import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { renderExport, type ExportFixture } from "../../src/exports/registry";

/**
 * An export golden is a folder: case.json (the run fixture, format and mapping) and the expected
 * file, byte for byte, plus its expected control totals.
 */
export interface ExportCase {
  name: string;
  dir: string;
  fixture: ExportFixture;
  expectedFile: string;
  expectedControlTotals: unknown;
  /** The notes for the payroll clerk, when the case pins them. */
  notes?: string[];
}

export function loadExportCases(root: string): ExportCase[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) => {
      const dir = join(root, name);
      const spec = JSON.parse(readFileSync(join(dir, "case.json"), "utf8")) as {
        fixture: ExportFixture;
        expectedFile: string;
        expectedControlTotals: unknown;
        notes?: string[];
      };
      return { name, dir, ...spec };
    });
}

export function checkExportCase(c: ExportCase): void {
  const result = renderExport(c.fixture);
  const expectedBytes = readFileSync(join(c.dir, c.expectedFile));
  expect(Buffer.from(result.bytes).equals(expectedBytes)).toBe(true);
  expect(result.filename).toBe(c.expectedFile);
  expect(result.controlTotals).toEqual(c.expectedControlTotals);
  if (c.notes) expect(result.notes).toEqual(c.notes);
}
