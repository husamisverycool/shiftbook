"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAX_PLACEMENT_FILE_BYTES } from "@/lib/limits";
import { withAgency } from "@/server/db";
import { StaleRequestError } from "@/server/errors";
import { FIELDS, SOURCES, type Mapping, type Source } from "@/server/placements/fields";
import type { DateOrder, Decisions } from "@/server/placements/plan";
import { ImportFileError, runImport, saveDateOrder, saveDecision, saveMapping, startImport } from "@/server/placements/service";
import { PeriodBusyError } from "@/server/run/period-lock";
import { actorAllowedTo } from "@/server/session";
import { agencyToday } from "@/server/settings";
import { documentStore } from "@/server/storage";

const MAX_BYTES = MAX_PLACEMENT_FILE_BYTES;
const refresh = () => {
  revalidatePath("/[locale]/(app)/assignments/import", "page");
  revalidatePath("/[locale]/(app)/assignments", "page");
  revalidatePath("/[locale]/(app)/job-orders", "page");
};
type Refusal = "unsupported" | "empty" | "too_large" | "too_many_rows" | "no_header" | "busy" | "stale";

// Every input is checked against its shape: a hand-made request gets the same refusal as a stale tab.
const id = z.uuid();
const SourceSchema = z.enum(SOURCES);
const MappingSchema = z.partialRecord(z.enum(FIELDS), z.string().max(500));
const KindSchema = z.enum(["worker", "client", "jobOrder", "status"]);
const RawSchema = z.string().max(500);
const ValueSchema = z.string().max(200).nullable();
const DateOrderSchema = z.enum(["month_first", "day_first"]).nullable();

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

/** Starts an import; the columns removed on receipt are kept on it and shown on the mapping step. */
export async function startImportAction(source: Source, form: FormData): Promise<{ ok: true; id: string } | { ok: false; error: Refusal }> {
  const actor = await actorAllowedTo("placements");
  const file = form.get("file");
  if (!SourceSchema.safeParse(source).success) return { ok: false, error: "unsupported" };
  if (!(file instanceof File)) return { ok: false, error: "empty" };
  if (file.size > MAX_BYTES) return { ok: false, error: "too_large" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  return guarded(async () => {
    const r = await withAgency(actor.agencyId, async (tx) => startImport(tx, actor, documentStore, { source, filename: file.name, bytes }, await agencyToday(tx)));
    return { ok: true as const, id: r.id };
  });
}

export async function saveMappingAction(importId: string, mapping: Mapping): Promise<{ ok: true } | { ok: false; error: Refusal }> {
  const actor = await actorAllowedTo("placements");
  const parsed = MappingSchema.safeParse(mapping);
  if (!id.safeParse(importId).success || !parsed.success) return { ok: false, error: "stale" };
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => saveMapping(tx, actor, documentStore, importId, parsed.data));
    return { ok: true as const };
  });
}

export async function saveDecisionAction(importId: string, kind: keyof Decisions, raw: string, value: string | null): Promise<{ ok: true } | { ok: false; error: Refusal }> {
  const actor = await actorAllowedTo("placements");
  if (!id.safeParse(importId).success || !KindSchema.safeParse(kind).success || !RawSchema.safeParse(raw).success || !ValueSchema.safeParse(value).success) {
    return { ok: false, error: "stale" };
  }
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => saveDecision(tx, actor, importId, kind, raw, value));
    return { ok: true as const };
  });
}

export async function saveDateOrderAction(importId: string, order: DateOrder | null): Promise<{ ok: true } | { ok: false; error: Refusal }> {
  const actor = await actorAllowedTo("placements");
  if (!id.safeParse(importId).success || !DateOrderSchema.safeParse(order).success) return { ok: false, error: "stale" };
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => saveDateOrder(tx, actor, importId, order));
    return { ok: true as const };
  });
}

export async function runImportAction(importId: string): Promise<{ ok: true } | { ok: false; error: Refusal }> {
  const actor = await actorAllowedTo("placements");
  if (!id.safeParse(importId).success) return { ok: false, error: "stale" };
  return guarded(async () => {
    await withAgency(actor.agencyId, async (tx) => runImport(tx, actor, documentStore, importId, await agencyToday(tx)));
    return { ok: true as const };
  });
}
