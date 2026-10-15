import type { EarningType, Fraction, IsoDate } from "@shiftbook/rules";
import type { ControlTotals, PayrollIds } from "../server/db/schema";
import { ExportError } from "./errors";
import { renderGustoHours } from "./gusto-hours";

export type ExportFormat = "gusto_hours_csv";

export interface ExportWorker {
  workerId: string;
  firstName: string;
  lastName: string;
  payrollIds: PayrollIds;
}

export interface ExportPayLine {
  workerId: string;
  type: EarningType;
  minutes: number;
  amountCents: number;
  rate: Fraction;
}

/** Everything an export needs, frozen from one pay run. Pure data: no database access. */
export interface ExportFixture {
  format: ExportFormat;
  mappingVersion: string;
  period: { startsOn: IsoDate; endsOn: IsoDate };
  /** The agency's earning-code map for this format: earning type → column in the file. */
  earningCodeMap: Partial<Record<EarningType, string>>;
  workers: ExportWorker[];
  payLines: ExportPayLine[];
}

export interface ExportResult {
  filename: string;
  mediaType: string;
  bytes: Uint8Array;
  controlTotals: ControlTotals;
  /** Plain-English notes for the payroll clerk (e.g. hours rounding to the file's precision). */
  notes: string[];
}

export function renderExport(fixture: ExportFixture): ExportResult {
  switch (fixture.format) {
    case "gusto_hours_csv":
      return renderGustoHours(fixture);
    default:
      throw new ExportError("unknown_format", `Unknown export format: ${String(fixture.format)}`);
  }
}
