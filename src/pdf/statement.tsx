/**
 * Statement PDF — docs/patterns/_documents/statement.md (Avionté Invoice Merge; TempWorks Merge
 * Invoices; QuickBooks customer statements): a first page listing the chosen invoices and their
 * total, then each invoice as issued. Payments stay on each invoice. Fully formatted strings only.
 */
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { InvoicePages, type InvoiceData } from "./invoice";

export interface StatementData {
  labels: {
    title: string;
    date: string;
    billTo: string;
    number: string;
    period: string;
    issued: string;
    due: string;
    amount: string;
    total: string;
    paidSeparately: string;
    page: (page: number, pages: number) => string;
  };
  date: string;
  from: { name: string; lines: string[] };
  billTo: { name: string; lines: string[] };
  rows: { number: string; period: string; issued: string; due: string; amount: string }[];
  total: string;
  invoices: InvoiceData[];
}

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 64, paddingHorizontal: 48, fontSize: 9, fontFamily: "Helvetica", color: "#111111" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 16 },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 110, color: "#555555" },
  addresses: { flexDirection: "row", marginTop: 16, marginBottom: 24 },
  address: { width: "50%" },
  addressHead: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cccccc", paddingBottom: 4, color: "#555555" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5", paddingVertical: 5 },
  cNumber: { width: "24%" },
  cPeriod: { width: "30%" },
  cDate: { width: "15%" },
  cAmount: { width: "16%", textAlign: "right" },
  total: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 6, fontFamily: "Helvetica-Bold" },
  totalLabel: { width: "30%", textAlign: "right", marginRight: 8 },
  note: { marginTop: 12, color: "#555555" },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, flexDirection: "row", justifyContent: "flex-end", color: "#555555" },
});

export function StatementDocument({ data }: { data: StatementData }) {
  const l = data.labels;
  return (
    <Document title={`${l.title} ${data.billTo.name}`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{l.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{l.date}</Text>
          <Text>{data.date}</Text>
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
        <View style={styles.head}>
          <Text style={styles.cNumber}>{l.number}</Text>
          <Text style={styles.cPeriod}>{l.period}</Text>
          <Text style={styles.cDate}>{l.issued}</Text>
          <Text style={styles.cDate}>{l.due}</Text>
          <Text style={styles.cAmount}>{l.amount}</Text>
        </View>
        {data.rows.map((r) => (
          <View key={r.number} style={styles.row} wrap={false}>
            <Text style={styles.cNumber}>{r.number}</Text>
            <Text style={styles.cPeriod}>{r.period}</Text>
            <Text style={styles.cDate}>{r.issued}</Text>
            <Text style={styles.cDate}>{r.due}</Text>
            <Text style={styles.cAmount}>{r.amount}</Text>
          </View>
        ))}
        <View style={styles.total}>
          <Text style={styles.totalLabel}>{l.total}</Text>
          <Text style={styles.cAmount}>{data.total}</Text>
        </View>
        <Text style={styles.note}>{l.paidSeparately}</Text>
        <View style={styles.footer} fixed>
          <Text render={({ pageNumber, totalPages }) => l.page(pageNumber, totalPages)} />
        </View>
      </Page>
      {data.invoices.map((inv) => (
        <InvoicePages key={inv.number} data={{ ...inv, detail: null, images: [] }} />
      ))}
    </Document>
  );
}
