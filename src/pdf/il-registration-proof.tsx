/**
 * Illinois proof of registration — docs/patterns/_documents/il-registration-proof.md (the layout of
 * the statement; the contents of 820 ILCS 175/85(a) and 56 Ill. Adm. Code 260.510). Fully formatted
 * strings only.
 */
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface IlProofData {
  labels: {
    title: string;
    law: string;
    made: string;
    forClient: string;
    office: string;
    number: string;
    issued: string;
    expires: string;
    workersComp: string;
    insurer: string;
    policy: string;
    period: string;
    howToCheck: string;
    page: (page: number, pages: number) => string;
  };
  made: string;
  agency: { name: string; lines: string[] };
  client: { name: string; lines: string[] };
  registrations: { office: string; number: string; issued: string; expires: string }[];
  policy: { insurer: string; number: string; period: string } | null;
  /** Said when no policy is in force on the date. */
  noPolicy: string;
  howToCheck: string;
}

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 64, paddingHorizontal: 48, fontSize: 9, fontFamily: "Helvetica", color: "#111111" },
  top: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  agencyName: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
  titleBlock: { alignItems: "flex-end" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  law: { color: "#555555", marginTop: 2 },
  made: { marginTop: 6 },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 18, marginBottom: 6 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cccccc", paddingBottom: 4, color: "#555555" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5", paddingVertical: 5 },
  cOffice: { width: "40%" },
  cNumber: { width: "30%" },
  cDate: { width: "15%" },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 110, color: "#555555" },
  note: { marginTop: 18 },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, flexDirection: "row", justifyContent: "flex-end", color: "#555555" },
});

export function IlProofDocument({ data }: { data: IlProofData }) {
  const l = data.labels;
  return (
    <Document title={`${l.title} — ${data.client.name}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.top}>
          <View>
            <Text style={styles.agencyName}>{data.agency.name}</Text>
            {data.agency.lines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{l.title}</Text>
            <Text style={styles.law}>{l.law}</Text>
            <Text style={styles.made}>
              {l.made} {data.made}
            </Text>
          </View>
        </View>
        <Text style={styles.heading}>{l.forClient}</Text>
        <Text>{data.client.name}</Text>
        {data.client.lines.map((line) => (
          <Text key={line}>{line}</Text>
        ))}
        <View style={{ marginTop: 18 }}>
          <View style={styles.head}>
            <Text style={styles.cOffice}>{l.office}</Text>
            <Text style={styles.cNumber}>{l.number}</Text>
            <Text style={styles.cDate}>{l.issued}</Text>
            <Text style={styles.cDate}>{l.expires}</Text>
          </View>
          {data.registrations.map((r) => (
            <View key={r.number} style={styles.row} wrap={false}>
              <Text style={styles.cOffice}>{r.office}</Text>
              <Text style={styles.cNumber}>{r.number}</Text>
              <Text style={styles.cDate}>{r.issued}</Text>
              <Text style={styles.cDate}>{r.expires}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.heading}>{l.workersComp}</Text>
        {data.policy ? (
          <>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{l.insurer}</Text>
              <Text>{data.policy.insurer}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{l.policy}</Text>
              <Text>{data.policy.number}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{l.period}</Text>
              <Text>{data.policy.period}</Text>
            </View>
          </>
        ) : (
          <Text>{data.noPolicy}</Text>
        )}
        <Text style={styles.note}>{data.howToCheck}</Text>
        <View style={styles.footer} fixed>
          <Text render={({ pageNumber, totalPages }) => l.page(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  );
}
