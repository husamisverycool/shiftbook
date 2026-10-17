/**
 * The worker app's reads and changes (slice t; SPEC §27 items 5–6). Every function here runs in a
 * transaction fenced to one worker (./fence.ts), so it can only ever touch that worker's rows.
 *
 * - Onboarding (Gusto's self-onboarding steps): personal information with the SSN (sealed as the
 *   roster seals it), Form W-4, Form I-9 Section 1 (sealed), payment (bank details sealed, the last
 *   four in clear), the agency's policies, and the typed signature. All audited, never the numbers.
 * - Hours (from the review flow), pay stubs (from paid runs: gross earnings only — taxes and
 *   deductions are the payroll provider's), messages with the agency, and clock in and out (a time
 *   entry waiting for review, never approved here).
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { addDays, workweekStart, type Weekday } from "@shiftbook/rules";
import { auditBy } from "../audit";
import { appKey, digest, seal, unseal } from "../auth/crypto";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { periodState } from "../run/period-lock";
import { agencyZone, settingOn } from "../settings";
import { last4Of, sealSsn, ssnIndex } from "../workers/ssn";
import { outsideWorkerFence } from "./fence";
import { onboardingProgress, readDeposit, readI9, readPersonal, readSignature, readW4, STEPS, type Deposit, type I9Answers, type Progress, type Step } from "./forms";
import type { Lang, Translator } from "./translate";

export interface Who {
  agencyId: string;
  workerId: string;
  label: string;
}
const by = (w: Who) => ({ agencyId: w.agencyId, userId: null, label: w.label });

// ---------- onboarding ----------

/** The agency's policies a worker acknowledges (an agency setting; these when the agency has none). */
export const DEFAULT_POLICIES = ["safety", "harassment", "timekeeping"] as const;

export async function policiesOf(tx: Tx, today: string): Promise<string[]> {
  const v = await settingOn<unknown>(tx, "onboarding.policies", today);
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : [...DEFAULT_POLICIES];
}

export interface OnboardingView {
  progress: Progress;
  personal: s.OnboardingPersonal | null;
  ssnLast4: string | null;
  w4: s.OnboardingW4 | null;
  i9Status: s.I9Status | null;
  paymentKind: "direct_deposit" | "paper_check" | null;
  depositLast4: string | null;
  policies: { key: string; at: string | null }[];
  signedName: string | null;
  signedAt: Date | null;
}

export async function onboardingOf(tx: Tx, workerId: string, today: string): Promise<OnboardingView> {
  const [row] = await tx.select().from(s.workerOnboarding).where(eq(s.workerOnboarding.workerId, workerId));
  const [w] = await tx.select({ ssnLast4: s.workers.ssnLast4 }).from(s.workers).where(eq(s.workers.id, workerId));
  const acknowledged = new Map((row?.policies ?? []).map((p) => [p.key, p.at]));
  return {
    progress: onboardingProgress(row ?? null),
    personal: row?.personal ?? null,
    ssnLast4: w?.ssnLast4 ?? null,
    w4: row?.w4 ?? null,
    i9Status: row?.i9Status ?? null,
    paymentKind: row?.paymentKind ?? null,
    depositLast4: row?.depositLast4 ?? null,
    policies: (await policiesOf(tx, today)).map((key) => ({ key, at: acknowledged.get(key) ?? null })),
    signedName: row?.signedName ?? null,
    signedAt: row?.signedAt ?? null,
  };
}

async function onboardingRow(tx: Tx, who: Who) {
  const [row] = await tx.select().from(s.workerOnboarding).where(eq(s.workerOnboarding.workerId, who.workerId)).for("update");
  if (row) return row;
  const [made] = await tx.insert(s.workerOnboarding).values({ workerId: who.workerId, agencyId: who.agencyId }).returning();
  return made!;
}

export type StepResult = { ok: true } | { ok: false; field: string };
type Answers = Record<string, string | undefined>;
export interface StepContext {
  today: string;
  now: Date;
  address: string | null;
  userAgent: string | null;
}

