"use server";

// The inbox's own actions (docs/patterns/inbox.md): mapping a time file a saved profile does not know,
// and the nickname a match in document review can teach (docs/patterns/documents/[documentId].md).
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { withAgency } from "@/server/db";
import { StaleRequestError } from "@/server/errors";
import { MappingProblemError, mappingLines, mappingPreview, saveMapping, type MappingDraft, type MappingPreview } from "@/server/intake/mapping";
import { learnNickname, nicknameFromEntry } from "@/server/intake/nicknames";
import type { ProfileProblem } from "@/server/intake/profiles";
import type { Line } from "@/server/intake/structured";
import { PeriodBusyError, PeriodLockedError } from "@/server/run/period-lock";
import { processQueuedDocuments } from "@/server/services";
import { actorAllowedTo } from "@/server/session";
import { documentStore } from "@/server/storage";

const id = z.uuid();
const column = z.string().max(200).optional();
const DraftSchema = z
  .object({
    name: z.string().max(80),
    headerRow: z.number().int().min(1).max(15),
    dateFormat: z.enum(["MM/DD/YYYY", "YYYY-MM-DD"]),
    columns: z.object({ externalId: column, name: z.string().max(200), date: z.string().max(200), in: column, out: column, breakMinutes: column, totalHours: column, clientName: column }).strict(),
  })
  .strict();

const refresh = () => revalidatePath("/[locale]/(app)/convert", "page");

export async function mappingLinesAction(documentId: string): Promise<{ filename: string; lines: Line[] } | { error: "stale" }> {
  const actor = await actorAllowedTo("hours");
  if (!id.safeParse(documentId).success) return { error: "stale" };
  try {
    return await withAgency(actor.agencyId, (tx) => mappingLines(tx, documentStore, documentId));
  } catch (error) {
    if (error instanceof StaleRequestError) return { error: "stale" };
    throw error;
  }
}

export async function mappingPreviewAction(documentId: string, draft: MappingDraft): Promise<MappingPreview | { error: "stale" }> {
  const actor = await actorAllowedTo("hours");
  if (!id.safeParse(documentId).success || !DraftSchema.safeParse(draft).success) return { error: "stale" };
  try {
    return await withAgency(actor.agencyId, (tx) => mappingPreview(tx, documentStore, documentId, draft));
  } catch (error) {
    if (error instanceof StaleRequestError) return { error: "stale" };
    throw error;
  }
}

export async function saveMappingAction(documentId: string, draft: MappingDraft): Promise<{ ok: true } | { error: "stale" | "period_locked" | "busy" } | { problems: ProfileProblem[] }> {
  const actor = await actorAllowedTo("hours");
  if (!id.safeParse(documentId).success || !DraftSchema.safeParse(draft).success) return { error: "stale" };
  try {
    await withAgency(actor.agencyId, (tx) => saveMapping(tx, actor, documentStore, documentId, draft));
    after(() => processQueuedDocuments(actor).catch(() => undefined));
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof MappingProblemError) return { problems: error.problems };
    if (error instanceof StaleRequestError) return { error: "stale" };
    if (error instanceof PeriodLockedError) return { error: "period_locked" };
    if (error instanceof PeriodBusyError) return { error: "busy" };
    throw error;
  }
}

/** The nickname matching this entry's written name to its worker would teach, if any. */
export async function nicknameSuggestionAction(entryId: string): Promise<{ nickname: string; givenName: string } | null> {
  const actor = await actorAllowedTo("hours");
  if (!id.safeParse(entryId).success) return null;
  const s = await withAgency(actor.agencyId, (tx) => nicknameFromEntry(tx, entryId));
  return s ? { nickname: s.nickname, givenName: s.givenName } : null;
}

export async function learnNicknameAction(entryId: string): Promise<{ ok: boolean }> {
  const actor = await actorAllowedTo("hours");
  if (!id.safeParse(entryId).success) return { ok: false };
  try {
    const learned = await withAgency(actor.agencyId, (tx) => learnNickname(tx, actor, entryId));
    return { ok: learned !== null };
  } catch {
    return { ok: false };
  }
}
