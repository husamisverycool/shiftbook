/**
 * The payroll-file input for a set of pay lines, shared by the run (a dry run that turns any file
 * problem into a blocker before anyone clicks "Create files") and the files service (the real file).
 * The format, its options and its codes are the agency's payroll file settings in use now (slice f,
 * decision F1: one system at a time; a change applies to every file not made yet).
 */
import type { EarningType, Fraction } from "@shiftbook/rules";
import type { ExportFixture } from "../../exports/registry";
import type { ExportFormat, PayrollTarget } from "../../exports/targets";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { gustoColumns, payrollCodes, payrollTarget } from "../payroll/settings";

/** Which version of each format's mapping a file was made with (stored on the export). */
export const MAPPING_VERSION: Record<ExportFormat, string> = {
  gusto_hours_csv: "gusto-core-v1",
  qbd_iif: "qbd-iif-v1",
  qbo_time_csv: "qbo-time-v1",
  adp_wfn_paydata: "adp-wfn-v1",
  adp_run_csv: "adp-run-v1",
  spreadsheet_csv: "spreadsheet-v1",
};

/** No payroll system is chosen yet: the run names it as a blocker. */
export class NoPayrollTargetError extends Error {
  constructor() {
    super("No payroll system is chosen yet. Choose it in the payroll file settings.");
    this.name = "NoPayrollTargetError";
  }
}

/** The settings a payroll file is made with (part of what the Owner approves). */
export async function payrollSettings(tx: Tx): Promise<{ target: PayrollTarget; earningCodeMap: Partial<Record<EarningType, string>>; codes: ExportFixture["codes"] } | null> {
  const target = await payrollTarget(tx);
  if (!target) return null;
  if (target.format === "gusto_hours_csv") return { target, earningCodeMap: await gustoColumns(tx), codes: undefined };
  return { target, earningCodeMap: {}, codes: (await payrollCodes(tx, target.format)).codes };
}

export async function payrollFixture(
  tx: Tx,
  period: { startsOn: string; endsOn: string },
  lines: { workerId: string; type: EarningType; minutes: number; amountCents: number; rate: Fraction; parts?: number; workweekStart?: string }[],
): Promise<ExportFixture> {
  const settings = await payrollSettings(tx);
  if (!settings) throw new NoPayrollTargetError();
  const ids = [...new Set(lines.map((l) => l.workerId))];
  const people = (await tx.select().from(s.workers)).filter((w) => ids.includes(w.id));
  const format = settings.target.format;
  return {
    format,
    mappingVersion: MAPPING_VERSION[format],
    period: { startsOn: period.startsOn, endsOn: period.endsOn },
    earningCodeMap: settings.earningCodeMap,
    ...(format === "gusto_hours_csv" ? {} : { target: settings.target, codes: settings.codes }),
    workers: people.map((w) => ({ workerId: w.id, firstName: w.firstName, lastName: w.lastName, payrollIds: w.payrollIds })),
    payLines: lines.map((l) => ({
      workerId: l.workerId,
      type: l.type,
      minutes: l.minutes,
      amountCents: l.amountCents,
      rate: l.rate,
      ...(l.parts !== undefined ? { parts: l.parts } : {}),
      ...(l.workweekStart !== undefined ? { workweekStart: l.workweekStart } : {}),
    })),
  };
}
