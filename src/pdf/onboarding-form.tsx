/**
 * Onboarding form record PDF — docs/patterns/_documents/onboarding-form.md: Form W-4, Form I-9
 * Section 1 or the direct deposit authorization as a record of the answers given, labelled with the
 * official step and field names, the worker named with the SSN's last four only, then the typed
 * signature with its date and the statement agreed to. Fully formatted strings only.
 */
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface OnboardingFormData {
  title: string;
  subtitle: string;
  worker: { label: string; name: string; ssnLabel: string; ssn: string | null };
  rows: { label: string; value: string }[];
  signature: { label: string; name: string; dateLabel: string; date: string; statement: string } | null;
}

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, fontSize: 10, fontFamily: "Helvetica", color: "#111111" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { color: "#555555", marginBottom: 20 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5", paddingVertical: 6 },
  label: { width: "45%", color: "#555555", paddingRight: 8 },
  value: { width: "55%" },
  sign: { marginTop: 28, borderTopWidth: 1, borderTopColor: "#cccccc", paddingTop: 10 },
  signName: { fontFamily: "Helvetica-Oblique", fontSize: 14, marginVertical: 4 },
  statement: { color: "#555555", marginTop: 6 },
});

export function OnboardingFormDocument({ data }: { data: OnboardingFormData }) {
  return (
    <Document title={`${data.title} ${data.worker.name}`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.subtitle}>{data.subtitle}</Text>
        <View style={styles.row}>
          <Text style={styles.label}>{data.worker.label}</Text>
          <Text style={styles.value}>{data.worker.name}</Text>
        </View>
        {data.worker.ssn && (
          <View style={styles.row}>
            <Text style={styles.label}>{data.worker.ssnLabel}</Text>
            <Text style={styles.value}>{data.worker.ssn}</Text>
          </View>
        )}
        {data.rows.map((r) => (
          <View key={r.label} style={styles.row} wrap={false}>
            <Text style={styles.label}>{r.label}</Text>
            <Text style={styles.value}>{r.value}</Text>
          </View>
        ))}
        {data.signature && (
          <View style={styles.sign} wrap={false}>
            <Text>{data.signature.label}</Text>
            <Text style={styles.signName}>{data.signature.name}</Text>
            <Text>
              {data.signature.dateLabel} {data.signature.date}
            </Text>
            <Text style={styles.statement}>{data.signature.statement}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
