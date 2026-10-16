/**
 * What each step of the converter shows (docs/patterns/convert.md). Read-only, except that the
 * totals step recomputes the run when hours changed since it was last computed.
 */
import { desc, eq, inArray, and } from "drizzle-orm";
import { WORKED_TIME } from "@shiftbook/rules";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { isStuck } from "../intake/service";
import { clientNets } from "../files/invoice-plan";
import { correctionPlanFor, decisionText, paidBase } from "../run/corrections";
import { PeriodLockedError, periodState } from "../run/period-lock";
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
    // A period paid before Shiftbook is history, not to run.
    if ((await periodState(tx, p.id)) === "history") continue;
    const run = await latestRun(tx, p.id);
    const docs = await tx.select({ id: s.sourceDocuments.id }).from(s.sourceDocuments).where(eq(s.sourceDocuments.payPeriodId, p.id)).limit(1);
    out.push({ id: p.id, startsOn: p.startsOn, endsOn: p.endsOn, runStatus: run?.status ?? null, correcting: run?.kind === "correction" && run.status !== "exported" && run.status !== "closed", started: docs.length > 0 || run !== null });
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
  const now = new Date();
  return docs
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || cmp(a.filename, b.filename))
    .map((d) => {
      const mine = entries.filter((e) => e.documentId === d.id);
      return {
        id: d.id,
        filename: d.filename,
        kind: d.kind,
        status: d.status,
        /** Its reading stopped part-way (a crash or restart): offer to read it again or archive it. */
        stuck: isStuck(d, now),
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
  /** For hours held because the worker's assignment that day is at another client (or the timesheet's client is unclear): that client. */
  otherClient: { id: string; name: string } | null;
  fields: s.EntryFields;
  document: { id: string; filename: string; kind: string; pageCount: number | null } | null;
  rowIndex: number;
}

export async function hoursStep(tx: Tx, payPeriodId: string) {
  const docs = await tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.payPeriodId, payPeriodId));
  // An archived timesheet's hours were set aside with it and are not paid: they are not shown.
  const archived = new Set(docs.filter((d) => d.status === "archived").map((d) => d.id));
  const entries = (await tx.select().from(s.timeEntries).where(eq(s.timeEntries.payPeriodId, payPeriodId))).filter((e) => !(e.sourceDocumentId && archived.has(e.sourceDocumentId)));
  const workerRows = await tx.select().from(s.workers);
  const workersById = new Map(workerRows.map((w) => [w.id, w]));
  const assignmentClients = await tx
    .select({ id: s.assignments.id, clientName: s.clients.name })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId));
  const clientOf = new Map(assignmentClients.map((a) => [a.id, a.clientName]));
  const coverage = await tx
    .select({ workerId: s.assignments.workerId, start: s.assignments.startDate, end: s.assignments.endDate, status: s.assignments.status, clientId: s.clients.id, clientName: s.clients.name })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId));
  /** The one other client whose assignment covers that worker's day, if exactly one does. */
  const otherClientOf = (workerId: string | null, date: string | null, docClientId: string | null) => {
    if (!workerId || !date) return null;
    const others = new Map(coverage.filter((a) => a.workerId === workerId && a.status !== "cancelled" && a.start <= date && (a.end === null || date <= a.end) && a.clientId !== docClientId).map((a) => [a.clientId, a.clientName]));
    const [only] = others.size === 1 ? [...others] : [];
    return only ? { id: only[0], name: only[1] } : null;
  };
  const docClients = await tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients);
  const rows: HoursRow[] = entries
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
        otherClient:
          (e.reviewReasons.includes("assignment_at_other_client") || e.reviewReasons.includes("timesheet_client_unclear")) && !e.assignmentId ? otherClientOf(e.workerId, e.workDate, d?.clientId ?? null) : null,
        fields: e.fields,
        document: d ? { id: d.id, filename: d.filename, kind: d.kind, pageCount: d.pageCount } : null,
        rowIndex: e.rowIndex,
      };
    })
    .sort((a, b) => cmp(a.workerName.toLowerCase(), b.workerName.toLowerCase()) || cmp(a.workDate ?? "", b.workDate ?? "") || (a.inMinute ?? -1) - (b.inMinute ?? -1) || cmp(a.id, b.id));
  const roster = workerRows.map((w) => ({ id: w.id, name: fullName(w) })).sort((a, b) => cmp(a.name, b.name));
  return { rows, roster };
}

/**
 * Recomputes the working run every time totals are shown. Computing is idempotent (same inputs, same
 * fingerprint, nothing rewritten), so any change — hours, rates, worksites, rules, settings — shows.
 */
