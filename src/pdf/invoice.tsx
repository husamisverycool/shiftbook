/**
 * Invoice PDF — hierarchy from docs/patterns/_documents/invoice.md (Stripe invoice PDF; QuickBooks
 * Online template sections). Receives fully formatted strings: no money arithmetic happens here.
 */
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface InvoiceLine {
  description: string;
  detail: string;
  hours: string;
  rate: string;
  amount: string;
}

export interface InvoiceData {
  labels: {
    title: string;
    number: string;
    issued: string;
    due: string;
    billTo: string;
    description: string;
    hours: string;
    rate: string;
    amount: string;
    subtotal: string;
    total: string;
    amountDueLabel: string;
    page: (page: number, pages: number) => string;
  };
  number: string;
  issuedOn: string;
  dueOn: string;
  fields: { label: string; value: string }[];
  from: { name: string; lines: string[] };
  billTo: { name: string; lines: string[] };
  amountDueLine: string;
  lines: InvoiceLine[];
  subtotal: string;
  total: string;
  amountDue: string;
  footer: string;
}

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 64, paddingHorizontal: 48, fontSize: 9, fontFamily: "Helvetica", color: "#111111" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 16 },
  meta: { marginBottom: 24 },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 110, color: "#555555" },
  addresses: { flexDirection: "row", marginBottom: 24 },
  address: { width: "50%" },
  addressHead: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  amountDue: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 20 },
  tableHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cccccc", paddingBottom: 4, color: "#555555" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5", paddingVertical: 5 },
  colDescription: { width: "52%" },
  colHours: { width: "14%", textAlign: "right" },
  colRate: { width: "16%", textAlign: "right" },
  colAmount: { width: "18%", textAlign: "right" },
  detail: { color: "#555555", marginTop: 1 },
  totals: { marginTop: 12, marginLeft: "50%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  amountDueRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", color: "#555555" },
  footerText: { width: "75%" },
});

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  const l = data.labels;
  return (
    <Document title={`${l.title} ${data.number}`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{l.title}</Text>
        <View style={styles.meta}>
          {[
            { label: l.number, value: data.number },
            { label: l.issued, value: data.issuedOn },
            { label: l.due, value: data.dueOn },
            ...data.fields,
          ].map((f) => (
            <View key={f.label} style={styles.metaRow}>
              <Text style={styles.metaLabel}>{f.label}</Text>
              <Text>{f.value}</Text>
            </View>
          ))}
        </View>
        <View style={styles.addresses}>
          <View style={styles.address}>
            <Text style={styles.addressHead}>{data.from.name}</Text>
            {data.from.lines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </View>
          <View style={styles.address}>
            <Text style={styles.addressHead}>{l.billTo}</Text>
            <Text>{data.billTo.name}</Text>
            {data.billTo.lines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </View>
        </View>
        <Text style={styles.amountDue}>{data.amountDueLine}</Text>
        <View style={styles.tableHead} fixed>
          <Text style={styles.colDescription}>{l.description}</Text>
          <Text style={styles.colHours}>{l.hours}</Text>
          <Text style={styles.colRate}>{l.rate}</Text>
          <Text style={styles.colAmount}>{l.amount}</Text>
        </View>
        {data.lines.map((line, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <View style={styles.colDescription}>
              <Text>{line.description}</Text>
              <Text style={styles.detail}>{line.detail}</Text>
            </View>
            <Text style={styles.colHours}>{line.hours}</Text>
            <Text style={styles.colRate}>{line.rate}</Text>
            <Text style={styles.colAmount}>{line.amount}</Text>
          </View>
        ))}
        <View style={styles.totals} wrap={false}>
          <View style={styles.totalRow}>
            <Text>{l.subtotal}</Text>
            <Text>{data.subtotal}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>{l.total}</Text>
            <Text>{data.total}</Text>
          </View>
          <View style={styles.amountDueRow}>
            <Text>{l.amountDueLabel}</Text>
            <Text>{data.amountDue}</Text>
          </View>
        </View>
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{data.footer}</Text>
          <Text render={({ pageNumber, totalPages }) => l.page(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  );
}
