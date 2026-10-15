/**
 * Planning a placement import, row by row (docs/patterns/assignments/import.md): every row either
 * becomes an assignment (on an existing job order, or a new one whose worksite the person chose) or
 * is skipped with its reason — nothing is silently blanked. Workers are matched to the roster and
 * never created (SPEC §6). Pure: no I/O.
 */
import { parseIsoDateText, parseUsDate } from "../intake/parse";
import { matchWorker, type RosterWorker } from "../intake/names";
import type { Mapping, Source } from "./fields";

export interface Catalog {
  workers: RosterWorker[];
  nicknames: [string, string][];
  clients: { id: string; name: string }[];
  jobOrders: { id: string; clientId: string; position: string; shift: string | null }[];
  worksites: { id: string; clientId: string }[];
  /** `${source}|${externalId}` of placements already imported. */
  imported: Set<string>;
}

/** The person's choices in the review step: per kind, raw value → id, "leave_out", or "new:<worksiteId>". */
export type Decisions = Partial<Record<"worker" | "client" | "jobOrder" | "status", Record<string, string>>>;

export type SkipReason = { code: "already_imported" | "twice_in_file" | "left_out" | "not_on_roster" | "several_on_roster" | "client_not_found" | "new_job_order_needs_worksite" | "several_job_orders" | "missing_value" | "invalid_date" | "end_before_start" | "invalid_rate" | "cancelled_in_source"; value: string };

export type PlannedRow =
  | {
      row: number;
      outcome: "create";
      externalId: string | null;
      workerId: string;
      jobOrder: { id: string } | { new: { clientId: string; worksiteId: string; position: string; shift: string | null } };
      startDate: string;
      endDate: string | null;
      status: "active" | "ended";
      rates: { payRateCents: number; billRateCents: number } | null;
    }
  | { row: number; outcome: "skip"; reason: SkipReason };

const fold = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const parseDate = (text: string) => parseIsoDateText(text) ?? parseUsDate(text);

