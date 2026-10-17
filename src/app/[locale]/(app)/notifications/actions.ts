"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAgency } from "@/server/db";
import { deleteNotices, deleteRead, markAllRead, markRead } from "@/server/notifications/service";
import { currentActor } from "@/server/session";

/**
 * The inbox's actions (slice r; docs/patterns/notifications.md, Linear's U / Alt+U / Backspace /
 * Shift+Backspace). Each changes only the signed-in person's own notices.
 */
const ids = z.array(z.uuid()).max(2_000);
const refresh = () => revalidatePath("/[locale]/(app)", "layout");

export async function markReadAction(input: unknown, read: unknown): Promise<{ ok: boolean }> {
  const parsed = ids.safeParse(input);
  if (!parsed.success || typeof read !== "boolean") return { ok: false };
  const actor = await currentActor();
  await withAgency(actor.agencyId, (tx) => markRead(tx, actor.userId, parsed.data, read));
  refresh();
  return { ok: true };
}

export async function markAllReadAction(): Promise<{ ok: boolean }> {
  const actor = await currentActor();
  await withAgency(actor.agencyId, (tx) => markAllRead(tx, actor.userId));
  refresh();
  return { ok: true };
}

export async function deleteAction(input: unknown): Promise<{ ok: boolean }> {
  const parsed = ids.safeParse(input);
  if (!parsed.success) return { ok: false };
  const actor = await currentActor();
  await withAgency(actor.agencyId, (tx) => deleteNotices(tx, actor.userId, parsed.data));
  refresh();
  return { ok: true };
}

export async function deleteReadAction(): Promise<{ ok: boolean }> {
  const actor = await currentActor();
  await withAgency(actor.agencyId, (tx) => deleteRead(tx, actor.userId));
  refresh();
  return { ok: true };
}
