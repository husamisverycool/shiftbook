import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { ExportError } from "../../src/exports/errors";
import { fieldglassUpload, invoiceCsv, type InvoiceFileInput } from "../../src/exports/invoice-files";
import { renderExport, type ExportFixture } from "../../src/exports/registry";

/**
 * An export golden is a folder: case.json (the run fixture, format and mapping) and the expected
 * file, byte for byte, plus its expected control totals. An invoice file's case (slice g) gives the
 * invoice's lines instead of a run fixture, and the file it must make.
 */
export interface ExportCase {
  name: string;
  dir: string;
  fixture: ExportFixture;
  invoiceFile?: { format: InvoiceFileFormat; input: InvoiceFileInput };
  expectedFile?: string;
  expectedControlTotals?: unknown;
  /** The notes for the payroll clerk, when the case pins them. */
  notes?: string[];
  /** A refusal case (slice f): the export must refuse with this code, worker and message. */
  expectedError?: { code: string; workerId?: string; message: string };
}

export type InvoiceFileFormat = "invoice_csv" | "fieldglass_time_sheet_invoice";
export const INVOICE_FILES: Record<InvoiceFileFormat, { make: (input: InvoiceFileInput) => Uint8Array; filename: (number: string) => string }> = {
  invoice_csv: { make: invoiceCsv, filename: (number) => `invoice-${number}.csv` },
  fieldglass_time_sheet_invoice: { make: fieldglassUpload, filename: (number) => `fieldglass-${number}.csv` },
};

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
  if (c.invoiceFile) return checkInvoiceFileCase(c, c.invoiceFile);
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

function checkInvoiceFileCase(c: ExportCase, file: NonNullable<ExportCase["invoiceFile"]>): void {
  const kind = INVOICE_FILES[file.format];
  if (c.expectedError) {
    let error: unknown = null;
    try {
      kind.make(file.input);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ExportError);
    const refusal = error as ExportError;
    expect({ code: refusal.code, workerId: refusal.workerId, message: refusal.message }).toEqual({ workerId: undefined, ...c.expectedError });
    return;
  }
  if (!c.expectedFile) throw new Error(`${c.name}: a case needs an expected file or an expected refusal.`);
  expect(c.expectedFile).toBe(kind.filename(file.input.number));
  expect(Buffer.from(kind.make(file.input)).equals(readFileSync(join(c.dir, c.expectedFile)))).toBe(true);
}
