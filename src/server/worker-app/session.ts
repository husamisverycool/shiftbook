/**
 * The signed-in worker for the worker app's pages and actions (slice t): the worker's cookie, read
 * once per request; without a valid one, the sign-in screen.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../db";
import { env } from "../env";
import type { Tx } from "../db/client";
import { readWorkerSession, type WorkerAuthDeps, type WorkerSession } from "./auth";
import { withWorker } from "./fence";
import { smsTransport } from "./sms";

/**
 * The worker app's session cookie (apart from the agency's own, so the two never mix). Live, its name
 * carries the __Host- prefix: the browser then keeps it only from this host, over HTTPS, for every path.
 */
export const WORKER_COOKIE = env.mode === "live" ? "__Host-sb_worker" : "sb_worker";

export const workerDeps = (): WorkerAuthDeps => ({ db, sms: smsTransport() });

const session = cache(async (): Promise<WorkerSession | null> => readWorkerSession({ db }, (await cookies()).get(WORKER_COOKIE)?.value));

export const currentWorkerSession = () => session();

/** The signed-in worker, or the sign-in screen in their language. */
export async function currentWorker(locale: string): Promise<WorkerSession> {
  const w = await session();
  if (!w) redirect(`/${locale}/w/sign-in`);
  return w;
}

/** A transaction fenced to the signed-in worker. */
export const asWorker = <T>(w: Pick<WorkerSession, "agencyId" | "workerId">, fn: (tx: Tx) => Promise<T>) => withWorker(db, w, fn);
