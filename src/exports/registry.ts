import type { EarningType, Fraction, IsoDate } from "@shiftbook/rules";
import type { ControlTotals, PayrollIds } from "../server/db/schema";
import { ExportError } from "./errors";
import { renderAdpRun } from "./adp-run";
import { renderAdpWfn } from "./adp-wfn";
import { renderGustoHours } from "./gusto-hours";
import { renderPaychexFlex } from "./paychex-flex";
import { renderPaylocity } from "./paylocity";
import { renderQbdIif } from "./qbd-iif";
import { renderQboTime } from "./qbo-time";
import { renderSpreadsheet } from "./spreadsheet";
import type { CodeMap, ExportFormat, PayrollTarget } from "./targets";

export type { ExportFormat } from "./targets";

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
  /** A correction's line: how many stored lines, each rounded once, its amount adds up (default 2: was and now). */
  parts?: number;
  /** The workweek the line belongs to (dated files put it in that week). */
  workweekStart?: IsoDate;
}

/** Everything an export needs, frozen from one pay run. Pure data: no database access. */
export interface ExportFixture {
  format: ExportFormat;
  mappingVersion: string;
  period: { startsOn: IsoDate; endsOn: IsoDate };
  /** Gusto: the agency's earning-code map, earning type → column in the file. */
  earningCodeMap: Partial<Record<EarningType, string>>;
  /** Every other format: the system and its options (company code, version, layout). */
  target?: PayrollTarget;
  /** Every other format: the system's code for each kind of pay, and whether it travels as hours or dollars. */
  codes?: CodeMap;
  workers: ExportWorker[];
  payLines: ExportPayLine[];
  /**
   * A correction's file (slice e): the lines are differences against an earlier version, each the
   * difference of two amounts rounded once on their own lines (so within a cent of minutes × rate).
   */
  correction?: { version: number; baseVersion: number };
  /**
   * A worker's single regular rate in the whole period, for a correction that adds overtime or double
   * time without regular hours (the payroll system multiplies its stored base rate).
   */
  referenceRates?: Record<string, Fraction>;
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
    case "qbd_iif":
      return renderQbdIif(fixture);
    case "qbo_time_csv":
      return renderQboTime(fixture);
    case "adp_wfn_paydata":
      return renderAdpWfn(fixture);
    case "adp_run_csv":
      return renderAdpRun(fixture);
    case "paychex_flex_csv":
      return renderPaychexFlex(fixture);
    case "paylocity_time_csv":
      return renderPaylocity(fixture);
    case "spreadsheet_csv":
      return renderSpreadsheet(fixture);
    default:
      throw new ExportError("unknown_format", `Unknown export format: ${String(fixture.format)}`);
  }
}
