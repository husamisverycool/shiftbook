/**
 * Extraction goldens (SPEC §23 tests/goldens/extract/): each case's document is read the way the app
 * reads it — structured files through their profiles, images and PDFs by the two passes answered from
 * recorded readings (no model is called) — and scored on field accuracy and on silent errors (a wrong
 * value nothing flagged), which must be zero. Approved cases and cases waiting for the owner both run;
 * a case whose recorded readings do not exist yet is reported as waiting, not passed.
 *   pnpm test:extract
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CLIENTS, NICKNAMES, WORKERS } from "../../src/server/demo/dataset";
import { createImageReader } from "../../src/server/extraction/pipeline";
import { closeOcr } from "../../src/server/extraction/redact";
import { scoreReading, type ExpectedEntry, type Roster } from "../../src/server/extraction/scoring";
import { RecordedTransport, RecordingMissingError } from "../../src/server/extraction/transport";
import { parseStructuredUpload } from "../../src/server/intake/structured";
import { LocalDocumentStore } from "../../src/server/storage";

interface ExtractCase {
  name: string;
  summary: string;
  document: string;
  mediaType: string;
  recordings: string | null;
  period: { startsOn: string; endsOn: string };
  minAccuracy: number;
  expected: ExpectedEntry[];
}

const load = (dir: string): ExtractCase[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as ExtractCase)
    : [];

const roster: Roster = { workers: WORKERS.map((w) => ({ key: w.key, workerId: w.key, firstName: w.firstName, lastName: w.lastName })), nicknames: NICKNAMES };
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-extract-")));

async function read(c: ExtractCase) {
  const bytes = new Uint8Array(readFileSync(c.document));
  if (!c.recordings) return parseStructuredUpload(c.document.split("/").pop()!, bytes);
  const reader = createImageReader({ transport: new RecordedTransport(c.recordings), store });
  const result = await reader.read({
    agencyId: "00000000-0000-4000-a000-000000000000",
    documentId: c.name,
    filename: c.document.split("/").pop()!,
    mediaType: c.mediaType,
    bytes,
    period: c.period,
    clients: Object.values(CLIENTS).map((x) => x.name).sort(),
  });
  return result.parsed;
}

afterAll(async () => {
  await closeOcr();
});

for (const [label, dir] of [
  ["approved", "tests/goldens/extract"],
  ["proposed", "tests/goldens/_proposed/extract"],
] as const) {
  describe(`extraction goldens (${label})`, () => {
    const cases = load(dir);
    if (cases.length === 0) it.todo(`no ${label} extraction cases yet`);
    for (const c of cases) {
      it(`extract/${c.name}`, { timeout: 120_000 }, async (ctx) => {
        let parsed;
        try {
          parsed = await read(c);
        } catch (error) {
          // No recorded reading for this page yet: waiting, never counted as passed.
          if (error instanceof RecordingMissingError || (error instanceof Error && /no recorded reading/i.test(error.message))) return ctx.skip();
          throw error;
        }
        const score = scoreReading(c.expected, parsed, roster);
        console.log(`extract/${c.name}: ${score.correct}/${score.fields} fields right (${(score.accuracy * 100).toFixed(1)}%), ${score.silentErrors.length} silent errors`);
        expect(score.silentErrors).toEqual([]);
        expect(score.missing).toEqual([]);
        expect(score.extra).toEqual([]);
        expect(score.accuracy).toBeGreaterThanOrEqual(c.minAccuracy);
      });
    }
  });
}
