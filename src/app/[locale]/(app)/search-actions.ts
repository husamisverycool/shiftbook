"use server";

// The command menu's record search (decision 0038; docs/patterns/_components/command-menu.md). Every
// signed-in role reads these records; the search runs inside the person's agency.
import { withAgency } from "@/server/db";
import { searchRecords, type FoundRecord, type RecordSet, type Scope } from "@/server/search/records";
import { currentActor } from "@/server/session";

const SETS: RecordSet[] = ["all", "work", "people"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function searchRecordsAction(input: unknown): Promise<FoundRecord[]> {
  const i = (input ?? {}) as Record<string, unknown>;
  if (typeof i.term !== "string" || i.term.length > 200) return [];
  const set = SETS.includes(i.set as RecordSet) ? (i.set as RecordSet) : "all";
  const s = i.scope as Record<string, unknown> | null | undefined;
  const scope: Scope | null = s && (s.kind === "client" || s.kind === "worker") && typeof s.id === "string" && UUID.test(s.id) ? { kind: s.kind, id: s.id } : null;
  const actor = await currentActor();
  try {
    return await withAgency(actor.agencyId, (tx) => searchRecords(tx, { term: i.term as string, set, scope }));
  } catch (error) {
    console.error("search failed:", error instanceof Error ? error.message : String(error));
    return [];
  }
}
