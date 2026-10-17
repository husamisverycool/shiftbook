/**
 * Remittance advice PDF — docs/patterns/_documents/remittance.md (remittance-advice norms: payee,
 * payer, payment date, method and reference, then each invoice settled with its date, total and the
 * amount applied; the statement PDF's frame). Fully formatted strings only.
 */
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface RemittanceData {
  labels: {
    title: string;
    payee: string;
    payer: string;
    date: string;
    method: string;
    reference: string;
    invoice: string;
    invoiceDate: string;
    invoiceTotal: string;
    applied: string;
    payment: string;
    appliedTotal: string;
    notApplied: string;
    none: string;
    recordedBy: string;
    page: (page: number, pages: number) => string;
  };
  payee: { name: string; lines: string[] };
  payer: string;
  date: string;
  method: string;
  reference: string;
  rows: { number: string; date: string; total: string; applied: string }[];
  payment: string;
  appliedTotal: string;
  notApplied: string | null;
}

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 64, paddingHorizontal: 48, fontSize: 9, fontFamily: "Helvetica", color: "#111111" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 16 },
  top: { flexDirection: "row", marginBottom: 24 },
  half: { width: "50%" },
  head: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  meta: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 80, color: "#555555" },
  tHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cccccc", paddingBottom: 4, color: "#555555" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5", paddingVertical: 5 },
  cNumber: { width: "34%" },
  cDate: { width: "22%" },
  cMoney: { width: "22%", textAlign: "right" },
  total: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 3 },
  totalLabel: { width: "30%", textAlign: "right", marginRight: 8, color: "#555555" },
  totalValue: { width: "22%", textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", color: "#555555" },
});

export function RemittanceDocument({ data }: { data: RemittanceData }) {
  const l = data.labels;
  return (
    <Document title={`${l.title} ${data.date}`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{l.title}</Text>
        <View style={styles.top}>
          <View style={styles.half}>
            <Text style={styles.head}>{l.payee}</Text>
            <Text>{data.payee.name}</Text>
            {data.payee.lines.map((line, n) => (
              <Text key={n}>{line}</Text>
            ))}
            <Text style={[styles.head, { marginTop: 10 }]}>{l.payer}</Text>
            <Text>{data.payer}</Text>
          </View>
          <View style={styles.half}>
            {[
              [l.date, data.date],
              [l.method, data.method],
              [l.reference, data.reference],
            ].map(([label, value]) => (
              <View key={label} style={styles.meta}>
                <Text style={styles.metaLabel}>{label}</Text>
                <Text>{value}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.tHead}>
          <Text style={styles.cNumber}>{l.invoice}</Text>
          <Text style={styles.cDate}>{l.invoiceDate}</Text>
          <Text style={styles.cMoney}>{l.invoiceTotal}</Text>
          <Text style={styles.cMoney}>{l.applied}</Text>
        </View>
        {data.rows.length === 0 ? (
          <View style={styles.row}>
            <Text>{l.none}</Text>
          </View>
        ) : (
          data.rows.map((r, n) => (
            <View key={n} style={styles.row} wrap={false}>
              <Text style={styles.cNumber}>{r.number}</Text>
              <Text style={styles.cDate}>{r.date}</Text>
              <Text style={styles.cMoney}>{r.total}</Text>
              <Text style={styles.cMoney}>{r.applied}</Text>
            </View>
          ))
        )}
        <View style={[styles.total, { marginTop: 8 }]}>
          <Text style={styles.totalLabel}>{l.payment}</Text>
          <Text style={[styles.totalValue, styles.bold]}>{data.payment}</Text>
        </View>
        <View style={styles.total}>
          <Text style={styles.totalLabel}>{l.appliedTotal}</Text>
          <Text style={styles.totalValue}>{data.appliedTotal}</Text>
        </View>
        {data.notApplied && (
          <View style={styles.total}>
            <Text style={styles.totalLabel}>{l.notApplied}</Text>
            <Text style={styles.totalValue}>{data.notApplied}</Text>
          </View>
        )}
        <View style={styles.footer} fixed>
          <Text>{l.recordedBy}</Text>
          <Text render={({ pageNumber, totalPages }) => l.page(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  );
}
