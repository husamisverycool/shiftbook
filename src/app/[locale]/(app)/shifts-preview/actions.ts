"use server";

// The worker app's shift answers, in the demo preview (docs/patterns/shifts-preview.md): an agency person
// who changes placements answers as a demo worker. The worker app (slice t) calls the same services with
// the signed-in worker.
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAgency, type Tx } from "@/server/db";
import * as s from "@/server/db/schema";
import { env } from "@/server/env";
import { answerOffer, confirmShift, declineShift, type ShiftResult, type WorkerWho } from "@/server/schedule/service";
import { actorAllowedTo } from "@/server/session";

const id = z.uuid();

async function asWorker(tx: Tx, agencyId: string, workerId: string): Promise<WorkerWho | null> {
  const [w] = await tx.select({ firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers).where(eq(s.workers.id, workerId));
  return w ? { agencyId, workerId, label: `${w.firstName} ${w.lastName} (worker)` } : null;
}

async function run(ability: "placements", workerId: string, fn: (tx: Tx, who: WorkerWho) => Promise<ShiftResult>): Promise<ShiftResult> {
  const actor = await actorAllowedTo(ability);
  if (env.mode !== "demo" || !id.safeParse(workerId).success) return { ok: false, error: "not_found" };
  try {
    return await withAgency(actor.agencyId, async (tx) => {
      const who = await asWorker(tx, actor.agencyId, workerId);
      return who ? fn(tx, who) : { ok: false, error: "not_found" };
    });
  } finally {
    revalidatePath("/[locale]/(app)/shifts-preview", "page");
    revalidatePath("/[locale]/(app)/schedule", "page");
  }
}

export async function confirmAsWorkerAction(workerId: string, shiftId: string): Promise<ShiftResult> {
  if (!id.safeParse(shiftId).success) return { ok: false, error: "not_found" };
  return run("placements", workerId, (tx, who) => confirmShift(tx, who, shiftId));
}

export async function declineAsWorkerAction(workerId: string, shiftId: string, reason: string): Promise<ShiftResult> {
  if (!id.safeParse(shiftId).success || typeof reason !== "string") return { ok: false, error: "not_found" };
  return run("placements", workerId, (tx, who) => declineShift(tx, who, shiftId, reason));
}

export async function answerOfferAsWorkerAction(workerId: string, offerId: string, accept: boolean, reason: string | null): Promise<ShiftResult> {
  if (!id.safeParse(offerId).success || typeof accept !== "boolean" || (reason !== null && typeof reason !== "string")) return { ok: false, error: "not_found" };
  return run("placements", workerId, (tx, who) => answerOffer(tx, who, offerId, accept, reason));
}
