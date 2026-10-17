/**
 * Schedule of accounts PDF — docs/patterns/_documents/schedule-of-accounts.md (a factor's published
 * schedule form; the schedule as an SEC-filed factoring agreement defines it): the invoices assigned,
 * oldest first, their total, the seller's certification and assignment, signature lines, and a box
 * for the factor's use. Fully formatted strings only.
 */
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface ScheduleData {
  labels: {
    title: string;
    number: string;
    date: string;
    seller: string;
    assignedTo: string;
    debtor: string;
    invoice: string;
    issued: string;
    due: string;
    reference: string;
    amount: string;
    total: string;
    certification: string;
    signature: string;
    printedName: string;
    titleLine: string;
    dateLine: string;
    factorUse: string;
    page: (page: number, pages: number) => string;
  };
  number: string;
  date: string;
  seller: { name: string; lines: string[] };
  rows: { debtor: string; debtorLines: string[]; invoice: string; issued: string; due: string; reference: string; amount: string }[];
  total: string;
}

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 64, paddingHorizontal: 48, fontSize: 9, fontFamily: "Helvetica", color: "#111111" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 12 },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 110, color: "#555555" },
  parties: { flexDirection: "row", marginTop: 16, marginBottom: 20 },
  party: { width: "50%" },
  partyHead: { color: "#555555", marginBottom: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cccccc", paddingBottom: 4, color: "#555555" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5", paddingVertical: 5 },
  cDebtor: { width: "30%", paddingRight: 6 },
  cInvoice: { width: "15%" },
  cDate: { width: "12%" },
  cRef: { width: "15%" },
  cAmount: { width: "16%", textAlign: "right" },
  muted: { color: "#555555" },
  total: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 6, fontFamily: "Helvetica-Bold" },
  totalLabel: { marginRight: 8 },
  certification: { marginTop: 20, lineHeight: 1.4 },
  signatures: { flexDirection: "row", flexWrap: "wrap", marginTop: 28 },
  signature: { width: "50%", paddingRight: 24, marginBottom: 22 },
  line: { borderBottomWidth: 0.75, borderBottomColor: "#111111", height: 18, marginBottom: 3 },
  factorBox: { marginTop: 8, borderWidth: 0.75, borderColor: "#999999", height: 70, padding: 6 },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, flexDirection: "row", justifyContent: "flex-end", color: "#555555" },
});

export function ScheduleDocument({ data }: { data: ScheduleData }) {
  const l = data.labels;
  return (
    <Document title={`${l.title} ${data.number}`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{l.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{l.number}</Text>
          <Text>{data.number}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{l.date}</Text>
          <Text>{data.date}</Text>
        </View>
        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.partyHead}>{l.seller}</Text>
            <Text style={styles.bold}>{data.seller.name}</Text>
            {data.seller.lines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </View>
          <View style={styles.party}>
            <Text style={styles.partyHead}>{l.assignedTo}</Text>
            <View style={styles.line} />
          </View>
        </View>
        <View style={styles.head} fixed>
          <Text style={styles.cDebtor}>{l.debtor}</Text>
          <Text style={styles.cInvoice}>{l.invoice}</Text>
          <Text style={styles.cDate}>{l.issued}</Text>
          <Text style={styles.cDate}>{l.due}</Text>
          <Text style={styles.cRef}>{l.reference}</Text>
          <Text style={styles.cAmount}>{l.amount}</Text>
        </View>
        {data.rows.map((r) => (
          <View key={r.invoice} style={styles.row} wrap={false}>
            <View style={styles.cDebtor}>
              <Text>{r.debtor}</Text>
              {r.debtorLines.map((line) => (
                <Text key={line} style={styles.muted}>
                  {line}
                </Text>
              ))}
            </View>
            <Text style={styles.cInvoice}>{r.invoice}</Text>
            <Text style={styles.cDate}>{r.issued}</Text>
            <Text style={styles.cDate}>{r.due}</Text>
            <Text style={styles.cRef}>{r.reference}</Text>
            <Text style={styles.cAmount}>{r.amount}</Text>
          </View>
        ))}
        <View style={styles.total} wrap={false}>
          <Text style={styles.totalLabel}>{l.total}</Text>
          <Text>{data.total}</Text>
        </View>
        <View wrap={false}>
          <Text style={styles.certification}>{l.certification}</Text>
          <View style={styles.signatures}>
            {[l.signature, l.printedName, l.titleLine, l.dateLine].map((label) => (
              <View key={label} style={styles.signature}>
                <View style={styles.line} />
                <Text style={styles.muted}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.muted}>{l.factorUse}</Text>
          <View style={styles.factorBox} />
        </View>
        <View style={styles.footer} fixed>
          <Text render={({ pageNumber, totalPages }) => l.page(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  );
}
