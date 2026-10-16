/**
 * What the margin screens show (slice i; docs/patterns/margin.md, margin/overtime.md, margin/cash.md,
 * settings/margin.md). Lines come from runs whose files were made (decision I1); burden is computed
 * from the rates in force on each week's first day when the page is drawn (I2, I3), so a rate
 * corrected back in time changes the weeks it covers.
 */
import { addDays, isEffective, isIsoDate, roundHalfUp, workweekStart, type Weekday } from "@shiftbook/rules";
import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { daysFrom, daysToPay } from "../receivables/aging";
import { invoiceBalances } from "../receivables/balances";
import { dateIn, settingOn } from "../settings";
import { lineBurden } from "./burden";
import { expectedOn, floatingRows, payDateOf, projection, type FloatingRow } from "./floating";
import { overtimeRows } from "./leakage";
import { groupLines, totalsOf, weeksBetween, type GroupBy, type MarginDetail, type MarginLine, type SortBy } from "./margin";
import { OT_PREMIUM_KEY, PAY_DAY_KEY } from "./service";

const DONE: ("exported" | "closed")[] = ["exported", "closed"];
/** Hours paid: the time worked (regular, overtime, double time). */
const TIME = new Set(["REG", "OT", "DT"]);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const inForce = <T extends { effectiveFrom: string; effectiveTo: string | null }>(rows: T[], date: string) => rows.find((r) => isEffective(date, r.effectiveFrom, r.effectiveTo));

async function weekStartsOn(tx: Tx, date: string): Promise<Weekday> {
  const v = await settingOn<number>(tx, "workweek_starts_on", date);
  return (typeof v === "number" ? v : 1) as Weekday;
}

export const PRESET_WEEKS = [4, 13, 52] as const;
export type Preset = (typeof PRESET_WEEKS)[number] | "custom";

/** The period asked for (I6): the last 13 weeks by default, up to this week; or chosen dates, each moved to its week's start. */
export async function marginPeriod(tx: Tx, today: string, ask: { weeks?: string; from?: string; to?: string }): Promise<{ from: string; to: string; preset: Preset }> {
  const startsOn = await weekStartsOn(tx, today);
  const thisWeek = workweekStart(today, startsOn);
  if (ask.from && ask.to && isIsoDate(ask.from) && isIsoDate(ask.to) && ask.from <= ask.to) {
    return { from: workweekStart(ask.from, startsOn), to: workweekStart(ask.to, startsOn), preset: "custom" };
  }
  const weeks = PRESET_WEEKS.find((w) => String(w) === ask.weeks) ?? 13;
  return { from: addDays(thisWeek, -7 * (weeks - 1)), to: thisWeek, preset: weeks };
}

/** The runs whose files were made, with their period. */
async function doneRuns(tx: Tx) {
  return tx.select({ id: s.payRuns.id, payPeriodId: s.payRuns.payPeriodId, endsOn: s.payPeriods.endsOn }).from(s.payRuns).innerJoin(s.payPeriods, eq(s.payPeriods.id, s.payRuns.payPeriodId)).where(inArray(s.payRuns.status, DONE));
}

/** Names and places behind the lines: assignments → job orders → clients, worksites, branches; recruiters; workers. */
async function directory(tx: Tx) {
  const [assignments, jobOrders, worksites, clients, workers, users, branches] = await Promise.all([
    tx.select({ id: s.assignments.id, jobOrderId: s.assignments.jobOrderId, recruiterUserId: s.assignments.recruiterUserId }).from(s.assignments),
    tx.select({ id: s.jobOrders.id, clientId: s.jobOrders.clientId, worksiteId: s.jobOrders.worksiteId, branchId: s.jobOrders.branchId }).from(s.jobOrders),
    tx.select({ id: s.worksites.id, state: s.worksites.state }).from(s.worksites),
    tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients),
    tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName, wcState: s.workers.wcState }).from(s.workers),
    tx.select({ id: s.users.id, name: s.users.name }).from(s.users),
    tx.select({ id: s.branches.id, name: s.branches.name }).from(s.branches),
  ]);
  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const a = byId(assignments);
  const j = byId(jobOrders);
  const w = byId(worksites);
  const c = byId(clients);
  const p = byId(workers);
  const u = byId(users);
  const b = byId(branches);
  return {
    placement(assignmentId: string | null) {
      const as = assignmentId ? a.get(assignmentId) : undefined;
      const job = as ? j.get(as.jobOrderId) : undefined;
      return {
        jobOrderId: job?.id ?? null,
        clientId: job?.clientId ?? null,
        clientName: job ? (c.get(job.clientId)?.name ?? null) : null,
        state: job ? (w.get(job.worksiteId)?.state ?? null) : null,
        recruiterId: as?.recruiterUserId ?? null,
        recruiterName: as?.recruiterUserId ? (u.get(as.recruiterUserId)?.name ?? null) : null,
        branchId: job?.branchId ?? null,
        branchName: job?.branchId ? (b.get(job.branchId)?.name ?? null) : null,
      };
    },
    worker: (id: string) => {
      const x = p.get(id);
      return { name: x ? `${x.firstName} ${x.lastName}` : "", wcState: x?.wcState ?? null };
    },
    clientName: (id: string) => c.get(id)?.name ?? "",
  };
}

