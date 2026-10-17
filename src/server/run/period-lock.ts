/**
 * One writer per pay period at a time, and no changes once its files exist.
 *
 * Every action that changes a period's hours, its run or its files first takes a transaction-scoped
 * advisory lock on the period, so two clicks (or two tabs) run one after the other, never
 * interleaved. Once the period's run is exported the period is locked, until the Owner starts a
 * correction (a new run version paying only the differences; run/corrections.ts), which opens it
 * again until that version's files exist.
 */
import { desc, eq, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";

export class PeriodLockedError extends Error {
  /** Retrying cannot help (a background job fails at once). */
  readonly permanent = true;
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

/** The lock was not free within the wait: someone else is changing the period. Trying again helps. */
export class PeriodBusyError extends Error {
  constructor() {
    super("Someone else is changing this pay period right now, so nothing was done. Try again in a moment.");
    this.name = "PeriodBusyError";
  }
}

/** How long an action waits for the period's lock (tests shorten it). */
export const periodLock = { timeoutMs: 60_000 };

/** Postgres "lock_not_available", raised when lock_timeout runs out (drizzle wraps it in `cause`). */
function isLockTimeout(error: unknown): boolean {
  for (let e = error; typeof e === "object" && e !== null; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "55P03") return true;
  }
  return false;
}

/** Waits (at most `periodLock.timeoutMs`) for, then holds until the transaction ends, an advisory lock. */
async function advisoryLock(tx: Tx, key: string, mode: "exclusive" | "shared"): Promise<void> {
  const ms = Math.max(1, Math.trunc(periodLock.timeoutMs));
  await tx.execute(sql.raw(`set local lock_timeout = ${ms}`));
  try {
    if (mode === "shared") await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))`);
    else await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  } catch (error) {
    if (isLockTimeout(error)) throw new PeriodBusyError();
    throw error;
  }
}

/** The period's lock: one writer per period. */
export async function lockPeriod(tx: Tx, payPeriodId: string): Promise<void> {
  await advisoryLock(tx, `pay_period:${payPeriodId}`, "exclusive");
}

/**
 * The agency's job orders, assignments and rate cards. Changing them takes it exclusively; creating a
 * period's files takes it shared, so a rate or an assignment's dates cannot change while hours are
 * being paid with them (and the "used by a paid week" checks see every export that finished).
 */
export async function lockCatalog(tx: Tx, agencyId: string, mode: "exclusive" | "shared"): Promise<void> {
  await advisoryLock(tx, `catalog:${agencyId}`, mode);
}

/** The agency's compliance duties (slice j): worked out and changed one writer at a time. */
export async function lockCompliance(tx: Tx, agencyId: string): Promise<void> {
  await advisoryLock(tx, `compliance:${agencyId}`, "exclusive");
}

/** The compliance lock if it is free right now (true), else nothing (false): for work that may be skipped. */
export async function tryLockCompliance(tx: Tx, agencyId: string): Promise<boolean> {
  const rows = await tx.execute<{ ok: boolean }>(sql`select pg_try_advisory_xact_lock(hashtextextended(${`compliance:${agencyId}`}, 0)) as ok`);
  return rows[0]?.ok === true;
}

/**
 * The payroll file settings (slice f): changed under the exclusive lock, so two saves cannot both
 * start a row; read under the shared lock while files are made, so the file uses the settings the
 * Owner approved.
 */
export async function lockPayrollSettings(tx: Tx, agencyId: string, mode: "exclusive" | "shared"): Promise<void> {
  await advisoryLock(tx, `payroll-settings:${agencyId}`, mode);
}

/**
 * The agency's receivables (slice h): payments, applications and write-offs change one at a time,
 * so two people can never apply the same balance twice.
 */
export async function lockReceivables(tx: Tx, agencyId: string): Promise<void> {
  await advisoryLock(tx, `receivables:${agencyId}`, "exclusive");
}

/**
 * "exported": its files were created here (the latest run is exported or closed).
 * "history": paid before Granite — no exported run here, and hours already locked by that payment.
 * A correction in progress (an earlier version exported, the latest not yet) is "open".
 */
export async function periodState(tx: Tx, payPeriodId: string): Promise<"open" | "exported" | "history"> {
  const runs = await tx.select({ status: s.payRuns.status }).from(s.payRuns).where(eq(s.payRuns.payPeriodId, payPeriodId)).orderBy(desc(s.payRuns.version));
  const paid = (status: string) => status === "exported" || status === "closed";
  if (runs[0] && paid(runs[0].status)) return "exported";
  if (runs.some((r) => paid(r.status))) return "open";
  // Entries are locked only by an export (which also marks its run exported), so a locked entry
  // without an exported run here was paid elsewhere — even if a draft run was started on it.
  const [locked] = await tx
    .select({ id: s.timeEntries.id })
    .from(s.timeEntries)
    .where(sql`${s.timeEntries.payPeriodId} = ${payPeriodId} and ${s.timeEntries.status} = 'locked'`)
    .limit(1);
  return locked ? "history" : "open";
}

/** Locks the period and checks it belongs to the agency (row-level security) and is still open. */
export async function openPeriod(tx: Tx, payPeriodId: string) {
  await lockPeriod(tx, payPeriodId);
  const [period] = await tx.select().from(s.payPeriods).where(eq(s.payPeriods.id, payPeriodId));
  if (!period) throw new PeriodNotFoundError();
  if ((await periodState(tx, payPeriodId)) !== "open") throw new PeriodLockedError();
  return period;
}
