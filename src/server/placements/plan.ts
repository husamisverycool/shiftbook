/**
 * Planning a placement import, row by row (docs/patterns/assignments/import.md): every row either
 * becomes an assignment (on an existing job order, or a new one whose worksite the person chose) or
 * is skipped with its reason — nothing is silently blanked. Workers are matched to the roster and
 * never created (SPEC §6). Pure: no I/O.
 */
import { parseDollars } from "../../lib/amounts";
import { parseIsoDateText } from "../intake/parse";
import { matchWorker, type RosterWorker } from "../intake/names";
import { FIELDS, type Field, type Mapping, type Source } from "./fields";
import { MONTH_NAME, MONTH_NUMBER, WEEKDAY } from "./sensitive";

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

export type SkipReason = {
  code:
    | "already_imported"
    | "twice_in_file"
    | "left_out"
    | "not_on_roster"
    | "several_on_roster"
    | "client_not_found"
    | "new_job_order_needs_worksite"
    | "several_job_orders"
    | "missing_value"
    | "invalid_value"
    | "invalid_date"
    | "end_before_start"
    | "invalid_rate"
    | "cancelled_in_source"
    | "status_unclear"
    | "removed_by_person";
  value: string;
};

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
/** The highest hourly rate accepted ($100,000), as for rate cards. */
const MAX_RATE_CENTS = 10_000_000;
/** A placement id longer than this is not an id. */
const MAX_ID_LENGTH = 200;

/** "19.00" / "$1,019" → cents, exactly as the rate forms read it (a comma only separates thousands). */
function parseRate(text: string): number | null {
  const cents = parseDollars(text);
  return cents !== null && cents > 0 && cents <= MAX_RATE_CENTS ? cents : null;
}

export type DateOrder = "month_first" | "day_first";

/**
 * Whether the file writes dates day first (19/10/2026) or month first (10/19/2026). Day first only
 * when at least two dates have a first number above 12 and none has a second number above 12 — one
 * typo does not turn a whole file around; otherwise month first. The person sees each date as read
 * and can choose the other order (Attio: the format is chosen in the review step).
 */
export function dateOrderOf(values: string[]): DateOrder {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const v of values) {
    const m = v.length <= MAX_DATE_TEXT ? NUMERIC.exec(v.trim()) : null;
    if (!m) continue;
    if (Number(m[1]) > 12) dayFirst += 1;
    if (Number(m[3]) > 12) monthFirst += 1;
  }
  return dayFirst >= 2 && monthFirst === 0 ? "day_first" : "month_first";
}

/** A date cell longer than this is not a date (no pattern runs on it). */
const MAX_DATE_TEXT = 80;
/**
 * An optional time of day (and time zone) after a date, as spreadsheets and databases write
 * date-time cells: "10/19/2026 12:00:00 AM", "2026-10-19 00:00:00 UTC", "2026-10-19T07:00:00-05:00",
 * "2026-10-19 07:00 America/Chicago". Every repeat is bounded and the whole pattern anchored, so no
 * cell can make reading slow.
 */
