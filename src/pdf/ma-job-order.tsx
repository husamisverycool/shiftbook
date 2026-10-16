/**
 * Massachusetts job order — docs/patterns/_documents/ma-job-order.md (M.G.L. c. 149 § 159C(b);
 * 454 CMR 24.08). Fully formatted strings only.
 */
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface MaJobOrderData {
  labels: {
    title: string;
    law: string;
    worker: string;
    starts: string;
    made: string;
    contacts: string;
    agency: string;
    insurer: string;
    client: string;
    department: string;
    job: string;
    position: string;
    soc: string;
    requirements: string;
    pay: string;
    rate: string;
    payDay: string;
    overtime: string;
    hours: string;
    times: string;
    duration: string;
    extras: string;
    meals: string;
    transport: string;
    strike: string;
    page: (page: number, pages: number) => string;
  };
  worker: string;
  starts: string;
  made: string;
  agency: string[];
  insurer: string[];
  client: string[];
  department: string[];
  position: string;
  soc: string;
  requirements: string;
  rate: string;
  payDay: string;
  overtime: string;
  times: string;
  duration: string;
  meals: string;
  transport: string;
  strike: string;
  statement: string;
}

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 64, paddingHorizontal: 48, fontSize: 9, fontFamily: "Helvetica", color: "#111111" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  law: { color: "#555555", marginTop: 2, marginBottom: 12 },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 130, color: "#555555" },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 16, marginBottom: 6 },
  contacts: { flexDirection: "row", flexWrap: "wrap" },
  contact: { width: "50%", marginBottom: 8, paddingRight: 12 },
  contactHead: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  note: { marginTop: 18, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, flexDirection: "row", justifyContent: "flex-end", color: "#555555" },
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow} wrap={false}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={{ flex: 1 }}>{value}</Text>
    </View>
  );
}

export function MaJobOrderDocument({ data }: { data: MaJobOrderData }) {
  const l = data.labels;
  const contact = (head: string, lines: string[]) => (
    <View style={styles.contact}>
      <Text style={styles.contactHead}>{head}</Text>
      {lines.map((line, n) => (
        <Text key={n}>{line}</Text>
      ))}
    </View>
  );
  return (
    <Document title={`${l.title} — ${data.worker}`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{l.title}</Text>
        <Text style={styles.law}>{l.law}</Text>
        <Row label={l.worker} value={data.worker} />
        <Row label={l.starts} value={data.starts} />
        <Row label={l.made} value={data.made} />
        <Text style={styles.heading}>{l.contacts}</Text>
        <View style={styles.contacts}>
          {contact(l.agency, data.agency)}
          {contact(l.insurer, data.insurer)}
          {contact(l.client, data.client)}
          {contact(l.department, data.department)}
        </View>
        <Text style={styles.heading}>{l.job}</Text>
        <Row label={l.position} value={data.position} />
        <Row label={l.soc} value={data.soc} />
        <Row label={l.requirements} value={data.requirements} />
        <Text style={styles.heading}>{l.pay}</Text>
        <Row label={l.rate} value={data.rate} />
        <Row label={l.payDay} value={data.payDay} />
        <Row label={l.overtime} value={data.overtime} />
        <Text style={styles.heading}>{l.hours}</Text>
        <Row label={l.times} value={data.times} />
        <Row label={l.duration} value={data.duration} />
        <Text style={styles.heading}>{l.extras}</Text>
        <Row label={l.meals} value={data.meals} />
        <Row label={l.transport} value={data.transport} />
        <Row label={l.strike} value={data.strike} />
        <Text style={styles.note}>{data.statement}</Text>
        <View style={styles.footer} fixed>
          <Text render={({ pageNumber, totalPages }) => l.page(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  );
}
