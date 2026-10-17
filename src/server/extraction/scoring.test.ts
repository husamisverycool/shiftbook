import { describe, expect, it } from "vitest";
import { reading, type ParsedDocument, type RawEntry } from "../intake/types";
import { scoreReading, type ExpectedEntry, type Roster } from "./scoring";

const roster: Roster = {
  workers: [
    { key: "robert-jones", workerId: "w1", firstName: "Robert", lastName: "Jones" },
    { key: "ana-patel", workerId: "w2", firstName: "Anita", lastName: "Patel" },
  ],
  nicknames: [["Bob", "Robert"]],
};
const src = { kind: "cell" as const, row: 2, column: "x" };
function entry(name: string, date: string, total: number | null, opts: { checks?: string[]; agree?: boolean } = {}): RawEntry {
  const r = <T,>(v: T | null) => ({ ...reading(String(v), v, src), agree: opts.agree ?? null });
  return { rowIndex: 0, worker: r(name), date: r(date), in: null, out: null, break: null, total: r(total), externalId: null, checks: opts.checks ?? [] };
}
const doc = (entries: RawEntry[]): ParsedDocument => ({ kind: "image", profileKey: null, clientHint: null, entries, notes: [] });
const want: ExpectedEntry[] = [
  { workerKey: "robert-jones", date: "2026-10-06", minutes: 480 },
  { workerKey: null, written: "Dale Whitcomb", date: "2026-10-06", minutes: 240 },
];

describe("scoring a reading against its answer key", () => {
  it("counts every scored field right when the reading matches, a visitor included", () => {
    const s = scoreReading(want, doc([entry("Bob Jones", "2026-10-06", 480), entry("Dale Whitcomb", "2026-10-06", 240)]), roster);
    expect([s.fields, s.correct, s.accuracy, s.silentErrors, s.missing, s.extra]).toEqual([6, 6, 1, [], [], []]);
  });

  it("a wrong value nothing flagged is a silent error", () => {
    const s = scoreReading(want.slice(0, 1), doc([entry("Bob Jones", "2026-10-06", 450)]), roster);
    expect(s.silentErrors).toEqual([{ line: "robert-jones|2026-10-06", field: "minutes", expected: 480, read: 450, flagged: false }]);
    expect(s.accuracy).toBeCloseTo(2 / 3);
  });

  it("a wrong value with a check on its line, or passes that disagree, is flagged, not silent", () => {
    expect(scoreReading(want.slice(0, 1), doc([entry("Bob Jones", "2026-10-06", 450, { checks: ["total_mismatch"] })]), roster).silentErrors).toEqual([]);
    expect(scoreReading(want.slice(0, 1), doc([entry("Bob Jones", "2026-10-06", 450, { agree: false })]), roster).silentErrors).toEqual([]);
  });

  it("lists lines read that answer nothing, and expected lines not read", () => {
    const s = scoreReading(want.slice(0, 1), doc([entry("Anita Patel", "2026-10-06", 480)]), roster);
    expect([s.missing, s.extra]).toEqual([["robert-jones|2026-10-06"], ["ana-patel|2026-10-06"]]);
  });
});
