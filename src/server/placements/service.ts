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
import { tableFromCsv, tableFromXlsx, type Table } from "../intake/structured";
import { lockCatalog } from "../run/period-lock";
import { settingOn } from "../settings";
import type { Actor } from "../session";
import type { DocumentStore } from "../storage";
import { autoMap, FIELDS, missingFields, SOURCES, type Field, type Mapping, type Source } from "./fields";
import { dateOrderFor, dateValues, distinctValues, planRows, type Catalog, type DateOrder, type Decisions, type PlannedRow } from "./plan";
import { dropSensitive, headingProblem, safeFilename, type RemovedColumn } from "./sensitive";

/** The most rows one import takes: it runs under the catalog lock, so "create files" waits for it. */
export const MAX_IMPORT_ROWS = 2000;

const FILE_ERRORS = {
  unsupported: "Only CSV and Excel (.xlsx) files can be imported.",
  empty: "The file has no header row or no rows.",
  too_many_rows: `An import takes at most ${MAX_IMPORT_ROWS} rows.`,
  no_header: "The first row must hold column names.",
} as const;

export class ImportFileError extends Error {
  constructor(readonly reason: keyof typeof FILE_ERRORS) {
    super(FILE_ERRORS[reason]);
    this.name = "ImportFileError";
  }
}

