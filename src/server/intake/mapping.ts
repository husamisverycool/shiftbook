/**
 * "Map this file" (SPEC §6 saved column-mapping profiles; docs/patterns/convert.md upload step): a
 * time-clock CSV or XLSX whose columns no profile knows is mapped once from the file itself — the
 * person picks the line holding the column names, says which column holds what, sees the first rows
 * read that way, and saves the layout as a named profile. The file is then read again, and every
 * later file of that layout is read without asking.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { audit } from "../audit";
import type { Actor } from "../session";
import type { Tx } from "../db";
import * as s from "../db/schema";
import { StaleRequestError } from "../errors";
import type { DocumentStore } from "../storage";
import { profileProblems, type DateFormat, type ProfileProblem, type TimeclockProfile } from "./profiles";
import { SAVED_TIME_PREFIX } from "./saved-profiles";
import { retryDocument } from "./service";
import { firstLines, parseStructuredFile, tableAt, type Line } from "./structured";

const SPREADSHEET = /\.(csv|xlsx)$/i;
/** How many rows the preview shows under the chosen header line. */
const PREVIEW_ROWS = 5;

export type MappingColumns = TimeclockProfile["columns"];

export interface MappingDraft {
  name: string;
  headerRow: number;
  dateFormat: DateFormat;
  columns: MappingColumns;
}

export interface MappingPreview {
  header: string[];
  rows: string[][];
  /** The rows as the profile reads them: worker, date, in, out, break and hours (minutes), or why a value could not be read. */
  read: { worker: string; date: string | null; in: number | null; out: number | null; breakMinutes: number | null; minutes: number | null; checks: string[] }[];
  problems: ProfileProblem[];
}

async function spreadsheetOf(tx: Tx, store: DocumentStore, documentId: string) {
  const [doc] = await tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.id, documentId));
  if (!doc || !SPREADSHEET.test(doc.filename)) throw new StaleRequestError();
  return { doc, bytes: await store.get(doc.storageKey) };
}

/** The file's first lines, to pick the header among them. */
export async function mappingLines(tx: Tx, store: DocumentStore, documentId: string): Promise<{ filename: string; lines: Line[] }> {
  const { doc, bytes } = await spreadsheetOf(tx, store, documentId);
  return { filename: doc.filename, lines: await firstLines(doc.filename, bytes) };
}

function profileOf(draft: MappingDraft, key: string): TimeclockProfile {
  // Unused columns are left out rather than kept as empty strings.
  const columns = Object.fromEntries(Object.entries(draft.columns).filter(([, v]) => typeof v === "string" && v.trim() !== "")) as MappingColumns;
  return { kind: "timeclock", key, name: draft.name.trim(), version: 1, dateFormat: draft.dateFormat, headerRow: draft.headerRow, columns };
}

/** The columns under the chosen header line, and the first rows read the way the draft says. */
export async function mappingPreview(tx: Tx, store: DocumentStore, documentId: string, draft: MappingDraft): Promise<MappingPreview> {
  const { doc, bytes } = await spreadsheetOf(tx, store, documentId);
  const table = await tableAt(doc.filename, bytes, draft.headerRow);
  const profile = profileOf(draft, `${SAVED_TIME_PREFIX}preview`);
  const problems = profileProblems(profile, table.header);
  let read: MappingPreview["read"] = [];
  if (problems.length === 0) {
    // The preview reads the same lines the saved profile will read.
    const csv = [table.header, ...table.rows.slice(0, PREVIEW_ROWS)].map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(",")).join("\n");
    const parsed = parseStructuredFile("preview.csv", new TextEncoder().encode(csv), [{ ...profile, headerRow: 1 }]);
    read = parsed.entries.map((e) => ({
      worker: e.worker.value ?? e.worker.text ?? "",
      date: e.date.value,
      in: e.in?.value ?? null,
      out: e.out?.value ?? null,
      breakMinutes: e.break?.value ?? null,
      minutes: e.total?.value ?? null,
      checks: e.checks,
    }));
  }
  return { header: table.header, rows: table.rows.slice(0, PREVIEW_ROWS), read, problems };
}

export class MappingProblemError extends Error {
  constructor(readonly problems: ProfileProblem[]) {
    super(`The mapping is not complete: ${problems.join(", ")}.`);
    this.name = "MappingProblemError";
  }
}

/** Saves the layout as a named profile for the agency, audited, and reads the file again with it. */
export async function saveMapping(tx: Tx, actor: Actor, store: DocumentStore, documentId: string, draft: MappingDraft): Promise<{ profileId: string }> {
  if (draft.name.trim() === "") throw new MappingProblemError(["name"]);
  const { doc, bytes } = await spreadsheetOf(tx, store, documentId);
  const table = await tableAt(doc.filename, bytes, draft.headerRow);
  const key = `${SAVED_TIME_PREFIX}${randomUUID()}`;
  const profile = profileOf(draft, key);
  const problems = profileProblems(profile, table.header);
  if (problems.length > 0) throw new MappingProblemError(problems);
  const [row] = await tx
    .insert(s.mappingProfiles)
    .values({ agencyId: actor.agencyId, name: profile.name, source: key, version: 1, definition: profile })
    .returning({ id: s.mappingProfiles.id });
  await audit(tx, actor, [{ action: "create", entityType: "mapping_profile", entityId: row!.id, after: { name: profile.name, headerRow: profile.headerRow, dateFormat: profile.dateFormat, columns: profile.columns }, reason: `mapped from ${doc.filename}` }]);
  // A file that has not failed yet (a second click) is left as it is.
  if (doc.status === "failed") await retryDocument(tx, actor, documentId);
  return { profileId: row!.id };
}
