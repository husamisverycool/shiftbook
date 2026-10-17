/**
 * Pay stub PDF — docs/patterns/_documents/pay-stub.md (the Gusto pay stub): the agency and the worker
 * with the pay period; earnings with rate, hours, current and year to date; gross pay; the note that
 * taxes and deductions are the payroll provider's. Fully formatted strings only.
 */
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface PayStubData {
  labels: { title: string; period: string; worker: string; ssn: string; earnings: string; description: string; rate: string; hours: string; current: string; ytd: string; gross: string; note: string };
  agency: { name: string; lines: string[] };
  worker: { name: string; ssnLast4: string | null };
  period: string;
  lines: { description: string; rate: string; hours: string; current: string }[];
  gross: string;
  ytd: string;
}

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, fontSize: 9, fontFamily: "Helvetica", color: "#111111" },
  top: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  agency: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", textAlign: "right" },
  meta: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 90, color: "#555555" },
  section: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 20, marginBottom: 6 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cccccc", paddingBottom: 4, color: "#555555" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5", paddingVertical: 5 },
  total: { flexDirection: "row", paddingVertical: 6, fontFamily: "Helvetica-Bold" },
  cDesc: { width: "40%" },
  cNum: { width: "15%", textAlign: "right" },
  note: { marginTop: 16, color: "#555555" },
});

export function PayStubDocument({ data }: { data: PayStubData }) {
  const l = data.labels;
  return (
    <Document title={`${l.title} ${data.worker.name} ${data.period}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.top}>
          <View>
            <Text style={styles.agency}>{data.agency.name}</Text>
            {data.agency.lines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </View>
          <Text style={styles.title}>{l.title}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.metaLabel}>{l.worker}</Text>
          <Text>{data.worker.name}</Text>
        </View>
        {data.worker.ssnLast4 && (
          <View style={styles.meta}>
            <Text style={styles.metaLabel}>{l.ssn}</Text>
            <Text>{`XXX-XX-${data.worker.ssnLast4}`}</Text>
          </View>
        )}
        <View style={styles.meta}>
          <Text style={styles.metaLabel}>{l.period}</Text>
          <Text>{data.period}</Text>
        </View>
        <Text style={styles.section}>{l.earnings}</Text>
        <View style={styles.head}>
          <Text style={styles.cDesc}>{l.description}</Text>
          <Text style={styles.cNum}>{l.rate}</Text>
          <Text style={styles.cNum}>{l.hours}</Text>
          <Text style={styles.cNum}>{l.current}</Text>
          <Text style={styles.cNum}>{l.ytd}</Text>
        </View>
        {data.lines.map((line, n) => (
          <View key={n} style={styles.row} wrap={false}>
            <Text style={styles.cDesc}>{line.description}</Text>
            <Text style={styles.cNum}>{line.rate}</Text>
            <Text style={styles.cNum}>{line.hours}</Text>
            <Text style={styles.cNum}>{line.current}</Text>
            <Text style={styles.cNum} />
          </View>
        ))}
        <View style={styles.total}>
          <Text style={styles.cDesc}>{l.gross}</Text>
          <Text style={styles.cNum} />
          <Text style={styles.cNum} />
          <Text style={styles.cNum}>{data.gross}</Text>
          <Text style={styles.cNum}>{data.ytd}</Text>
        </View>
        <Text style={styles.note}>{l.note}</Text>
      </Page>
    </Document>
  );
}
