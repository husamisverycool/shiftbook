/**
 * What the money screens read (slice w; docs/patterns/money.md and its pages): the handoffs recorded,
 * the runs whose payroll can be handed off and each one's payload, wage access per worker, the
 * invoice-funding packets, and the broker's payroll by class. Reading only; tenant-fenced by the
 * caller's withAgency.
 */
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { daysToPay } from "../receivables/aging";
import { invoiceBalances } from "../receivables/balances";
import { payDates, rateCards, firstDays } from "../payroll/paid-lines";
import { fundingPacket, type FundingFacts, type FundingInvoice, type FundingPacket } from "./funding";
import { buildPayrollPayload, type PayrollPayload } from "./payroll-payload";
import { fundingRules, wageAccessRules } from "./settings";
import { wageAccessAvailability, type Availability, type UnpaidShift, type WageAccessRules } from "./wage-access";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const name = (w: { firstName: string; lastName: string }) => `${w.firstName} ${w.lastName}`;

// ---------- handoffs ----------

export interface HandoffRow {
  id: string;
  kind: s.HandoffKind;
  subjectType: string;
  subjectId: string;
  partner: s.HandoffPartner;
  status: "recorded";
  amountCents: number | null;
  summary: Record<string, unknown>;
  payloadSha256: string;
  createdAt: string;
  createdByLabel: string;
}

export async function handoffs(tx: Tx, opts: { kind?: s.HandoffKind; subjectId?: string } = {}): Promise<HandoffRow[]> {
  const where = [];
  if (opts.kind) where.push(eq(s.partnerHandoffs.kind, opts.kind));
  if (opts.subjectId) where.push(eq(s.partnerHandoffs.subjectId, opts.subjectId));
  const rows = await tx
    .select({
      id: s.partnerHandoffs.id,
      kind: s.partnerHandoffs.kind,
      subjectType: s.partnerHandoffs.subjectType,
      subjectId: s.partnerHandoffs.subjectId,
      partner: s.partnerHandoffs.partner,
      status: s.partnerHandoffs.status,
      amountCents: s.partnerHandoffs.amountCents,
      summary: s.partnerHandoffs.summary,
      payloadSha256: s.partnerHandoffs.payloadSha256,
      createdAt: s.partnerHandoffs.createdAt,
      createdByLabel: s.partnerHandoffs.createdByLabel,
    })
    .from(s.partnerHandoffs)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(s.partnerHandoffs.createdAt));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

// ---------- payroll ----------

export interface PayrollRunRow {
  id: string;
  version: number;
  kind: "regular" | "correction";
  periodStart: string;
  periodEnd: string;
  payday: string;
  status: string;
  workers: number;
  grossCents: number;
  handoff: HandoffRow | null;
}

/** Runs whose files were made, newest period first; a correction is listed but handed off through its file. */
export async function payrollRuns(tx: Tx): Promise<PayrollRunRow[]> {
  const runs = await tx
    .select({ run: s.payRuns, startsOn: s.payPeriods.startsOn, endsOn: s.payPeriods.endsOn })
    .from(s.payRuns)
    .innerJoin(s.payPeriods, eq(s.payPeriods.id, s.payRuns.payPeriodId))
    .where(inArray(s.payRuns.status, ["exported", "closed"]));
  const { payDateFor } = await payDates(tx);
  const done = await handoffs(tx, { kind: "payroll" });
  return runs
    .map(({ run, startsOn, endsOn }) => ({
      id: run.id,
      version: run.version,
      kind: run.kind,
      periodStart: startsOn,
      periodEnd: endsOn,
      payday: payDateFor(endsOn),
      status: run.status,
      workers: run.approval?.totals.workers ?? 0,
      grossCents: run.approval?.totals.grossCents ?? 0,
      handoff: done.find((h) => h.subjectId === run.id) ?? null,
    }))
    .sort((a, b) => cmp(b.periodStart, a.periodStart) || b.version - a.version);
}

export interface PayrollHandoffView {
  run: PayrollRunRow;
  payload: PayrollPayload;
  /** Names for the screen (the payload carries references, not names of places). */
  clients: Record<string, string>;
}

