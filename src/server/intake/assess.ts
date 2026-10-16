/**
 * Turns one row read from a document into a time-entry draft: match the worker to the roster, find
 * the assignment, compute minutes, and run every check (SPEC §6). Anything doubtful sends the row to
 * "needs review" with the reason; nothing is guessed and no worker is ever created.
 *
 * Confidence:
 *   high   — every value read with certainty (two readings agree, or a deterministic file) and every
 *            check passes; can be bulk-approved
 *   medium — values read with certainty, but a check failed (unknown worker, total mismatch…)
 *   low    — a value was unreadable, the two readings disagreed, or handwriting was not confirmed
 */
import type { EntryFields, FieldProvenance } from "../db/schema";
import { foldName, matchWorker, type RosterWorker } from "./names";
import type { FieldReading, RawEntry } from "./types";

export interface AssessContext {
  period: { startsOn: string; endsOn: string };
  roster: RosterWorker[];
  nicknames: [string, string][];
  assignments: { assignmentId: string; workerId: string; clientId: string; startDate: string; endDate: string | null; status: string }[];
  clients: { clientId: string; name: string }[];
  clientHint: string | null;
}

export interface EntryDraft {
  rowIndex: number;
  workerNameRaw: string;
  workerId: string | null;
  assignmentId: string | null;
  clientId: string | null;
  workDate: string | null;
  inMinute: number | null;
  outMinute: number | null;
  breakMinutes: number | null;
  minutes: number | null;
  fields: EntryFields;
  confidence: "high" | "medium" | "low";
  status: "extracted" | "needs_review";
  reviewReasons: string[];
  /** Ids a VMS gave these hours (slice g): kept for the client's VMS invoice upload. */
  vmsRefs?: { timeSheetIds: string[]; workerId: string };
}

type FieldName = keyof EntryFields;
const READING_PROBLEMS = /^(unreadable|passes_disagree|handwriting_not_confirmed):/;

export function resolveClient(hint: string | null, clients: AssessContext["clients"]): string | null {
  if (!hint) return null;
  const h = foldName(hint);
  const found = clients.filter((c) => {
    const name = foldName(c.name.replace(/\(demo\)/i, ""));
    return name === h || h.startsWith(name) || name.startsWith(h);
  });
  return found.length === 1 ? found[0]!.clientId : null;
}