const TIME_PART = String.raw`(?:(?:\s{1,3}|T)(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:\s{0,3}[ap]\.?\s?m\.?)?(?:\s{0,3}(?:z|utc|gmt|[a-z]{2,14}(?:/[a-z0-9_+\-]{1,30}){1,2}|[a-z]{2,5}))?(?:\s{0,3}[+-]\d{2}(?::?\d{2})?)?)?`;
/** A year after a month name: four digits, or two ("19-Oct-26", "Oct 19 '26"). */
const NAMED_YEAR = String.raw`['’]?(\d{4}|\d{2})`;
const NUMERIC = new RegExp(String.raw`^(\d{1,2})([/.\-])(\d{1,2})\2(\d{4}|\d{2})${TIME_PART}$`, "i");
const YEAR_FIRST = new RegExp(String.raw`^(\d{4})([/.\-])(\d{1,2})\2(\d{1,2})${TIME_PART}$`, "i");
// "19 Oct 2026", "19-Oct-26", "Mon 19 Oct 2026", "19 de octubre de 2026", "19 octobre 2026", "19. Oktober 2026"
const NAMED_DAY_FIRST = new RegExp(String.raw`^${WEEKDAY}(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]{0,3}(?:de\s{1,3})?${MONTH_NAME}[\s\-/.,]{0,3}(?:de\s{1,3})?${NAMED_YEAR}${TIME_PART}$`, "i");
// "Oct 19, 2026", "Mon, Oct 19, 2026", "Oct 19 '26" — a dash only before a four-digit year, so "Oct 19-26" stays a range of days
const NAMED_MONTH_FIRST = new RegExp(String.raw`^${WEEKDAY}${MONTH_NAME}[\s\-/.]{0,3}(\d{1,2})(?:st|nd|rd|th)?(?:,\s{0,3}|\s{1,3}|-(?=\d{4}))${NAMED_YEAR}${TIME_PART}$`, "i");
const monthOf = (name: string) => MONTH_NUMBER.get(name.toLowerCase());

