import { createDatabase } from "../../src/server/db/client";
import type { Tx } from "../../src/server/db/client";
import { earningType } from "../../src/server/db/schema";
import { approveRun } from "../../src/server/run/approval";
import { computeRun } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";

const PORT = process.env.SHIFTBOOK_PG_PORT ?? "54329";
const TEST_DB = process.env.SHIFTBOOK_TEST_DB ?? "shiftbook_test";

export const appUrl = () => process.env.TEST_APP_URL ?? `postgres://shiftbook_app@127.0.0.1:${PORT}/${TEST_DB}`;
export const ownerUrl = () =>
  process.env.TEST_OWNER_URL ?? `postgres://shiftbook_owner@127.0.0.1:${PORT}/${TEST_DB}`;

/** The app's view of the database: the shiftbook_app role, fenced by row-level security. */
export const openAppDb = () => createDatabase(appUrl(), { max: 2 });
/** The schema owner (BYPASSRLS): used only to arrange test data. */
export const openOwnerDb = () => createDatabase(ownerUrl(), { max: 2 });

/**
 * Awaits a promise that must fail and returns Postgres's own error message (the query builder wraps
 * it in a "Failed query" error whose `cause` is the database error).
 */
export async function databaseError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error) return cause.message;
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the database to refuse this operation, but it succeeded");
}

/**
 * Pay or bill lines in the engine's order (workweek, earning type, then minutes). Postgres returns
 * rows in no promised order, so a test that compares lines in order sorts them first.
 */
export function inLineOrder<T extends { workweekStart: string; type: (typeof earningType.enumValues)[number]; minutes: number }>(rows: T[]): T[] {
  const rank = (t: T["type"]) => earningType.enumValues.indexOf(t);
  return [...rows].sort((a, b) => (a.workweekStart < b.workweekStart ? -1 : a.workweekStart > b.workweekStart ? 1 : 0) || rank(a.type) - rank(b.type) || a.minutes - b.minutes);
}

/** The Owner approves the period's run as it stands (slice e: files are made only from an approved run). */
export async function approveAsOwner(tx: Tx, actor: Actor, payPeriodId: string): Promise<void> {
  const owner: Actor = { ...actor, role: "owner" };
  const run = await computeRun(tx, owner, payPeriodId);
  const result = await approveRun(tx, owner, payPeriodId, run.fingerprint);
  if (!result.ok) throw new Error(`the run could not be approved: ${result.error}`);
}
