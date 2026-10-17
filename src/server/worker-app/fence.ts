/**
 * The worker fence (slice t; drizzle/0046): a worker app transaction sets the agency (row-level
 * security's tenant fence) and the worker; RESTRICTIVE policies then show that worker's own rows only
 * on every table holding a worker's data — their hours, pay lines, assignments, messages, forms. A
 * mistake in a query can then show nothing of a colleague's.
 */
import { sql } from "drizzle-orm";
import type { Db, Tx } from "../db/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function withWorker<T>(db: Db, who: { agencyId: string; workerId: string }, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(who.agencyId) || !UUID.test(who.workerId)) throw new Error("withWorker: ids must be UUIDs");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.agency_id', ${who.agencyId}, true), set_config('app.worker_id', ${who.workerId}, true)`);
    return fn(tx);
  });
}

/**
 * The one check that must see the agency's other workers — whether an SSN typed is already on one —
 * runs with the worker fence lifted for that query alone, and answers only yes or no.
 */
export async function outsideWorkerFence<T>(tx: Tx, workerId: string, fn: () => Promise<T>): Promise<T> {
  await tx.execute(sql`select set_config('app.worker_id', '', true)`);
  try {
    return await fn();
  } finally {
    await tx.execute(sql`select set_config('app.worker_id', ${workerId}, true)`);
  }
}
