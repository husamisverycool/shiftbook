"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/audit";
import { testMapping, testPayroll } from "@/server/connections/queries";
import { withAgency } from "@/server/db";
import * as s from "@/server/db/schema";
import { profileForEditing, saveProfileColumns, type SaveColumnsResult } from "@/server/intake/agency-profiles";
import type { MappingProfile } from "@/server/intake/profiles";
import { SOURCES, type Mapping } from "@/server/placements/fields";
import { actorAllowedTo } from "@/server/session";

/** A time-file profile's columns, built-in and the agency's own (decision 0043: Edit columns). */
export async function profileColumnsAction(key: string): Promise<{ base: MappingProfile; current: MappingProfile } | null> {
  const actor = await actorAllowedTo("hours");
  const found = await withAgency(actor.agencyId, (tx) => profileForEditing(tx, key));
  return found ? { base: found.base, current: found.current } : null;
}

/** Saves the agency's column names for a time-file profile, or (`restore`) the built-in names again. */
export async function saveProfileColumnsAction(key: string, input: unknown, restore = false): Promise<SaveColumnsResult> {
  const actor = await actorAllowedTo("hours");
  const result = await withAgency(actor.agencyId, (tx) => saveProfileColumns(tx, actor, key, input, restore === true));
  if (result.ok) revalidatePath("/[locale]/(app)/settings/connections", "page");
  return result;
}

type TestResult = { status: "ready" | "attention"; attention?: { key: string; values?: Record<string, string | number> } };

/**
 * Zapier's Test connection: checks it now and says Ready or what needs attention. Testing is for those
 * who set the connection up (Stripe: administrators manage apps): the payroll system's is the settings
 * ability's, a recruiting system's the placements ability's.
 */
export async function testConnectionAction(key: string): Promise<TestResult | { error: "stale" }> {
  const [kind, system] = key.split(":");
  if (kind === "payroll") {
    const actor = await actorAllowedTo("settings");
    return withAgency(actor.agencyId, (tx) => testPayroll(tx));
  }
  if (kind === "recruiting" && z.enum(SOURCES).safeParse(system).success) {
    const actor = await actorAllowedTo("placements");
    const [profile] = await withAgency(actor.agencyId, (tx) => tx.select().from(s.mappingProfiles).where(eq(s.mappingProfiles.source, `placements:${system}`)));
    return testMapping(((profile?.definition as { mapping?: Mapping } | undefined)?.mapping ?? null) as Mapping | null);
  }
  return { error: "stale" };
}

/** Forgets a recruiting system's saved mapping (Zapier's Delete): the next import maps its columns again. */
export async function forgetMappingAction(source: string): Promise<{ ok: true } | { ok: false; error: "stale" }> {
  const actor = await actorAllowedTo("placementTerms");
  if (!z.enum(SOURCES).safeParse(source).success) return { ok: false, error: "stale" };
  await withAgency(actor.agencyId, async (tx) => {
    const removed = await tx.delete(s.mappingProfiles).where(eq(s.mappingProfiles.source, `placements:${source}`)).returning({ id: s.mappingProfiles.id, definition: s.mappingProfiles.definition });
    for (const r of removed) await audit(tx, actor, [{ action: "delete", entityType: "placement_import", entityId: r.id, before: { savedMapping: source, definition: r.definition } }]);
  });
  revalidatePath("/[locale]/(app)/settings/connections", "page");
  return { ok: true };
}