/** Year, month, day → ISO when it is a real date. A two-digit year is 20yy below 50 and 19yy from 50. */
function isoOf(year: string, month: number, day: number): string | null {
  const y = year.length === 2 ? (Number(year) < 50 ? 2000 : 1900) + Number(year) : Number(year);
  return parseIsoDateText(`${String(y).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}

/**
 * A start or end date as written → ISO: year first and month names (English, Spanish, French,
 * German; a weekday before, a two-digit year) as they are; otherwise month or day first, as the
 * file uses.
 */
export function parseDate(text: string, order: DateOrder): string | null {
  const trimmed = text.trim();
  if (trimmed.length > MAX_DATE_TEXT) return null;
  const t = trimmed.normalize("NFKC");
  const y = YEAR_FIRST.exec(t);
  if (y) return isoOf(y[1]!, Number(y[3]), Number(y[4]));
  const n = NUMERIC.exec(t);
  if (n) return order === "month_first" ? isoOf(n[4]!, Number(n[1]), Number(n[3])) : isoOf(n[4]!, Number(n[3]), Number(n[1]));
  const d = NAMED_DAY_FIRST.exec(t);
  const dayFirstMonth = d ? monthOf(d[2]!) : undefined;
  if (d && dayFirstMonth) return isoOf(d[3]!, dayFirstMonth, Number(d[1]));
  const m = NAMED_MONTH_FIRST.exec(t);
  const monthFirstMonth = m ? monthOf(m[1]!) : undefined;
  if (m && monthFirstMonth) return isoOf(m[3]!, monthFirstMonth, Number(m[2]));
  return null;
}

const ACTIVE = /^(|approved|placed|active|current|confirmed|started|ongoing|open|working|on assignment)$/;
const ENDED = /^(complete|completed|terminated|ended|finished|closed|done)$/;
const CANCELLED = /^(cancel|cancelled|canceled|withdrawn|declined|rejected|fell through|no show|no-show)$/;

/** A status word read as active, ended or cancelled; null when it is not clear (the person decides). */
export function statusOf(raw: string, decided?: string): "active" | "ended" | "cancelled" | null {
  if (decided === "active" || decided === "ended" || decided === "cancelled") return decided;
  const s = fold(raw);
  if (CANCELLED.test(s)) return "cancelled";
  if (ENDED.test(s)) return "ended";
  if (ACTIVE.test(s)) return "active";
  return null;
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
/** The client a value names: the person's decision, else an exact match (case and spacing aside). */
function clientOf(raw: string, decisions: Decisions, catalog: Catalog): string | null {
  if (!raw) return null;
  const decided = decisions.client?.[raw];
  if (decided === "leave_out") return null;
  return decided && catalog.clients.some((c) => c.id === decided) ? decided : autoClient(raw, catalog);
}
export const jobKey = (clientId: string, position: string, shift: string) => `${clientId}|${fold(position)}|${fold(shift)}`;
function autoJob(clientId: string, position: string, shift: string, catalog: Catalog) {
  return catalog.jobOrders.filter((j) => j.clientId === clientId && fold(j.position) === fold(position) && (shift === "" || fold(j.shift ?? "") === fold(shift)));
}

/** The start and end dates as written in the file. */
const datesIn = (header: string[], rows: string[][], mapping: Mapping) => rows.flatMap((r) => [cell(header, r, mapping.startDate), cell(header, r, mapping.endDate)]);

/** The date order used: the person's choice, or what the file shows. */
export const dateOrderFor = (header: string[], rows: string[][], mapping: Mapping, chosen?: DateOrder | null): DateOrder => chosen ?? dateOrderOf(datesIn(header, rows, mapping));

export interface PlanOptions {
  /** The order the person chose for dates; otherwise what the file shows. */
  dateOrder?: DateOrder | null;
  /** Each row's own number in the file (blank rows count); otherwise the header is row 1 and none is blank. */
  rowNumbers?: number[];
}

export function planRows(source: Source, header: string[], rows: string[][], mapping: Mapping, decisions: Decisions, catalog: Catalog, opts: PlanOptions = {}): PlannedRow[] {
  const seen = new Set<string>();
  const order = dateOrderFor(header, rows, mapping, opts.dateOrder);
  // A new job order is spelled as the file first spells it, whichever rows are imported.
  const spelling = new Map<string, { position: string; shift: string }>();
  for (const r of rows) {
    const clientId = clientOf(cell(header, r, mapping.client), decisions, catalog);
    const position = cell(header, r, mapping.position);
    const shift = cell(header, r, mapping.shift);
    const key = clientId && position ? jobKey(clientId, position, shift) : null;
    if (key && !spelling.has(key)) spelling.set(key, { position, shift });
  }
  return rows.map((r, i): PlannedRow => {
    const row = opts.rowNumbers?.[i] ?? i + 2;
    const skip = (code: SkipReason["code"], value: string): PlannedRow => ({ row, outcome: "skip", reason: { code, value } });
    const externalId = cell(header, r, mapping.externalId) || null;
    if (externalId && externalId.length > MAX_ID_LENGTH) return skip("invalid_value", "externalId");
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
    if (decisions.client?.[clientRaw] === "leave_out") return skip("left_out", clientRaw);
    const clientId = clientOf(clientRaw, decisions, catalog);
    if (!clientId) return skip("client_not_found", clientRaw);

    const position = cell(header, r, mapping.position);
    if (!position) return skip("missing_value", "position");
    const shift = cell(header, r, mapping.shift);
    const key = jobKey(clientId, position, shift);
    const spelled = spelling.get(key) ?? { position, shift };
    const decidedJob = decisions.jobOrder?.[key];
    let jobOrder: { id: string } | { new: { clientId: string; worksiteId: string; position: string; shift: string | null } };
    if (decidedJob === "leave_out") return skip("left_out", position);
    if (decidedJob?.startsWith("new:")) {
      const worksiteId = decidedJob.slice(4);
      if (!catalog.worksites.some((w) => w.id === worksiteId && w.clientId === clientId)) return skip("new_job_order_needs_worksite", position);
      jobOrder = { new: { clientId, worksiteId, position: spelled.position, shift: spelled.shift || null } };
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
    const startDate = parseDate(startRaw, order);
    if (!startDate) return skip("invalid_date", startRaw);
    const endRaw = cell(header, r, mapping.endDate);
    const endDate = endRaw ? parseDate(endRaw, order) : null;
    if (endRaw && !endDate) return skip("invalid_date", endRaw);
    if (endDate && endDate < startDate) return skip("end_before_start", endRaw);

    const statusRaw = cell(header, r, mapping.status);
    const status = statusOf(statusRaw, decisions.status?.[statusRaw]);
    if (status === null) return skip("status_unclear", statusRaw);
    if (status === "cancelled") return skip("cancelled_in_source", statusRaw);
    // An ended placement is imported with its end date (whether it has ended is read from the dates).
    if (status === "ended" && !endDate) return skip("missing_value", "endDate");

    const payRaw = cell(header, r, mapping.payRate);
    const billRaw = cell(header, r, mapping.billRate);
    let rates: { payRateCents: number; billRateCents: number } | null = null;
    if (payRaw || billRaw) {
      if (!payRaw) return skip("missing_value", "payRate");
      if (!billRaw) return skip("missing_value", "billRate");
      const pay = parseRate(payRaw);
      const bill = parseRate(billRaw);
      if (pay === null) return skip("invalid_rate", payRaw);
      if (bill === null) return skip("invalid_rate", billRaw);
      rates = { payRateCents: pay, billRateCents: bill };
    }
    return { row, outcome: "create", externalId, workerId, jobOrder, startDate, endDate, status, rates };
  });
}

/** Each distinct start or end date as written, with what it reads as in the order used (null: invalid format). */
export function dateValues(header: string[], rows: string[][], mapping: Mapping, order: DateOrder): { raw: string; count: number; date: string | null }[] {
  const counts = new Map<string, number>();
  for (const raw of datesIn(header, rows, mapping)) if (raw) counts.set(raw, (counts.get(raw) ?? 0) + 1);
  return [...counts]
    .map(([raw, count]) => ({ raw, count, date: parseDate(raw, order) }))
    .sort((a, b) => (a.date === null ? 0 : 1) - (b.date === null ? 0 : 1) || b.count - a.count || a.raw.localeCompare(b.raw));
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

// ---------- fixing only the rows with errors (Avionté BOLD bulk import, decision 0040) ----------

/** A row's own fixes, by its number in the file: file column → the value typed in its place. */
export type RowEdits = Record<string, Record<string, string>>;

/** The file's rows with the fixes typed for them; `rowNumbers[i]` is row i's number in the file. */
export function applyRowEdits(header: string[], rows: string[][], rowNumbers: number[] | undefined, edits: RowEdits): string[][] {
  if (Object.keys(edits).length === 0) return rows;
  return rows.map((r, i) => {
    const fix = edits[String(rowNumbers?.[i] ?? i + 2)];
    if (!fix) return r;
    const out = [...r];
    for (const [column, value] of Object.entries(fix)) {
      const at = header.indexOf(column);
      if (at >= 0) out[at] = value;
    }
    return out;
  });
}

/** Rows the person left out are skipped with that reason, whatever else was wrong with them. */
export function withRemoved(plan: PlannedRow[], removed: number[]): PlannedRow[] {
  if (removed.length === 0) return plan;
  const set = new Set(removed);
  return plan.map((p) => (set.has(p.row) ? { row: p.row, outcome: "skip" as const, reason: { code: "removed_by_person" as const, value: "" } } : p));
}

/**
 * The one field a skipped row can be fixed in, typed in place (the file column mapped to it), or null
 * when the fix is elsewhere (a value matched on Review values, a duplicate, a decision to leave out).
 */
export function fixableField(reason: SkipReason, header: string[], row: string[], mapping: Mapping): { field: Field; column: string; value: string } | null {
  const cell = (f: Field) => {
    const column = mapping[f];
    return column ? { field: f, column, value: row[header.indexOf(column)] ?? "" } : null;
  };
  switch (reason.code) {
    case "missing_value":
    case "invalid_value":
      if (reason.value === "worker") return mapping.workerName ? cell("workerName") : null;
      return (FIELDS as readonly string[]).includes(reason.value) ? cell(reason.value as Field) : null;
    case "invalid_date": {
      const start = cell("startDate");
      return start && start.value.trim() === reason.value.trim() ? start : cell("endDate");
    }
    case "end_before_start":
      return cell("endDate");
    case "invalid_rate": {
      const pay = cell("payRate");
      return pay && pay.value.trim() === reason.value.trim() ? pay : cell("billRate");
    }
    case "status_unclear":
      return cell("status");
    default:
      return null;
  }
}
