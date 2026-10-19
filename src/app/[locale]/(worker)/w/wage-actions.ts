"use server";

/**
 * The worker's own earned-wage-access request (docs/patterns/w.md item 6; SPEC §27 item 9): recorded
 * for the agency's wage-access partner under the agency's rules — nothing moves in Tabulado.
 */
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as s from "@/server/db/schema";
import { requestWageAccessAsWorker, type MoneyResult } from "@/server/money/service";
import { asWorker, currentWorkerSession } from "@/server/worker-app/session";

export async function requestMyWageAccessAction(amountCents: number, delivery: "standard" | "expedited"): Promise<MoneyResult> {
  const w = await currentWorkerSession();
  if (!w) return { ok: false, error: "not_found" };
  try {
    return await asWorker(w, async (tx) => {
      const [me] = await tx.select({ firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers).where(eq(s.workers.id, w.workerId));
      if (!me) return { ok: false, error: "not_found" } as const;
      return requestWageAccessAsWorker(tx, { agencyId: w.agencyId, workerId: w.workerId, label: `${me.firstName} ${me.lastName} (worker app)` }, amountCents, delivery);
    });
  } finally {
    revalidatePath("/[locale]/(worker)/w/(tabs)", "layout");
  }
}