/** The payload for one regular run, built from its approved pay lines; null when there is no such run. */
export async function payrollHandoffView(tx: Tx, runId: string): Promise<PayrollHandoffView | null> {
  if (!UUID.test(runId)) return null;
  const run = (await payrollRuns(tx)).find((r) => r.id === runId);
  if (!run || run.kind !== "regular") return null;
  const [row] = await tx.select().from(s.payRuns).where(eq(s.payRuns.id, runId));
  const lines = await tx.select().from(s.payLines).where(eq(s.payLines.payRunId, runId));
  const workerIds = [...new Set(lines.map((l) => l.workerId))];
  const [workers, assignments, jobs, sites, clients, files, cardOf, firstDay] = await Promise.all([
    workerIds.length > 0 ? tx.select().from(s.workers).where(inArray(s.workers.id, workerIds)) : Promise.resolve([]),
    tx.select({ id: s.assignments.id, jobOrderId: s.assignments.jobOrderId }).from(s.assignments),
    tx.select({ id: s.jobOrders.id, worksiteId: s.jobOrders.worksiteId, clientId: s.jobOrders.clientId }).from(s.jobOrders),
    tx.select().from(s.worksites),
    tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients),
    tx.select({ controlTotals: s.exports.controlTotals, createdAt: s.exports.createdAt }).from(s.exports).where(eq(s.exports.payRunId, runId)),
    rateCards(tx),
    firstDays(tx, lines),
  ]);
  // Wage access this payroll repays: a request is recovered by the earliest run that pays any of the
  // hours it drew on (so it is deducted once even when its hours span two weeks).
  const requests = workerIds.length > 0 ? (await handoffs(tx, { kind: "wage_access" })).filter((h) => workerIds.includes(h.subjectId)) : [];
  const recoveries: { workerId: string; handoffId: string; amountCents: number }[] = [];
  if (requests.length > 0) {
    const doneRuns = (await payrollRuns(tx)).filter((r) => r.kind === "regular");
    const otherLines = await tx
      .select({ payRunId: s.payLines.payRunId, workerId: s.payLines.workerId, timeEntryIds: s.payLines.timeEntryIds })
      .from(s.payLines)
      .where(and(inArray(s.payLines.workerId, workerIds), inArray(s.payLines.payRunId, doneRuns.map((r) => r.id))));
    const startOf = new Map(doneRuns.map((r) => [r.id, `${r.periodStart}|${String(r.version).padStart(4, "0")}`]));
    for (const h of requests) {
      const drawn = new Set(Array.isArray(h.summary.entryIds) ? (h.summary.entryIds as string[]) : []);
      const paying = [...new Set(otherLines.filter((l) => l.workerId === h.subjectId && l.timeEntryIds.some((id) => drawn.has(id))).map((l) => l.payRunId))].sort((a, b) => cmp(startOf.get(a) ?? "", startOf.get(b) ?? ""));
      if (paying[0] === runId) recoveries.push({ workerId: h.subjectId, handoffId: h.id, amountCents: h.amountCents ?? 0 });
    }
  }
  // The gross the payroll file carried (the first file made), else what the Owner approved.
  const file = files.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  const runGrossCents = file?.controlTotals.grossCents ?? row?.approval?.totals.grossCents ?? 0;
  const payload = buildPayrollPayload({
    run: { id: run.id, version: run.version, periodStart: run.periodStart, periodEnd: run.periodEnd, payday: run.payday, rulesVersion: row?.rulesVersion ?? "", approvedAt: row?.approvedAt?.toISOString() ?? null },
    runGrossCents,
    workers: workers.map((w) => ({ id: w.id, firstName: w.firstName, lastName: w.lastName, hireDate: w.hireDate, ssnLast4: w.ssnLast4 })),
    workplaces: sites.map((w) => ({ id: w.id, name: w.name, state: w.state, county: w.county, city: w.city, address: w.addressLine })),
    recoveries,
    lines: lines.map((l) => {
      const a = assignments.find((x) => x.id === l.assignmentId);
      const job = a ? jobs.find((j) => j.id === a.jobOrderId) : undefined;
      const card = cardOf(l.assignmentId, job?.id ?? null, firstDay(l), l.workweekStart);
      return {
        id: l.id,
        workerId: l.workerId,
        type: l.type,
        minutes: l.minutes,
        rate: { num: l.rateNum, den: l.rateDen },
        amountCents: l.amountCents,
        workweekStart: l.workweekStart,
        workplaceId: job?.worksiteId ?? null,
        clientId: job?.clientId ?? null,
        clientName: job ? (clients.find((c) => c.id === job.clientId)?.name ?? null) : null,
        wcClassCode: card?.wcClassCode ?? null,
        explain: l.explain,
      };
    }),
  });
  return { run, payload, clients: Object.fromEntries(clients.map((c) => [`granite:client:${c.id}`, c.name])) };
}