export interface MarginView {
  from: string;
  to: string;
  totals: ReturnType<typeof totalsOf>;
  weeks: { week: string; totals: ReturnType<typeof totalsOf> }[];
  groups: ReturnType<typeof groupLines>;
  lines: MarginLine[];
  overtimePremiumNotBilledCents: number;
}

/** Every assignment's week in the period with its billed, pay and burden (I1–I5). */
export async function marginLines(tx: Tx, from: string, to: string): Promise<MarginLine[]> {
  const runs = await doneRuns(tx);
  if (runs.length === 0) return [];
  const runIds = runs.map((r) => r.id);
  const [pays, bills] = await Promise.all([
    tx.select().from(s.payLines).where(and(inArray(s.payLines.payRunId, runIds), gte(s.payLines.workweekStart, from), lte(s.payLines.workweekStart, to))),
    tx.select().from(s.billLines).where(and(inArray(s.billLines.payRunId, runIds), gte(s.billLines.workweekStart, from), lte(s.billLines.workweekStart, to))),
  ]);
  if (pays.length === 0 && bills.length === 0) return [];
  const dir = await directory(tx);
  const [cards, taxes, wcs] = await Promise.all([tx.select().from(s.rateCards), tx.select().from(s.burdenTaxRates), tx.select().from(s.wcRates)]);
  const exclude = new Map<string, boolean>();
  for (const week of new Set(pays.map((p) => p.workweekStart))) exclude.set(week, (await settingOn<boolean>(tx, OT_PREMIUM_KEY, week)) !== false);

  const lines = new Map<string, MarginLine>();
  const lineFor = (assignmentId: string | null, workerId: string, week: string, clientId: string | null) => {
    const key = `${assignmentId ?? `none:${workerId}`}|${week}`;
    let l = lines.get(key);
    if (!l) {
      const p = dir.placement(assignmentId);
      const cid = p.clientId ?? clientId;
      l = {
        key,
        assignmentId,
        workerId,
        workerName: dir.worker(workerId).name,
        clientId: cid,
        clientName: p.clientName ?? (cid ? dir.clientName(cid) : null),
        week,
        recruiterId: p.recruiterId,
        recruiterName: p.recruiterName,
        branchId: p.branchId,
        branchName: p.branchName,
        minutesPaid: 0,
        billedCents: 0,
        payCents: 0,
        burdenCents: 0,
        incomplete: false,
        details: [],
      };
      lines.set(key, l);
    }
    return l;
  };

  for (const p of pays) {
    const l = lineFor(p.assignmentId, p.workerId, p.workweekStart, null);
    const placement = dir.placement(p.assignmentId);
    const card = p.assignmentId
      ? (inForce(cards.filter((c) => c.assignmentId === p.assignmentId), p.workweekStart) ?? inForce(cards.filter((c) => c.jobOrderId === placement.jobOrderId && c.assignmentId === null), p.workweekStart))
      : undefined;
    const state = placement.state;
    const tax = (state ? inForce(taxes.filter((t) => t.state === state), p.workweekStart) : undefined) ?? inForce(taxes.filter((t) => t.state === null), p.workweekStart);
    const wcState = dir.worker(p.workerId).wcState ?? state;
    const wcClass = card?.wcClassCode ?? null;
    const wc = wcState && wcClass ? inForce(wcs.filter((r) => r.state === wcState && r.classCode === wcClass), p.workweekStart) : undefined;
    const b = lineBurden({ type: p.type, amountCents: p.amountCents }, { taxPpm: tax?.ratePpm ?? null, taxState: tax ? tax.state : state, wcPpm: wc?.ratePpm ?? null, wcState, wcClass, excludeOtPremium: exclude.get(p.workweekStart) ?? true });
    l.payCents += p.amountCents;
    l.burdenCents += b.cents;
    if (TIME.has(p.type)) l.minutesPaid += p.minutes;
    if (b.incomplete) l.incomplete = true;
    l.details.push({ kind: "pay", type: p.type, minutes: p.minutes, amountCents: p.amountCents, burdenCents: b.cents, explain: p.explain, burdenExplain: b.explain });
  }
  for (const b of bills) {
    const l = lineFor(b.assignmentId, b.workerId, b.workweekStart, b.clientId);
    l.billedCents += b.amountCents;
    l.details.push({ kind: "bill", type: b.type, minutes: b.minutes, amountCents: b.amountCents, burdenCents: 0, explain: b.explain, burdenExplain: null } satisfies MarginDetail);
  }
  return [...lines.values()];
}

