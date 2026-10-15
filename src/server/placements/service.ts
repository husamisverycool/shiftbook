/**
 * Placement imports (SPEC §8; docs/patterns/assignments/import.md — Attio's upload → map → review
 * values → preview → run, with import history). The stored copy of the file never holds SSN or
 * birth-date columns. Running an import is one transaction under the catalog lock; each row is its
 * own savepoint, so a row that cannot be imported is skipped with its reason and the rest go in.
 * Running it again changes nothing; re-importing the same placements skips them.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { audit } from "../audit";
import { createAssignment } from "../catalog/assignments";
import { createJobOrder } from "../catalog/job-orders";
import { addRateVersion, versionsOf } from "../catalog/rate-cards";
import { inForce } from "../catalog/versions";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { StaleRequestError } from "../errors";
import { readCsv, writeCsv } from "../../exports/csv";
import { tableFromCsv, tableFromXlsx } from "../intake/structured";
import { lockCatalog } from "../run/period-lock";
import { settingOn } from "../run/service";
import type { Actor } from "../session";
import type { DocumentStore } from "../storage";
import { autoMap, FIELDS, missingFields, SOURCES, type Field, type Mapping, type Source } from "./fields";
import { distinctValues, planRows, type Catalog, type Decisions, type PlannedRow } from "./plan";
import { dropSensitive } from "./sensitive";

export class ImportFileError extends Error {
  constructor(readonly reason: "unsupported" | "empty") {
    super(reason === "unsupported" ? "Only CSV and Excel (.xlsx) files can be imported." : "The file has no header row or no rows.");
    this.name = "ImportFileError";
  }
}

export type ImportResult = NonNullable<typeof s.placementImports.$inferSelect.results>[number];
const PROFILE = (source: Source) => `placements:${source}`;

export async function startImport(tx: Tx, actor: Actor, store: DocumentStore, input: { source: Source; filename: string; bytes: Uint8Array }): Promise<{ id: string; dropped: number }> {
  if (!SOURCES.includes(input.source)) throw new ImportFileError("unsupported");
  const ext = input.filename.toLowerCase().split(".").pop();
  if (ext !== "csv" && ext !== "xlsx") throw new ImportFileError("unsupported");
  const table = ext === "csv" ? tableFromCsv(input.bytes) : await tableFromXlsx(input.bytes);
  if (table.header.length === 0 || table.rows.length === 0) throw new ImportFileError("empty");
  // Before anything is stored, shown or logged.
  const clean = dropSensitive(table.header.map((h) => h.trim()), table.rows);
  const bytes = writeCsv([clean.header, ...clean.rows]);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storageKey = `${actor.agencyId}/imports/${sha256}.csv`;
  await store.put(storageKey, bytes);
  const [profile] = await tx.select().from(s.mappingProfiles).where(eq(s.mappingProfiles.source, PROFILE(input.source))).orderBy(desc(s.mappingProfiles.version)).limit(1);
  const remembered = ((profile?.definition as { mapping?: Mapping } | undefined)?.mapping ?? {}) as Mapping;
  const mapping = autoMap(clean.header, input.source, remembered);
  const [row] = await tx
    .insert(s.placementImports)
    .values({ agencyId: actor.agencyId, source: input.source, filename: input.filename, sha256, storageKey, mapping, createdBy: actor.userId })
    .returning({ id: s.placementImports.id });
  await audit(tx, actor, [{ action: "create", entityType: "placement_import", entityId: row!.id, after: { source: input.source, filename: input.filename, rows: clean.rows.length, columnsDropped: clean.dropped } }]);
  return { id: row!.id, dropped: clean.dropped };
}

async function load(tx: Tx, store: DocumentStore, id: string) {
  const [record] = await tx.select().from(s.placementImports).where(eq(s.placementImports.id, id));
  if (!record) return null;
  const [header = [], ...rows] = readCsv(new TextDecoder().decode(await store.get(record.storageKey)));
  return { record, header, rows: rows.filter((r) => r.some((c) => c.trim() !== "")) };
}

export async function catalogFor(tx: Tx): Promise<Catalog> {
  const workers = await tx.select().from(s.workers);
  const nicknames = await tx.select().from(s.nicknames);
  const clients = await tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients);
  const jobOrders = await tx.select({ id: s.jobOrders.id, clientId: s.jobOrders.clientId, position: s.jobOrders.position, shift: s.jobOrders.shift }).from(s.jobOrders);
  const worksites = await tx.select({ id: s.worksites.id, clientId: s.worksites.clientId }).from(s.worksites);
  const imported = await tx
    .select({ source: s.assignments.externalSource, id: s.assignments.externalId })
    .from(s.assignments)
    .where(and(isNotNull(s.assignments.externalSource), isNotNull(s.assignments.externalId)));
  return {
    workers: workers.map((w) => ({ workerId: w.id, firstName: w.firstName, lastName: w.lastName })),
    nicknames: nicknames.map((n) => [n.nickname, n.givenName]),
    clients,
    jobOrders,
    worksites,
    imported: new Set(imported.map((i) => `${i.source}|${i.id}`)),
  };
}

/** Everything the import screens show for one import. */
export async function importView(tx: Tx, store: DocumentStore, id: string) {
  const loaded = await load(tx, store, id);
  if (!loaded) return null;
  const { record, header, rows } = loaded;
  const mapping = record.mapping as Mapping;
  const decisions = record.decisions as Decisions;
  const catalog = await catalogFor(tx);
  const missing = missingFields(mapping);
  const plan = missing.length === 0 ? planRows(record.source as Source, header, rows, mapping, decisions, catalog) : [];
  return {
    id: record.id,
    source: record.source as Source,
    filename: record.filename,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    header,
    rowCount: rows.length,
    samples: Object.fromEntries(header.map((h, i) => [h, rows.slice(0, 100).map((r) => r[i] ?? "").filter((v) => v !== "").slice(0, 5)])),
    mapping,
    missing,
    values: missing.length === 0 ? distinctValues(header, rows, mapping, decisions, catalog) : null,
    plan,
    results: record.results,
  };
}
export type ImportView = NonNullable<Awaited<ReturnType<typeof importView>>>;

