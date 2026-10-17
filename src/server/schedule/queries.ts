/**
 * What the schedule screens read (slice u; docs/patterns/schedule.md, margin/attendance.md,
 * shifts-preview.md): the week's grid, a worker's own shifts and offers, and the attendance figures.
 */
import { and, asc, desc, eq, gte, inArray, lte, ne, or } from "drizzle-orm";
import { addDays, workweekStart, type Weekday } from "@shiftbook/rules";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { settingOn } from "../settings";
import { attendance, dayCounters, LATE_TOLERANCE_MINUTES, overlapping, statusCounts, unpublished, type AttendanceRow } from "./logic";

export async function weekStartsOn(tx: Tx, date: string): Promise<Weekday> {
  const v = await settingOn<number>(tx, "workweek_starts_on", date);
  return (typeof v === "number" ? v : 1) as Weekday;
}

export interface GridShift {
  id: string;
  jobOrderId: string;
  position: string;
  clientId: string;
  clientName: string;
  worksiteId: string;
  worksiteName: string;
  workDate: string;
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
  workerId: string | null;
  workerName: string | null;
  state: s.ShiftState;
  requireConfirmation: boolean;
  unpublished: boolean;
  published: boolean;
  confirmBy: string | null;
  warning: "declined" | "expired" | null;
  warningWorkerName: string | null;
  warningReason: string | null;
  noShow: boolean;
  overlap: boolean;
  offers: { id: string; workerName: string; status: string; reason: string | null; at: string }[];
}

export interface WeekView {
  weekStart: string;
  days: string[];
  clientId: string | null;
  clients: { id: string; name: string }[];
  jobOrders: { id: string; position: string; clientId: string; clientName: string; worksiteName: string }[];
  workers: { id: string; name: string }[];
  shifts: GridShift[];
  counters: { date: string; shifts: number; minutes: number }[];
  status: Record<"open" | "unpublished" | "awaiting" | "warnings", string[]>;
}

const name = (w: { firstName: string; lastName: string } | null | undefined) => (w ? `${w.firstName} ${w.lastName}` : null);