export async function marginView(tx: Tx, q: { from: string; to: string; groupBy: GroupBy; sort: SortBy }): Promise<MarginView> {
  const lines = await marginLines(tx, q.from, q.to);
  const overtime = await overtimeView(tx, q);
  return {
    from: q.from,
    to: q.to,
    totals: totalsOf(lines),
    weeks: weeksBetween(q.from, q.to).map((week) => ({ week, totals: totalsOf(lines.filter((l) => l.week === week)) })),
    groups: groupLines(lines, q.groupBy, q.sort),
    lines,
    overtimePremiumNotBilledCents: overtime.totals.premiumNotBilledCents,
  };
}

/** Overtime paid but not billed at the multiplier, with names (I7). */
export async function overtimeView(tx: Tx, q: { from: string; to: string }) {
  const runs = await doneRuns(tx);
  const empty = { rows: [], totals: { paidMinutes: 0, leakedMinutes: 0, premiumNotBilledCents: 0 } };
  if (runs.length === 0) return empty;
  const runIds = runs.map((r) => r.id);
  const ot = ["OT", "DT"] as ("OT" | "DT")[];
  const [pays, bills] = await Promise.all([
    tx.select().from(s.payLines).where(and(inArray(s.payLines.payRunId, runIds), inArray(s.payLines.type, ot), gte(s.payLines.workweekStart, q.from), lte(s.payLines.workweekStart, q.to))),
    tx.select().from(s.billLines).where(and(inArray(s.billLines.payRunId, runIds), inArray(s.billLines.type, ot), gte(s.billLines.workweekStart, q.from), lte(s.billLines.workweekStart, q.to))),
  ]);
  if (bills.length === 0) return empty;
  const dir = await directory(tx);
  const rows = overtimeRows(
    pays.map((p) => ({ workerId: p.workerId, week: p.workweekStart, type: p.type as "OT" | "DT", minutes: p.minutes, amountCents: p.amountCents })),
    bills.map((b) => ({ workerId: b.workerId, week: b.workweekStart, clientId: b.clientId, type: b.type as "OT" | "DT", minutes: b.minutes, ruleId: b.ruleId })),
  ).map((r) => ({ ...r, clientName: dir.clientName(r.clientId), workerName: dir.worker(r.workerId).name }));
  return {
    rows,
    totals: {
      paidMinutes: rows.reduce((t, r) => t + r.paidMinutes, 0),
      leakedMinutes: rows.reduce((t, r) => t + r.straightMinutes + r.notBilledMinutes, 0),
      premiumNotBilledCents: rows.reduce((t, r) => t + r.premiumNotBilledCents, 0),
    },
  };
}
export type OvertimeView = Awaited<ReturnType<typeof overtimeView>>;

/** Days to pay counts invoices paid off in the year before the date (as slice h's H7). */
const DAYS_TO_PAY_WINDOW = 365;

