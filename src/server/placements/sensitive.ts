/**
 * Social Security numbers and birth dates never leave the upload (CLAUDE.md data safety; SPEC §21):
 * a column is dropped when its header names one, or when any of its cells holds an SSN-shaped value.
 * The stored copy, previews, mappings and logs only ever see what is left.
 */
const SENSITIVE_HEADER = /\b(ssn|social\s*security|social\s*sec|soc\s*sec|tax\s*id|taxpayer|tin|itin|dob|date\s*of\s*birth|birth\s*date|birthdate|dateofbirth|birthday)\b|ssn|dateofbirth|birthdate/i;
const SSN_SHAPED = /\b\d{3}-\d{2}-\d{4}\b/;

export function dropSensitive(header: string[], rows: string[][]): { header: string[]; rows: string[][]; dropped: number } {
  const keep = header.map((h, i) => !SENSITIVE_HEADER.test(h) && !rows.some((r) => SSN_SHAPED.test(r[i] ?? "")));
  return {
    header: header.filter((_, i) => keep[i]),
    rows: rows.map((r) => header.map((_, i) => r[i] ?? "").filter((_, i) => keep[i])),
    dropped: keep.filter((k) => !k).length,
  };
}