/** The week holding `date` (the agency's workweek), every shift in it, optionally one client's. */
export async function weekView(tx: Tx, today: string, ask: { week?: string; clientId?: string | null }): Promise<WeekView> {
  const startsOn = await weekStartsOn(tx, today);
  const weekStart = workweekStart(ask.week && /^\d{4}-\d{2}-\d{2}$/.test(ask.week) ? ask.week : today, startsOn);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const clients = await tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients).orderBy(asc(s.clients.name));
  const clientId = ask.clientId && clients.some((c) => c.id === ask.clientId) ? ask.clientId : null;
  const jobOrders = await tx
    .select({ id: s.jobOrders.id, position: s.jobOrders.position, clientId: s.jobOrders.clientId, clientName: s.clients.name, worksiteName: s.worksites.name })
    .from(s.jobOrders)
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId))
    .orderBy(asc(s.clients.name), asc(s.jobOrders.position));
  const workers = await tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers).where(eq(s.workers.status, "active")).orderBy(asc(s.workers.lastName), asc(s.workers.firstName));
  const workerName = new Map(workers.map((w) => [w.id, name(w)!]));
  const rows = await tx
    .select({ shift: s.shifts, position: s.jobOrders.position, clientId: s.jobOrders.clientId, clientName: s.clients.name, worksiteId: s.worksites.id, worksiteName: s.worksites.name })
    .from(s.shifts)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.shifts.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId))
    .where(and(gte(s.shifts.workDate, days[0]!), lte(s.shifts.workDate, days[6]!), ne(s.shifts.state, "cancelled")))
    .orderBy(asc(s.shifts.workDate), asc(s.shifts.startMinute));
  const inView = rows.filter((r) => clientId === null || r.clientId === clientId);
  const ids = inView.map((r) => r.shift.id);
  const offers =
    ids.length === 0
      ? []
      : await tx
          .select({ offer: s.shiftOffers, firstName: s.workers.firstName, lastName: s.workers.lastName })
          .from(s.shiftOffers)
          .innerJoin(s.workers, eq(s.workers.id, s.shiftOffers.workerId))
          .where(inArray(s.shiftOffers.shiftId, ids))
          .orderBy(asc(s.shiftOffers.createdAt));
  // Overlaps count across every client: a worker can't be in two places at once.
  const clash = overlapping(rows.map((r) => r.shift));
  // Names of workers no longer on the active roster (a declined shift's worker, say).
  const missing = [...new Set(inView.flatMap((r) => [r.shift.workerId, r.shift.warningWorkerId]).filter((x): x is string => !!x && !workerName.has(x)))];
  if (missing.length > 0)
    for (const w of await tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers).where(inArray(s.workers.id, missing))) workerName.set(w.id, name(w)!);
  const shifts: GridShift[] = inView.map(({ shift: sh, ...r }) => ({
    id: sh.id,
    jobOrderId: sh.jobOrderId,
    position: r.position,
    clientId: r.clientId,
    clientName: r.clientName,
    worksiteId: r.worksiteId,
    worksiteName: r.worksiteName,
    workDate: sh.workDate,
    startMinute: sh.startMinute,
    endMinute: sh.endMinute,
    breakMinutes: sh.breakMinutes,
    workerId: sh.workerId,
    workerName: sh.workerId ? (workerName.get(sh.workerId) ?? null) : null,
    state: sh.state,
    requireConfirmation: sh.requireConfirmation,
    unpublished: unpublished(sh),
    published: sh.publishedAt !== null,
    confirmBy: sh.confirmBy?.toISOString() ?? null,
    warning: sh.warning,
    warningWorkerName: sh.warningWorkerId ? (workerName.get(sh.warningWorkerId) ?? null) : null,
    warningReason: sh.warningReason,
    noShow: sh.noShow,
    overlap: clash.has(sh.id),
    offers: offers.filter((o) => o.offer.shiftId === sh.id).map((o) => ({ id: o.offer.id, workerName: `${o.firstName} ${o.lastName}`, status: o.offer.status, reason: o.offer.reason, at: o.offer.createdAt.toISOString() })),
  }));
  const like = inView.map((r) => ({ ...r.shift, overlapsElsewhere: clash.has(r.shift.id) }));
  const status = statusCounts(like);
  // A clash with another client's shift is a warning here too.
  status.warnings = [...new Set([...status.warnings, ...like.filter((x) => x.overlapsElsewhere).map((x) => x.id)])];
  return {
    weekStart,
    days,
    clientId,
    clients,
    jobOrders: jobOrders.filter((j) => clientId === null || j.clientId === clientId),
    workers: workers.map((w) => ({ id: w.id, name: name(w)! })),
    shifts,
    counters: dayCounters(like, days),
    status,
  };
}

export interface WorkerShift {
  id: string;
  workDate: string;
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
  position: string;
  clientName: string;
  worksiteName: string;
  city: string;
  state: s.ShiftState | "declined";
  confirmBy: string | null;
  reason: string | null;
}

export interface WorkerShifts {
  offers: (WorkerShift & { offerId: string })[];
  upcoming: WorkerShift[];
  past: WorkerShift[];
  cancelled: WorkerShift[];
  /** Upcoming shifts waiting for this worker's answer, plus open offers (Deputy's count). */
  needsAnswer: number;
}