/** Cash floating as of a date, by client and week, and what the next payroll adds (I8, I9). */
export async function cashView(tx: Tx, asOf: string) {
  const setting = await settingOn<number>(tx, PAY_DAY_KEY, asOf);
  const payDayAfter = typeof setting === "number" ? setting : null;
  const after = payDayAfter ?? 0;
  const runs = await doneRuns(tx);
  const dir = await directory(tx);
  const runIds = runs.map((r) => r.id);
  const pays = runIds.length > 0 ? await tx.select({ payRunId: s.payLines.payRunId, assignmentId: s.payLines.assignmentId, amountCents: s.payLines.amountCents }).from(s.payLines).where(inArray(s.payLines.payRunId, runIds)) : [];
  const paidMap = new Map<string, { runId: string; periodEndsOn: string; clientId: string; paidCents: number }>();
  for (const p of pays) {
    const clientId = dir.placement(p.assignmentId).clientId ?? "none";
    const run = runs.find((r) => r.id === p.payRunId)!;
    const k = `${run.id}|${clientId}`;
    const cur = paidMap.get(k) ?? { runId: run.id, periodEndsOn: run.endsOn, clientId, paidCents: 0 };
    cur.paidCents += p.amountCents;
    paidMap.set(k, cur);
  }
  // Payments applied to each run's invoices, received by the date and not voided by then.
  const zone = await settingOn<unknown>(tx, "time_zone", asOf);
  const matches =
    runIds.length > 0
      ? await tx
          .select({ runId: s.invoices.payRunId, clientId: s.invoices.clientId, amountCents: s.paymentMatches.amountCents, receivedOn: s.payments.receivedOn, voidedAt: s.payments.voidedAt })
          .from(s.paymentMatches)
          .innerJoin(s.payments, eq(s.payments.id, s.paymentMatches.paymentId))
          .innerJoin(s.invoices, eq(s.invoices.id, s.paymentMatches.invoiceId))
          .where(and(inArray(s.invoices.payRunId, runIds), lte(s.payments.receivedOn, asOf)))
      : [];
  const collected = matches.filter((m) => m.voidedAt === null || dateIn(zone, m.voidedAt) > asOf).map((m) => ({ runId: m.runId, clientId: m.clientId, collectedCents: m.amountCents }));
  const rows: FloatingRow[] = floatingRows([...paidMap.values()], collected, asOf, after);

  // Days to pay per client (slice h).
  const balances = await invoiceBalances(tx);
  const daysOf = (clientId: string) =>
    daysToPay(
      balances
        .filter((b) => b.invoice.clientId === clientId && b.paidOffOn !== null && b.paidOffOn <= asOf && daysFrom(b.paidOffOn, asOf) < DAYS_TO_PAY_WINDOW)
        .map((b) => ({ issuedOn: b.invoice.issuedOn, dueOn: b.invoice.dueOn, paidOn: b.paidOffOn! })),
    );
  const clientIds = [...new Set(rows.map((r) => r.clientId))];
  const clients = clientIds
    .map((clientId) => {
      const mine = rows.filter((r) => r.clientId === clientId);
      return {
        clientId,
        clientName: clientId === "none" ? null : dir.clientName(clientId),
        paidCents: mine.reduce((t, r) => t + r.paidCents, 0),
        collectedCents: mine.reduce((t, r) => t + r.collectedCents, 0),
        floatingCents: mine.reduce((t, r) => t + r.floatingCents, 0),
        daysToPay: clientId === "none" ? null : daysOf(clientId),
        weeks: mine.map((r) => ({ runId: r.runId, periodEndsOn: r.periodEndsOn, payDate: r.payDate, paidCents: r.paidCents, collectedCents: r.collectedCents, floatingCents: r.floatingCents })),
      };
    })
    .sort((a, b) => b.floatingCents - a.floatingCents || cmp(a.clientName ?? "", b.clientName ?? ""));
  const floatingCents = rows.reduce((t, r) => t + r.floatingCents, 0);

  // The next pay date: the earliest after the date, from the periods there are and this week's.
  const periods = await tx.select({ id: s.payPeriods.id, endsOn: s.payPeriods.endsOn }).from(s.payPeriods);
  const startsOn = await weekStartsOn(tx, asOf);
  let weekEnd = addDays(workweekStart(asOf, startsOn), 6);
  while (payDateOf(weekEnd, after) <= asOf) weekEnd = addDays(weekEnd, 7);
  const candidates = [payDateOf(weekEnd, after), ...periods.map((p) => payDateOf(p.endsOn, after)).filter((d) => d > asOf)].sort(cmp);
  const payDate = candidates[0]!;
  const endsOn = addDays(payDate, -after);
  const forDate = runs.filter((r) => r.endsOn === endsOn).map((r) => r.id);
  const grossOf = (ids: string[]) => pays.filter((p) => ids.includes(p.payRunId)).reduce((t, p) => t + p.amountCents, 0);
  let payroll: { cents: number; estimate: boolean };
  if (forDate.length > 0) payroll = { cents: grossOf(forDate), estimate: false };
  else {
    // The average of the last four paid weeks (their pay date has passed), rounded half up once.
    const paidEnds = [...new Set(runs.filter((r) => payDateOf(r.endsOn, after) <= asOf).map((r) => r.endsOn))].sort(cmp).slice(-4);
    const total = paidEnds.reduce((t, e) => t + grossOf(runs.filter((r) => r.endsOn === e).map((r) => r.id)), 0);
    payroll = { cents: paidEnds.length > 0 ? roundHalfUp(total, paidEnds.length) : 0, estimate: true };
  }
  const expected = balances
    .filter((b) => b.balanceCents > 0)
    .map((b) => ({ number: b.invoice.number, clientName: b.clientName, balanceCents: b.balanceCents, expectedOn: expectedOn({ issuedOn: b.invoice.issuedOn, dueOn: b.invoice.dueOn, averageDays: daysOf(b.invoice.clientId).averageDays }) }))
    .sort((a, b) => cmp(a.expectedOn, b.expectedOn) || cmp(a.number, b.number));
  const next = { payDate, payroll, expected, ...projection({ floatingNowCents: floatingCents, payDate, payroll, expected }) };
  return { asOf, payDayAfter, floatingCents, clients, next };
}
export type CashView = Awaited<ReturnType<typeof cashView>>;

