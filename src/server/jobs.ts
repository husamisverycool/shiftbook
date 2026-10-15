/**
 * A small database-backed job queue (no extra service): uploads are recorded instantly and read in
 * the background. A job is claimed with FOR UPDATE SKIP LOCKED so two workers never take the same one.
 */
import { eq, sql } from "drizzle-orm";
import type { Tx } from "./db/client";
import { jobs } from "./db/schema";

export const MAX_ATTEMPTS = 3;
/** A job still "running" after this long was left by a crashed or restarted server: run it again. */
export const STALE_AFTER_MINUTES = 10;

export interface JobRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
}

type WithAgency = <T>(agencyId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;

export async function claimNextJob(withAgency: WithAgency, agencyId: string): Promise<JobRow | null> {
  return withAgency(agencyId, async (tx) => {
    const rows = await tx.execute<{ id: string; kind: string; payload: Record<string, unknown>; attempts: number }>(
      sql`select id, kind, payload, attempts from jobs
          where status = 'queued'
             or (status = 'running' and updated_at < now() - make_interval(mins => ${STALE_AFTER_MINUTES}))
          order by created_at limit 1 for update skip locked`,
    );
    const job = rows[0];
    if (!job) return null;
    await tx.update(jobs).set({ status: "running", attempts: job.attempts + 1, updatedAt: new Date() }).where(eq(jobs.id, job.id));
    return { ...job, attempts: job.attempts + 1 };
  });
}

/** Runs queued jobs one at a time until none are left or `limit` is reached. Returns how many ran. */
export async function runPendingJobs(
  withAgency: WithAgency,
  agencyId: string,
  handle: (job: JobRow) => Promise<void>,
  limit = 25,
): Promise<number> {
  let ran = 0;
  while (ran < limit) {
    const job = await claimNextJob(withAgency, agencyId);
    if (!job) break;
    ran += 1;
    try {
      await handle(job);
      await withAgency(agencyId, (tx) => tx.update(jobs).set({ status: "done", lastError: null, updatedAt: new Date() }).where(eq(jobs.id, job.id)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const permanent = typeof error === "object" && error !== null && (error as { permanent?: unknown }).permanent === true;
      const status = permanent || job.attempts >= MAX_ATTEMPTS ? "failed" : "queued";
      await withAgency(agencyId, (tx) => tx.update(jobs).set({ status, lastError: message, updatedAt: new Date() }).where(eq(jobs.id, job.id)));
      if (status === "queued") continue;
    }
  }
  return ran;
}
