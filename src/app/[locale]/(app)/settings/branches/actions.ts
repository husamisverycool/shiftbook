"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAgency } from "@/server/db";
import { createBranch, renameBranch, setBranchArchived, type SetupResult } from "@/server/setup/agency";
import { actorAllowedTo } from "@/server/session";

/** Settings › Branches (docs/patterns/settings/branches.md): the service checks every rule. */
const done = () => revalidatePath("/[locale]/(app)/settings/branches", "page");

export async function createBranchAction(name: unknown): Promise<SetupResult | { ok: false; error: "generic" }> {
  if (typeof name !== "string" || name.length > 200) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("settings");
  const r = await withAgency(actor.agencyId, (tx) => createBranch(tx, actor, name.trim()));
  done();
  return r.ok ? { ok: true } : r;
}

export async function renameBranchAction(id: string, name: unknown): Promise<SetupResult | { ok: false; error: "generic" }> {
  if (!z.uuid().safeParse(id).success || typeof name !== "string" || name.length > 200) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("settings");
  const r = await withAgency(actor.agencyId, (tx) => renameBranch(tx, actor, id, name.trim()));
  done();
  return r;
}

export async function archiveBranchAction(id: string, archived: boolean): Promise<SetupResult | { ok: false; error: "generic" }> {
  if (!z.uuid().safeParse(id).success || typeof archived !== "boolean") return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("settings");
  const r = await withAgency(actor.agencyId, (tx) => setBranchArchived(tx, actor, id, archived));
  done();
  return r;
}
