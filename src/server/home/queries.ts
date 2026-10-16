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

export const SETUP_STEPS = ["payroll", "placements", "convert", "approval", "files", "bank", "ssn"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

const exists = async (q: Promise<{ n: number }[]>) => ((await q)[0]?.n ?? 0) > 0;

/** Each step of the setup guide, done or not, from the agency's own records. */
export async function setupSteps(tx: Tx, periodsStarted: boolean): Promise<Record<SetupStep, boolean>> {
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
  return { payroll, placements, convert: periodsStarted, approval, files, bank, ssn };
}

export type PeriodState = "none" | "draft" | "validating" | "blocked" | "ready" | "approved" | "exported" | "closed" | "correcting";

export async function homeView(tx: Tx, agencyId: string, today: string, may: { viewMargin: boolean }) {
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

  // Today (Stripe Home): the pay period's hours by day and who worked them, from the entries on file
  // (rejected ones and those of archived timesheets are never paid, so never counted).
  let days: { date: string; minutes: number }[] = [];
  let workers = 0;
  if (current) {
    const entries = await tx
      .select({ date: s.timeEntries.workDate, minutes: s.timeEntries.minutes, workerId: s.timeEntries.workerId })
      .from(s.timeEntries)
      .leftJoin(s.sourceDocuments, eq(s.sourceDocuments.id, s.timeEntries.sourceDocumentId))
      .where(and(eq(s.timeEntries.payPeriodId, current.id), ne(s.timeEntries.status, "rejected"), or(isNull(s.timeEntries.sourceDocumentId), ne(s.sourceDocuments.status, "archived"))));
    for (let d = current.startsOn; d <= current.endsOn; d = addDays(d, 1)) days.push({ date: d, minutes: entries.filter((e) => e.date === d).reduce((n, e) => n + (e.minutes ?? 0), 0) });
    workers = new Set(entries.filter((e) => e.workerId !== null && (e.minutes ?? 0) > 0).map((e) => e.workerId)).size;
    if (days.length > 31) days = [];
  }

  // Your overview (Stripe Home): the past 13 weeks week by week, and the 13 before them to compare.
  let overview: { from: string; to: string; weeks: { week: string; billedCents: number; marginCents: number; minutesPaid: number }[]; previous: { billedCents: number; marginCents: number; minutesPaid: number } } | null = null;
  if (may.viewMargin) {
    const range = await marginPeriod(tx, today, { weeks: "13" });
    const view = await marginView(tx, { from: range.from, to: range.to, groupBy: "client", sort: "margin" });
    const before = await marginView(tx, { from: addDays(range.from, -7 * 13), to: addDays(range.from, -7), groupBy: "client", sort: "margin" });
    overview = {
      from: range.from,
      to: addDays(range.to, 6),
      weeks: view.weeks.map((w) => ({ week: w.week, billedCents: w.totals.billedCents, marginCents: w.totals.marginCents, minutesPaid: w.totals.minutesPaid })),
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
    today: { days, workers, minutes: days.reduce((n, d) => n + d.minutes, 0) },
    overview,
  };
}
export type HomeView = Awaited<ReturnType<typeof homeView>>;
