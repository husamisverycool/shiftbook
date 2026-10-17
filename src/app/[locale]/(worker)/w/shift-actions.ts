"use server";

/**
 * The worker app's shift answers (docs/patterns/w/shifts.md): confirm, can't make it, accept or decline
 * an offer — always as the signed-in worker, inside the worker fence (src/server/worker-app/fence.ts);
 * the shift or offer id is the only thing the page sends.
 */
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Tx } from "@/server/db";
import * as s from "@/server/db/schema";
import { answerOffer, confirmShift, declineShift, type ShiftResult, type WorkerWho } from "@/server/schedule/service";
import { asWorker, currentWorkerSession } from "@/server/worker-app/session";

const id = z.uuid();

async function asSignedIn(fn: (tx: Tx, who: WorkerWho) => Promise<ShiftResult>): Promise<ShiftResult> {
  const w = await currentWorkerSession();
  if (!w) return { ok: false, error: "not_found" };
  try {
    return await asWorker(w, async (tx) => {
      const [me] = await tx.select({ firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers).where(eq(s.workers.id, w.workerId));
      return me ? fn(tx, { agencyId: w.agencyId, workerId: w.workerId, label: `${me.firstName} ${me.lastName} (worker)` }) : { ok: false, error: "not_found" };
    });
  } finally {
    revalidatePath("/[locale]/(worker)/w/(tabs)", "layout");
  }
}

export async function confirmShiftAction(shiftId: string): Promise<ShiftResult> {
  if (!id.safeParse(shiftId).success) return { ok: false, error: "not_found" };
  return asSignedIn((tx, who) => confirmShift(tx, who, shiftId));
}

export async function declineShiftAction(shiftId: string, reason: string): Promise<ShiftResult> {
  if (!id.safeParse(shiftId).success || typeof reason !== "string") return { ok: false, error: "not_found" };
  return asSignedIn((tx, who) => declineShift(tx, who, shiftId, reason.slice(0, 500)));
}

export async function answerOfferAction(offerId: string, accept: boolean, reason: string | null): Promise<ShiftResult> {
  if (!id.safeParse(offerId).success || typeof accept !== "boolean" || (reason !== null && typeof reason !== "string")) return { ok: false, error: "not_found" };
  return asSignedIn((tx, who) => answerOffer(tx, who, offerId, accept, reason === null ? null : reason.slice(0, 500)));
}
