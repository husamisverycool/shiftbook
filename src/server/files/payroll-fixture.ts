/**
 * The payroll-file input for a set of pay lines, shared by the run (a dry run that turns any file
 * problem into a blocker before anyone clicks "Create files") and the files service (the real file).
 */
import type { EarningType, Fraction } from "@shiftbook/rules";
import { eq } from "drizzle-orm";
import type { ExportFixture } from "../../exports/registry";
import type { Tx } from "../db/client";
import * as s from "../db/schema";

export const PAYROLL_FORMAT = "gusto_hours_csv" as const;
export const PAYROLL_MAPPING_VERSION = "gusto-core-v1";

const effective = (date: string, from: string, to: string | null) => from <= date && (to === null || date <= to);

export async function payrollFixture(
  tx: Tx,
  period: { startsOn: string; endsOn: string },
  lines: { workerId: string; type: EarningType; minutes: number; amountCents: number; rate: Fraction }[],
): Promise<ExportFixture> {
  const settings = (await tx.select().from(s.agencySettings).where(eq(s.agencySettings.key, `earning_code_map.${PAYROLL_FORMAT}`))).filter((r) =>
    effective(period.startsOn, r.effectiveFrom, r.effectiveTo),
  );
  if (settings.length > 1) throw new Error(`The earning-code map for the payroll file has ${settings.length} rows in effect on ${period.startsOn}.`);
  const ids = [...new Set(lines.map((l) => l.workerId))];
  const people = (await tx.select().from(s.workers)).filter((w) => ids.includes(w.id));
  return {
    format: PAYROLL_FORMAT,
    mappingVersion: PAYROLL_MAPPING_VERSION,
    period: { startsOn: period.startsOn, endsOn: period.endsOn },
    earningCodeMap: (settings[0]?.value as ExportFixture["earningCodeMap"] | undefined) ?? {},
    workers: people.map((w) => ({ workerId: w.id, firstName: w.firstName, lastName: w.lastName, payrollIds: w.payrollIds })),
    payLines: lines.map((l) => ({ workerId: l.workerId, type: l.type, minutes: l.minutes, amountCents: l.amountCents, rate: l.rate })),
  };
}