/** "19.00" / "$19" → cents; at most two decimals; nothing else. */
function parseRate(text: string): number | null {
  const t = text.trim().replace(/^\$/, "").replace(/,/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}

/** Cancelled placements are not imported; completed ones are imported as ended. */
export function statusOf(raw: string, decided?: string): "active" | "ended" | "cancelled" {
  if (decided === "active" || decided === "ended" || decided === "cancelled") return decided;
  const s = fold(raw);
  if (/cancel|withdrawn|declined|rejected|fell through/.test(s)) return "cancelled";
  if (/complete|terminated|ended|finished|closed/.test(s)) return "ended";
  return "active";
}

function cell(header: string[], row: string[], column: string | undefined): string {
  if (!column) return "";
  const i = header.indexOf(column);
  return i < 0 ? "" : (row[i] ?? "").trim();
}

export function workerText(header: string[], row: string[], mapping: Mapping): string {
  return mapping.workerName ? cell(header, row, mapping.workerName) : `${cell(header, row, mapping.workerFirstName)} ${cell(header, row, mapping.workerLastName)}`.trim();
}

function autoWorker(raw: string, catalog: Catalog): { id: string | null; several: boolean } {
  const m = matchWorker(raw, catalog.workers, catalog.nicknames);
  return m.status === "matched" ? { id: m.workerId, several: false } : { id: null, several: m.status === "ambiguous" };
}
const autoClient = (raw: string, catalog: Catalog) => catalog.clients.find((c) => fold(c.name) === fold(raw))?.id ?? null;
export const jobKey = (clientId: string, position: string, shift: string) => `${clientId}|${fold(position)}|${fold(shift)}`;
function autoJob(clientId: string, position: string, shift: string, catalog: Catalog) {
  return catalog.jobOrders.filter((j) => j.clientId === clientId && fold(j.position) === fold(position) && (shift === "" || fold(j.shift ?? "") === fold(shift)));
}

export function planRows(source: Source, header: string[], rows: string[][], mapping: Mapping, decisions: Decisions, catalog: Catalog): PlannedRow[] {
  const seen = new Set<string>();
  return rows.map((r, i): PlannedRow => {
    const row = i + 1;
    const skip = (code: SkipReason["code"], value: string): PlannedRow => ({ row, outcome: "skip", reason: { code, value } });
    const externalId = cell(header, r, mapping.externalId) || null;
    if (externalId) {
      if (catalog.imported.has(`${source}|${externalId}`)) return skip("already_imported", externalId);
      if (seen.has(externalId)) return skip("twice_in_file", externalId);
      seen.add(externalId);
    }

    const name = workerText(header, r, mapping);
    if (!name) return skip("missing_value", "worker");
    const decidedWorker = decisions.worker?.[name];
    if (decidedWorker === "leave_out") return skip("left_out", name);
    const auto = autoWorker(name, catalog);
    const workerId = decidedWorker && catalog.workers.some((w) => w.workerId === decidedWorker) ? decidedWorker : auto.id;
    if (!workerId) return skip(auto.several ? "several_on_roster" : "not_on_roster", name);

    const clientRaw = cell(header, r, mapping.client);
    if (!clientRaw) return skip("missing_value", "client");
    const decidedClient = decisions.client?.[clientRaw];
    if (decidedClient === "leave_out") return skip("left_out", clientRaw);
    const clientId = decidedClient && catalog.clients.some((c) => c.id === decidedClient) ? decidedClient : autoClient(clientRaw, catalog);
    if (!clientId) return skip("client_not_found", clientRaw);

    const position = cell(header, r, mapping.position);
    if (!position) return skip("missing_value", "position");
    const shift = cell(header, r, mapping.shift);
    const decidedJob = decisions.jobOrder?.[jobKey(clientId, position, shift)];
    let jobOrder: { id: string } | { new: { clientId: string; worksiteId: string; position: string; shift: string | null } };
    if (decidedJob === "leave_out") return skip("left_out", position);
    if (decidedJob?.startsWith("new:")) {
      const worksiteId = decidedJob.slice(4);
      if (!catalog.worksites.some((w) => w.id === worksiteId && w.clientId === clientId)) return skip("new_job_order_needs_worksite", position);
      jobOrder = { new: { clientId, worksiteId, position, shift: shift || null } };
    } else if (decidedJob && catalog.jobOrders.some((j) => j.id === decidedJob && j.clientId === clientId)) {
      jobOrder = { id: decidedJob };
    } else {
      const found = autoJob(clientId, position, shift, catalog);
      if (found.length === 0) return skip("new_job_order_needs_worksite", position);
      if (found.length > 1) return skip("several_job_orders", position);
      jobOrder = { id: found[0]!.id };
    }

    const startRaw = cell(header, r, mapping.startDate);
    if (!startRaw) return skip("missing_value", "startDate");
    const startDate = parseDate(startRaw);
    if (!startDate) return skip("invalid_date", startRaw);
    const endRaw = cell(header, r, mapping.endDate);
    const endDate = endRaw ? parseDate(endRaw) : null;
    if (endRaw && !endDate) return skip("invalid_date", endRaw);
    if (endDate && endDate < startDate) return skip("end_before_start", endRaw);

    const statusRaw = cell(header, r, mapping.status);
    const status = statusOf(statusRaw, decisions.status?.[statusRaw]);
    if (status === "cancelled") return skip("cancelled_in_source", statusRaw);

    const payRaw = cell(header, r, mapping.payRate);
    const billRaw = cell(header, r, mapping.billRate);
    let rates: { payRateCents: number; billRateCents: number } | null = null;
    if (payRaw || billRaw) {
      const pay = parseRate(payRaw);
      const bill = parseRate(billRaw);
      if (pay === null) return skip("invalid_rate", payRaw);
      if (bill === null) return skip("invalid_rate", billRaw);
      rates = { payRateCents: pay, billRateCents: bill };
    }
    return { row, outcome: "create", externalId, workerId, jobOrder, startDate, endDate, status, rates };
  });
}

export interface DistinctValue {
  raw: string;
  count: number;
  /** The automatic or decided match, or null when the person must decide. */
  match: string | null;
  label?: string;
  clientId?: string;
}

/** Each distinct worker, client and job-order value with its row count and match (Attio review values). */
export function distinctValues(header: string[], rows: string[][], mapping: Mapping, decisions: Decisions, catalog: Catalog) {
  const count = (map: Map<string, DistinctValue>, raw: string, make: () => Omit<DistinctValue, "count">) => {
    const cur = map.get(raw);
    if (cur) cur.count += 1;
    else map.set(raw, { ...make(), count: 1 });
  };
  const worker = new Map<string, DistinctValue>();
  const client = new Map<string, DistinctValue>();
  const jobOrder = new Map<string, DistinctValue>();
  const status = new Map<string, DistinctValue>();
  for (const r of rows) {
    const name = workerText(header, r, mapping);
    if (name) count(worker, name, () => ({ raw: name, match: decisions.worker?.[name] ?? autoWorker(name, catalog).id }));
    const clientRaw = cell(header, r, mapping.client);
    if (!clientRaw) continue;
    count(client, clientRaw, () => ({ raw: clientRaw, match: decisions.client?.[clientRaw] ?? autoClient(clientRaw, catalog) }));
    const clientId = decisions.client?.[clientRaw] && decisions.client[clientRaw] !== "leave_out" ? decisions.client[clientRaw]! : autoClient(clientRaw, catalog);
    const statusRaw = cell(header, r, mapping.status);
    if (mapping.status) count(status, statusRaw, () => ({ raw: statusRaw, match: statusOf(statusRaw, decisions.status?.[statusRaw]) }));
    const position = cell(header, r, mapping.position);
    if (!clientId || !position) continue;
    const shift = cell(header, r, mapping.shift);
    const key = jobKey(clientId, position, shift);
    count(jobOrder, key, () => {
      const found = autoJob(clientId, position, shift, catalog);
      return { raw: key, label: shift ? `${position} · ${shift}` : position, clientId, match: decisions.jobOrder?.[key] ?? (found.length === 1 ? found[0]!.id : null) };
    });
  }
  const sorted = (m: Map<string, DistinctValue>) => [...m.values()].sort((a, b) => (a.match === null ? 0 : 1) - (b.match === null ? 0 : 1) || b.count - a.count || a.raw.localeCompare(b.raw));
  return { worker: sorted(worker), client: sorted(client), jobOrder: sorted(jobOrder), status: sorted(status) };
}
