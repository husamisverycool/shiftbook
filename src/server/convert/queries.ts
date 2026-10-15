/**
 * What each step of the converter shows (docs/patterns/convert.md). Read-only, except that the
 * totals step recomputes the run when hours changed since it was last computed.
 */
import { desc, eq, inArray } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { computeRun, type RunIssue } from "../run/service";
import type { Actor } from "../session";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const fullName = (w: { firstName: string; lastName: string }) => `${w.firstName} ${w.lastName}`;

export async function latestRun(tx: Tx, payPeriodId: string) {
  const [run] = await tx.select().from(s.payRuns).where(eq(s.payRuns.payPeriodId, payPeriodId)).orderBy(desc(s.payRuns.version)).limit(1);
  return run ?? null;
}

export async function listPeriods(tx: Tx) {
  const periods = await tx.select().from(s.payPeriods);
  const out = [];
  for (const p of [...periods].sort((a, b) => cmp(b.startsOn, a.startsOn))) {
    const run = await latestRun(tx, p.id);
    const docs = await tx.select({ id: s.sourceDocuments.id }).from(s.sourceDocuments).where(eq(s.sourceDocuments.payPeriodId, p.id)).limit(1);
    out.push({ id: p.id, startsOn: p.startsOn, endsOn: p.endsOn, runStatus: run?.status ?? null, started: docs.length > 0 || run !== null });
  }
  return out;
}

export async function getPeriod(tx: Tx, payPeriodId: string) {
  const [p] = await tx.select().from(s.payPeriods).where(eq(s.payPeriods.id, payPeriodId));
  return p ?? null;
}

export async function uploadStep(tx: Tx, payPeriodId: string) {
  const docs = await tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.payPeriodId, payPeriodId));
  const entries = await tx
    .select({ documentId: s.timeEntries.sourceDocumentId, status: s.timeEntries.status })
    .from(s.timeEntries)
    .where(eq(s.timeEntries.payPeriodId, payPeriodId));
  const clients = await tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients);
  return docs
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || cmp(a.filename, b.filename))
    .map((d) => {
      const mine = entries.filter((e) => e.documentId === d.id);
      return {
        id: d.id,
        filename: d.filename,
        kind: d.kind,
        status: d.status,
        error: d.error,
        clientName: clients.find((c) => c.id === d.clientId)?.name ?? null,
        entries: mine.length,
        needsReview: mine.filter((e) => e.status === "needs_review").length,
      };
    });
}

export interface HoursRow {
  id: string;
  workerId: string | null;
  workerName: string;
  workerNameRaw: string;
  clientName: string | null;
  workDate: string | null;
  inMinute: number | null;
  outMinute: number | null;
  breakMinutes: number | null;
  minutes: number | null;
  confidence: "high" | "medium" | "low";
  status: (typeof s.timeEntryStatus.enumValues)[number];
  reviewReasons: string[];
  fields: s.EntryFields;
  document: { id: string; filename: string; kind: string; pageCount: number | null } | null;
  rowIndex: number;
}

export async function hoursStep(tx: Tx, payPeriodId: string) {
  const entries = await tx.select().from(s.timeEntries).where(eq(s.timeEntries.payPeriodId, payPeriodId));
  const docs = await tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.payPeriodId, payPeriodId));
  const workerRows = await tx.select().from(s.workers);
  const workersById = new Map(workerRows.map((w) => [w.id, w]));
  const assignmentClients = await tx
    .select({ id: s.assignments.id, clientName: s.clients.name })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId));
  const clientOf = new Map(assignmentClients.map((a) => [a.id, a.clientName]));
  const docClients = await tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients);
  const rows: HoursRow[] = entries
    .filter((e) => e.sourceDocumentId !== null)
    .map((e) => {
      const w = e.workerId ? workersById.get(e.workerId) : undefined;
      const d = docs.find((x) => x.id === e.sourceDocumentId);
      return {
        id: e.id,
        workerId: e.workerId,
        workerName: w ? fullName(w) : e.workerNameRaw,
        workerNameRaw: e.workerNameRaw,
        clientName: (e.assignmentId ? clientOf.get(e.assignmentId) : undefined) ?? docClients.find((c) => c.id === d?.clientId)?.name ?? null,
        workDate: e.workDate,
        inMinute: e.inMinute,
        outMinute: e.outMinute,
        breakMinutes: e.breakMinutes,
        minutes: e.minutes,
        confidence: e.confidence,
        status: e.status,
        reviewReasons: e.reviewReasons,
        fields: e.fields,
        document: d ? { id: d.id, filename: d.filename, kind: d.kind, pageCount: d.pageCount } : null,
        rowIndex: e.rowIndex,
      };
    })
    .sort((a, b) => cmp(a.workerName.toLowerCase(), b.workerName.toLowerCase()) || cmp(a.workDate ?? "", b.workDate ?? "") || (a.inMinute ?? -1) - (b.inMinute ?? -1) || cmp(a.id, b.id));
  const roster = workerRows.map((w) => ({ id: w.id, name: fullName(w) })).sort((a, b) => cmp(a.name, b.name));
  return { rows, roster };
}

/** Recomputes the working run when it is missing, reset to draft, or older than the latest hours. */
export async function ensureFreshRun(tx: Tx, actor: Actor, payPeriodId: string) {
  const run = await latestRun(tx, payPeriodId);
  if (run && (run.status === "exported" || run.status === "closed")) return run;
  if (run && run.status !== "draft") {
    const entries = await tx.select({ updatedAt: s.timeEntries.updatedAt }).from(s.timeEntries).where(eq(s.timeEntries.payPeriodId, payPeriodId));
    const workers = await tx.select({ createdAt: s.workers.createdAt }).from(s.workers);
    const newest = Math.max(0, ...entries.map((e) => e.updatedAt.getTime()), ...workers.map((w) => w.createdAt.getTime()));
    if (newest <= run.updatedAt.getTime()) return run;
  }
  await computeRun(tx, actor, payPeriodId);
  return (await latestRun(tx, payPeriodId))!;
}

