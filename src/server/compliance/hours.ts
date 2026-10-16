/**
 * The hours the Illinois equal-pay counter counts (820 ILCS 175/42; slice c step 5, slice j J5): work
 * at a worksite in a state with a counter rule, on day and temporary labor, from time entries not set
 * aside (on timesheets not archived), per worker, client and day; and the hours worked before
 * Shiftbook (opening balances not removed), on the date each runs to. The run and the counters page
 * read the same hours.
 */
import { and, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import type { OpeningBalance, WorkedDay } from "./counters";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Covered work per worker, client and day from `from` to `through` (inclusive), for some workers or all. */
export async function coveredHours(tx: Tx, q: { states: string[]; from: string; through: string; workerIds?: string[] }): Promise<WorkedDay[]> {
  if (q.states.length === 0 || (q.workerIds && q.workerIds.length === 0)) return [];
  const rows = await tx
    .select({ workerId: s.timeEntries.workerId, clientId: s.jobOrders.clientId, date: s.timeEntries.workDate, minutes: sql<number>`sum(${s.timeEntries.minutes})::int` })
    .from(s.timeEntries)
    .innerJoin(s.assignments, eq(s.assignments.id, s.timeEntries.assignmentId))
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId))
    .leftJoin(s.sourceDocuments, eq(s.sourceDocuments.id, s.timeEntries.sourceDocumentId))
    .where(
      and(
        q.workerIds ? inArray(s.timeEntries.workerId, q.workerIds) : undefined,
        gte(s.timeEntries.workDate, q.from),
        lte(s.timeEntries.workDate, q.through),
        ne(s.timeEntries.status, "rejected"),
        isNotNull(s.timeEntries.minutes),
        inArray(s.worksites.state, q.states),
        eq(s.jobOrders.dayAndTemporaryLabor, true),
        or(isNull(s.sourceDocuments.id), ne(s.sourceDocuments.status, "archived")),
      ),
    )
    .groupBy(s.timeEntries.workerId, s.jobOrders.clientId, s.timeEntries.workDate);
  return rows
    .filter((r): r is WorkedDay => r.workerId !== null && r.date !== null)
    .sort((a, b) => cmp(a.workerId, b.workerId) || cmp(a.clientId, b.clientId) || cmp(a.date, b.date));
}

/** Opening balances not removed, running to a date from `from` to `through`, for some workers or all. */
export async function openingBalances(tx: Tx, q: { from: string; through: string; workerIds?: string[] }): Promise<(OpeningBalance & { id: string })[]> {
  if (q.workerIds && q.workerIds.length === 0) return [];
  const rows = await tx
    .select({ id: s.hoursOpeningBalances.id, workerId: s.hoursOpeningBalances.workerId, clientId: s.hoursOpeningBalances.clientId, throughOn: s.hoursOpeningBalances.throughOn, minutes: s.hoursOpeningBalances.minutes })
    .from(s.hoursOpeningBalances)
    .where(and(isNull(s.hoursOpeningBalances.removedAt), gte(s.hoursOpeningBalances.throughOn, q.from), lte(s.hoursOpeningBalances.throughOn, q.through), q.workerIds ? inArray(s.hoursOpeningBalances.workerId, q.workerIds) : undefined));
  return rows.sort((a, b) => cmp(a.workerId, b.workerId) || cmp(a.clientId, b.clientId) || cmp(a.throughOn, b.throughOn) || cmp(a.id, b.id));
}