async function draft(tx: Tx, id: string) {
  const [record] = await tx.select().from(s.placementImports).where(eq(s.placementImports.id, id)).for("update");
  if (!record || record.status !== "draft") throw new StaleRequestError();
  return record;
}

export async function saveMapping(tx: Tx, actor: Actor, store: DocumentStore, id: string, mapping: Mapping): Promise<void> {
  await draft(tx, id);
  const loaded = await load(tx, store, id);
  const clean: Mapping = {};
  for (const [field, column] of Object.entries(mapping) as [Field, string | undefined][]) {
    if (FIELDS.includes(field) && column && loaded!.header.includes(column)) clean[field] = column;
  }
  await tx.update(s.placementImports).set({ mapping: clean, updatedAt: new Date() }).where(eq(s.placementImports.id, id));
  await audit(tx, actor, [{ action: "update", entityType: "placement_import", entityId: id, after: { mapping: clean } }]);
}

/** One decision from the review step; fixing a value fixes every row with it (Attio). */
export async function saveDecision(tx: Tx, actor: Actor, id: string, kind: keyof Decisions, raw: string, value: string | null): Promise<void> {
  const record = await draft(tx, id);
  const decisions = { ...(record.decisions as Decisions) };
  const forKind = { ...(decisions[kind] ?? {}) };
  if (value === null) delete forKind[raw];
  else forKind[raw] = value;
  decisions[kind] = forKind;
  await tx.update(s.placementImports).set({ decisions, updatedAt: new Date() }).where(eq(s.placementImports.id, id));
  await audit(tx, actor, [{ action: "update", entityType: "placement_import", entityId: id, after: { decision: { kind, raw, value } } }]);
}