export async function ensureFreshRun(tx: Tx, actor: Actor, payPeriodId: string) {
  const run = await latestRun(tx, payPeriodId);
  if (run && (run.status === "exported" || run.status === "closed")) return { run, fingerprint: null };
  try {
    const computed = await computeRun(tx, actor, payPeriodId);
    return { run: (await latestRun(tx, payPeriodId))!, fingerprint: computed.fingerprint };
  } catch (error) {
    // The files were created between the status check and the lock: show the exported run.
    if (error instanceof PeriodLockedError) return { run: (await latestRun(tx, payPeriodId))!, fingerprint: null };
    throw error;
  }
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
  const { run, fingerprint } = await ensureFreshRun(tx, actor, payPeriodId);
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
    // Hours billed are worked hours only: a premium or minimum-pay line repeats or adds minutes nobody worked.
    if (WORKED_TIME.includes(l.type)) row.minutes += l.minutes;
    row.billedCents += l.amountCents;
    perClient.set(l.clientId, row);
  }
  const workers = [...perWorker.values()].sort((a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()));
  const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((t, r) => t + f(r), 0);
  return {
    correction: run.kind === "correction" ? await correctionView(tx, run, clients) : null,
    run: { id: run.id, version: run.version, status: run.status, fingerprint },
    approval: run.approvedAt ? { by: run.approvedByLabel ?? "", at: run.approvedAt } : null,
    canApprove: actor.role === "owner",
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

/**
 * A correction's review (docs/patterns/convert.md: was / now / difference per worker and per client),
 * the decisions on file, and the workers it cannot skip (paid in the version it corrects; decision E10).
 */
async function correctionView(tx: Tx, run: typeof s.payRuns.$inferSelect, clients: { id: string; name: string }[]) {
  const base = (await paidBase(tx, run.payPeriodId, run.version))!;
  const plan = await correctionPlanFor(tx, run);
  const ids = [...new Set([...plan.pay.map((l) => l.workerId), ...base.pay.map((l) => l.workerId)])];
  const people = ids.length > 0 ? await tx.select().from(s.workers).where(inArray(s.workers.id, ids)) : [];
  const nameOf = new Map(people.map((w) => [w.id, fullName(w)]));
  // Was and now are each worker's (and client's) whole pay (bill) for the period in each version.
  const now = await tx.select({ workerId: s.payLines.workerId, amountCents: s.payLines.amountCents }).from(s.payLines).where(eq(s.payLines.payRunId, run.id));
  const nowBill = await tx.select({ clientId: s.billLines.clientId, amountCents: s.billLines.amountCents }).from(s.billLines).where(eq(s.billLines.payRunId, run.id));
  const total = <T,>(rows: T[], keep: (r: T) => boolean, cents: (r: T) => number) => rows.filter(keep).reduce((sum, r) => sum + cents(r), 0);
  const byWorker = new Map<string, { workerId: string; name: string; wasCents: number; nowCents: number; diffCents: number; regular: number; overtime: number; double: number }>();
  for (const l of plan.pay) {
    const row = byWorker.get(l.workerId) ?? {
      workerId: l.workerId,
      name: nameOf.get(l.workerId) ?? "",
      wasCents: total(base.pay, (x) => x.workerId === l.workerId, (x) => x.amountCents),
      nowCents: total(now, (x) => x.workerId === l.workerId, (x) => x.amountCents),
      diffCents: 0,
      regular: 0,
      overtime: 0,
      double: 0,
    };
    row.diffCents += l.amountCents;
    if (l.type === "REG") row.regular += l.minutes;
    else if (l.type === "OT") row.overtime += l.minutes;
    else if (l.type === "DT") row.double += l.minutes;
    byWorker.set(l.workerId, row);
  }
  const byClient = new Map<string, { clientId: string; name: string; wasCents: number; nowCents: number; diffCents: number; minutes: number }>();
  for (const l of plan.bill) {
    const row = byClient.get(l.clientId!) ?? {
      clientId: l.clientId!,
      name: clients.find((c) => c.id === l.clientId)?.name ?? "",
      wasCents: total(base.bill, (x) => x.clientId === l.clientId, (x) => x.amountCents),
      nowCents: total(nowBill, (x) => x.clientId === l.clientId, (x) => x.amountCents),
      diffCents: 0,
      minutes: 0,
    };
    row.diffCents += l.amountCents;
    if (WORKED_TIME.includes(l.type)) row.minutes += l.minutes;
    byClient.set(l.clientId!, row);
  }
  const decisions = plan.workers.flatMap((w) =>
    w.decisions.map((d) => ({ id: d.id, workerId: w.workerId, name: nameOf.get(w.workerId) ?? "", decision: d.decision, differenceCents: d.differenceCents, note: d.note, by: d.decidedByLabel, fits: !w.stale.includes(d) })),
  );
  const workers = [...byWorker.values()].sort((a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()));
  const clientRows = [...byClient.values()].sort((a, b) => cmp(a.name, b.name));
  return {
    version: run.version,
    baseVersion: base.run.version,
    reason: run.reason ?? "",
    workers,
    clients: clientRows,
    decisions: decisions.sort((a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase())),
    summary: {
      workers: workers.length,
      regular: workers.reduce((t, w) => t + w.regular, 0),
      overtime: workers.reduce((t, w) => t + w.overtime, 0),
      double: workers.reduce((t, w) => t + w.double, 0),
      payDiffCents: workers.reduce((t, w) => t + w.diffCents, 0),
      billDiffCents: clientRows.reduce((t, c) => t + c.diffCents, 0),
    },
    noSkip: [...new Set(base.pay.map((l) => l.workerId))].sort(cmp),
    noBringBack: base.run.skipped.map((x) => x.workerId).sort(cmp),
  };
}

/** The open correction's version, reason and the version it corrects, for the step frame; or null. */
export async function openCorrectionOf(tx: Tx, payPeriodId: string) {
  const run = await latestRun(tx, payPeriodId);
  if (!run || run.kind !== "correction" || run.status === "exported" || run.status === "closed") return null;
  const base = await paidBase(tx, payPeriodId, run.version);
  return { version: run.version, baseVersion: base?.run.version ?? run.version - 1, reason: run.reason ?? "" };
}

/** Every paid version of the period, newest first, each with its files (docs/patterns/convert.md, Files: versions). */
export async function filesStep(tx: Tx, actor: Actor, payPeriodId: string) {
  const run = await latestRun(tx, payPeriodId);
  if (!run || run.status !== "exported") return null;
  const paid = await tx
    .select()
    .from(s.payRuns)
    .where(and(eq(s.payRuns.payPeriodId, payPeriodId), inArray(s.payRuns.status, ["exported", "closed"])))
    .orderBy(desc(s.payRuns.version));
  const versions = [];
  for (const v of paid) {
    const [payroll] = await tx.select().from(s.exports).where(eq(s.exports.payRunId, v.id)).orderBy(desc(s.exports.createdAt)).limit(1);
    const invoices = await tx
      .select({ id: s.invoices.id, number: s.invoices.number, kind: s.invoices.kind, originalInvoiceId: s.invoices.originalInvoiceId, totalCents: s.invoices.totalCents, dueOn: s.invoices.dueOn, clientId: s.invoices.clientId, clientName: s.clients.name })
      .from(s.invoices)
      .innerJoin(s.clients, eq(s.clients.id, s.invoices.clientId))
      .where(eq(s.invoices.payRunId, v.id));
    const originals = invoices.some((i) => i.originalInvoiceId)
      ? await tx.select({ id: s.invoices.id, number: s.invoices.number }).from(s.invoices).where(inArray(s.invoices.id, invoices.map((i) => i.originalInvoiceId).filter((x): x is string => x !== null)))
      : [];
    // A correction: clients whose differences net to zero get no document (decision E11); say so.
    const netZero: string[] = [];
    // A cent rounding left over when hours moved at one rate: neither paid nor taken back, said here.
    const roundings: { name: string; cents: number }[] = [];
    if (v.kind === "correction") {
      const plan = await correctionPlanFor(tx, v);
      const left = plan.workers.filter((w) => w.leftoverCents !== 0);
      if (left.length > 0) {
        const people = await tx.select().from(s.workers).where(inArray(s.workers.id, left.map((w) => w.workerId)));
        roundings.push(...left.map((w) => ({ name: fullName(people.find((p) => p.id === w.workerId)!), cents: w.leftoverCents })).sort((a, b) => cmp(a.name, b.name)));
      }
      // Clients whose differences were real but whose invoices got no document in this version.
      const billedNow = new Set(invoices.map((i) => i.clientId));
      const zero = [...clientNets(plan.bill)].filter(([id, c]) => c.real && c.netCents === 0 && !billedNow.has(id)).map(([id]) => id);
      if (zero.length > 0) netZero.push(...(await tx.select({ name: s.clients.name }).from(s.clients).where(inArray(s.clients.id, zero))).map((c) => c.name).sort(cmp));
    }
    const decided = await tx
      .select({ decision: s.correctionDecisions.decision, differenceCents: s.correctionDecisions.differenceCents, note: s.correctionDecisions.note, by: s.correctionDecisions.decidedByLabel, firstName: s.workers.firstName, lastName: s.workers.lastName })
      .from(s.correctionDecisions)
      .innerJoin(s.workers, eq(s.workers.id, s.correctionDecisions.workerId))
      .where(eq(s.correctionDecisions.payRunId, v.id));
    versions.push({
      id: v.id,
      version: v.version,
      kind: v.kind,
      reason: v.reason,
      payroll: payroll ? { id: payroll.id, format: payroll.format, filename: payroll.filename, sha256: payroll.sha256, controlTotals: payroll.controlTotals, notes: payroll.notes } : null,
      invoices: invoices
        .map((i) => ({ id: i.id, number: i.number, kind: i.kind, originalNumber: originals.find((o) => o.id === i.originalInvoiceId)?.number ?? null, totalCents: i.totalCents, dueOn: i.dueOn, clientName: i.clientName }))
        .sort((a, b) => cmp(a.number, b.number)),
      decisions: decided
        .map((d) => ({ name: fullName(d), text: decisionText(d), note: d.note, by: d.by }))
        .sort((a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase())),
      netZero,
      roundings,
    });
  }
  return { run: { id: run.id, version: run.version }, versions, canCorrect: actor.role === "owner" };
}
