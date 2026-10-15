import type { Box } from "../db/schema";

/** Where a value came from in a structured file: spreadsheet-style row (header = row 1) and column. */
export interface CellSource {
  kind: "cell";
  row: number;
  column: string;
}

/** One value read from a document, with its provenance and how it was read (SPEC §6). */
export interface FieldReading<T> {
  text: string | null;
  value: T | null;
  page: number | null;
  box: Box | null;
  /** Readings of the two independent extraction passes (images/PDFs); null for structured files. */
  passA: string | null;
  passB: string | null;
  /** Whether the two passes agreed; null when there is a single deterministic source. */
  agree: boolean | null;
  handwritten: boolean;
  source?: CellSource;
}

/** One candidate time entry as read from a document, before roster matching and checks. */
export interface RawEntry {
  rowIndex: number;
  worker: FieldReading<string>;
  date: FieldReading<string>;
  in: FieldReading<number> | null;
  out: FieldReading<number> | null;
  break: FieldReading<number> | null;
  total: FieldReading<number> | null;
  externalId: string | null;
  /** Problems already known while reading (unreadable value, duplicate day, totals that don't add up). */
  checks: string[];
}

export type ParsedKind = "timeclock_csv" | "timeclock_xlsx" | "vms_export" | "image" | "pdf";

export interface ParsedDocument {
  kind: ParsedKind;
  profileKey: string | null;
  /** The client named in the document (buyer, letterhead), used when a worker has several assignments. */
  clientHint: string | null;
  entries: RawEntry[];
  /** Plain-English notes for the coordinator (e.g. skipped revoked time sheets). */
  notes: string[];
}

export const reading = <T>(text: string | null, value: T | null, source?: CellSource): FieldReading<T> => ({
  text,
  value,
  page: null,
  box: null,
  passA: null,
  passB: null,
  agree: null,
  handwritten: false,
  source,
});