/** Runs the import once; afterwards it only returns what happened. */
export async function runImport(tx: Tx, actor: Actor, store: DocumentStore, id: string, today: string): Promise<ImportResult[]> {
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [record] = await tx.select().from(s.placementImports).where(eq(s.placementImports.id, id)).for("update");
  if (!record) throw new StaleRequestError();
  if (record.status === "done") return record.results ?? [];
  const loaded = (await load(tx, store, id))!;
  const mapping = record.mapping as Mapping;
  if (missingFields(mapping).length > 0) throw new StaleRequestError();
  const source = record.source as Source;
  const plan = planRows(source, loaded.header, loaded.rows, mapping, record.decisions as Decisions, await catalogFor(tx));
  const defaults = (await settingOn<{ ot: { num: number; den: number }; dt: { num: number; den: number } }>(tx, "rate_card.default_bill_multipliers", today))!;
  const newJobs = new Map<string, string>();
  const results: ImportResult[] = [];
  for (const p of plan) {
    if (p.outcome === "skip") {
      results.push({ row: p.row, outcome: "skipped", reason: p.reason });
      continue;
    }
    try {
      await tx.transaction(async (sp) => {
        results.push(await importRow(sp, actor, source, p, newJobs, defaults));
      });
    } catch (error) {
      if (!(error instanceof RowRefused)) throw error;
      results.push({ row: p.row, outcome: "skipped", reason: error.reason });
    }
  }
  // Remember this mapping for the next import from the same source (Flatfile memory).
  await tx.delete(s.mappingProfiles).where(eq(s.mappingProfiles.source, PROFILE(source)));
  await tx.insert(s.mappingProfiles).values({ agencyId: actor.agencyId, name: `Placements from ${source}`, source: PROFILE(source), definition: { mapping } });
  await tx.update(s.placementImports).set({ status: "done", results, updatedAt: new Date() }).where(eq(s.placementImports.id, id));
  const imported = results.filter((r) => r.outcome === "imported").length;
  await audit(tx, actor, [{ action: "import", entityType: "placement_import", entityId: id, after: { imported, skipped: results.length - imported } }]);
  return results;
}

class RowRefused extends Error {
  constructor(readonly reason: { code: string; value: string }) {
    super(reason.code);
  }
}

async function importRow(
  tx: Tx,
  actor: Actor,
  source: Source,
  p: Extract<PlannedRow, { outcome: "create" }>,
  newJobs: Map<string, string>,
  defaults: { ot: { num: number; den: number }; dt: { num: number; den: number } },
): Promise<ImportResult> {
  let jobOrderId: string;
  if ("id" in p.jobOrder) jobOrderId = p.jobOrder.id;
  else {
    const n = p.jobOrder.new;
    const key = `${n.clientId}|${n.worksiteId}|${n.position.toLowerCase()}|${(n.shift ?? "").toLowerCase()}`;
    const made = newJobs.get(key);
    if (made) jobOrderId = made;
    else {
      const r = await createJobOrder(tx, actor, { clientId: n.clientId, worksiteId: n.worksiteId, position: n.position, shift: n.shift, socCode: null, headcount: 1, payMinCents: null, payMaxCents: null, prevailingWage: false });
      if (!r.ok) throw new RowRefused({ code: "job_order_refused", value: n.position });
      jobOrderId = r.id;
      newJobs.set(key, r.id);
    }
  }
  const a = await createAssignment(tx, actor, { workerId: p.workerId, jobOrderId, startDate: p.startDate, endDate: p.endDate, external: p.externalId ? { source, id: p.externalId } : undefined });
  if (!a.ok) throw new RowRefused({ code: a.error, value: p.startDate });
  if (p.status === "ended") await tx.update(s.assignments).set({ status: "ended" }).where(eq(s.assignments.id, a.id));
  if (p.rates) {
    // The placement's own rates, unless they are the job order's rates on its start date.
    const jobCard = inForce(await versionsOf(tx, { jobOrderId, assignmentId: null }), p.startDate);
    if (!jobCard || jobCard.payRateCents !== p.rates.payRateCents || jobCard.billRateCents !== p.rates.billRateCents) {
      const r = await addRateVersion(tx, actor, { assignmentId: a.id }, {
        effectiveFrom: p.startDate,
        payRateCents: p.rates.payRateCents,
        bill: { rateCents: p.rates.billRateCents },
        otMultiplier: jobCard ? { num: jobCard.otMultiplierNum, den: jobCard.otMultiplierDen } : defaults.ot,
        dtMultiplier: jobCard ? { num: jobCard.dtMultiplierNum, den: jobCard.dtMultiplierDen } : defaults.dt,
        wcClassCode: jobCard?.wcClassCode ?? null,
      });
      if (!r.ok) throw new RowRefused({ code: "rates_refused", value: r.error });
    }
  }
  return { row: p.row, outcome: "imported", reason: null };
}

export async function listImports(tx: Tx) {
  const rows = await tx.select().from(s.placementImports).orderBy(desc(s.placementImports.createdAt));
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    filename: r.filename,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    imported: (r.results ?? []).filter((x) => x.outcome === "imported").length,
    skipped: (r.results ?? []).filter((x) => x.outcome === "skipped").length,
  }));
}
