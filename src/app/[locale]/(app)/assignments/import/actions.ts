"use server";

import { revalidatePath } from "next/cache";
import { withAgency } from "@/server/db";
import { StaleRequestError } from "@/server/errors";
import type { Mapping, Source } from "@/server/placements/fields";
import type { Decisions } from "@/server/placements/plan";
import { ImportFileError, runImport, saveDecision, saveMapping, startImport } from "@/server/placements/service";
import { PeriodBusyError } from "@/server/run/period-lock";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";
import { documentStore } from "@/server/storage";

const MAX_BYTES = 10 * 1024 * 1024;
const refresh = () => {
  revalidatePath("/[locale]/(app)/assignments/import", "page");
  revalidatePath("/[locale]/(app)/assignments", "page");
  revalidatePath("/[locale]/(app)/job-orders", "page");
};
type Refusal = "unsupported" | "empty" | "too_large" | "busy" | "stale";

async function guarded<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: Refusal }> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ImportFileError) return { ok: false, error: error.reason };
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    if (error instanceof StaleRequestError) return { ok: false, error: "stale" };
    throw error;
  } finally {
    refresh();
  }
}

export async function startImportAction(source: Source, form: FormData): Promise<{ ok: true; id: string; dropped: number } | { ok: false; error: Refusal }> {
  const actor = currentActor();
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "empty" };
  if (file.size > MAX_BYTES) return { ok: false, error: "too_large" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  return guarded(async () => {
    const r = await withAgency(actor.agencyId, (tx) => startImport(tx, actor, documentStore, { source, filename: file.name, bytes }));
    return { ok: true as const, ...r };
  });
}

export async function saveMappingAction(id: string, mapping: Mapping): Promise<{ ok: true } | { ok: false; error: Refusal }> {
  const actor = currentActor();
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => saveMapping(tx, actor, documentStore, id, mapping));
    return { ok: true as const };
  });
}

export async function saveDecisionAction(id: string, kind: keyof Decisions, raw: string, value: string | null): Promise<{ ok: true } | { ok: false; error: Refusal }> {
  const actor = currentActor();
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => saveDecision(tx, actor, id, kind, raw, value));
    return { ok: true as const };
  });
}

export async function runImportAction(id: string): Promise<{ ok: true } | { ok: false; error: Refusal }> {
  const actor = currentActor();
  return guarded(async () => {
    await withAgency(actor.agencyId, async (tx) => runImport(tx, actor, documentStore, id, await agencyToday(tx)));
    return { ok: true as const };
  });
}
