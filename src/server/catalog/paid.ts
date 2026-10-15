/**
 * What has been paid already: the last day of the last paid week that holds hours of some
 * assignments. Hours are locked only when a period's files are created (or were paid before
 * Shiftbook), so locked entries mark paid weeks.
 */
import { and, eq, inArray, max } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";

/** The last day of the last paid week with hours of these assignments, or null. */
export async function paidThrough(tx: Tx, assignmentIds: string[]): Promise<string | null> {
  if (assignmentIds.length === 0) return null;
  const [row] = await tx
    .select({ last: max(s.payPeriods.endsOn) })
    .from(s.timeEntries)
    .innerJoin(s.payPeriods, eq(s.payPeriods.id, s.timeEntries.payPeriodId))
    .where(and(eq(s.timeEntries.status, "locked"), inArray(s.timeEntries.assignmentId, assignmentIds)));
  return row?.last ?? null;
}

/** The first and last paid work dates of one assignment, or null when nothing of it was paid. */
export async function paidDates(tx: Tx, assignmentId: string): Promise<{ first: string; last: string } | null> {
  const rows = await tx
    .select({ date: s.timeEntries.workDate })
    .from(s.timeEntries)
    .where(and(eq(s.timeEntries.status, "locked"), eq(s.timeEntries.assignmentId, assignmentId)));
  const dates = rows.map((r) => r.date).filter((d): d is string => d !== null).sort();
  return dates.length > 0 ? { first: dates[0]!, last: dates.at(-1)! } : null;
}
