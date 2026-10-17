/**
 * Writes PROPOSED extraction golden cases (SPEC §23 tests/goldens/extract/) to
 * tests/goldens/_proposed/extract/ for the owner to approve. The expected values come from the demo
 * documents' ground truth (demo/truth/, written when the documents were made) and, for the two
 * printed test photos, from the hand-written answers in tests/e2e/fixtures/make-photo-fixture.ts.
 *   pnpm tsx scripts/propose-extract-goldens.ts
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CURRENT_PERIOD } from "../src/server/demo/dataset";
import type { ExpectedEntry } from "../src/server/extraction/scoring";

const OUT = "tests/goldens/_proposed/extract";
const TRUTH = "demo/truth/2026-10-05";
const SAMPLES = "demo/samples/2026-10-05";
const MEDIA: Record<string, string> = { csv: "text/csv", jpg: "image/jpeg", heic: "image/heic", pdf: "application/pdf" };

export interface ExtractCase {
  name: string;
  summary: string;
  document: string;
  mediaType: string;
  /** Recorded readings the replay transport answers from (no model is called); null for structured files. */
  recordings: string | null;
  period: { startsOn: string; endsOn: string };
  /** The least field accuracy accepted (silent errors must be zero whatever this says). */
  minAccuracy: number;
  expected: ExpectedEntry[];
}

type TruthRow = { workerKey?: string; written?: string | { name: string }; date?: string; inMinute?: number; outMinute?: number; breakMinutes?: number; minutes?: number; expected?: ExpectedEntry & { workerKey: string | null } };
type Truth = { document: string; kind: string; date?: string; rows: TruthRow[]; handwritten?: boolean };

function expectedOf(t: Truth): ExpectedEntry[] {
  return t.rows.map((r) => {
    const x = r.expected ?? r;
    const written = typeof r.written === "string" ? r.written : r.written?.name;
    const e: ExpectedEntry = { workerKey: x.workerKey ?? null, date: (x.date ?? t.date)! };
    if (written) e.written = written;
    if (x.inMinute !== undefined) e.inMinute = x.inMinute;
    if (x.outMinute !== undefined) e.outMinute = x.outMinute;
    if (x.breakMinutes !== undefined) e.breakMinutes = x.breakMinutes;
    if (x.minutes !== undefined) e.minutes = x.minutes;
    return e;
  });
}

const cases: ExtractCase[] = [];
for (const file of readdirSync(TRUTH).sort()) {
  const t = JSON.parse(readFileSync(join(TRUTH, file), "utf8")) as Truth;
  const ext = t.document.split(".").pop()!.toLowerCase();
  const structured = ext === "csv" || ext === "xlsx";
  cases.push({
    name: t.document.replace(/\.[a-z]+$/i, ""),
    summary: structured
      ? `The ${t.kind === "vms_export" ? "Fieldglass export" : "time-clock export"} read through its saved profile: every line, worker, date and hours exactly as the file states them (demo/truth).`
      : `The ${t.handwritten ? "hand-written sign-in sheet" : "signed weekly hours PDF"} read by the two passes from recorded readings: each line's worker, date and hours as written (demo/truth). Runs once its recorded readings exist; until then it is reported as waiting.`,
    document: join(SAMPLES, t.document),
    mediaType: MEDIA[ext] ?? "application/octet-stream",
    recordings: structured ? null : "demo/recordings",
    period: { startsOn: CURRENT_PERIOD.startsOn, endsOn: CURRENT_PERIOD.endsOn },
    minAccuracy: structured ? 1 : 0.95,
    expected: expectedOf(t),
  });
}

// The printed test photos (TEST FIXTURE answers, not demo data).
const photo = (file: string, date: string, rows: [string | null, string, number, number, number, number][]): ExtractCase => ({
  name: file.replace(/\.jpg$/, ""),
  summary: `A printed sign-in sheet (test fixture) read by the two passes from its recorded readings. ${date === "2026-10-07" ? "Kateryna's written total (8 hours) does not match her times (7 h 30 min) and a visitor not on the roster signed in: both are read as written and flagged, never silently accepted." : "It reads cleanly."}`,
  document: `tests/e2e/fixtures/${file}`,
  mediaType: "image/jpeg",
  recordings: "tests/e2e/fixtures/recordings",
  period: { startsOn: CURRENT_PERIOD.startsOn, endsOn: CURRENT_PERIOD.endsOn },
  minAccuracy: 1,
  expected: rows.map(([workerKey, written, inMinute, outMinute, breakMinutes, minutes]) => ({ workerKey, written, date, inMinute, outMinute, breakMinutes, minutes })),
});
cases.push(
  photo("photo-sign-in-2026-10-06.jpg", "2026-10-06", [
    ["robert-jones", "Robert Jones", 900, 1410, 30, 480],
    ["kateryna-bondarenko", "Kateryna Bondarenko", 900, 1380, 30, 450],
  ]),
  photo("photo-sign-in-2026-10-07.jpg", "2026-10-07", [
    ["robert-jones", "Robert Jones", 900, 1410, 30, 480],
    ["kateryna-bondarenko", "Kateryna Bondarenko", 900, 1380, 30, 480],
    [null, "Dale Whitcomb", 900, 1140, 0, 240],
  ]),
);

mkdirSync(OUT, { recursive: true });
for (const c of cases) {
  writeFileSync(join(OUT, `${c.name}.json`), JSON.stringify(c, null, 2) + "\n");
  console.log(`proposed extract/${c.name} (${c.expected.length} lines)`);
}
