import { createDatabase } from "../../src/server/db/client";

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