/** Repeated column names get a number, so each column can be matched on its own. */
function uniqueNames(header: string[]): string[] {
  const seen = new Map<string, number>();
  return header.map((h) => {
    const name = h.trim() || "Column";
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name} (${n})`;
  });
}

export type ImportResult = NonNullable<typeof s.placementImports.$inferSelect.results>[number];
const PROFILE = (source: Source) => `placements:${source}`;

export async function startImport(
  tx: Tx,
  actor: Actor,
  store: DocumentStore,
  input: { source: Source; filename: string; bytes: Uint8Array },
  today: string,
): Promise<{ id: string; removed: RemovedColumn[] }> {
  if (!SOURCES.includes(input.source)) throw new ImportFileError("unsupported");
  const ext = input.filename.toLowerCase().split(".").pop();
  if (ext !== "csv" && ext !== "xlsx") throw new ImportFileError("unsupported");
  let table: Table;
  try {
    // Excel date cells as ISO dates: they cannot be read with day and month swapped.
    table = ext === "csv" ? tableFromCsv(input.bytes) : await tableFromXlsx(input.bytes, { dates: "iso" });
  } catch {
    throw new ImportFileError("unsupported"); // a damaged or mislabelled file
  }
  if (table.header.length === 0 || table.rows.length === 0) throw new ImportFileError("empty");
  if (table.rows.length > MAX_IMPORT_ROWS) throw new ImportFileError("too_many_rows");
  // A first row holding an SSN or a date is a record, not column names: refused before anything is kept.
  if (headingProblem(table.header, today)) throw new ImportFileError("no_header");
  const [profile] = await tx.select().from(s.mappingProfiles).where(eq(s.mappingProfiles.source, PROFILE(input.source))).orderBy(desc(s.mappingProfiles.version)).limit(1);
  const remembered = ((profile?.definition as { mapping?: Mapping } | undefined)?.mapping ?? {}) as Mapping;
  const header = uniqueNames(table.header);
  // The start and end dates the import recognises hold history, not birth dates.
  const guess = autoMap(header, input.source, remembered);
  // Before anything is stored, shown or logged.
  const clean = dropSensitive(header, table.rows, today, { dateColumns: [guess.startDate, guess.endDate].filter((c): c is string => !!c) });
  const kept = clean.rows.flatMap((r, i) => (r.some((c) => c.trim() !== "") ? [i] : []));
  const rows = kept.map((i) => clean.rows[i]!);
  const rowNumbers = kept.map((i) => table.rowNumbers[i]!);
  if (rows.length === 0) throw new ImportFileError("empty");
  const filename = safeFilename(input.filename);
  const bytes = writeCsv([clean.header, ...rows]);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storageKey = `${actor.agencyId}/imports/${sha256}.csv`;
  await store.put(storageKey, bytes);
  const mapping = autoMap(clean.header, input.source, remembered);
  const [row] = await tx
    .insert(s.placementImports)
    .values({ agencyId: actor.agencyId, source: input.source, filename, sha256, storageKey, mapping, removedColumns: clean.removed, rowNumbers, createdBy: actor.userId })
    .returning({ id: s.placementImports.id });
  await audit(tx, actor, [{ action: "create", entityType: "placement_import", entityId: row!.id, after: { source: input.source, filename, rows: rows.length, columnsRemoved: clean.removed } }]);
  return { id: row!.id, removed: clean.removed };
}

async function load(tx: Tx, store: DocumentStore, id: string) {
  const [record] = await tx.select().from(s.placementImports).where(eq(s.placementImports.id, id));
  if (!record) return null;
  const [header = [], ...rows] = readCsv(new TextDecoder().decode(await store.get(record.storageKey)));
  // Stored rows are never blank (a trailing line end aside), so they line up with their numbers.
  return { record, header, rows: rows.filter((r) => r.some((c) => c.trim() !== "")), opts: { dateOrder: record.dateOrder, rowNumbers: record.rowNumbers.length > 0 ? record.rowNumbers : undefined } };
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
  const { record, header, rows, opts } = loaded;
  const mapping = record.mapping as Mapping;
  const decisions = record.decisions as Decisions;
  const catalog = await catalogFor(tx);
  const missing = missingFields(mapping);
  const plan = missing.length === 0 ? planRows(record.source as Source, header, rows, mapping, decisions, catalog, opts) : [];
  const order = dateOrderFor(header, rows, mapping, record.dateOrder);
  // What the run will add, worked out the same way the run does.
  const cards = await tx.select().from(s.rateCards);
  const names = new Map(catalog.workers.map((w) => [w.workerId, `${w.firstName} ${w.lastName}`]));
  const rateVersions = plan.flatMap((p) => {
    if (p.outcome !== "create" || !p.rates) return [];
    const jobCard = "id" in p.jobOrder ? inForce(cards.filter((c) => c.jobOrderId === (p.jobOrder as { id: string }).id && c.assignmentId === null), p.startDate) : null;
    if (jobCard && jobCard.payRateCents === p.rates.payRateCents && jobCard.billRateCents === p.rates.billRateCents) return [];
    return [{ row: p.row, workerName: names.get(p.workerId) ?? "", from: p.startDate, payRateCents: p.rates.payRateCents, billRateCents: p.rates.billRateCents }];
  });
  const newJobOrders = new Set(plan.flatMap((p) => (p.outcome === "create" && "new" in p.jobOrder ? [newJobKey(p.jobOrder.new)] : []))).size;
  const jobLabel = new Map(catalog.jobOrders.map((j) => [j.id, j.shift ? `${j.position} · ${j.shift}` : j.position]));
  // Each assignment the import will create, with the dates it will get (Attio: the records per tab).
  const previewRows = plan.flatMap((p) =>
    p.outcome !== "create"
      ? []
      : [
          {
            row: p.row,
            workerName: names.get(p.workerId) ?? "",
            jobOrder: "id" in p.jobOrder ? (jobLabel.get(p.jobOrder.id) ?? "") : p.jobOrder.new.shift ? `${p.jobOrder.new.position} · ${p.jobOrder.new.shift}` : p.jobOrder.new.position,
            newJobOrder: "new" in p.jobOrder,
            startDate: p.startDate,
            endDate: p.endDate,
          },
        ],
  );
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
    removed: record.removedColumns,
    values: missing.length === 0 ? distinctValues(header, rows, mapping, decisions, catalog) : null,
    dates: { order, chosen: record.dateOrder ?? null, values: missing.length === 0 ? dateValues(header, rows, mapping, order) : [] },
    plan,
    preview: {
      create: plan.filter((p) => p.outcome === "create").length,
      newJobOrders,
      rateVersions,
      alreadyImported: plan.filter((p) => p.outcome === "skip" && p.reason.code === "already_imported").length,
      rows: previewRows,
    },
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

/** The person's choice of date order in the review step; null goes back to reading it from the file. */
export async function saveDateOrder(tx: Tx, actor: Actor, id: string, order: DateOrder | null): Promise<void> {
  await draft(tx, id);
  if (order !== null && order !== "month_first" && order !== "day_first") throw new StaleRequestError();
  await tx.update(s.placementImports).set({ dateOrder: order, updatedAt: new Date() }).where(eq(s.placementImports.id, id));
  await audit(tx, actor, [{ action: "update", entityType: "placement_import", entityId: id, after: { dateOrder: order } }]);
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
  const plan = planRows(source, loaded.header, loaded.rows, mapping, record.decisions as Decisions, await catalogFor(tx), loaded.opts);
  const defaults = await settingOn<Defaults>(tx, "rate_card.default_bill_multipliers", today);
  const newJobs = new Map<string, string>();
  const results: ImportResult[] = [];
  for (const p of plan) {
    if (p.outcome === "skip") {
      results.push({ row: p.row, outcome: "skipped", reason: p.reason });
      continue;
    }
    try {
      const made = await tx.transaction((sp) => importRow(sp, actor, source, p, newJobs, defaults));
      // A job order made by this row counts only once the row is kept (a refused row rolls it back).
      if (made.newJob) newJobs.set(made.newJob.key, made.newJob.id);
      results.push(made.result);
    } catch (error) {
      if (error instanceof RowRefused) results.push({ row: p.row, outcome: "skipped", reason: error.reason });
      // The database refused this row's values: it is skipped with a plain reason, the rest go in.
      else if (isDatabaseError(error)) results.push({ row: p.row, outcome: "skipped", reason: { code: "could_not_save", value: "" } });
      else throw error;
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

type Defaults = { ot: { num: number; den: number }; dt: { num: number; den: number } };

/** A Postgres error (it carries an SQLSTATE code), as opposed to a fault in this code. */
function isDatabaseError(error: unknown): boolean {
  for (let e = error; typeof e === "object" && e !== null; e = (e as { cause?: unknown }).cause) {
    if (typeof (e as { code?: unknown }).code === "string" && /^[0-9A-Z]{5}$/.test((e as { code: string }).code)) return true;
  }
  return false;
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
  defaults: Defaults | undefined,
): Promise<{ result: ImportResult; newJob?: { key: string; id: string } }> {
  let jobOrderId: string;
  let newJob: { key: string; id: string } | undefined;
  if ("id" in p.jobOrder) jobOrderId = p.jobOrder.id;
  else {
    const n = p.jobOrder.new;
    const key = newJobKey(n);
    const made = newJobs.get(key);
    if (made) jobOrderId = made;
    else {
      const r = await createJobOrder(tx, actor, { clientId: n.clientId, worksiteId: n.worksiteId, position: n.position, shift: n.shift, socCode: null, headcount: 1, payMinCents: null, payMaxCents: null, prevailingWage: false });
      if (!r.ok) throw new RowRefused({ code: "job_order_refused", value: n.position });
      jobOrderId = r.id;
      newJob = { key, id: r.id };
    }
  }
  const a = await createAssignment(tx, actor, { workerId: p.workerId, jobOrderId, startDate: p.startDate, endDate: p.endDate, external: p.externalId ? { source, id: p.externalId } : undefined });
  if (!a.ok) throw new RowRefused({ code: a.error, value: p.startDate });
  if (p.rates) {
    // The placement's own rates, unless they are the job order's rates on its start date.
    const jobCard = inForce(await versionsOf(tx, { jobOrderId, assignmentId: null }), p.startDate);
    if (!jobCard || jobCard.payRateCents !== p.rates.payRateCents || jobCard.billRateCents !== p.rates.billRateCents) {
      const multipliers = jobCard ? { ot: { num: jobCard.otMultiplierNum, den: jobCard.otMultiplierDen }, dt: { num: jobCard.dtMultiplierNum, den: jobCard.dtMultiplierDen } } : defaults;
      if (!multipliers) throw new RowRefused({ code: "rates_refused", value: "no_default_multipliers" });
      const r = await addRateVersion(tx, actor, { assignmentId: a.id }, {
        effectiveFrom: p.startDate,
        payRateCents: p.rates.payRateCents,
        bill: { rateCents: p.rates.billRateCents },
        otMultiplier: multipliers.ot,
        dtMultiplier: multipliers.dt,
        wcClassCode: jobCard?.wcClassCode ?? null,
      });
      if (!r.ok) throw new RowRefused({ code: "rates_refused", value: r.error });
    }
  }
  return { result: { row: p.row, outcome: "imported", reason: null }, newJob };
}

/** One new job order per client, worksite, position and shift (case does not matter). */
export const newJobKey = (n: { clientId: string; worksiteId: string; position: string; shift: string | null }) =>
  `${n.clientId}|${n.worksiteId}|${n.position.trim().toLowerCase()}|${(n.shift ?? "").trim().toLowerCase()}`;

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
