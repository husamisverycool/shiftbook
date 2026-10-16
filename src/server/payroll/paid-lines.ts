/**
 * What was paid, as margin (slice i) and the workers' comp packet (slice j) read it: each period's
 * latest run whose files were made (a correction computes the whole period again), each pay line's
 * overtime multiplier from its rule, the rate card in force on the line's first day of work, and the
 * pay date of each period (its last day + the pay day in force then).
 */
import { addDays, isEffective } from "@shiftbook/rules";
import { eq, inArray } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";

const DONE: ("exported" | "closed")[] = ["exported", "closed"];
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const inForce = <T extends { effectiveFrom: string; effectiveTo: string | null }>(rows: T[], date: string) => rows.find((r) => isEffective(date, r.effectiveFrom, r.effectiveTo));
/** Workers are paid this many days after a period ends (slice i, decision I8); none set: the last day. */
export const PAY_DAY_KEY = "payroll.pay_day_after_period_end";

export interface DoneRun {
  id: string;
  payPeriodId: string;
  version: number;
  endsOn: string;
}

/** The runs whose files were made: every version (the period's invoices and files are on all of them), and each period's latest. */
export async function doneRuns(tx: Tx): Promise<{ all: DoneRun[]; latest: DoneRun[] }> {
  const all = await tx
    .select({ id: s.payRuns.id, payPeriodId: s.payRuns.payPeriodId, version: s.payRuns.version, endsOn: s.payPeriods.endsOn })
    .from(s.payRuns)
    .innerJoin(s.payPeriods, eq(s.payPeriods.id, s.payRuns.payPeriodId))
    .where(inArray(s.payRuns.status, DONE));
  const latest = new Map<string, DoneRun>();
  for (const r of all) {
    const cur = latest.get(r.payPeriodId);
    if (!cur || r.version > cur.version) latest.set(r.payPeriodId, r);
  }
  return { all, latest: [...latest.values()] };
}

/** An overtime pay line's multiplier from its rule (overtime_rules): the worksite state's row, else the federal one. */
export async function multipliers(tx: Tx) {
  const rules = await tx.select().from(s.overtimeRules);
  return (ruleId: string, state: string | null, week: string) => {
    const rows = rules.filter((r) => r.ruleCode === ruleId && isEffective(week, r.effectiveFrom, r.effectiveTo));
    const r = rows.find((x) => x.jurisdiction === state) ?? rows.find((x) => x.jurisdiction === "US") ?? rows[0];
    return r ? { num: r.multiplierNum, den: r.multiplierDen } : null;
  };
}

/** The first day each pay line's time was worked (from its time entries), else its week's first day. */
export async function firstDays(tx: Tx, lines: { timeEntryIds: string[] }[]) {
  const ids = [...new Set(lines.flatMap((l) => l.timeEntryIds))];
  const dates = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const rows = await tx.select({ id: s.timeEntries.id, workDate: s.timeEntries.workDate }).from(s.timeEntries).where(inArray(s.timeEntries.id, ids.slice(i, i + 1000)));
    for (const r of rows) if (r.workDate) dates.set(r.id, r.workDate);
  }
  return (l: { timeEntryIds: string[]; workweekStart: string }) =>
    l.timeEntryIds
      .map((id) => dates.get(id))
      .filter((d): d is string => d !== undefined)
      .sort(cmp)[0] ?? l.workweekStart;
}

/** The rate card in force on the line's first day of work, else one that starts later that week (slice i review finding 2). */
export const cardFor = (rows: (typeof s.rateCards.$inferSelect)[], day: string, week: string) =>
  inForce(rows, day) ?? rows.filter((r) => r.effectiveFrom > day && r.effectiveFrom <= addDays(week, 6)).sort((x, y) => cmp(x.effectiveFrom, y.effectiveFrom))[0];

/** The placement's own card, else its job order's, for a line. */
export async function rateCards(tx: Tx) {
  const cards = await tx.select().from(s.rateCards);
  return (assignmentId: string | null, jobOrderId: string | null, day: string, week: string) => {
    if (!assignmentId) return undefined;
    const own = cards.filter((c) => c.assignmentId !== null && c.assignmentId === assignmentId);
    const jobs = cards.filter((c) => c.assignmentId === null && c.jobOrderId === jobOrderId);
    return cardFor(own, day, week) ?? cardFor(jobs, day, week);
  };
}

/** Each period's pay date: its last day + the pay day in force on that day (slice i review finding 4). */
export async function payDates(tx: Tx) {
  const rows = await tx.select().from(s.agencySettings).where(eq(s.agencySettings.key, PAY_DAY_KEY));
  const dayOn = (endsOn: string) => {
    const v = inForce(rows, endsOn)?.value;
    return typeof v === "number" ? v : 0;
  };
  return { payDateFor: (endsOn: string) => addDays(endsOn, dayOn(endsOn)), setting: (date: string) => inForce(rows, date)?.value };
}
