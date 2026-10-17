/**
 * Scoring a reading against its answer key (SPEC §23 tests/goldens/extract/): field accuracy, and
 * "silent errors" — a wrong value nothing flagged for a person to check — which must be zero. A value
 * is flagged when its entry carries a check, its two passes disagree, it could not be read, or (for
 * the worker) the name did not match exactly one roster worker.
 */
import { foldName, matchWorker, type RosterWorker } from "../intake/names";
import type { ParsedDocument, RawEntry } from "../intake/types";

export interface ExpectedEntry {
  /** The roster worker the line belongs to; null for a name not on the roster (a visitor). */
  workerKey: string | null;
  /** The name as written, to pair a line whose worker is not on the roster. */
  written?: string;
  date: string;
  inMinute?: number | null;
  outMinute?: number | null;
  breakMinutes?: number | null;
  minutes?: number | null;
}

export type ScoredField = "worker" | "date" | "in" | "out" | "break" | "minutes";

export interface FieldMiss {
  line: string;
  field: ScoredField;
  expected: string | number | null;
  read: string | number | null;
  flagged: boolean;
}

export interface Score {
  fields: number;
  correct: number;
  /** correct ÷ fields, 0 to 1 (1 when there is nothing to score). */
  accuracy: number;
  misses: FieldMiss[];
  /** Wrong values nothing flagged: must be none. */
  silentErrors: FieldMiss[];
  /** Expected lines with no reading at all, and readings that answer no expected line. */
  missing: string[];
  extra: string[];
}

export interface Roster {
  workers: (RosterWorker & { key: string })[];
  nicknames: [string, string][];
}

function keyOfReading(e: RawEntry, roster: Roster): { workerKey: string | null; matched: boolean } {
  const written = e.worker.value ?? e.worker.text ?? "";
  const m = matchWorker(written, roster.workers, roster.nicknames);
  if (m.status !== "matched") return { workerKey: null, matched: false };
  return { workerKey: roster.workers.find((w) => w.workerId === m.workerId)?.key ?? null, matched: true };
}

const lineKey = (workerKey: string | null, written: string | undefined, date: string | null) => `${workerKey ?? `written:${foldName(written ?? "")}`}|${date ?? "?"}`;

export function scoreReading(expected: ExpectedEntry[], parsed: ParsedDocument, roster: Roster): Score {
  const readings = parsed.entries.map((e) => {
    const who = keyOfReading(e, roster);
    return { e, who, key: lineKey(who.workerKey, e.worker.value ?? e.worker.text ?? undefined, e.date.value) };
  });
  const unused = new Set(readings.map((_, i) => i));
  const misses: FieldMiss[] = [];
  const missing: string[] = [];
  let fields = 0;
  let correct = 0;

  for (const x of expected) {
    const key = lineKey(x.workerKey, x.written, x.date);
    const at = readings.findIndex((r, i) => unused.has(i) && r.key === key);
    if (at < 0) {
      missing.push(key);
      continue;
    }
    unused.delete(at);
    const { e, who } = readings[at]!;
    const lineFlagged = e.checks.length > 0;
    const check = (field: ScoredField, want: string | number | null | undefined, got: string | number | null, flagged: boolean) => {
      if (want === undefined) return; // not in the answer key for this document
      fields += 1;
      if (want === got) correct += 1;
      else misses.push({ line: key, field, expected: want, read: got, flagged: lineFlagged || flagged });
    };
    const disagrees = (r: { value: unknown; agree: boolean | null } | null) => r === null || r.value === null || r.agree === false;
    check("worker", x.workerKey, who.workerKey, !who.matched);
    check("date", x.date, e.date.value, disagrees(e.date));
    check("in", x.inMinute, e.in?.value ?? null, disagrees(e.in));
    check("out", x.outMinute, e.out?.value ?? null, disagrees(e.out));
    check("break", x.breakMinutes, e.break?.value ?? null, disagrees(e.break));
    // Minutes: the written total when the document has one, otherwise out − in − break.
    const total = e.total?.value ?? (e.in?.value != null && e.out?.value != null ? e.out.value - e.in.value - (e.break?.value ?? 0) : null);
    check("minutes", x.minutes, total, e.total ? disagrees(e.total) : disagrees(e.in) || disagrees(e.out));
  }
  const extra = [...unused].map((i) => readings[i]!.key);
  return {
    fields,
    correct,
    accuracy: fields === 0 ? 1 : correct / fields,
    misses,
    silentErrors: misses.filter((m) => !m.flagged),
    missing,
    extra,
  };
}
