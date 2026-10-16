/**
 * Workers' comp packet — docs/patterns/_documents/wc-audit-packet.md (Patriot Workers' Comp Wages
 * report; NCRB Basic Manual Rule 2-C-2-a). Fully formatted strings only; no Social Security numbers.
 */
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

type Figures = { hours: string; straight: string; ot: string; dt: string; other: string; total: string };

export interface WcPacketData {
  labels: {
    title: string;
    insurer: string;
    range: string;
    made: string;
    summary: string;
    detail: string;
    missing: string;
    tieOut: string;
    state: string;
    classCode: string;
    worker: string;
    hours: string;
    straight: string;
    ot: string;
    dt: string;
    other: string;
    total: string;
    subtotal: string;
    page: (page: number, pages: number) => string;
  };
  agency: string;
  insurer: string;
  range: string;
  made: string;
  classes: ({ state: string; classCode: string; description: string } & Figures)[];
  rows: ({ state: string; classCode: string; worker: string } & Figures)[];
  totals: Figures;
  missing: { worker: string; state: string; hours: string; total: string }[];
  tieOut: string;
}

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 36, fontSize: 8, fontFamily: "Helvetica", color: "#111111" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 90, color: "#555555" },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 14, marginBottom: 4 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cccccc", paddingBottom: 3, color: "#555555" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5", paddingVertical: 3 },
  bold: { fontFamily: "Helvetica-Bold" },
  cState: { width: "7%" },
  cClass: { width: "9%" },
  cWorker: { width: "22%" },
  cNum: { width: "10%", textAlign: "right" },
  note: { marginTop: 4 },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", color: "#555555" },
});

function Nums({ f, bold }: { f: Figures; bold?: boolean }) {
  const s = bold ? [styles.cNum, styles.bold] : [styles.cNum];
  return (
    <>
      <Text style={s}>{f.hours}</Text>
      <Text style={s}>{f.straight}</Text>
      <Text style={s}>{f.ot}</Text>
      <Text style={s}>{f.dt}</Text>
      <Text style={s}>{f.other}</Text>
      <Text style={s}>{f.total}</Text>
    </>
  );
}

export function WcPacketDocument({ data }: { data: WcPacketData }) {
  const l = data.labels;
  const head = (withWorker: boolean) => (
    <View style={styles.head} fixed={false}>
      <Text style={styles.cState}>{l.state}</Text>
      <Text style={styles.cClass}>{l.classCode}</Text>
      <Text style={styles.cWorker}>{withWorker ? l.worker : ""}</Text>
      <Text style={styles.cNum}>{l.hours}</Text>
      <Text style={styles.cNum}>{l.straight}</Text>
      <Text style={styles.cNum}>{l.ot}</Text>
      <Text style={styles.cNum}>{l.dt}</Text>
      <Text style={styles.cNum}>{l.other}</Text>
      <Text style={styles.cNum}>{l.total}</Text>
    </View>
  );
  return (
    <Document title={`${l.title} — ${data.range}`}>
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{l.title}</Text>
        <Text style={{ marginBottom: 8 }}>{data.agency}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{l.insurer}</Text>
          <Text>{data.insurer}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{l.range}</Text>
          <Text>{data.range}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{l.made}</Text>
          <Text>{data.made}</Text>
        </View>
        <Text style={styles.heading}>{l.summary}</Text>
        {head(false)}
        {data.classes.map((c) => (
          <View key={`${c.state}-${c.classCode}`} style={styles.row} wrap={false}>
            <Text style={styles.cState}>{c.state}</Text>
            <Text style={styles.cClass}>{c.classCode}</Text>
            <Text style={styles.cWorker}>{c.description}</Text>
            <Nums f={c} />
          </View>
        ))}
        <View style={styles.row} wrap={false}>
          <Text style={[styles.cState, styles.bold]}>{l.total}</Text>
          <Text style={styles.cClass} />
          <Text style={styles.cWorker} />
          <Nums f={data.totals} bold />
        </View>
        <Text style={styles.heading}>{l.detail}</Text>
        {head(true)}
        {data.rows.map((r, n) => (
          <View key={n} style={styles.row} wrap={false}>
            <Text style={styles.cState}>{r.state}</Text>
            <Text style={styles.cClass}>{r.classCode}</Text>
            <Text style={styles.cWorker}>{r.worker}</Text>
            <Nums f={r} />
          </View>
        ))}
        {data.missing.length > 0 && (
          <>
            <Text style={styles.heading}>{l.missing}</Text>
            {data.missing.map((m, n) => (
              <View key={n} style={styles.row} wrap={false}>
                <Text style={styles.cState}>{m.state}</Text>
                <Text style={styles.cClass}>—</Text>
                <Text style={styles.cWorker}>{m.worker}</Text>
                <Text style={styles.cNum}>{m.hours}</Text>
                <Text style={[styles.cNum, { width: "50%" }]}>{m.total}</Text>
              </View>
            ))}
          </>
        )}
        <Text style={styles.heading}>{l.tieOut}</Text>
        <Text style={styles.note}>{data.tieOut}</Text>
        <View style={styles.footer} fixed>
          <Text>{data.agency}</Text>
          <Text render={({ pageNumber, totalPages }) => l.page(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  );
}