/** One worker's shifts (Instawork: Upcoming, Past, Cancelled) and the open shifts offered to them. */
export async function workerShifts(tx: Tx, workerId: string, today: string): Promise<WorkerShifts> {
  const rows = await tx
    .select({ shift: s.shifts, position: s.jobOrders.position, clientName: s.clients.name, worksiteName: s.worksites.name, city: s.worksites.city })
    .from(s.shifts)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.shifts.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId))
    .where(and(or(eq(s.shifts.workerId, workerId), and(eq(s.shifts.warningWorkerId, workerId), eq(s.shifts.warning, "declined")))))
    .orderBy(asc(s.shifts.workDate), asc(s.shifts.startMinute));
  const view = (r: (typeof rows)[number], state: WorkerShift["state"], reason: string | null = null): WorkerShift => ({
    id: r.shift.id,
    workDate: r.shift.workDate,
    startMinute: r.shift.startMinute,
    endMinute: r.shift.endMinute,
    breakMinutes: r.shift.breakMinutes,
    position: r.position,
    clientName: r.clientName,
    worksiteName: r.worksiteName,
    city: r.city,
    state,
    confirmBy: r.shift.confirmBy?.toISOString() ?? null,
    reason,
  });
  // Only what the agency has published reaches the worker.
  const mine = rows.filter((r) => r.shift.workerId === workerId && r.shift.publishedAt !== null);
  const upcoming = mine.filter((r) => r.shift.state !== "cancelled" && r.shift.workDate >= today).map((r) => view(r, r.shift.state));
  const past = mine.filter((r) => r.shift.state !== "cancelled" && r.shift.workDate < today).map((r) => view(r, r.shift.state)).reverse();
  const cancelled = [
    ...mine.filter((r) => r.shift.state === "cancelled").map((r) => view(r, "cancelled")),
    ...rows.filter((r) => r.shift.warningWorkerId === workerId && r.shift.warning === "declined").map((r) => view(r, "declined", r.shift.warningReason)),
  ].sort((a, b) => b.workDate.localeCompare(a.workDate));
  const offerRows = await tx
    .select({ offerId: s.shiftOffers.id, shift: s.shifts, position: s.jobOrders.position, clientName: s.clients.name, worksiteName: s.worksites.name, city: s.worksites.city })
    .from(s.shiftOffers)
    .innerJoin(s.shifts, eq(s.shifts.id, s.shiftOffers.shiftId))
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.shifts.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId))
    .where(and(eq(s.shiftOffers.workerId, workerId), eq(s.shiftOffers.status, "offered"), eq(s.shifts.state, "open"), gte(s.shifts.workDate, today)))
    .orderBy(asc(s.shifts.workDate), asc(s.shifts.startMinute));
  const offers = offerRows.map((r) => ({ ...view(r, "open"), offerId: r.offerId }));
  return { offers, upcoming, past, cancelled, needsAnswer: offers.length + upcoming.filter((u) => u.state === "awaiting").length };
}

export interface AttendanceView {
  from: string;
  to: string;
  toleranceMinutes: number;
  totals: Omit<AttendanceRow, "clientId">;
  byClient: (AttendanceRow & { clientName: string })[];
  problems: { shiftId: string; workDate: string; clientName: string; workerName: string | null; position: string; issue: "no_show" | "late" | "open"; lateBy: number | null }[];
}

