import { env } from "../env";
import { createDatabase, type Database } from "./client";

// One pool per server process (kept across hot reloads in development).
const globalForDb = globalThis as unknown as { shiftbookDb?: Database };

export const database: Database = globalForDb.shiftbookDb ?? createDatabase(env.databaseUrl);
globalForDb.shiftbookDb = database;

export const { db, withAgency } = database;
export type { Db, Tx } from "./client";
