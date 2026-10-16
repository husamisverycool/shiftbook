/**
 * What the margin screens show (slice i; docs/patterns/margin.md, margin/overtime.md, margin/cash.md,
 * settings/margin.md). Lines come from each period's latest run whose files were made (decision I1:
 * a correction computes the whole period again); burden is computed from the rates in force on each
 * week's first day when the page is drawn (I2, I3), so a rate corrected back in time changes the
 * weeks it covers.
 */
import { addDays, isEffective, isIsoDate, roundHalfUp, workweekStart, type Weekday } from "@shiftbook/rules";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { daysFrom, daysToPay } from "../receivables/aging";
import { invoiceBalances } from "../receivables/balances";
import { dateIn, settingOn } from "../settings";
import { lineBurden } from "./burden";
import { expectedOn, floatingRows, payDateOf, projection, type ExpectedInvoice, type PeriodClientCollected, type PeriodClientPaid } from "./floating";
import { overtimeRows } from "./leakage";
import { groupLines, totalsOf, weeksBetween, type GroupBy, type MarginDetail, type MarginLine, type SortBy } from "./margin";
import { cardFor, doneRuns, firstDays, inForce, multipliers } from "../payroll/paid-lines";
import { OT_PREMIUM_KEY, PAY_DAY_KEY } from "./service";

/** Hours paid: the time worked (regular, overtime, double time). */
const TIME = new Set(["REG", "OT", "DT"]);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** The longest chosen period, in weeks (two years). */
export const MAX_WEEKS = 104;
/** Days to pay counts invoices paid off in the year before the date (as slice h's H7). */
export const DAYS_TO_PAY_WINDOW = 365;

async function weekStartsOn(tx: Tx, date: string): Promise<Weekday> {
  const v = await settingOn<number>(tx, "workweek_starts_on", date);
  return (typeof v === "number" ? v : 1) as Weekday;
}

export const PRESET_WEEKS = [4, 13, 52] as const;
export type Preset = (typeof PRESET_WEEKS)[number] | "custom";

