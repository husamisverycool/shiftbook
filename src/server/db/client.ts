import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>;
export type Db = Database["db"];
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDatabase(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
  const db = drizzle(client, { schema });

  /**
   * Runs `fn` in a transaction fenced to one agency. Row-level security uses the transaction-local
   * setting app.agency_id, so nothing in `fn` can read or write another agency's rows.
   */
  async function withAgency<T>(agencyId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!UUID.test(agencyId)) throw new Error("withAgency: agencyId must be a UUID");
    return db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.agency_id', ${agencyId}, true)`);
      return fn(tx);
    });
  }

  return { client, db, withAgency, close: () => client.end({ timeout: 5 }) };
}
