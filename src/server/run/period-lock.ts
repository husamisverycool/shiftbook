/**
 * One writer per pay period at a time, and no changes once its files exist.
 *
 * Every action that changes a period's hours, its run or its files first takes a transaction-scoped
 * advisory lock on the period, so two clicks (or two tabs) run one after the other, never
 * interleaved. Once the period's run is exported the period is locked: in this slice a period is
 * paid once, and corrections (a new run version paying only the differences) come later.
 */
import { desc, eq, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";

export class PeriodLockedError extends Error {
  constructor() {
    super("This pay period's files were already created, so its hours and totals can no longer change.");
    this.name = "PeriodLockedError";
  }
}

export class PeriodNotFoundError extends Error {
  constructor() {
    super("That pay period does not exist for this agency.");
    this.name = "PeriodNotFoundError";
  }
}

/** Waits for, then holds until the transaction ends, the period's lock. */
export async function lockPeriod(tx: Tx, payPeriodId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`pay_period:${payPeriodId}`}, 0))`);
}

/** Locks the period and checks it belongs to the agency (row-level security) and is still open. */
export async function openPeriod(tx: Tx, payPeriodId: string) {
  await lockPeriod(tx, payPeriodId);
  const [period] = await tx.select().from(s.payPeriods).where(eq(s.payPeriods.id, payPeriodId));
  if (!period) throw new PeriodNotFoundError();
  const [latest] = await tx.select({ status: s.payRuns.status }).from(s.payRuns).where(eq(s.payRuns.payPeriodId, payPeriodId)).orderBy(desc(s.payRuns.version)).limit(1);
  if (latest && (latest.status === "exported" || latest.status === "closed")) throw new PeriodLockedError();
  return period;
}