// ---------- wage access ----------

export interface WageAccessRow {
  workerId: string;
  workerName: string;
  availability: Availability;
  requests: HandoffRow[];
}

const APPROVED: ("reviewed" | "client_approved")[] = ["reviewed", "client_approved"];

/** Each worker's approved, unpaid hours and what may be accessed; one worker with `workerId`. */
export async function wageAccessView(tx: Tx, opts: { workerId?: string } = {}): Promise<{ rules: WageAccessRules; rows: WageAccessRow[] }> {
  const rules = await wageAccessRules(tx);
  if (opts.workerId !== undefined && !UUID.test(opts.workerId)) return { rules, rows: [] };
  const where = [inArray(s.timeEntries.status, APPROVED)];
  if (opts.workerId) where.push(eq(s.timeEntries.workerId, opts.workerId));
  const entries = (await tx.select().from(s.timeEntries).where(and(...where))).filter((e) => e.workerId && e.assignmentId && e.workDate && (e.minutes ?? 0) > 0);
  const requests = await handoffs(tx, { kind: "wage_access", ...(opts.workerId ? { subjectId: opts.workerId } : {}) });
  const drawn = [...new Set(requests.flatMap((r) => (Array.isArray(r.summary.entryIds) ? (r.summary.entryIds as string[]) : [])))];
  const paid = new Set(
    drawn.length > 0
      ? (await tx.select({ id: s.timeEntries.id }).from(s.timeEntries).where(and(inArray(s.timeEntries.id, drawn), eq(s.timeEntries.status, "locked")))).map((r) => r.id)
      : [],
  );
  const workerIds = [...new Set([...entries.map((e) => e.workerId!), ...requests.map((r) => r.subjectId), ...(opts.workerId ? [opts.workerId] : [])])];
  const [workers, assignments, cardOf] = await Promise.all([
    workerIds.length > 0 ? tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers).where(inArray(s.workers.id, workerIds)) : Promise.resolve([]),
    tx.select({ id: s.assignments.id, jobOrderId: s.assignments.jobOrderId }).from(s.assignments),
    rateCards(tx),
  ]);
  const rows = workers.map((w) => {
    const shifts: UnpaidShift[] = entries
      .filter((e) => e.workerId === w.id)
      .map((e) => {
        const a = assignments.find((x) => x.id === e.assignmentId);
        const card = cardOf(e.assignmentId, a?.jobOrderId ?? null, e.workDate!, e.workDate!);
        return { entryId: e.id, workDate: e.workDate!, minutes: e.minutes!, payRateCents: card?.payRateCents ?? null };
      });
    const mine = requests.filter((r) => r.subjectId === w.id);
    const outstanding = mine.map((r) => ({ amountCents: r.amountCents ?? 0, entryIds: Array.isArray(r.summary.entryIds) ? (r.summary.entryIds as string[]) : [] }));
    return { workerId: w.id, workerName: name(w), availability: wageAccessAvailability(shifts, outstanding, rules, paid), requests: mine };
  });
  return { rules, rows: rows.sort((a, b) => b.availability.earnedCents - a.availability.earnedCents || cmp(a.workerName, b.workerName)) };
}

// ---------- invoice funding ----------

