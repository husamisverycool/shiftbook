"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAgency } from "@/server/db";
import { StaleRequestError } from "@/server/errors";
import { addNickname, NICKNAME_MAX, NicknameProblemError, removeNickname } from "@/server/intake/nicknames";
import { actorAllowedTo } from "@/server/session";

const refresh = () => revalidatePath("/[locale]/(app)/settings/names", "page");
const name = z.string().max(NICKNAME_MAX * 2);

export async function addNicknameAction(nickname: string, givenName: string): Promise<{ ok: true } | { error: "blank" | "same" | "too_long" | "exists" }> {
  const actor = await actorAllowedTo("hours");
  if (!name.safeParse(nickname).success || !name.safeParse(givenName).success) return { error: "too_long" };
  try {
    await withAgency(actor.agencyId, (tx) => addNickname(tx, actor, nickname, givenName));
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof NicknameProblemError) return { error: error.problem };
    throw error;
  }
}

export async function removeNicknameAction(id: string): Promise<{ ok: boolean }> {
  const actor = await actorAllowedTo("hours");
  if (!z.uuid().safeParse(id).success) return { ok: false };
  try {
    await withAgency(actor.agencyId, (tx) => removeNickname(tx, actor, id));
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof StaleRequestError) return { ok: false };
    throw error;
  }
}