export function assessEntry(raw: RawEntry, ctx: AssessContext): EntryDraft {
  const reasons: string[] = [...raw.checks];
  const fieldChecks: Partial<Record<FieldName, string[]>> = {};
  const flag = (reason: string, field?: FieldName) => {
    if (!reasons.includes(reason)) reasons.push(reason);
    if (field) (fieldChecks[field] ??= []).push(reason);
  };
  for (const c of raw.checks) {
    const field = c.split(":")[1] as FieldName | undefined;
    if (field) (fieldChecks[field] ??= []).push(c);
  }

  // How each value was read: two passes must agree; handwriting needs confirmed agreement.
  const fields: [FieldName, FieldReading<unknown> | null][] = [
    ["worker", raw.worker],
    ["date", raw.date],
    ["in", raw.in],
    ["out", raw.out],
    ["break", raw.break],
    ["total", raw.total],
  ];
  for (const [name, f] of fields) {
    if (!f) continue;
    if (f.agree === false) flag(`passes_disagree:${name}`, name);
    else if (f.handwritten && f.agree !== true) flag(`handwriting_not_confirmed:${name}`, name);
  }

  // Worker: matched within the document's client first, then the whole roster.
  const clientId = resolveClient(ctx.clientHint, ctx.clients);
  const written = raw.worker.value ?? "";
  const scoped = clientId
    ? ctx.roster.filter((w) => ctx.assignments.some((a) => a.workerId === w.workerId && a.clientId === clientId))
    : ctx.roster;
  let match = matchWorker(written, scoped, ctx.nicknames);
  if (match.status === "unmatched" && clientId) match = matchWorker(written, ctx.roster, ctx.nicknames);
  let workerId: string | null = null;
  if (!written) flag("unreadable:worker", "worker");
  else if (match.status === "matched") workerId = match.workerId;
  else if (match.status === "ambiguous") flag("worker_ambiguous", "worker");
  else flag("worker_not_on_roster", "worker");

  // Date.
  const workDate = raw.date.value;
  if (!workDate) flag("unreadable:date", "date");
  else if (workDate < ctx.period.startsOn || workDate > ctx.period.endsOn) flag("date_outside_period", "date");

  // Assignment active on that date (at the document's client when known).
  let assignmentId: string | null = null;
  let entryClientId: string | null = clientId;
  if (workerId && workDate) {
    const active = ctx.assignments.filter(
      (a) =>
        a.workerId === workerId &&
        a.status !== "cancelled" &&
        a.startDate <= workDate &&
        (a.endDate === null || workDate <= a.endDate) &&
        (clientId === null || a.clientId === clientId),
    );
    if (active.length === 1) {
      assignmentId = active[0]!.assignmentId;
      entryClientId = active[0]!.clientId;
    } else if (active.length === 0) flag("no_active_assignment", "worker");
    else flag("several_active_assignments", "worker");
  }

  // Minutes: from the clock times when present, otherwise from the written total.
  const inMinute = raw.in?.value ?? null;
  const outMinute = raw.out?.value ?? null;
  const breakMinutes = raw.break?.value ?? (raw.in && raw.out ? 0 : null);
  let minutes: number | null = null;
  if (raw.in || raw.out) {
    if (inMinute !== null && outMinute !== null) {
      if (outMinute <= inMinute) flag("in_after_out", "out");
      else if (outMinute > 1440) flag("crosses_midnight", "out");
      else {
        minutes = outMinute - inMinute - (breakMinutes ?? 0);
        if (minutes <= 0) flag("break_longer_than_shift", "break");
      }
    }
    if (raw.total?.value != null && minutes !== null && raw.total.value !== minutes) flag("total_mismatch", "total");
  } else if (raw.total) {
    minutes = raw.total.value;
    if (minutes === null) flag("unreadable:total", "total");
  }
  if (minutes !== null && minutes > 1440) flag("over_24_hours", "total");

  const provenance = (name: FieldName, f: FieldReading<unknown> | null): FieldProvenance | undefined => {
    if (!f) return undefined;
    const checks = fieldChecks[name] ?? [];
    return {
      value: f.text,
      page: f.page,
      box: f.box,
      passA: f.passA,
      passB: f.passB,
      agree: f.agree,
      handwritten: f.handwritten,
      ...(f.source ? { source: { row: f.source.row, column: f.source.column } } : {}),
      confidence: checks.some((c) => READING_PROBLEMS.test(c)) ? "low" : checks.length > 0 ? "medium" : "high",
      checks,
    };
  };
  const entryFields: EntryFields = {};
  for (const [name, f] of fields) {
    const p = provenance(name, f);
    if (p) entryFields[name] = p;
  }

  const confidence = reasons.some((r) => READING_PROBLEMS.test(r)) ? "low" : reasons.length > 0 ? "medium" : "high";
  return {
    rowIndex: raw.rowIndex,
    workerNameRaw: written,
    workerId,
    assignmentId,
    clientId: entryClientId,
    workDate,
    inMinute,
    outMinute,
    breakMinutes,
    minutes,
    fields: entryFields,
    confidence,
    status: reasons.length > 0 ? "needs_review" : "extracted",
    reviewReasons: reasons,
    ...(raw.vmsRefs ? { vmsRefs: raw.vmsRefs } : {}),
  };
}

/**
 * A timesheet belongs to one client: the one named on it, or else the client most of its matched
 * entries are at. An entry matched to an assignment at another client goes back to review instead of
 * being billed there (a worker who moved clients still appears on the old client's time clock). When
 * the client cannot be told (a tie), every matched entry is held for review.
 */
export function settleDocumentClient(drafts: EntryDraft[], named: string | null): { clientId: string | null; drafts: EntryDraft[] } {
  const counts = new Map<string, number>();
  for (const d of drafts) if (d.assignmentId && d.clientId) counts.set(d.clientId, (counts.get(d.clientId) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const clear = ranked.length <= 1 || ranked[0]![1] > ranked[1]![1];
  const clientId = named ?? (clear ? (ranked[0]?.[0] ?? null) : null);
  const hold = (d: EntryDraft, reason: string): EntryDraft => ({
    ...d,
    assignmentId: null,
    clientId,
    status: "needs_review",
    // Held for a person: never offered to bulk approval as high confidence.
    confidence: d.confidence === "low" ? "low" : "medium",
    reviewReasons: d.reviewReasons.includes(reason) ? d.reviewReasons : [...d.reviewReasons, reason],
  });
  return {
    clientId,
    drafts: drafts.map((d) => {
      if (!d.assignmentId) return clientId && !d.clientId ? { ...d, clientId } : d;
      if (clientId === null) return hold(d, "timesheet_client_unclear");
      return d.clientId === clientId ? d : hold(d, "assignment_at_other_client");
    }),
  };
}
