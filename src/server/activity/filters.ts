/**
 * The activity log's filters, read from and written to the address (Stripe's Copy link; GitHub's
 * qualifiers: who, what, when). Pure. Anything the address carries that the log cannot use falls
 * back to the default: the past three months (GitHub), everyone, everything.
 */
import { addDays, isIsoDate } from "@shiftbook/rules";
import { ACTIVITY_EVENTS, RECORD_TYPES } from "./events";

export interface ActivityFilters {
  from: string;
  to: string;
  person: string | null;
  type: string | null;
  action: string | null;
  record: { type: string; id: string } | null;
}

/** GitHub's audit log opens on the past three months. */
export const DEFAULT_DAYS = 90;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseActivityFilters(params: Record<string, string | string[] | undefined>, today: string): ActivityFilters {
  let from = first(params.from);
  let to = first(params.to);
  from = from && isIsoDate(from) ? from : addDays(today, -DEFAULT_DAYS);
  to = to && isIsoDate(to) ? to : today;
  if (from > to) [from, to] = [to, from];
  const person = first(params.person)?.trim().slice(0, 200) || null;
  const type = first(params.type) ?? "";
  const action = first(params.action) ?? "";
  const record = /^([a-z_]{1,40}):(.+)$/.exec(first(params.record) ?? "");
  return {
    from,
    to,
    person,
    type: (RECORD_TYPES as readonly string[]).includes(type) ? type : null,
    action: (ACTIVITY_EVENTS as readonly string[]).includes(action) ? action : null,
    record: record && (RECORD_TYPES as readonly string[]).includes(record[1]!) && UUID.test(record[2]!) ? { type: record[1]!, id: record[2]!.toLowerCase() } : null,
  };
}

/** The filters that differ from the defaults, as name and value pairs (the address, and the export's record). */
export function activityParams(f: ActivityFilters, today: string): Record<string, string> {
  const d = parseActivityFilters({}, today);
  const out: Record<string, string> = {};
  if (f.from !== d.from) out.from = f.from;
  if (f.to !== d.to) out.to = f.to;
  if (f.person) out.person = f.person;
  if (f.type) out.type = f.type;
  if (f.action) out.action = f.action;
  if (f.record) out.record = `${f.record.type}:${f.record.id}`;
  return out;
}

export function activityQueryString(f: ActivityFilters, today: string): string {
  return new URLSearchParams(activityParams(f, today)).toString();
}
