/**
 * An agency's own column names for the built-in time-file profiles (decision 0043): a VMS report's
 * layout varies by buyer, so Settings › Connections lets the agency rename each column. Every save is a
 * new version (the files already read keep pointing at the version that read them).
 */
import { desc, inArray } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { can } from "../permissions";
import type { Actor } from "../session";
import { BUILT_IN_PROFILES, profileColumnProblems, withAgencyColumns, type ColumnProblem, type MappingProfile, type ProfileColumns } from "./profiles";

export interface AgencyProfiles {
  /** The profiles files are read with: each built-in one, with the agency's columns when it saved any. */
  profiles: MappingProfile[];
  /** The saved row in force per profile key (a file read with it records which). */
  rowIds: Map<string, string>;
}

/** The agency's latest saved version of each built-in profile. */
async function latestRows(tx: Tx) {
  const rows = await tx
    .select()
    .from(s.mappingProfiles)
    .where(inArray(s.mappingProfiles.source, BUILT_IN_PROFILES.map((p) => p.key)))
    .orderBy(desc(s.mappingProfiles.version), desc(s.mappingProfiles.createdAt));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.source)) latest.set(r.source, r);
  return latest;
}

export async function agencyProfiles(tx: Tx): Promise<AgencyProfiles> {
  const latest = await latestRows(tx);
  return {
    profiles: BUILT_IN_PROFILES.map((p) => withAgencyColumns(p, latest.get(p.key)?.definition ?? null)),
    rowIds: new Map([...latest].map(([k, r]) => [k, r.id])),
  };
}

/** One profile as the Edit columns dialog shows it: the built-in names beside the agency's. */
export async function profileForEditing(tx: Tx, key: string): Promise<{ base: MappingProfile; current: MappingProfile; version: number } | null> {
  const base = BUILT_IN_PROFILES.find((p) => p.key === key);
  if (!base) return null;
  const row = (await latestRows(tx)).get(key);
  return { base, current: withAgencyColumns(base, row?.definition ?? null), version: row?.version ?? 0 };
}

export type SaveColumnsResult = { ok: true; version: number } | { ok: false; error: "forbidden" | "not_found" } | { ok: false; error: "invalid"; problems: ColumnProblem[] };

/**
 * Saves the agency's column names for a profile as its next version, or (`restore`) the built-in
 * names again. Owner and Coordinator: the people who read timesheets in (the hours ability).
 */
export async function saveProfileColumns(tx: Tx, actor: Actor, key: unknown, input: unknown, restore = false): Promise<SaveColumnsResult> {
  if (!can(actor, "hours")) return { ok: false, error: "forbidden" };
  const base = BUILT_IN_PROFILES.find((p) => p.key === key);
  if (!base) return { ok: false, error: "not_found" };
  let definition: ProfileColumns;
  if (restore) {
    definition = { columns: { ...base.columns }, dateFormat: base.dateFormat, ...(base.kind === "vms" ? { includeStatuses: [...base.includeStatuses] } : {}) };
  } else {
    const problems = profileColumnProblems(base, input);
    if (problems.length > 0) return { ok: false, error: "invalid", problems };
    const given = input as ProfileColumns;
    const columns = Object.fromEntries(Object.keys(base.columns).flatMap((f) => (typeof given.columns[f] === "string" && given.columns[f]!.trim() ? [[f, given.columns[f]!.trim()]] : [])));
    definition = {
      columns,
      dateFormat: given.dateFormat ?? base.dateFormat,
      ...(base.kind === "vms" ? { includeStatuses: (given.includeStatuses ?? base.includeStatuses).map((x) => x.trim()).filter(Boolean) } : {}),
    };
  }
  const before = (await latestRows(tx)).get(base.key);
  const version = (before?.version ?? 0) + 1;
  const [row] = await tx.insert(s.mappingProfiles).values({ agencyId: actor.agencyId, name: base.name, source: base.key, version, definition }).returning({ id: s.mappingProfiles.id });
  await audit(tx, actor, [{ action: "update", entityType: "mapping_profile", entityId: row!.id, before: before ? { version: before.version, definition: before.definition } : null, after: { profile: base.key, version, definition, restored: restore } }]);
  return { ok: true, version };
}
