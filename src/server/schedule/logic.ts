/**
 * Scheduling, pure (slice u, decision 0041; docs/patterns/schedule.md, margin/attendance.md). No
 * database: the grid's counters, the status bar's counts (Deputy), overlaps (When I Work's scheduling
 * concerns) and the attendance figures (Deputy's report; Instawork's fill rate). Minutes are integers;
 * rates are whole basis points.
 */
import type { ShiftState } from "../db/schema";

export interface ShiftLike {
  id: string;
  workDate: string;
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
  workerId: string | null;
  state: ShiftState;
  publishedAt: Date | null;
  changedAt: Date;
  warning: "declined" | "expired" | null;
  noShow: boolean;
}

/** Instawork's confirm deadline: an answer is due 16 hours before the start (Deputy: then it opens again). */
export const CONFIRM_DEADLINE_MINUTES = 16 * 60;
/** Deputy's attendance report: late is later than the start plus this tolerance (its default). */
export const LATE_TOLERANCE_MINUTES = 15;

export const paidMinutes = (s: Pick<ShiftLike, "startMinute" | "endMinute" | "breakMinutes">): number => s.endMinute - s.startMinute - s.breakMinutes;

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
const span = (s: ShiftLike): [number, number] => {
  const day = dayNumber(s.workDate) * 1440;
  return [day + s.startMinute, day + s.endMinute];
};

const live = (s: Pick<ShiftLike, "state">) => s.state !== "cancelled";

/** Two live shifts of one worker whose times meet (When I Work's scheduling concerns). */
export function overlaps(a: ShiftLike, b: ShiftLike): boolean {
  if (a.id === b.id || !a.workerId || a.workerId !== b.workerId || !live(a) || !live(b)) return false;
  const [as, ae] = span(a);
  const [bs, be] = span(b);
  return as < be && bs < ae;
}

/** Unpublished until published, and again after any change since (When I Work's pending changes). */
export const unpublished = (s: Pick<ShiftLike, "state" | "publishedAt" | "changedAt">): boolean => live(s) && (s.publishedAt === null || s.changedAt > s.publishedAt);

/** The ids of every shift that overlaps another of the same worker. */
export function overlapping(shifts: ShiftLike[]): Set<string> {
  const out = new Set<string>();
  const byWorker = new Map<string, ShiftLike[]>();
  for (const s of shifts) if (s.workerId && live(s)) byWorker.set(s.workerId, [...(byWorker.get(s.workerId) ?? []), s]);
  for (const list of byWorker.values())
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (overlaps(list[i]!, list[j]!)) {
          out.add(list[i]!.id);
          out.add(list[j]!.id);
        }
  return out;
}

/** Deputy's status bar: each count is the shifts it jumps through, in grid order. */
export function statusCounts(shifts: ShiftLike[]): Record<"open" | "unpublished" | "awaiting" | "warnings", string[]> {
  const sorted = [...shifts].filter(live).sort((a, b) => a.workDate.localeCompare(b.workDate) || a.startMinute - b.startMinute);
  const clash = overlapping(sorted);
  return {
    open: sorted.filter((s) => s.state === "open").map((s) => s.id),
    unpublished: sorted.filter(unpublished).map((s) => s.id),
    awaiting: sorted.filter((s) => s.state === "awaiting").map((s) => s.id),
    warnings: sorted.filter((s) => s.warning !== null || clash.has(s.id)).map((s) => s.id),
  };
}

/** When I Work's per-day counters: shifts and paid minutes, cancelled shifts left out. */
export function dayCounters(shifts: ShiftLike[], days: string[]): { date: string; shifts: number; minutes: number }[] {
  return days.map((date) => {
    const on = shifts.filter((s) => s.workDate === date && live(s));
    return { date, shifts: on.length, minutes: on.reduce((sum, s) => sum + paidMinutes(s), 0) };
  });
}

/** n of total as whole basis points, rounded half up; 0 when there is nothing to count. */
export const rateBp = (n: number, total: number): number => (total === 0 ? 0 : Math.floor((n * 20_000 + total) / (2 * total)));

export interface AttendanceShift extends ShiftLike {
  clientId: string;
  /** The first time in recorded for the worker that day at that client, minutes after midnight. */
  firstInMinute: number | null;
  /** Whether the shift has ended. */
  ended: boolean;
}

export interface AttendanceRow {
  clientId: string;
  requested: number;
  filled: number;
  fillBp: number;
  scheduled: number;
  noShows: number;
  noShowBp: number;
  late: number;
  lateBp: number;
}

/**
 * Per client: fill rate = shifts with a worker of shifts requested (Instawork); no-show rate =
 * no-shows of past scheduled shifts × 100 (Deputy); late = a first time in after the start plus the
 * tolerance (Deputy's default 15 minutes).
 */
export function attendance(shifts: AttendanceShift[], toleranceMinutes = LATE_TOLERANCE_MINUTES): AttendanceRow[] {
  const by = new Map<string, AttendanceShift[]>();
  for (const s of shifts) if (live(s)) by.set(s.clientId, [...(by.get(s.clientId) ?? []), s]);
  return [...by.entries()].map(([clientId, list]) => {
    const requested = list.length;
    const filled = list.filter((s) => s.workerId !== null).length;
    const past = list.filter((s) => s.ended && s.workerId !== null);
    const noShows = past.filter((s) => s.noShow).length;
    const late = past.filter((s) => !s.noShow && s.firstInMinute !== null && s.firstInMinute > s.startMinute + toleranceMinutes).length;
    return { clientId, requested, filled, fillBp: rateBp(filled, requested), scheduled: past.length, noShows, noShowBp: rateBp(noShows, past.length), late, lateBp: rateBp(late, past.length) };
  });
}