/** The last four weeks to the end of this week: fill, no-shows and lateness per client (Deputy; Instawork). */
export async function attendanceView(tx: Tx, today: string, nowMinute: number): Promise<AttendanceView> {
  const startsOn = await weekStartsOn(tx, today);
  const to = addDays(workweekStart(today, startsOn), 6);
  const from = addDays(to, -27);
  const rows = await tx
    .select({ shift: s.shifts, clientId: s.jobOrders.clientId, clientName: s.clients.name, position: s.jobOrders.position, firstName: s.workers.firstName, lastName: s.workers.lastName })
    .from(s.shifts)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.shifts.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .leftJoin(s.workers, eq(s.workers.id, s.shifts.workerId))
    .where(and(gte(s.shifts.workDate, from), lte(s.shifts.workDate, to), ne(s.shifts.state, "cancelled")))
    .orderBy(desc(s.shifts.workDate));
  // The first time in for each worker, day and client, from the hours (never made by the schedule).
  const workerIds = [...new Set(rows.map((r) => r.shift.workerId).filter((x): x is string => !!x))];
  const entries =
    workerIds.length === 0
      ? []
      : await tx
          .select({ workerId: s.timeEntries.workerId, workDate: s.timeEntries.workDate, inMinute: s.timeEntries.inMinute, clientId: s.jobOrders.clientId })
          .from(s.timeEntries)
          .innerJoin(s.assignments, eq(s.assignments.id, s.timeEntries.assignmentId))
          .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
          .where(and(inArray(s.timeEntries.workerId, workerIds), gte(s.timeEntries.workDate, from), lte(s.timeEntries.workDate, to)));
  const firstIn = new Map<string, number>();
  for (const e of entries) {
    if (e.inMinute === null || !e.workerId || !e.workDate) continue;
    const k = `${e.workerId}|${e.workDate}|${e.clientId}`;
    firstIn.set(k, Math.min(firstIn.get(k) ?? Infinity, e.inMinute));
  }
  const ended = (d: string, end: number) => d < today || (d === today && end <= nowMinute);
  const list = rows.map((r) => ({ ...r.shift, clientId: r.clientId, firstInMinute: r.shift.workerId ? (firstIn.get(`${r.shift.workerId}|${r.shift.workDate}|${r.clientId}`) ?? null) : null, ended: ended(r.shift.workDate, r.shift.endMinute) }));
  const byClientRows = attendance(list, LATE_TOLERANCE_MINUTES);
  const clientName = new Map(rows.map((r) => [r.clientId, r.clientName]));
  const sum = (k: "requested" | "filled" | "scheduled" | "noShows" | "late") => byClientRows.reduce((t, r) => t + r[k], 0);
  const [all] = attendance(list.map((x) => ({ ...x, clientId: "all" })), LATE_TOLERANCE_MINUTES);
  const problems: AttendanceView["problems"] = [];
  for (const r of rows) {
    const x = list.find((l) => l.id === r.shift.id)!;
    const who = r.firstName ? `${r.firstName} ${r.lastName}` : null;
    const base = { shiftId: r.shift.id, workDate: r.shift.workDate, clientName: r.clientName, workerName: who, position: r.position };
    if (x.ended && x.workerId && x.noShow) problems.push({ ...base, issue: "no_show", lateBy: null });
    else if (x.ended && x.workerId && x.firstInMinute !== null && x.firstInMinute > x.startMinute + LATE_TOLERANCE_MINUTES) problems.push({ ...base, issue: "late", lateBy: x.firstInMinute - x.startMinute });
    else if (x.state === "open" && r.shift.workDate <= today) problems.push({ ...base, issue: "open", lateBy: null });
  }
  return {
    from,
    to,
    toleranceMinutes: LATE_TOLERANCE_MINUTES,
    totals: all
      ? { requested: all.requested, filled: all.filled, fillBp: all.fillBp, scheduled: all.scheduled, noShows: all.noShows, noShowBp: all.noShowBp, late: all.late, lateBp: all.lateBp }
      : { requested: sum("requested"), filled: sum("filled"), fillBp: 0, scheduled: sum("scheduled"), noShows: sum("noShows"), noShowBp: 0, late: sum("late"), lateBp: 0 },
    byClient: byClientRows.map((r) => ({ ...r, clientName: clientName.get(r.clientId) ?? "" })).sort((a, b) => a.clientName.localeCompare(b.clientName)),
    problems,
  };
}

/** Confirmed shifts in a pay period with no hours recorded for that worker, day and client yet (the run's exceptions step). */
export async function scheduledWithoutHours(tx: Tx, from: string, to: string): Promise<{ shiftId: string; workDate: string; workerName: string; clientName: string; position: string }[]> {
  const rows = await tx
    .select({ shift: s.shifts, clientId: s.jobOrders.clientId, clientName: s.clients.name, position: s.jobOrders.position, firstName: s.workers.firstName, lastName: s.workers.lastName })
    .from(s.shifts)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.shifts.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .innerJoin(s.workers, eq(s.workers.id, s.shifts.workerId))
    .where(and(gte(s.shifts.workDate, from), lte(s.shifts.workDate, to), eq(s.shifts.state, "confirmed"), eq(s.shifts.noShow, false)));
  if (rows.length === 0) return [];
  const entries = await tx
    .select({ workerId: s.timeEntries.workerId, workDate: s.timeEntries.workDate, clientId: s.jobOrders.clientId })
    .from(s.timeEntries)
    .innerJoin(s.assignments, eq(s.assignments.id, s.timeEntries.assignmentId))
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .where(and(gte(s.timeEntries.workDate, from), lte(s.timeEntries.workDate, to)));
  const has = new Set(entries.map((e) => `${e.workerId}|${e.workDate}|${e.clientId}`));
  return rows
    .filter((r) => !has.has(`${r.shift.workerId}|${r.shift.workDate}|${r.clientId}`))
    .map((r) => ({ shiftId: r.shift.id, workDate: r.shift.workDate, workerName: `${r.firstName} ${r.lastName}`, clientName: r.clientName, position: r.position }));
}
