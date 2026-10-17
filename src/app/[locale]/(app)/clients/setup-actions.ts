"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAgency } from "@/server/db";
import { countiesOf, searchPlaces, type County, type Place } from "@/server/places/census";
import { PeriodBusyError } from "@/server/run/period-lock";
import { createClient, createWorksite, setClientArchived, setWorksiteArchived, updateClient, updateWorksite, type ArchiveResult, type ClientResult, type WorksiteResult } from "@/server/setup/clients";
import { actorAllowedTo } from "@/server/session";

/**
 * Adding and editing clients and their worksites (docs/patterns/clients.md, docs/patterns/clients/[id].md).
 * Shapes only here: the setup service checks every rule and names the field that breaks one.
 */
type Busy = { ok: false; error: "busy" | "generic" };
const small = (v: unknown) => JSON.stringify(v ?? null).length <= 4000;
const isId = (v: unknown) => z.uuid().safeParse(v).success;

async function guarded<T>(work: () => Promise<T>): Promise<T | Busy> {
  try {
    return await work();
  } catch (error) {
    // Files are being made from the client list right now: try again in a moment.
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    throw error;
  } finally {
    revalidatePath("/[locale]/(app)/clients", "page");
    revalidatePath("/[locale]/(app)/clients/[id]", "page");
  }
}

export async function createClientAction(values: unknown): Promise<ClientResult | Busy> {
  if (!small(values)) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("clients");
  return guarded(() => withAgency(actor.agencyId, (tx) => createClient(tx, actor, values)));
}

export async function updateClientAction(id: string, values: unknown): Promise<ClientResult | Busy> {
  if (!isId(id) || !small(values)) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("clients");
  return guarded(() => withAgency(actor.agencyId, (tx) => updateClient(tx, actor, id, values)));
}

export async function archiveClientAction(id: string, archived: boolean): Promise<ArchiveResult | Busy> {
  if (!isId(id) || typeof archived !== "boolean") return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("clients");
  return guarded(() => withAgency(actor.agencyId, (tx) => setClientArchived(tx, actor, id, archived)));
}

export async function createWorksiteAction(clientId: string, values: unknown): Promise<WorksiteResult | Busy> {
  if (!isId(clientId) || !small(values)) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("clients");
  return guarded(() => withAgency(actor.agencyId, (tx) => createWorksite(tx, actor, clientId, values)));
}

export async function updateWorksiteAction(id: string, values: unknown): Promise<WorksiteResult | Busy> {
  if (!isId(id) || !small(values)) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("clients");
  return guarded(() => withAgency(actor.agencyId, (tx) => updateWorksite(tx, actor, id, values)));
}

export async function archiveWorksiteAction(id: string, archived: boolean): Promise<ArchiveResult | Busy> {
  if (!isId(id) || typeof archived !== "boolean") return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("clients");
  return guarded(() => withAgency(actor.agencyId, (tx) => setWorksiteArchived(tx, actor, id, archived)));
}

/** The state's counties, from the Census list (decision 0008), for the worksite dialog. */
export async function censusCountiesAction(state: string): Promise<County[]> {
  await actorAllowedTo("clients");
  return typeof state === "string" && /^[A-Z]{2}$/.test(state) ? countiesOf(state) : [];
}

/** The incorporated places of one county, from the Census list, for the worksite dialog. */
export async function censusPlacesAction(state: string, countyFips: string): Promise<Place[]> {
  await actorAllowedTo("clients");
  if (typeof state !== "string" || !/^[A-Z]{2}$/.test(state) || typeof countyFips !== "string" || !/^\d{5}$/.test(countyFips)) return [];
  return searchPlaces(state, "", countyFips, 2000);
}
