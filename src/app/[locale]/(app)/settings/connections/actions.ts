"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/audit";
import { testMapping, testPayroll } from "@/server/connections/queries";
import { withAgency } from "@/server/db";
import * as s from "@/server/db/schema";
import { SOURCES, type Mapping } from "@/server/placements/fields";
import { actorAllowedTo, currentActor } from "@/server/session";

type TestResult = { status: "ready" | "attention"; attention?: { key: string; values?: Record<string, string | number> } };

/** Zapier's Test connection: checks it now and says Ready or what needs attention. Reading only. */
export async function testConnectionAction(key: string): Promise<TestResult | { error: "stale" }> {
  const actor = await currentActor();
  const [kind, system] = key.split(":");
  if (kind === "payroll") return withAgency(actor.agencyId, (tx) => testPayroll(tx));
  if (kind === "recruiting" && z.enum(SOURCES).safeParse(system).success) {
    const [profile] = await withAgency(actor.agencyId, (tx) => tx.select().from(s.mappingProfiles).where(eq(s.mappingProfiles.source, `placements:${system}`)));
    return testMapping(((profile?.definition as { mapping?: Mapping } | undefined)?.mapping ?? null) as Mapping | null);
  }
  if (kind === "time" || kind === "upload") return { status: "ready" };
  return { error: "stale" };
}

/** Forgets a recruiting system's saved mapping (Zapier's Delete): the next import maps its columns again. */
export async function forgetMappingAction(source: string): Promise<{ ok: true } | { ok: false; error: "stale" }> {
  const actor = await actorAllowedTo("placements");
  if (!z.enum(SOURCES).safeParse(source).success) return { ok: false, error: "stale" };
  await withAgency(actor.agencyId, async (tx) => {
    const removed = await tx.delete(s.mappingProfiles).where(eq(s.mappingProfiles.source, `placements:${source}`)).returning({ id: s.mappingProfiles.id, definition: s.mappingProfiles.definition });
    for (const r of removed) await audit(tx, actor, [{ action: "delete", entityType: "placement_import", entityId: r.id, before: { savedMapping: source, definition: r.definition } }]);
  });
  revalidatePath("/[locale]/(app)/settings/connections", "page");
  return { ok: true };
}
