/**
 * Invoice PDF — hierarchy from docs/patterns/_documents/invoice.md (Stripe invoice PDF; QuickBooks
 * Online template sections), its templates (Bullhorn One group by candidate; Avionté PO at the top of
 * each page) and its backup pages (Avionté merged invoice and timecards; Bullhorn `[APPROVE_LOG]`).
 * Receives fully formatted strings: no money arithmetic happens here.
 */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

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
  /** None on a credit note (docs/patterns/_documents/invoice.md, correction documents). */
  dueOn: string | null;
  fields: { label: string; value: string }[];
  from: { name: string; lines: string[] };
  billTo: { name: string; lines: string[] };
  amountDueLine: string;
  lines: InvoiceLine[];
  subtotal: string;
  total: string;
  amountDue: string;
  footer: string;
  /** Per-worker detail template: the lines grouped under a heading, each group with its subtotal. */
  groups?: { title: string; subtotalLabel: string; subtotal: string; lines: InvoiceLine[] }[];
  /** PO header template: printed at the top of every page. */
  poHeader?: string | null;
  /** Backup: hours detail pages after the invoice. */
  detail?: InvoiceDetail | null;
  /** Backup: one timesheet picture per page (redacted copies). */
  images?: InvoiceImage[];
}

export interface InvoiceDetail {
  title: string;
  columns: { date: string; in: string; out: string; break: string; hours: string };
  weeks: { heading: string; rows: { date: string; in: string; out: string; break: string; hours: string }[]; totalLabel: string; total: string; approvals: string[] }[];
}

export interface InvoiceImage {
  data: Buffer;
  format: "jpg" | "png";
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
  poHeader: { position: "absolute", top: 20, left: 48, right: 48, fontFamily: "Helvetica-Bold", color: "#111111" },
  groupHead: { fontFamily: "Helvetica-Bold", paddingTop: 8, paddingBottom: 2 },
  groupTotal: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#cccccc" },
  groupTotalLabel: { width: "30%", textAlign: "right", color: "#555555", marginRight: 8 },
  groupTotalValue: { width: "18%", textAlign: "right", fontFamily: "Helvetica-Bold" },
  detailTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 12 },
  weekHead: { fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  dRow: { flexDirection: "row", paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5" },
  dHead: { flexDirection: "row", paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: "#cccccc", color: "#555555" },
  dDate: { width: "36%" },
  dCell: { width: "16%", textAlign: "right" },
  dTotal: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 3, fontFamily: "Helvetica-Bold" },
  approval: { color: "#555555", marginTop: 3 },
  imagePage: { padding: 32 },
  image: { width: "100%", height: "92%", objectFit: "contain" },
});

/** The invoice's pages (and its backup), for one document or for a statement. */
export function InvoicePages({ data }: { data: InvoiceData }) {
  const l = data.labels;
  const footer = (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>{data.footer}</Text>
      <Text render={({ pageNumber, totalPages }) => l.page(pageNumber, totalPages)} />
    </View>
  );
  const poHeader = data.poHeader ? (
    <Text style={styles.poHeader} fixed>
      {data.poHeader}
    </Text>
  ) : null;
  const row = (line: InvoiceLine, key: string | number) => (
    <View key={key} style={styles.row} wrap={false}>
      <View style={styles.colDescription}>
        <Text>{line.description}</Text>
        <Text style={styles.detail}>{line.detail}</Text>
      </View>
      <Text style={styles.colHours}>{line.hours}</Text>
      <Text style={styles.colRate}>{line.rate}</Text>
      <Text style={styles.colAmount}>{line.amount}</Text>
    </View>
  );
  return (
    <>
      <Page size="LETTER" style={styles.page}>
        {poHeader}
        <Text style={styles.title}>{l.title}</Text>
        <View style={styles.meta}>
          {[
            { label: l.number, value: data.number },
            { label: l.issued, value: data.issuedOn },
            ...(data.dueOn !== null ? [{ label: l.due, value: data.dueOn }] : []),
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
        {data.groups
          ? data.groups.map((g, gi) => (
              <View key={gi}>
                <Text style={styles.groupHead}>{g.title}</Text>
                {g.lines.map((line, i) => row(line, i))}
                <View style={styles.groupTotal} wrap={false}>
                  <Text style={styles.groupTotalLabel}>{g.subtotalLabel}</Text>
                  <Text style={styles.groupTotalValue}>{g.subtotal}</Text>
                </View>
              </View>
            ))
          : data.lines.map((line, i) => row(line, i))}
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
        {footer}
      </Page>
      {data.detail && (
        <Page size="LETTER" style={styles.page}>
          {poHeader}
          <Text style={styles.detailTitle}>{data.detail.title}</Text>
          {data.detail.weeks.map((w, wi) => (
            <View key={wi} wrap={false}>
              <Text style={styles.weekHead}>{w.heading}</Text>
              <View style={styles.dHead}>
                <Text style={styles.dDate}>{data.detail!.columns.date}</Text>
                <Text style={styles.dCell}>{data.detail!.columns.in}</Text>
                <Text style={styles.dCell}>{data.detail!.columns.out}</Text>
                <Text style={styles.dCell}>{data.detail!.columns.break}</Text>
                <Text style={styles.dCell}>{data.detail!.columns.hours}</Text>
              </View>
              {w.rows.map((r, ri) => (
                <View key={ri} style={styles.dRow}>
                  <Text style={styles.dDate}>{r.date}</Text>
                  <Text style={styles.dCell}>{r.in}</Text>
                  <Text style={styles.dCell}>{r.out}</Text>
                  <Text style={styles.dCell}>{r.break}</Text>
                  <Text style={styles.dCell}>{r.hours}</Text>
                </View>
              ))}
              <View style={styles.dTotal}>
                <Text style={styles.groupTotalLabel}>{w.totalLabel}</Text>
                <Text style={styles.dCell}>{w.total}</Text>
              </View>
              {w.approvals.map((a, ai) => (
                <Text key={ai} style={styles.approval}>
                  {a}
                </Text>
              ))}
            </View>
          ))}
          {footer}
        </Page>
      )}
      {(data.images ?? []).map((img, i) => (
        <Page key={`img-${i}`} size="LETTER" style={styles.imagePage}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- a PDF page image: react-pdf has no alt text */}
          <Image src={{ data: img.data, format: img.format }} style={styles.image} />
          {footer}
        </Page>
      ))}
    </>
  );
}

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  return (
    <Document title={`${data.labels.title} ${data.number}`}>
      <InvoicePages data={data} />
    </Document>
  );
}