/** Saves one step (Gusto: each step saved as the person goes); signing needs every other step done. */
export async function saveStep(tx: Tx, who: Who, step: Step, a: Answers, ctx: StepContext): Promise<StepResult> {
  if (!STEPS.includes(step)) return { ok: false, field: "step" };
  const row = await onboardingRow(tx, who);
  if (row.signedAt) return { ok: false, field: "signed" };
  const kek = appKey();
  const now = ctx.now;
  const set = (values: Partial<typeof s.workerOnboarding.$inferInsert>) => tx.update(s.workerOnboarding).set({ ...values, updatedAt: now }).where(eq(s.workerOnboarding.workerId, who.workerId));
  const log = (after: Record<string, unknown>) => auditBy(tx, by(who), [{ action: "update", entityType: "worker", entityId: who.workerId, after: { onboarding: step, ...after } }]);

  if (step === "personal") {
    const [onFile] = await tx.select({ ssnIndex: s.workers.ssnIndex, ssnLast4: s.workers.ssnLast4 }).from(s.workers).where(eq(s.workers.id, who.workerId));
    const r = readPersonal(a, ctx.today, { ssnOnFile: Boolean(onFile?.ssnIndex) });
    if (!r.ok) return r;
    const p = r.value;
    const personal: s.OnboardingPersonal = { legalFirstName: p.legalFirstName, legalLastName: p.legalLastName, addressLine: p.addressLine, city: p.city, state: p.state, zip: p.zip, email: p.email };
    if (p.ssn === null) {
      await set({ personal, personalAt: now, birthSealed: seal(Buffer.from(p.birthDate, "utf8"), kek, `birth:${who.workerId}`) });
      await log({ ssn: "unchanged", last4: onFile?.ssnLast4 ?? null });
      return { ok: true };
    }
    const index = ssnIndex(p.ssn, kek, who.agencyId);
    // The one look at the agency's other workers: is the number already on one? Yes or no only.
    const taken = await outsideWorkerFence(tx, who.workerId, async () => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`ssn:${who.agencyId}`}, 0))`);
      const [other] = await tx.select({ id: s.workers.id }).from(s.workers).where(and(eq(s.workers.ssnIndex, index), ne(s.workers.id, who.workerId)));
      return Boolean(other);
    });
    if (taken) {
      await log({ ssn: "duplicate_refused" });
      return { ok: false, field: "ssn" };
    }
    const w = onFile;
    if (w?.ssnIndex !== index) await tx.update(s.workers).set({ ssnSealed: sealSsn(p.ssn, kek, who.workerId), ssnLast4: last4Of(p.ssn), ssnIndex: index, ssnChangedAt: now }).where(eq(s.workers.id, who.workerId));
    await set({ personal, personalAt: now, birthSealed: seal(Buffer.from(p.birthDate, "utf8"), kek, `birth:${who.workerId}`) });
    await log({ ssn: w?.ssnIndex === index ? "unchanged" : "changed", last4: last4Of(p.ssn) });
    return { ok: true };
  }
  if (step === "w4") {
    const r = readW4(a);
    if (!r.ok) return r;
    await set({ w4: r.value, w4At: now });
    await log({ filingStatus: r.value.filingStatus });
    return { ok: true };
  }
  if (step === "i9") {
    const r = readI9(a);
    if (!r.ok) return r;
    await set({ i9Sealed: seal(Buffer.from(JSON.stringify(r.value), "utf8"), kek, `i9:${who.workerId}`), i9Status: r.value.status, i9At: now });
    await log({ i9Status: r.value.status });
    return { ok: true };
  }
  if (step === "payment") {
    const r = readDeposit(a);
    if (!r.ok) return r;
    const d = r.value;
    if (d.kind === "paper_check") await set({ paymentKind: "paper_check", depositSealed: null, depositLast4: null, paymentAt: now });
    else await set({ paymentKind: "direct_deposit", depositSealed: seal(Buffer.from(JSON.stringify(d), "utf8"), kek, `deposit:${who.workerId}`), depositLast4: d.account.slice(-4), paymentAt: now });
    await log({ payment: d.kind, last4: d.kind === "direct_deposit" ? d.account.slice(-4) : null });
    return { ok: true };
  }
  if (step === "policies") {
    const keys = await policiesOf(tx, ctx.today);
    if (!keys.every((k) => a[`policy_${k}`] === "on")) return { ok: false, field: "policies" };
    await set({ policies: keys.map((key) => ({ key, at: now.toISOString() })), policiesAt: now });
    await log({ policies: keys });
    return { ok: true };
  }
  // Review and sign: every other step first (Gusto's Review step).
  const progress = onboardingProgress(row);
  if (STEPS.filter((x) => x !== "sign").some((x) => progress.steps[x] === null) || !row.personal) return { ok: false, field: "steps" };
  const r = readSignature(a, row.personal);
  if (!r.ok) return r;
  await set({ signedName: r.value, signedAt: now, signedAddressHash: ctx.address ? digest(`signature|${ctx.address}`) : null, signedUserAgent: ctx.userAgent?.slice(0, 400) ?? null });
  // The roster's I-9 date (the compliance duties read it): Section 1 completed today.
  await tx.update(s.workers).set({ i9Section1On: sql`coalesce(${s.workers.i9Section1On}, ${ctx.today}::date)` }).where(eq(s.workers.id, who.workerId));
  await auditBy(tx, by(who), [{ action: "approve", entityType: "worker", entityId: who.workerId, after: { onboarding: "signed", forms: ["w4", "i9_section1", payKindOf(row)] } }]);
  return { ok: true };
}
const payKindOf = (row: { paymentKind: string | null }) => (row.paymentKind === "direct_deposit" ? "direct_deposit_authorization" : "paper_check");

/** The sealed answers, opened for a form's PDF (the worker's own, or the Owner's look with a reason). */
export async function formAnswers(tx: Tx, workerId: string): Promise<{ row: typeof s.workerOnboarding.$inferSelect; birthDate: string | null; i9: I9Answers | null; deposit: Deposit | null } | null> {
  const [row] = await tx.select().from(s.workerOnboarding).where(eq(s.workerOnboarding.workerId, workerId));
  if (!row) return null;
  const kek = appKey();
  return {
    row,
    birthDate: row.birthSealed ? unseal(row.birthSealed, kek, `birth:${workerId}`).toString("utf8") : null,
    i9: row.i9Sealed ? (JSON.parse(unseal(row.i9Sealed, kek, `i9:${workerId}`).toString("utf8")) as I9Answers) : null,
    deposit: row.depositSealed ? (JSON.parse(unseal(row.depositSealed, kek, `deposit:${workerId}`).toString("utf8")) as Deposit) : null,
  };
}

// ---------- hours ----------

export type DayStatus = "waiting" | "approved" | "paid" | "questioned";
const dayStatus = (st: (typeof s.timeEntryStatus.enumValues)[number]): DayStatus => (st === "locked" ? "paid" : st === "client_approved" || st === "reviewed" ? "approved" : st === "disputed" ? "questioned" : "waiting");

export interface HoursWeek {
  periodId: string;
  startsOn: string;
  endsOn: string;
  minutes: number;
  days: { id: string; date: string; inMinute: number | null; outMinute: number | null; minutes: number; status: DayStatus; fromApp: boolean }[];
}

/** The worker's hours by pay week, newest first (Gusto's Time tab; Square's timecards). */
export async function hoursOf(tx: Tx, workerId: string, weeks = 8): Promise<HoursWeek[]> {
  const rows = await tx
    .select({ id: s.timeEntries.id, periodId: s.timeEntries.payPeriodId, startsOn: s.payPeriods.startsOn, endsOn: s.payPeriods.endsOn, date: s.timeEntries.workDate, inMinute: s.timeEntries.inMinute, outMinute: s.timeEntries.outMinute, minutes: s.timeEntries.minutes, status: s.timeEntries.status, reasons: s.timeEntries.reviewReasons })
    .from(s.timeEntries)
    .innerJoin(s.payPeriods, eq(s.payPeriods.id, s.timeEntries.payPeriodId))
    .where(and(eq(s.timeEntries.workerId, workerId), ne(s.timeEntries.status, "extracted")))
    .orderBy(desc(s.payPeriods.startsOn), asc(s.timeEntries.workDate), asc(s.timeEntries.inMinute));
  const out: HoursWeek[] = [];
  for (const r of rows) {
    if (!r.date || r.minutes === null) continue;
    let week = out.find((x) => x.periodId === r.periodId);
    if (!week) {
      if (out.length >= weeks) continue;
      week = { periodId: r.periodId, startsOn: r.startsOn, endsOn: r.endsOn, minutes: 0, days: [] };
      out.push(week);
    }
    week.minutes += r.minutes;
    week.days.push({ id: r.id, date: r.date, inMinute: r.inMinute, outMinute: r.outMinute, minutes: r.minutes, status: dayStatus(r.status), fromApp: r.reasons.includes("worker_app") });
  }
  return out;
}

// ---------- pay stubs (Gusto pay stub: earnings with rate, hours, current and year to date) ----------

const PAID_RUNS = ["exported", "closed"] as const;

export interface StubSummary {
  runId: string;
  startsOn: string;
  endsOn: string;
  correction: boolean;
  grossCents: number;
}

/** Every paid week the worker has earnings in, newest first, with the year's gross so far. */
export async function payStubsOf(tx: Tx, workerId: string): Promise<{ stubs: StubSummary[]; yearCents: number; year: string | null }> {
  const rows = await tx
    .select({ runId: s.payRuns.id, kind: s.payRuns.kind, startsOn: s.payPeriods.startsOn, endsOn: s.payPeriods.endsOn, cents: sql<number>`sum(${s.payLines.amountCents})::int` })
    .from(s.payLines)
    .innerJoin(s.payRuns, eq(s.payRuns.id, s.payLines.payRunId))
    .innerJoin(s.payPeriods, eq(s.payPeriods.id, s.payRuns.payPeriodId))
    .where(and(eq(s.payLines.workerId, workerId), inArray(s.payRuns.status, [...PAID_RUNS])))
    .groupBy(s.payRuns.id, s.payRuns.kind, s.payPeriods.startsOn, s.payPeriods.endsOn)
    .orderBy(desc(s.payPeriods.endsOn), desc(s.payRuns.version));
  const stubs = rows.map((r) => ({ runId: r.runId, startsOn: r.startsOn, endsOn: r.endsOn, correction: r.kind === "correction", grossCents: r.cents }));
  const year = stubs[0]?.endsOn.slice(0, 4) ?? null;
  return { stubs, year, yearCents: stubs.filter((x) => x.endsOn.slice(0, 4) === year).reduce((t, x) => t + x.grossCents, 0) };
}

export interface StubLine {
  type: (typeof s.earningType.enumValues)[number];
  rate: { num: number; den: number };
  minutes: number;
  amountCents: number;
}
export interface StubDetail extends StubSummary {
  lines: StubLine[];
  ytdCents: number;
  agency: { name: string; addressLines: string[] };
  worker: { name: string; ssnLast4: string | null };
}

/** One paid week's earnings (Gusto's pay stub), year to date up to and with it. */
export async function payStubOf(tx: Tx, workerId: string, runId: string): Promise<StubDetail | null> {
  const { stubs } = await payStubsOf(tx, workerId);
  const at = stubs.findIndex((x) => x.runId === runId);
  if (at === -1) return null;
  const stub = stubs[at]!;
  const lines = await tx
    .select({ type: s.payLines.type, num: s.payLines.rateNum, den: s.payLines.rateDen, minutes: sql<number>`sum(${s.payLines.minutes})::int`, cents: sql<number>`sum(${s.payLines.amountCents})::int` })
    .from(s.payLines)
    .where(and(eq(s.payLines.payRunId, runId), eq(s.payLines.workerId, workerId)))
    .groupBy(s.payLines.type, s.payLines.rateNum, s.payLines.rateDen)
    .orderBy(asc(s.payLines.type), asc(s.payLines.rateNum));
  // Year to date: this stub and every earlier one in its calendar year (stubs are newest first).
  const ytdCents = stubs.slice(at).filter((x) => x.endsOn.slice(0, 4) === stub.endsOn.slice(0, 4)).reduce((t, x) => t + x.grossCents, 0);
  const [agency] = await tx.select({ name: s.agencies.name, addressLines: s.agencies.addressLines }).from(s.agencies);
  const [w] = await tx.select({ firstName: s.workers.firstName, lastName: s.workers.lastName, ssnLast4: s.workers.ssnLast4 }).from(s.workers).where(eq(s.workers.id, workerId));
  return {
    ...stub,
    lines: lines.map((l) => ({ type: l.type, rate: { num: l.num, den: l.den }, minutes: l.minutes, amountCents: l.cents })),
    ytdCents,
    agency: { name: agency?.name ?? "", addressLines: agency?.addressLines ?? [] },
    worker: { name: w ? `${w.firstName} ${w.lastName}` : "", ssnLast4: w?.ssnLast4 ?? null },
  };
}

// ---------- messages (one thread per worker, as a WhatsApp chat) ----------

export interface ThreadMessage {
  id: string;
  sender: "worker" | "agency";
  authorLabel: string;
  body: string;
  bodyLocale: string;
  translation: string | null;
  createdAt: Date;
}

export async function threadOf(tx: Tx, workerId: string): Promise<ThreadMessage[]> {
  const rows = await tx.select().from(s.workerMessages).where(eq(s.workerMessages.workerId, workerId)).orderBy(asc(s.workerMessages.createdAt)).limit(500);
  return rows.map((r) => ({ id: r.id, sender: r.sender, authorLabel: r.authorLabel, body: r.body, bodyLocale: r.bodyLocale, translation: r.translation, createdAt: r.createdAt }));
}

export async function unreadForWorker(tx: Tx, workerId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.workerMessages).where(and(eq(s.workerMessages.workerId, workerId), eq(s.workerMessages.sender, "agency"), isNull(s.workerMessages.readByWorkerAt)));
  return r?.n ?? 0;
}

export async function markReadByWorker(tx: Tx, workerId: string, now: Date): Promise<void> {
  await tx.update(s.workerMessages).set({ readByWorkerAt: now }).where(and(eq(s.workerMessages.workerId, workerId), eq(s.workerMessages.sender, "agency"), isNull(s.workerMessages.readByWorkerAt)));
}

const cleanBody = (text: string) => (typeof text === "string" ? text.replace(/\r\n?/g, "\n").trim() : "");

/**
 * A message in the thread, translated for the other side when the worker's language is not the
 * agency's (the agency works in English; a Spanish-speaking worker's message gets an English line).
 */
export async function postMessage(tx: Tx, m: { agencyId: string; workerId: string; sender: "worker" | "agency"; authorLabel: string; authorUserId: string | null; body: string; bodyLocale: Lang; otherLocale: Lang }, translator: Translator): Promise<{ ok: true; id: string } | { ok: false; error: "empty" | "too_long" }> {
  const body = cleanBody(m.body);
  if (!body) return { ok: false, error: "empty" };
  if (body.length > 2000) return { ok: false, error: "too_long" };
  const translation = m.bodyLocale === m.otherLocale ? null : await translator.translate(body, m.bodyLocale, m.otherLocale);
  const [row] = await tx
    .insert(s.workerMessages)
    .values({ agencyId: m.agencyId, workerId: m.workerId, sender: m.sender, authorLabel: m.authorLabel, authorUserId: m.authorUserId, body, bodyLocale: m.bodyLocale, translation, translationLocale: translation ? m.otherLocale : null })
    .returning({ id: s.workerMessages.id });
  return { ok: true, id: row!.id };
}

// ---------- clock in and out (Gusto's Time tab; Square Team) ----------

export interface ClockChoice {
  assignmentId: string;
  position: string;
  clientName: string;
  needsLocation: boolean;
}
export interface ClockView {
  open: { punchId: string; since: Date; position: string; clientName: string; needsLocation: boolean } | null;
  choices: ClockChoice[];
}

/** The worker's current assignments at clients that let them clock in, and a clock-in in progress. */
export async function clockOf(tx: Tx, workerId: string, today: string): Promise<ClockView> {
  const choices = await tx
    .select({ assignmentId: s.assignments.id, position: s.jobOrders.position, clientName: s.clients.name, clock: s.clients.workerClock })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .where(and(eq(s.assignments.workerId, workerId), eq(s.assignments.status, "active"), lte(s.assignments.startDate, today), sql`(${s.assignments.endDate} is null or ${s.assignments.endDate} >= ${today}::date)`, ne(s.clients.workerClock, "off")))
    .orderBy(asc(s.clients.name));
  const [open] = await tx
    .select({ punchId: s.workerClockPunches.id, since: s.workerClockPunches.clockInAt, position: s.jobOrders.position, clientName: s.clients.name, clock: s.clients.workerClock })
    .from(s.workerClockPunches)
    .innerJoin(s.assignments, eq(s.assignments.id, s.workerClockPunches.assignmentId))
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .where(and(eq(s.workerClockPunches.workerId, workerId), isNull(s.workerClockPunches.clockOutAt)));
  return {
    open: open ? { punchId: open.punchId, since: open.since, position: open.position, clientName: open.clientName, needsLocation: open.clock === "location" } : null,
    choices: choices.map((c) => ({ assignmentId: c.assignmentId, position: c.position, clientName: c.clientName, needsLocation: c.clock === "location" })),
  };
}

export type ClockError = "not_allowed" | "already_in" | "not_in" | "location_required" | "too_short" | "period_paid";

const readLocation = (l: unknown): s.PunchLocation | null => {
  if (!l || typeof l !== "object") return null;
  const { lat, lng, accuracyM } = l as Record<string, unknown>;
  if (typeof lat !== "number" || typeof lng !== "number" || typeof accuracyM !== "number") return null;
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && accuracyM >= 0 && accuracyM < 100_000)) return null;
  // About a metre: enough to place a worksite, no finer.
  const round = (x: number) => Math.round(x * 100_000) / 100_000;
  return { lat: round(lat), lng: round(lng), accuracyM: Math.round(accuracyM) };
};

export async function clockIn(tx: Tx, who: Who, assignmentId: string, location: unknown, today: string, now: Date): Promise<{ ok: true } | { ok: false; error: ClockError }> {
  const view = await clockOf(tx, who.workerId, today);
  if (view.open) return { ok: false, error: "already_in" };
  const choice = view.choices.find((c) => c.assignmentId === assignmentId);
  if (!choice) return { ok: false, error: "not_allowed" };
  const loc = readLocation(location);
  if (choice.needsLocation && !loc) return { ok: false, error: "location_required" };
  await tx.insert(s.workerClockPunches).values({ agencyId: who.agencyId, workerId: who.workerId, assignmentId, clockInAt: now, inLocation: choice.needsLocation ? loc : null });
  await auditBy(tx, by(who), [{ action: "create", entityType: "worker_clock", entityId: who.workerId, after: { clockIn: now.toISOString(), assignmentId, location: choice.needsLocation ? "given" : "not asked" } }]);
  return { ok: true };
}

/** The date and minute after midnight of an instant where the agency is. */
export function localMinute(zone: string, at: Date): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const p = (t: string) => parts.find((x) => x.type === t)!.value;
  return { date: `${p("year")}-${p("month")}-${p("day")}`, minute: Number(p("hour")) * 60 + Number(p("minute")) };
}

/** The pay week holding a date, made from the agency's workweek when there is none yet. */
async function periodFor(tx: Tx, agencyId: string, date: string): Promise<{ id: string } | null> {
  const [found] = await tx.select({ id: s.payPeriods.id }).from(s.payPeriods).where(and(lte(s.payPeriods.startsOn, date), gte(s.payPeriods.endsOn, date)));
  if (found) return found;
  const startsOnDay = await settingOn<number>(tx, "workweek_starts_on", date);
  const start = workweekStart(date, (typeof startsOnDay === "number" ? startsOnDay : 1) as Weekday);
  const [made] = await tx.insert(s.payPeriods).values({ agencyId, startsOn: start, endsOn: addDays(start, 6) }).onConflictDoNothing().returning({ id: s.payPeriods.id });
  if (made) return made;
  const [again] = await tx.select({ id: s.payPeriods.id }).from(s.payPeriods).where(eq(s.payPeriods.startsOn, start));
  return again ?? null;
}

/**
 * Clocking out makes the day's time entry, waiting for review (Gusto: "for your manager or admin to
 * review and approve"): the clock times where the agency is, whole minutes, no break taken out; a
 * shift past midnight counts on the day it began.
 */
export async function clockOut(tx: Tx, who: Who, location: unknown, now: Date): Promise<{ ok: true; entryId: string } | { ok: false; error: ClockError }> {
  const [punch] = await tx.select().from(s.workerClockPunches).where(and(eq(s.workerClockPunches.workerId, who.workerId), isNull(s.workerClockPunches.clockOutAt))).for("update");
  if (!punch) return { ok: false, error: "not_in" };
  const [client] = await tx
    .select({ clock: s.clients.workerClock, clientId: s.clients.id })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .where(eq(s.assignments.id, punch.assignmentId));
  const loc = readLocation(location);
  if (client?.clock === "location" && !loc) return { ok: false, error: "location_required" };
  const zone = await agencyZone(tx, now);
  const start = localMinute(zone, punch.clockInAt);
  const worked = Math.floor((now.getTime() - punch.clockInAt.getTime()) / 60_000);
  if (worked < 1) return { ok: false, error: "too_short" };
  const period = await periodFor(tx, who.agencyId, start.date);
  // Whether the week is still open reads every worker's hours in it (a paid week locks them all).
  if (!period || (await outsideWorkerFence(tx, who.workerId, () => periodState(tx, period.id))) !== "open") return { ok: false, error: "period_paid" };
  const [w] = await tx.select({ firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers).where(eq(s.workers.id, who.workerId));
  const [entry] = await tx
    .insert(s.timeEntries)
    .values({
      agencyId: who.agencyId,
      payPeriodId: period.id,
      workerNameRaw: w ? `${w.firstName} ${w.lastName}` : "",
      workerId: who.workerId,
      assignmentId: punch.assignmentId,
      workDate: start.date,
      inMinute: start.minute,
      outMinute: start.minute + worked,
      breakMinutes: 0,
      minutes: worked,
      confidence: "high",
      status: "needs_review",
      reviewReasons: ["worker_app"],
    })
    .returning({ id: s.timeEntries.id });
  await tx.update(s.workerClockPunches).set({ clockOutAt: now, outLocation: client?.clock === "location" ? loc : null, timeEntryId: entry!.id }).where(eq(s.workerClockPunches.id, punch.id));
  await auditBy(tx, by(who), [{ action: "create", entityType: "time_entry", entityId: entry!.id, after: { source: "worker_app", workDate: start.date, inMinute: start.minute, minutes: worked } }]);
  return { ok: true, entryId: entry!.id };
}

// ---------- Home ----------

export interface HomeView {
  firstName: string;
  onboarding: Progress;
  clock: ClockView;
  thisWeek: HoursWeek | null;
  latestPay: StubSummary | null;
  unread: number;
}

export async function homeOf(tx: Tx, workerId: string, today: string): Promise<HomeView> {
  const [w] = await tx.select({ firstName: s.workers.firstName }).from(s.workers).where(eq(s.workers.id, workerId));
  const [row] = await tx.select().from(s.workerOnboarding).where(eq(s.workerOnboarding.workerId, workerId));
  const weeks = await hoursOf(tx, workerId, 1);
  const pay = await payStubsOf(tx, workerId);
  return {
    firstName: w?.firstName ?? "",
    onboarding: onboardingProgress(row ?? null),
    clock: await clockOf(tx, workerId, today),
    thisWeek: weeks[0] ?? null,
    latestPay: pay.stubs[0] ?? null,
    unread: await unreadForWorker(tx, workerId),
  };
}