/** The rates and settings, newest first within each key, with what applies today and what is next. */
export async function marginSettings(tx: Tx, today: string) {
  const [taxes, wcs, settingRows] = await Promise.all([
    tx.select().from(s.burdenTaxRates),
    tx.select().from(s.wcRates),
    tx.select().from(s.agencySettings).where(inArray(s.agencySettings.key, [OT_PREMIUM_KEY, PAY_DAY_KEY])),
  ]);
  const byDate = <T extends { effectiveFrom: string }>(a: T, b: T) => cmp(b.effectiveFrom, a.effectiveFrom);
  const dated = <V>(key: string) => {
    const rows = settingRows.filter((r) => r.key === key).sort(byDate);
    const now = inForce(rows, today);
    const next = rows.filter((r) => r.effectiveFrom > today).sort((a, b) => cmp(a.effectiveFrom, b.effectiveFrom))[0];
    return { now: now ? { value: now.value as V, from: now.effectiveFrom } : null, next: next ? { value: next.value as V, from: next.effectiveFrom } : null };
  };
  const ot = dated<boolean>(OT_PREMIUM_KEY);
  const pay = dated<number>(PAY_DAY_KEY);
  const changed = async (types: string[]) => {
    const [e] = await tx.select({ at: s.auditEvents.occurredAt, by: s.auditEvents.actorLabel }).from(s.auditEvents).where(inArray(s.auditEvents.entityType, types)).orderBy(desc(s.auditEvents.occurredAt)).limit(1);
    return e ?? null;
  };
  return {
    taxRates: taxes.sort((a, b) => cmp(a.state ?? "~", b.state ?? "~") || byDate(a, b)).map((r) => ({ id: r.id, state: r.state, ratePpm: r.ratePpm, includes: r.includes, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, inForce: isEffective(today, r.effectiveFrom, r.effectiveTo) })),
    wcRates: wcs.sort((a, b) => cmp(a.state, b.state) || cmp(a.classCode, b.classCode) || byDate(a, b)).map((r) => ({ id: r.id, state: r.state, classCode: r.classCode, description: r.description, ratePpm: r.ratePpm, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, inForce: isEffective(today, r.effectiveFrom, r.effectiveTo) })),
    otPremium: { exclude: ot.now ? ot.now.value !== false : true, from: ot.now?.from ?? null, next: ot.next ? { exclude: ot.next.value !== false, from: ot.next.from } : null },
    payDay: { days: pay.now ? pay.now.value : null, from: pay.now?.from ?? null, next: pay.next ? { days: pay.next.value, from: pay.next.from } : null },
    changed: { taxes: await changed(["burden_tax_rate"]), wc: await changed(["wc_rate"]), settings: await changed(["agency_setting"]) },
    /** Class codes on the agency's rate cards with no workers' comp rate today, by state (a gap to fill). */
    missing: await missingWc(tx, today, wcs),
  };
}
export type MarginSettings = Awaited<ReturnType<typeof marginSettings>>;

/** Rate-card class codes in use today (state of the worksite) with no workers' comp rate in force. */
async function missingWc(tx: Tx, today: string, wcs: (typeof s.wcRates.$inferSelect)[]) {
  const rows = await tx
    .select({ classCode: s.rateCards.wcClassCode, state: s.worksites.state, from: s.rateCards.effectiveFrom, to: s.rateCards.effectiveTo })
    .from(s.rateCards)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.rateCards.jobOrderId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId))
    .where(isNull(s.rateCards.assignmentId));
  const out = new Set<string>();
  for (const r of rows) if (r.classCode && isEffective(today, r.from, r.to) && !inForce(wcs.filter((w) => w.state === r.state && w.classCode === r.classCode), today)) out.add(`${r.state} ${r.classCode}`);
  return [...out].sort(cmp);
}
