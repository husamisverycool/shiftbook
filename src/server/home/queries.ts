/**
 * Home (docs/patterns/home.md): the setup guide's steps, each done by what has happened; the key
 * figures; and what needs attention now. Reads only — every figure is the one its own page shows.
 */
import { and, count, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { addDays } from "@shiftbook/rules";
import { listApprovals } from "../approvals/service";
import { urgentCount } from "../compliance/queries";
import { listPeriods } from "../convert/queries";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { marginPeriod, marginView } from "../margin/queries";
import { payrollTarget } from "../payroll/settings";
import { receivablesView } from "../receivables/queries";

export const SETUP_STEPS = ["agency", "clients", "branches", "payroll", "placements", "convert", "approval", "files", "bank", "ssn"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

const exists = async (q: Promise<{ n: number }[]>) => ((await q)[0]?.n ?? 0) > 0;

/** Each step of the setup guide, done or not, from the agency's own records. */
export async function setupSteps(tx: Tx, periodsStarted: boolean): Promise<Record<SetupStep, boolean>> {
  // The business set up first (completeness audit G1): its details, time zone and pay week; a client
  // with a worksite; a branch.
  const [agency] = await tx.select({ addressLines: s.agencies.addressLines }).from(s.agencies);
  const [settingRows, clientsWithSites, branches] = await Promise.all([
    tx.select({ key: s.agencySettings.key }).from(s.agencySettings).where(inArray(s.agencySettings.key, ["time_zone", "workweek_starts_on"])),
    exists(tx.select({ n: count() }).from(s.worksites).innerJoin(s.clients, eq(s.clients.id, s.worksites.clientId))),
    exists(tx.select({ n: count() }).from(s.branches)),
  ]);
  const agencySet = (agency?.addressLines.length ?? 0) > 0 && ["time_zone", "workweek_starts_on"].every((k) => settingRows.some((r) => r.key === k));
  const [payroll, placements, approval, files, bank, ssn] = await Promise.all([
    payrollTarget(tx).then((t) => t !== null),
    exists(tx.select({ n: count() }).from(s.assignments).where(eq(s.assignments.status, "active"))),
    exists(tx.select({ n: count() }).from(s.approvalRequests)),
    exists(tx.select({ n: count() }).from(s.payRuns).where(inArray(s.payRuns.status, ["exported", "closed"]))),
    exists(tx.select({ n: count() }).from(s.bankImports)),
    // The Owner's look at one SSN (decision 0027): a reveal of a worker's SSN field since the agency
    // last started over (the log is append-only, so a demo reset leaves earlier reveals in it).
    exists(
      tx
        .select({ n: count() })
        .from(s.auditEvents)
        .where(
          and(
            eq(s.auditEvents.action, "reveal"),
            eq(s.auditEvents.entityType, "worker"),
            sql`${s.auditEvents.after}->>'field' = 'ssn'`,
            sql`${s.auditEvents.occurredAt} > coalesce((select max(r.occurred_at) from audit_events r where r.action = 'reset' and r.entity_type = 'agency'), '-infinity'::timestamptz)`,
          ),
        ),
    ),
  ]);
  return { agency: agencySet, clients: clientsWithSites, branches, payroll, placements, convert: periodsStarted, approval, files, bank, ssn };
}

export type PeriodState = "none" | "draft" | "validating" | "blocked" | "ready" | "approved" | "exported" | "closed" | "correcting";

/** The hours on file for a pay period: rejected entries and those of archived timesheets are never paid, so never counted. */
async function periodEntries(tx: Tx, payPeriodId: string) {
  return tx
    .select({ date: s.timeEntries.workDate, minutes: s.timeEntries.minutes, workerId: s.timeEntries.workerId })
    .from(s.timeEntries)
    .leftJoin(s.sourceDocuments, eq(s.sourceDocuments.id, s.timeEntries.sourceDocumentId))
    .where(and(eq(s.timeEntries.payPeriodId, payPeriodId), ne(s.timeEntries.status, "rejected"), or(isNull(s.timeEntries.sourceDocumentId), ne(s.sourceDocuments.status, "archived"))));
}

/**
 * `weeks`: Your overview's date range, as Margin's presets ("4", "13" — the default — or "52"),
 * read from the address.
 */
export async function homeView(tx: Tx, agencyId: string, today: string, may: { viewMargin: boolean; weeks?: string }) {
  const periods = await listPeriods(tx);
  // The period people work on: the newest with hours (Client approvals picks it the same way).
  const current = periods.find((p) => p.started) ?? periods[0] ?? null;
  const steps = await setupSteps(tx, periods.some((p) => p.started));

  let period: { id: string; startsOn: string; endsOn: string; state: PeriodState; problems: number } | null = null;
  if (current) {
    const state: PeriodState = current.correcting ? "correcting" : ((current.runStatus as PeriodState | null) ?? (current.started ? "draft" : "none"));
    let problems = 0;
    if (state === "blocked") {
      const [run] = await tx.select({ blockers: s.payRuns.blockers }).from(s.payRuns).where(eq(s.payRuns.payPeriodId, current.id)).orderBy(sql`${s.payRuns.version} desc`).limit(1);
      problems = Array.isArray(run?.blockers) ? run.blockers.length : 0;
    }
    period = { id: current.id, startsOn: current.startsOn, endsOn: current.endsOn, state, problems };
  }

  const approvals = current ? await listApprovals(tx, current.id) : [];
  const ar = await receivablesView(tx, today);
  const openInvoices = ar.clients.reduce((n, c) => n + Object.values(c.invoices).reduce((m, list) => m + list.length, 0), 0);
  const overdueInvoices = ar.clients.reduce((n, c) => n + Object.entries(c.invoices).reduce((m, [bucket, list]) => m + (bucket === "current" ? 0 : list.length), 0), 0);

  // Overdue and due soon as the sidebar's badge counts them (worked out again first, as there).
  const urgent = await urgentCount(tx, agencyId, today);
  const [overdue] = await tx.select({ n: count() }).from(s.obligations).where(and(eq(s.obligations.status, "open"), lt(s.obligations.dueOn, today)));
  const [bankToMatch] = await tx.select({ n: count() }).from(s.bankLines).where(eq(s.bankLines.status, "review"));
  const [placed] = await tx.select({ n: sql<number>`count(distinct ${s.assignments.workerId})::int` }).from(s.assignments).where(eq(s.assignments.status, "active"));

  // Today (Stripe Home): the pay period's hours by day and who worked them, from the entries on file;
  // and the period just before it to compare, as Stripe's Today compares with yesterday.
  let days: { date: string; minutes: number }[] = [];
  let workers = 0;
  let previous: { startsOn: string; endsOn: string; minutes: number } | null = null;
  if (current) {
    const entries = await periodEntries(tx, current.id);
    for (let d = current.startsOn; d <= current.endsOn; d = addDays(d, 1)) days.push({ date: d, minutes: entries.filter((e) => e.date === d).reduce((n, e) => n + (e.minutes ?? 0), 0) });
    workers = new Set(entries.filter((e) => e.workerId !== null && (e.minutes ?? 0) > 0).map((e) => e.workerId)).size;
    if (days.length > 31) days = [];
    // Any period before it, a week paid before Tabulado included: its hours were worked all the same.
    const [before] = await tx.select().from(s.payPeriods).where(lt(s.payPeriods.startsOn, current.startsOn)).orderBy(sql`${s.payPeriods.startsOn} desc`).limit(1);
    if (before) previous = { startsOn: before.startsOn, endsOn: before.endsOn, minutes: (await periodEntries(tx, before.id)).reduce((n, e) => n + (e.minutes ?? 0), 0) };
  }

  // Your overview (Stripe Home): the weeks of the date range week by week, and as many before them to compare.
  type Week = { week: string; billedCents: number; marginCents: number; minutesPaid: number };
  let overview: { from: string; to: string; preset: number; weeks: Week[]; previousWeeks: Week[]; previous: { billedCents: number; marginCents: number; minutesPaid: number } } | null = null;
  if (may.viewMargin) {
    const range = await marginPeriod(tx, today, { weeks: may.weeks ?? "13" });
    const count = range.preset === "custom" ? 13 : range.preset;
    const view = await marginView(tx, { from: range.from, to: range.to, groupBy: "client", sort: "margin" });
    const before = await marginView(tx, { from: addDays(range.from, -7 * count), to: addDays(range.from, -7), groupBy: "client", sort: "margin" });
    const weekly = (v: typeof view): Week[] => v.weeks.map((w) => ({ week: w.week, billedCents: w.totals.billedCents, marginCents: w.totals.marginCents, minutesPaid: w.totals.minutesPaid }));
    overview = {
      from: range.from,
      to: addDays(range.to, 6),
      preset: count,
      weeks: weekly(view),
      previousWeeks: weekly(before),
      previous: { billedCents: before.totals.billedCents, marginCents: before.totals.marginCents, minutesPaid: before.totals.minutesPaid },
    };
  }

  return {
    steps,
    period,
    approvals: {
      waiting: approvals.filter((a) => a.state === "waiting").length,
      disputed: approvals.filter((a) => a.state === "disputed").length,
      // Only where the client must approve before payroll: elsewhere asking is optional.
      toSend: approvals.filter((a) => a.approvalRequired && (a.state === "not_sent" || a.state === "send_again")).length,
    },
    receivables: { openCents: ar.totalCents, openInvoices, overdueCents: ar.overdueCents, overdueInvoices },
    compliance: { overdue: overdue?.n ?? 0, dueSoon: Math.max(0, urgent - (overdue?.n ?? 0)) },
    bankToMatch: bankToMatch?.n ?? 0,
    workersPlaced: placed?.n ?? 0,
    today: { days, workers, minutes: days.reduce((n, d) => n + d.minutes, 0), previous },
    overview,
  };
}
export type HomeView = Awaited<ReturnType<typeof homeView>>;
