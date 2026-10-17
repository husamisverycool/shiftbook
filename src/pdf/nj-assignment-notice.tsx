/**
 * New Jersey Temporary Laborer Assignment Notification — docs/patterns/_documents/nj-assignment-notice.md.
 * The fields of the Department's form MW-23 (N.J.S.A. 34:8D-3; the firm must use the form the
 * Commissioner approved), in its order and, as the form is, in English with Spanish beneath each label.
 * Fully formatted strings only.
 */
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/** One label in the form's two languages. */
export interface Both {
  en: string;
  es: string;
}

export interface NjNoticeLabels {
  title: Both;
  law: Both;
  intro: Both;
  laborer: Both;
  firm: Both;
  client: Both;
  carrier: Both;
  worksite: Both;
  sameWorksite: Both;
  work: Both;
  description: Both;
  wages: Both;
  schedule: Both;
  training: Both;
  meals: Both;
  equipment: Both;
  clothing: Both;
  protective: Both;
  licenses: Both;
  transport: Both;
  no: Both;
  yes: Both;
  sickLeave: Both;
  made: Both;
  page: (page: number, pages: number) => string;
}

export interface NjNoticeData {
  labels: NjNoticeLabels;
  laborer: string;
  firm: string[];
  client: string[];
  carrier: string[];
  /** Null when the worksite is the client's address above. */
  worksite: string[] | null;
  work: string;
  description: string;
  wages: string;
  schedule: string;
  /** "" = no; otherwise what is required, who provides it and any cost to the laborer. */
  training: string;
  meals: string;
  equipment: string;
  clothing: string;
  protective: string;
  licenses: string;
  transport: string;
  made: string;
}

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9, fontFamily: "Helvetica", color: "#111111" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  titleEs: { fontSize: 11, color: "#444444", marginBottom: 2 },
  law: { color: "#555555", marginBottom: 8 },
  intro: { lineHeight: 1.35, marginBottom: 2 },
  introEs: { lineHeight: 1.35, color: "#444444", marginBottom: 10 },
  box: { borderWidth: 0.75, borderColor: "#999999", padding: 6, marginBottom: 6 },
  pair: { flexDirection: "row", gap: 6, marginBottom: 6 },
  half: { flex: 1, borderWidth: 0.75, borderColor: "#999999", padding: 6 },
  label: { fontFamily: "Helvetica-Bold" },
  labelEs: { color: "#555555", marginBottom: 3 },
  value: { lineHeight: 1.35 },
  answer: { fontFamily: "Helvetica-Bold" },
  sick: { marginTop: 6, lineHeight: 1.35, fontSize: 8 },
  sickEs: { marginTop: 4, lineHeight: 1.35, fontSize: 8, color: "#444444" },
  footer: { position: "absolute", bottom: 26, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", color: "#555555" },
});

function Label({ both }: { both: Both }) {
  return (
    <>
      <Text style={styles.label}>{both.en}</Text>
      <Text style={styles.labelEs}>{both.es}</Text>
    </>
  );
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, n) => (
        <Text key={n} style={styles.value}>
          {line}
        </Text>
      ))}
    </>
  );
}

export function NjAssignmentNoticeDocument({ data }: { data: NjNoticeData }) {
  const l = data.labels;
  const field = (label: Both, value: string) => (
    <View style={styles.box} wrap={false}>
      <Label both={label} />
      <Text style={styles.value}>{value || "—"}</Text>
    </View>
  );
  // The form's questions: No, or Yes with what is required, who provides it and its cost.
  const question = (label: Both, value: string) => (
    <View style={styles.box} wrap={false}>
      <Label both={label} />
      {value ? (
        <Text style={styles.value}>
          <Text style={styles.answer}>{`${l.yes.en} | ${l.yes.es}. `}</Text>
          {value}
        </Text>
      ) : (
        <Text style={styles.answer}>{`${l.no.en} | ${l.no.es}`}</Text>
      )}
    </View>
  );
  return (
    <Document title={`${l.title.en} — ${data.laborer}`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{l.title.en}</Text>
        <Text style={styles.titleEs}>{l.title.es}</Text>
        <Text style={styles.law}>{`${l.law.en} | ${l.law.es}`}</Text>
        <Text style={styles.intro}>{l.intro.en}</Text>
        <Text style={styles.introEs}>{l.intro.es}</Text>
        {field(l.laborer, data.laborer)}
        <View style={styles.pair} wrap={false}>
          <View style={styles.half}>
            <Label both={l.firm} />
            <Lines lines={data.firm} />
          </View>
          <View style={styles.half}>
            <Label both={l.client} />
            <Lines lines={data.client} />
          </View>
        </View>
        <View style={styles.pair} wrap={false}>
          <View style={styles.half}>
            <Label both={l.carrier} />
            <Lines lines={data.carrier} />
          </View>
          <View style={styles.half}>
            <Label both={l.worksite} />
            {data.worksite ? <Lines lines={data.worksite} /> : <Text style={styles.value}>{`${l.sameWorksite.en} | ${l.sameWorksite.es}`}</Text>}
          </View>
        </View>
        {field(l.work, data.work)}
        {field(l.description, data.description)}
        {field(l.wages, data.wages)}
        {field(l.schedule, data.schedule)}
        {question(l.training, data.training)}
        {question(l.meals, data.meals)}
        {question(l.equipment, data.equipment)}
        {question(l.clothing, data.clothing)}
        {question(l.protective, data.protective)}
        {question(l.licenses, data.licenses)}
        {question(l.transport, data.transport)}
        <View wrap={false}>
          <Text style={styles.sick}>{l.sickLeave.en}</Text>
          <Text style={styles.sickEs}>{l.sickLeave.es}</Text>
        </View>
        <View style={styles.footer} fixed>
          <Text>{`${l.made.en} | ${l.made.es}: ${data.made}`}</Text>
          <Text render={({ pageNumber, totalPages }) => l.page(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  );
}
