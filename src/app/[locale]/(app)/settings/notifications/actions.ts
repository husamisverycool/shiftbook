"use server";

import { withAgency } from "@/server/db";
import { setEmailSetting } from "@/server/notifications/service";
import { currentActor } from "@/server/session";

/** A person's own email switch for one kind of notice (slice r; Linear: Account › Notifications). */
export async function setEmailAction(kind: unknown, email: unknown): Promise<{ ok: boolean }> {
  const actor = await currentActor();
  const r = await withAgency(actor.agencyId, (tx) => setEmailSetting(tx, actor.agencyId, actor.userId, actor.role, kind, email));
  return { ok: r.ok };
}
