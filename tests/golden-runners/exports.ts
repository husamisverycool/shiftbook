import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { ExportError } from "../../src/exports/errors";
import { renderExport, type ExportFixture } from "../../src/exports/registry";

/**
 * An export golden is a folder: case.json (the run fixture, format and mapping) and the expected
 * file, byte for byte, plus its expected control totals.
 */
export interface ExportCase {
  name: string;
  dir: string;
  fixture: ExportFixture;
  expectedFile?: string;
  expectedControlTotals?: unknown;
  /** The notes for the payroll clerk, when the case pins them. */
  notes?: string[];
  /** A refusal case (slice f): the export must refuse with this code, worker and message. */
  expectedError?: { code: string; workerId?: string; message: string };
}

export function loadExportCases(root: string): ExportCase[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) => {
      const dir = join(root, name);
      const spec = JSON.parse(readFileSync(join(dir, "case.json"), "utf8")) as Omit<ExportCase, "name" | "dir">;
      return { name, dir, ...spec };
    });
}

export function checkExportCase(c: ExportCase): void {
  if (c.expectedError) {
    let error: unknown = null;
    try {
      renderExport(c.fixture);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ExportError);
    const refusal = error as ExportError;
    expect({ code: refusal.code, workerId: refusal.workerId, message: refusal.message }).toEqual({ workerId: undefined, ...c.expectedError });
    return;
  }
  if (!c.expectedFile) throw new Error(`${c.name}: a case needs an expected file or an expected refusal.`);
  const result = renderExport(c.fixture);
  const expectedBytes = readFileSync(join(c.dir, c.expectedFile));
  expect(Buffer.from(result.bytes).equals(expectedBytes)).toBe(true);
  expect(result.filename).toBe(c.expectedFile);
  expect(result.controlTotals).toEqual(c.expectedControlTotals);
  if (c.notes) expect(result.notes).toEqual(c.notes);
}