export interface BlockerGroup {
  code: RunIssue["code"];
  ruleCode: string | null;
  /** Set when the group is about one state's (or the federal) rules. */
  jurisdiction: string | null;
  ruleCodes: string[];
  issues: RunIssue[];
  workerIds: string[];
  workerNames: string[];
  entryIds: string[];
}

/** Codes grouped per jurisdiction: one alert names the rules once and lists the workers. */
const BY_JURISDICTION = new Set(["rule_not_supported_yet", "unknown_jurisdiction"]);

/** One group per blocker type (Gusto shows one banner per blocker type). */
export function groupIssues(issues: RunIssue[]): BlockerGroup[] {
  const groups = new Map<string, BlockerGroup>();
  for (const i of issues) {
    const byPlace = BY_JURISDICTION.has(i.code);
    const key = byPlace ? `${i.code}|${i.jurisdiction ?? ""}` : `${i.code}|${i.ruleCode ?? ""}`;
    const g =
      groups.get(key) ??
      { code: i.code, ruleCode: byPlace ? null : (i.ruleCode ?? null), jurisdiction: byPlace ? (i.jurisdiction ?? null) : null, ruleCodes: [], issues: [], workerIds: [], workerNames: [], entryIds: [] };
    g.issues.push(i);
    if (byPlace && i.ruleCode && !g.ruleCodes.includes(i.ruleCode)) g.ruleCodes.push(i.ruleCode);
    if (i.workerName && !g.workerNames.includes(i.workerName)) g.workerNames.push(i.workerName);
    if (i.workerId && !g.workerIds.includes(i.workerId)) g.workerIds.push(i.workerId);
    for (const id of i.entryIds ?? []) if (!g.entryIds.includes(id)) g.entryIds.push(id);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    g.ruleCodes.sort(cmp);
    g.workerNames.sort((a, b) => cmp(a.toLowerCase(), b.toLowerCase()));
  }
  return [...groups.values()];
}

export async function totalsStep(tx: Tx, actor: Actor, payPeriodId: string) {
  const run = await ensureFreshRun(tx, actor, payPeriodId);
  const pay = await tx.select().from(s.payLines).where(eq(s.payLines.payRunId, run.id));
  const bill = await tx.select().from(s.billLines).where(eq(s.billLines.payRunId, run.id));
  const ids = [...new Set([...pay.map((l) => l.workerId), ...run.skipped.map((x) => x.workerId)])];
  const people = ids.length > 0 ? await tx.select().from(s.workers).where(inArray(s.workers.id, ids)) : [];
  const nameOf = new Map(people.map((w) => [w.id, fullName(w)]));
  const clients = await tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients);

  const perWorker = new Map<string, { workerId: string; name: string; regular: number; overtime: number; double: number; grossCents: number }>();
  for (const l of pay) {
    const row = perWorker.get(l.workerId) ?? { workerId: l.workerId, name: nameOf.get(l.workerId) ?? "", regular: 0, overtime: 0, double: 0, grossCents: 0 };
    if (l.type === "REG") row.regular += l.minutes;
    else if (l.type === "OT") row.overtime += l.minutes;
    else if (l.type === "DT") row.double += l.minutes;
    row.grossCents += l.amountCents;
    perWorker.set(l.workerId, row);
  }
  const perClient = new Map<string, { clientId: string; name: string; minutes: number; billedCents: number }>();
  for (const l of bill) {
    const row = perClient.get(l.clientId) ?? { clientId: l.clientId, name: clients.find((c) => c.id === l.clientId)?.name ?? "", minutes: 0, billedCents: 0 };
    row.minutes += l.minutes;
    row.billedCents += l.amountCents;
    perClient.set(l.clientId, row);
  }
  const workers = [...perWorker.values()].sort((a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()));
  const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((t, r) => t + f(r), 0);
  return {
    run: { id: run.id, version: run.version, status: run.status },
    summary: {
      workers: workers.length,
      regular: sum(workers, (w) => w.regular),
      overtime: sum(workers, (w) => w.overtime),
      double: sum(workers, (w) => w.double),
      grossCents: sum(workers, (w) => w.grossCents),
      billedCents: sum(bill, (l) => l.amountCents),
    },
    workers,
    clients: [...perClient.values()].sort((a, b) => cmp(a.name, b.name)),
    blockers: groupIssues(run.blockers as RunIssue[]),
    warnings: groupIssues(run.warnings as RunIssue[]),
    skipped: run.skipped.map((x) => ({ ...x, name: nameOf.get(x.workerId) ?? x.workerId })).sort((a, b) => cmp(a.reason, b.reason) || cmp(a.name, b.name)),
  };
}

export async function filesStep(tx: Tx, payPeriodId: string) {
  const run = await latestRun(tx, payPeriodId);
  if (!run || run.status !== "exported") return null;
  const [payroll] = await tx.select().from(s.exports).where(eq(s.exports.payRunId, run.id)).orderBy(desc(s.exports.createdAt)).limit(1);
  const invoices = await tx
    .select({ id: s.invoices.id, number: s.invoices.number, totalCents: s.invoices.totalCents, dueOn: s.invoices.dueOn, clientName: s.clients.name })
    .from(s.invoices)
    .innerJoin(s.clients, eq(s.clients.id, s.invoices.clientId))
    .where(eq(s.invoices.payRunId, run.id));
  return { run: { id: run.id, version: run.version }, payroll: payroll ?? null, invoices: invoices.sort((a, b) => cmp(a.number, b.number)) };
}
