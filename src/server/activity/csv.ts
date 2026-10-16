/**
 * The activity log as CSV (GitHub's export, following the filters; Vercel's previous and next as
 * Before and After). A cell a spreadsheet would run as a formula is kept as text (decision 0019).
 */
import { csvCell } from "../../lib/csv-cell";
import type { ActivityEvent } from "./events";

const json = (v: unknown) => (v === null || v === undefined ? "" : JSON.stringify(v));
/** The record as the export names it: a duty's kind, the name, a run's or a day's dates. */
const recordText = (r: ActivityEvent["record"]) => [r.kind ?? null, r.name, r.period ? (r.period.from === r.period.to ? r.period.from : `${r.period.from} – ${r.period.to}`) : null, r.gone ? "(no longer on file)" : null].filter(Boolean).join(" · ");

export function activityCsv(events: ActivityEvent[]): string {
  const head = ["When (UTC)", "Who", "Event", "Action", "Record type", "Record", "Record id", "Reason", "Before", "After"];
  const rows = events.map((e) => [e.at, e.actor, e.event, e.action, e.entityType, recordText(e.record), e.entityId, e.reason ?? "", json(e.before), json(e.after)]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
