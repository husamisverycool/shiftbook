/**
 * Time-file layouts a person mapped from a sample file (SPEC §6 "saved column-mapping profiles"):
 * kept per agency in mapping_profiles under the source "timeclock:<key>", read before the built-in
 * profiles so the next file of that layout is read without asking again.
 */
import { asc, like } from "drizzle-orm";
import type { Tx } from "../db";
import * as s from "../db/schema";
import type { TimeclockProfile } from "./profiles";

export const SAVED_TIME_PREFIX = "timeclock:";

export async function savedTimeProfiles(tx: Tx): Promise<{ id: string; definition: TimeclockProfile }[]> {
  const rows = await tx
    .select({ id: s.mappingProfiles.id, definition: s.mappingProfiles.definition, createdAt: s.mappingProfiles.createdAt })
    .from(s.mappingProfiles)
    .where(like(s.mappingProfiles.source, `${SAVED_TIME_PREFIX}%`))
    .orderBy(asc(s.mappingProfiles.createdAt));
  return rows.map((r) => ({ id: r.id, definition: r.definition as TimeclockProfile })).filter((r) => r.definition?.kind === "timeclock");
}