/** The period asked for (I6): the last 13 weeks by default, up to this week; or chosen dates, each moved to its week's start, at most two years. */
export async function marginPeriod(tx: Tx, today: string, ask: { weeks?: string; from?: string; to?: string }): Promise<{ from: string; to: string; preset: Preset }> {
  const startsOn = await weekStartsOn(tx, today);
  const thisWeek = workweekStart(today, startsOn);
  if (ask.from && ask.to && isIsoDate(ask.from) && isIsoDate(ask.to) && ask.from <= ask.to) {
    const to = workweekStart(ask.to, startsOn);
    const earliest = addDays(to, -7 * (MAX_WEEKS - 1));
    const from = workweekStart(ask.from, startsOn);
    return { from: from < earliest ? earliest : from, to, preset: "custom" };
  }
  const weeks = PRESET_WEEKS.find((w) => String(w) === ask.weeks) ?? 13;
  return { from: addDays(thisWeek, -7 * (weeks - 1)), to: thisWeek, preset: weeks };
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
  const { latest } = await doneRuns(tx);
  if (latest.length === 0) return [];
  const runIds = latest.map((r) => r.id);
  const [pays, bills] = await Promise.all([
    tx.select().from(s.payLines).where(and(inArray(s.payLines.payRunId, runIds), gte(s.payLines.workweekStart, from), lte(s.payLines.workweekStart, to))),
    tx.select().from(s.billLines).where(and(inArray(s.billLines.payRunId, runIds), gte(s.billLines.workweekStart, from), lte(s.billLines.workweekStart, to))),
  ]);
  if (pays.length === 0 && bills.length === 0) return [];
  const dir = await directory(tx);
  const [cards, taxes, wcs, multiplierOf, firstDay] = await Promise.all([tx.select().from(s.rateCards), tx.select().from(s.burdenTaxRates), tx.select().from(s.wcRates), multipliers(tx), firstDays(tx, pays)]);
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
        incomplete: 0,
        details: [],
      };
      lines.set(key, l);
    }
    return l;
  };

  for (const p of pays) {
    const l = lineFor(p.assignmentId, p.workerId, p.workweekStart, null);
    const placement = dir.placement(p.assignmentId);
    const day = firstDay(p);
    const own = cards.filter((c) => c.assignmentId !== null && c.assignmentId === p.assignmentId);
    const jobs = cards.filter((c) => c.assignmentId === null && c.jobOrderId === placement.jobOrderId);
    const card = p.assignmentId ? (cardFor(own, day, p.workweekStart) ?? cardFor(jobs, day, p.workweekStart)) : undefined;
    const state = placement.state;
    const tax = (state ? inForce(taxes.filter((t) => t.state === state), p.workweekStart) : undefined) ?? inForce(taxes.filter((t) => t.state === null), p.workweekStart);
    const wcState = dir.worker(p.workerId).wcState ?? state;
    const wcClass = card?.wcClassCode ?? null;
    const wc = wcState && wcClass ? inForce(wcs.filter((r) => r.state === wcState && r.classCode === wcClass), p.workweekStart) : undefined;
    const multiplier = p.type === "OT" || p.type === "DT" ? multiplierOf(p.ruleId, state, p.workweekStart) : null;
    const b = lineBurden({ type: p.type, amountCents: p.amountCents, multiplier }, { taxPpm: tax?.ratePpm ?? null, taxState: tax ? tax.state : state, wcPpm: wc?.ratePpm ?? null, wcState, wcClass, excludeOtPremium: exclude.get(p.workweekStart) ?? true });
    l.payCents += p.amountCents;
    l.burdenCents += b.cents;
    if (TIME.has(p.type)) l.minutesPaid += p.minutes;
    if (b.incomplete) l.incomplete += 1;
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

/** One pay or bill line behind an overtime row, as the run wrote it. */
export interface OvertimeLine {
  kind: "pay" | "bill";
  type: "OT" | "DT";
  minutes: number;
  amountCents: number;
  explain: string;
}

/** Overtime paid but not billed at the multiplier, with names and the run's lines (I7). */
export async function overtimeView(tx: Tx, q: { from: string; to: string }) {
  const { latest } = await doneRuns(tx);
  const empty = { rows: [], totals: { paidMinutes: 0, leakedMinutes: 0, premiumNotBilledCents: 0 } };
  if (latest.length === 0) return empty;
  const runIds = latest.map((r) => r.id);
  const ot = ["OT", "DT"] as ("OT" | "DT")[];
  const [pays, bills] = await Promise.all([
    tx.select().from(s.payLines).where(and(inArray(s.payLines.payRunId, runIds), inArray(s.payLines.type, ot), gte(s.payLines.workweekStart, q.from), lte(s.payLines.workweekStart, q.to))),
    tx.select().from(s.billLines).where(and(inArray(s.billLines.payRunId, runIds), inArray(s.billLines.type, ot), gte(s.billLines.workweekStart, q.from), lte(s.billLines.workweekStart, q.to))),
  ]);
  if (bills.length === 0) return empty;
  const [dir, multiplierOf] = await Promise.all([directory(tx), multipliers(tx)]);
  const rows = overtimeRows(
    pays.map((p) => ({ workerId: p.workerId, week: p.workweekStart, type: p.type as "OT" | "DT", minutes: p.minutes, amountCents: p.amountCents, multiplier: multiplierOf(p.ruleId, dir.placement(p.assignmentId).state, p.workweekStart) })),
    bills.map((b) => ({ workerId: b.workerId, week: b.workweekStart, clientId: b.clientId, type: b.type as "OT" | "DT", minutes: b.minutes, ruleId: b.ruleId })),
  ).map((r) => ({
    ...r,
    clientName: dir.clientName(r.clientId),
    workerName: dir.worker(r.workerId).name,
    lines: [
      ...pays.filter((p) => p.workerId === r.workerId && p.workweekStart === r.week).map((p): OvertimeLine => ({ kind: "pay", type: p.type as "OT" | "DT", minutes: p.minutes, amountCents: p.amountCents, explain: p.explain })),
      ...bills.filter((b) => b.workerId === r.workerId && b.workweekStart === r.week && b.clientId === r.clientId).map((b): OvertimeLine => ({ kind: "bill", type: b.type as "OT" | "DT", minutes: b.minutes, amountCents: b.amountCents, explain: b.explain })),
    ],
  }));
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

/** Weeks searched for the next pay date: five back (the pay day is at most 28 days after) to five ahead. */
const PAY_DATE_BACK = 5;
const PAY_DATE_WEEKS = 11;

/** Cash floating as of a date, by client and week, and what the next payroll adds (I8, I9). */
export async function cashView(tx: Tx, asOf: string) {
  const payDayRows = await tx.select().from(s.agencySettings).where(eq(s.agencySettings.key, PAY_DAY_KEY));
  // The pay day in force on a period's last day (review finding 4); none set: the last day itself.
  const payDayOn = (endsOn: string) => {
    const v = inForce(payDayRows, endsOn)?.value;
    return typeof v === "number" ? v : 0;
  };
  const payDateFor = (endsOn: string) => payDateOf(endsOn, payDayOn(endsOn));
  const setting = inForce(payDayRows, asOf)?.value;
  const payDayAfter = typeof setting === "number" ? setting : null;

  const { all, latest } = await doneRuns(tx);
  const dir = await directory(tx);
  const runIds = latest.map((r) => r.id);
  const pays = runIds.length > 0 ? await tx.select({ payRunId: s.payLines.payRunId, assignmentId: s.payLines.assignmentId, amountCents: s.payLines.amountCents }).from(s.payLines).where(inArray(s.payLines.payRunId, runIds)) : [];
  const runOf = new Map(all.map((r) => [r.id, r]));
  const paidMap = new Map<string, PeriodClientPaid>();
  for (const p of pays) {
    const clientId = dir.placement(p.assignmentId).clientId ?? "none";
    const run = runOf.get(p.payRunId)!;
    const k = `${run.payPeriodId}|${clientId}`;
    const cur = paidMap.get(k) ?? { periodId: run.payPeriodId, periodEndsOn: run.endsOn, payDate: payDateFor(run.endsOn), clientId, paidCents: 0 };
    cur.paidCents += p.amountCents;
    paidMap.set(k, cur);
  }
  const paid = [...paidMap.values()];

  // Payments applied to the period's invoices (every version's), received by the date and not voided by then.
  const zone = await settingOn<unknown>(tx, "time_zone", asOf);
  const allIds = all.map((r) => r.id);
  const matches =
    allIds.length > 0
      ? await tx
          .select({ runId: s.invoices.payRunId, clientId: s.invoices.clientId, amountCents: s.paymentMatches.amountCents, voidedAt: s.payments.voidedAt })
          .from(s.paymentMatches)
          .innerJoin(s.payments, eq(s.payments.id, s.paymentMatches.paymentId))
          .innerJoin(s.invoices, eq(s.invoices.id, s.paymentMatches.invoiceId))
          .where(and(inArray(s.invoices.payRunId, allIds), lte(s.payments.receivedOn, asOf)))
      : [];
  const collected: PeriodClientCollected[] = matches
    .filter((m) => m.voidedAt === null || dateIn(zone, m.voidedAt) > asOf)
    .map((m) => ({ periodId: runOf.get(m.runId)!.payPeriodId, clientId: m.clientId, collectedCents: m.amountCents }));
  // Only what is floating is listed (review finding 5).
  const rows = floatingRows(paid, collected, asOf).filter((r) => r.floatingCents > 0);

  // Days to pay per client (slice h).
  const balances = await invoiceBalances(tx, { asOf });
  const daysOf = (clientId: string) =>
    daysToPay(
      balances
        .filter((b) => b.invoice.clientId === clientId && b.paidOffOn !== null && b.paidOffOn <= asOf && daysFrom(b.paidOffOn, asOf) < DAYS_TO_PAY_WINDOW)
        .map((b) => ({ issuedOn: b.invoice.issuedOn, dueOn: b.invoice.dueOn, paidOn: b.paidOffOn! })),
    );
  const clients = [...new Set(rows.map((r) => r.clientId ?? "none"))]
    .map((clientId) => {
      const mine = rows.filter((r) => (r.clientId ?? "none") === clientId);
      return {
        clientId,
        clientName: clientId === "none" ? null : dir.clientName(clientId),
        paidCents: mine.reduce((t, r) => t + r.paidCents, 0),
        collectedCents: mine.reduce((t, r) => t + r.collectedCents, 0),
        floatingCents: mine.reduce((t, r) => t + r.floatingCents, 0),
        daysToPay: clientId === "none" ? null : daysOf(clientId),
        weeks: mine.map((r) => ({ periodId: r.periodId, periodEndsOn: r.periodEndsOn, payDate: r.payDate, paidCents: r.paidCents, collectedCents: r.collectedCents, floatingCents: r.floatingCents })),
      };
    })
    .sort((a, b) => b.floatingCents - a.floatingCents || cmp(a.clientName ?? "", b.clientName ?? ""));
  const floatingCents = rows.reduce((t, r) => t + r.floatingCents, 0);

  // The next pay date: the earliest after the date, of the weeks around it (each by the pay day in
  // force at its end) and of the periods there are.
  const startsOn = await weekStartsOn(tx, asOf);
  const periods = await tx.select({ endsOn: s.payPeriods.endsOn }).from(s.payPeriods);
  const firstEnd = addDays(workweekStart(addDays(asOf, -7 * PAY_DATE_BACK), startsOn), 6);
  const ends = [...Array.from({ length: PAY_DATE_WEEKS }, (_, i) => addDays(firstEnd, 7 * i)), ...periods.map((p) => p.endsOn)];
  const payDate = ends
    .map(payDateFor)
    .filter((d) => d > asOf)
    .sort(cmp)[0]!;
  const runFor = paid.some((p) => p.payDate === payDate);
  const nextRows: PeriodClientPaid[] = [];
  if (!runFor) {
    // No run for it yet: the average of the last four periods paid, rounded half up once.
    const paidPeriods = [...new Map(paid.filter((p) => p.payDate <= asOf).map((p) => [p.periodId, p.periodEndsOn])).entries()].sort((a, b) => cmp(a[1], b[1])).slice(-4);
    const total = paid.filter((p) => paidPeriods.some(([id]) => id === p.periodId)).reduce((t, p) => t + p.paidCents, 0);
    const endsOn = ends.filter((e) => payDateFor(e) === payDate).sort(cmp)[0]!;
    nextRows.push({ periodId: `next:${endsOn}`, periodEndsOn: endsOn, payDate, clientId: null, paidCents: paidPeriods.length > 0 ? roundHalfUp(total, paidPeriods.length) : 0 });
  }
  const expected = balances
    .filter((b) => b.balanceCents > 0)
    .flatMap((b): (ExpectedInvoice & { clientName: string })[] => {
      const run = runOf.get(b.invoice.payRunId);
      if (!run) return [];
      return [{ periodId: run.payPeriodId, clientId: b.invoice.clientId, number: b.invoice.number, clientName: b.clientName, balanceCents: b.balanceCents, expectedOn: expectedOn({ issuedOn: b.invoice.issuedOn, dueOn: b.invoice.dueOn, averageDays: daysOf(b.invoice.clientId).averageDays }) }];
    })
    .sort((a, b) => cmp(a.expectedOn, b.expectedOn) || cmp(a.number, b.number));
  const p = projection({ asOf, paid, collected, next: { payDate, rows: nextRows, estimate: !runFor }, expected });
  const counted = expected.filter((e) => p.counted.includes(e.number));
  const next = {
    payDate,
    payroll: { cents: p.payrollCents, estimate: !runFor },
    /** The open invoices expected in by the pay date. */
    expected: counted,
    expectedCents: counted.reduce((t, e) => t + e.balanceCents, 0),
    /** What they pay back of the payroll they were billed for (never another week's). */
    backCents: p.backCents,
    afterCents: p.afterCents,
    /** Open invoices already past their expected date: not counted on. */
    overdueCents: p.overdueCents,
  };
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
  // Who changed a section last: the newest rate row (a reset re-creates them), or the newest
  // settings change made since the settings rows were written.
  const newest = (rows: { createdAt: Date; createdByLabel: string }[]) => {
    const r = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return r ? { at: r.createdAt, by: r.createdByLabel } : null;
  };
  const since = settingRows.reduce<Date | null>((min, r) => (min === null || r.createdAt < min ? r.createdAt : min), null);
  const settingsChanged = async () => {
    if (since === null) return null;
    const events = await tx.select({ at: s.auditEvents.occurredAt, by: s.auditEvents.actorLabel, after: s.auditEvents.after }).from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "agency_setting"), gte(s.auditEvents.occurredAt, since))).orderBy(desc(s.auditEvents.occurredAt));
    const e = events.find((x) => [OT_PREMIUM_KEY, PAY_DAY_KEY].includes((x.after as { key?: string } | null)?.key ?? ""));
    return e ? { at: e.at, by: e.by } : null;
  };
  return {
    taxRates: taxes.sort((a, b) => cmp(a.state ?? "~", b.state ?? "~") || byDate(a, b)).map((r) => ({ id: r.id, state: r.state, ratePpm: r.ratePpm, includes: r.includes, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, inForce: isEffective(today, r.effectiveFrom, r.effectiveTo) })),
    wcRates: wcs.sort((a, b) => cmp(a.state, b.state) || cmp(a.classCode, b.classCode) || byDate(a, b)).map((r) => ({ id: r.id, state: r.state, classCode: r.classCode, description: r.description, ratePpm: r.ratePpm, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, inForce: isEffective(today, r.effectiveFrom, r.effectiveTo) })),
    otPremium: { exclude: ot.now ? ot.now.value !== false : true, from: ot.now?.from ?? null, next: ot.next ? { exclude: ot.next.value !== false, from: ot.next.from } : null },
    payDay: { days: pay.now ? pay.now.value : null, from: pay.now?.from ?? null, next: pay.next ? { days: pay.next.value, from: pay.next.from } : null },
    changed: { taxes: newest(taxes), wc: newest(wcs), settings: await settingsChanged() },
    /** Class codes on the agency's rate cards with no workers' comp rate today, by state (a gap to fill). */
    missing: await missingWc(tx, today, wcs),
  };
}
export type MarginSettings = Awaited<ReturnType<typeof marginSettings>>;