/** Every open invoice's packet as of today (newest first); one with `invoiceId`. */
export async function fundingView(tx: Tx, today: string, opts: { invoiceId?: string } = {}): Promise<{ packets: FundingPacket[]; handoffs: HandoffRow[] }> {
  const rules = await fundingRules(tx);
  const balances = await invoiceBalances(tx, { asOf: today });
  const open = balances.filter((b) => b.balanceCents > 0 && b.invoice.status === "issued");
  const allOpenCents = open.reduce((t, b) => t + b.balanceCents, 0);
  const wanted = opts.invoiceId ? balances.filter((b) => b.invoice.id === opts.invoiceId) : open;
  if (wanted.length === 0) return { packets: [], handoffs: [] };
  const clientIds = [...new Set(wanted.map((b) => b.invoice.clientId))];
  const runIds = [...new Set(wanted.map((b) => b.invoice.payRunId))];
  const [runs, requests] = await Promise.all([
    tx.select({ id: s.payRuns.id, payPeriodId: s.payRuns.payPeriodId }).from(s.payRuns).where(inArray(s.payRuns.id, runIds)),
    tx.select().from(s.approvalRequests).where(inArray(s.approvalRequests.clientId, clientIds)),
  ]);
  const requestIds = requests.map((r) => r.id);
  const [decisions, disputes] = await Promise.all([
    requestIds.length > 0 ? tx.select().from(s.approvalDecisions).where(inArray(s.approvalDecisions.requestId, requestIds)) : Promise.resolve([]),
    requestIds.length > 0 ? tx.select({ requestId: s.clientDisputes.requestId, status: s.clientDisputes.status }).from(s.clientDisputes).where(and(inArray(s.clientDisputes.requestId, requestIds), ne(s.clientDisputes.status, "draft"))) : Promise.resolve([]),
  ]);
  const funded = await handoffs(tx, { kind: "funding" });
  const packets = wanted.map((b) => {
    const inv = b.invoice;
    const period = runs.find((r) => r.id === inv.payRunId)?.payPeriodId;
    const mine = requests.filter((r) => r.clientId === inv.clientId);
    const forPeriod = mine.filter((r) => r.payPeriodId === period).map((r) => r.id);
    const decided = decisions.filter((d) => mine.some((r) => r.id === d.requestId));
    const paidOff = balances.filter((x) => x.invoice.clientId === inv.clientId && x.paidOffOn).map((x) => ({ issuedOn: x.invoice.issuedOn, dueOn: x.invoice.dueOn, paidOn: x.paidOffOn! }));
    const dtp = daysToPay(paidOff);
    const facts: FundingFacts = {
      asOf: today,
      clientOpenCents: open.filter((x) => x.invoice.clientId === inv.clientId).reduce((t, x) => t + x.balanceCents, 0),
      allOpenCents,
      paidInvoices: dtp.invoices,
      averageDaysToPay: dtp.averageDays,
      averageDaysLate: dtp.averageDaysLate,
      approvedShifts: decided.reduce((t, d) => t + d.approved.length, 0),
      disputedShifts: decided.reduce((t, d) => t + d.disputed.length, 0),
      openDisputes: disputes.filter((d) => forPeriod.includes(d.requestId) && d.status === "open").length,
      approvals: decisions
        .filter((d) => forPeriod.includes(d.requestId))
        .sort((x, y) => x.decidedAt.getTime() - y.decidedAt.getTime())
        .map((d) => ({ approverName: d.typedName, decidedAt: d.decidedAt.toISOString(), approvedShifts: d.approved.length, disputedShifts: d.disputed.length })),
    };
    const backup = inv.document?.backup;
    const invoice: FundingInvoice = {
      id: inv.id,
      number: inv.number,
      clientId: inv.clientId,
      clientName: b.clientName,
      issuedOn: inv.issuedOn,
      dueOn: inv.dueOn,
      totalCents: inv.totalCents,
      balanceCents: b.balanceCents,
      status: inv.status,
      kind: inv.kind,
      poNumber: inv.poNumber,
      hasBackup: Boolean(backup && (backup.detail || backup.images.length > 0)),
    };
    return fundingPacket(invoice, facts, rules);
  });
  return { packets: packets.sort((a, b) => cmp(b.invoice.issuedOn, a.invoice.issuedOn) || cmp(b.invoice.number, a.invoice.number)), handoffs: funded };
}

export { fundingRules, wageAccessRules };