/**
 * Rate-card class codes in use today with no workers' comp rate in force, by the state the burden
 * looks them up in: each placement's worker's workers' comp state, else the worksite's (review
 * finding 15). A job order's card and a placement's own card both count.
 */
async function missingWc(tx: Tx, today: string, wcs: (typeof s.wcRates.$inferSelect)[]) {
  const [cards, assignments, jobOrders, worksites, workers] = await Promise.all([
    tx.select({ jobOrderId: s.rateCards.jobOrderId, assignmentId: s.rateCards.assignmentId, classCode: s.rateCards.wcClassCode, from: s.rateCards.effectiveFrom, to: s.rateCards.effectiveTo }).from(s.rateCards),
    tx.select({ id: s.assignments.id, jobOrderId: s.assignments.jobOrderId, workerId: s.assignments.workerId, endDate: s.assignments.endDate, status: s.assignments.status }).from(s.assignments),
    tx.select({ id: s.jobOrders.id, worksiteId: s.jobOrders.worksiteId }).from(s.jobOrders),
    tx.select({ id: s.worksites.id, state: s.worksites.state }).from(s.worksites),
    tx.select({ id: s.workers.id, wcState: s.workers.wcState }).from(s.workers),
  ]);
  const siteOf = (jobOrderId: string) => worksites.find((w) => w.id === jobOrders.find((j) => j.id === jobOrderId)?.worksiteId)?.state ?? null;
  const wcStateOf = (workerId: string) => workers.find((w) => w.id === workerId)?.wcState ?? null;
  const live = assignments.filter((a) => a.status === "active" && (a.endDate === null || a.endDate >= today));
  const current = cards.filter((c): c is typeof c & { classCode: string } => c.classCode !== null && isEffective(today, c.from, c.to));
  const out = new Set<string>();
  const check = (state: string | null, classCode: string) => {
    if (state && !inForce(wcs.filter((w) => w.state === state && w.classCode === classCode), today)) out.add(`${state} ${classCode}`);
  };
  for (const c of current) {
    const site = siteOf(c.jobOrderId);
    if (c.assignmentId === null) {
      check(site, c.classCode);
      // Placements under the job order without a card of their own today.
      for (const a of live.filter((x) => x.jobOrderId === c.jobOrderId && !current.some((o) => o.assignmentId === x.id))) check(wcStateOf(a.workerId) ?? site, c.classCode);
    } else {
      const a = live.find((x) => x.id === c.assignmentId);
      if (a) check(wcStateOf(a.workerId) ?? site, c.classCode);
    }
  }
  return [...out].sort(cmp);
}
