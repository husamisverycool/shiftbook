/**
 * RULE: Illinois equal pay for day and temporary laborers — the hours counter.
 *
 * - 820 ILCS 175/42(a) (P.A. 103-1030, eff. 2024-08-09): a laborer "assigned to work and performs work
 *   at the same third party client for more than 720 hours within a 12-month period, beginning on or
 *   after April 1, 2024" is owed equal pay and benefits, or their hourly cash value (§ 42(b));
 *   § 42(a)(2)(B) and (c): "more than 4,160 hours within a 48-month period".
 * - 56 Ill. Adm. Code 260.505(b): the client's data is due "before the beginning of the day or
 *   temporary laborer's next pay period". IDOL bulletin 2025-06-05: work on or after April 1, 2024.
 * Safe readings (docs/research/pay-rules-slice-c.md §4): the 12 months roll; once crossed, the duty
 * does not end when the rolling total drops; only hours worked count (not guarantee, holiday or
 * premium time); only this agency's hours are known. The engine counts and records the obligation;
 * the equal-pay rate needs the client's data, so hours after the crossing are flagged, not repriced.
 * Every number (start, windows, thresholds, the 600-hour heads-up) is rule data.
 */
import { addDays, addMonths, isEffective, workweekStart } from "../dates";
import { formatClock } from "../format";
import { english, hoursValue, nested, part, type Say, type SayValue } from "../say";
import type { EqualPayRule, HoursWorked, Issue, Obligation, ObligationKind, ObligationOnFile, Shift, Weekday } from "../types";
import { latestRequest, rateInForce, type EqualPayRate } from "./il-equal-pay-rate";

export const IL_EQUAL_PAY = "il_dtlsa_equal_pay";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
type Event = { date: string; minutes: number; shift: Shift | null };
type Tier = { kind: ObligationKind; months: number; threshold: number };

const ruleOn = (rules: EqualPayRule[], jurisdiction: string, date: string) => rules.find((r) => r.jurisdiction === jurisdiction && isEffective(date, r.effectiveFrom, r.effectiveTo)) ?? null;

/** Covered by the Act: day and temporary labor at a worksite whose state has the equal-pay rule in force that day. */
export const coveredByEqualPay = (rules: EqualPayRule[], s: Shift) => s.dayAndTemporaryLabor !== false && ruleOn(rules, s.jurisdiction, s.date) !== null;

/** Work that counts: hours actually worked on covered work. */
export const countsTowardEqualPay = (rules: EqualPayRule[], s: Shift) => s.minutes > 0 && !s.reportedOnly && coveredByEqualPay(rules, s);

/** First index whose date is ≥ date (dates ascending). */
function lowerBound(events: Event[], date: string): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid]!.date < date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function equalPayCounter(args: { rules: EqualPayRule[]; shifts: Shift[]; hoursWorked: HoursWorked[]; onFile: ObligationOnFile[]; workweekStartsOn: Weekday; rates?: EqualPayRate[] }): { obligations: Obligation[]; warnings: Issue[] } {
  const obligations: Obligation[] = [];
  const warnings: Issue[] = [];
  const pairs = new Map<string, Shift[]>();
  for (const s of args.shifts.filter((x) => countsTowardEqualPay(args.rules, x))) {
    const key = `${s.workerId}\u0000${s.clientId}\u0000${s.jurisdiction}`;
    pairs.set(key, [...(pairs.get(key) ?? []), s]);
  }
  for (const key of [...pairs.keys()].sort(cmp)) {
    const current = pairs.get(key)!;
    const { workerId, clientId, jurisdiction, workerName } = current[0]!;
    const clientName = current.find((s) => s.clientName)?.clientName;
    const client: SayValue = clientName ?? nested(part("clientById", { id: clientId }));
    const events: Event[] = [
      ...args.hoursWorked.filter((h) => h.workerId === workerId && h.clientId === clientId && h.minutes > 0).map((h) => ({ date: h.date, minutes: h.minutes, shift: null })),
      ...current.map((s) => ({ date: s.date, minutes: s.minutes, shift: s })),
    ].sort(
      (a, b) =>
        cmp(a.date, b.date) ||
        (a.shift ? 1 : 0) - (b.shift ? 1 : 0) ||
        (a.shift?.startMinute ?? -1) - (b.shift?.startMinute ?? -1) ||
        cmp([...(a.shift?.entryIds ?? [])].sort(cmp).join(","), [...(b.shift?.entryIds ?? [])].sort(cmp).join(",")) ||
        a.minutes - b.minutes,
    );
    const prefix = [0];
    for (const e of events) prefix.push(prefix[prefix.length - 1]! + e.minutes);

    // Pass 1: the first crossing of each threshold, from the hours alone.
    type Found = { index: number; date: string; offset: number; at: number | null; windowStart: string; rule: EqualPayRule; months: number; threshold: number };
    const found = new Map<ObligationKind, Found>();
    const window12 = new Map<number, number>();
    events.forEach((e, i) => {
      const rule = ruleOn(args.rules, jurisdiction, e.date);
      if (!rule || e.date < rule.countsFrom) return;
      const tiers: Tier[] = [
        { kind: "il_equal_pay_720h", months: rule.windowMonths, threshold: rule.triggerMinutes },
        { kind: "il_equal_pay_4160h", months: rule.longWindowMonths, threshold: rule.longTriggerMinutes },
      ];
      for (const tier of tiers) {
        const windowStart = [addDays(addMonths(e.date, -tier.months), 1), rule.countsFrom].sort(cmp)[1]!;
        const before = prefix[i]! - prefix[lowerBound(events, windowStart)]!;
        if (tier.kind === "il_equal_pay_720h") window12.set(i, before + e.minutes);
        if (found.has(tier.kind) || before + e.minutes <= tier.threshold) continue;
        const offset = Math.max(0, tier.threshold - before);
        const at = e.shift && e.shift.startMinute !== null && before <= tier.threshold ? e.shift.startMinute + offset : null;
        found.set(tier.kind, { index: i, date: e.date, offset, at, windowStart, rule, months: tier.months, threshold: tier.threshold });
      }
    });

    // The crossing that counts is the earliest: the one found, or the one on file. A crossing found
    // before the one on file is recorded (a late timesheet moves it earlier); once on file, it stays.
    const onFile = new Map(args.onFile.filter((o) => o.workerId === workerId && o.clientId === clientId).map((o) => [o.kind, o.crossedOn]));
    const weeks = new Map<string, { after: number; asked: string | null; lastDate: string; lastIndex: number; rule: EqualPayRule }>();
    let crossed720: string | null = null;
    for (const kind of ["il_equal_pay_720h", "il_equal_pay_4160h"] as const) {
      const f = found.get(kind) ?? null;
      const fileDate = onFile.get(kind) ?? null;
      const recorded = f !== null && (fileDate === null || f.date < fileDate);
      const crossingDate = recorded ? f.date : fileDate;
      if (crossingDate === null) continue;
      if (kind === "il_equal_pay_720h") crossed720 = crossingDate;
      // Minutes after the crossing, per event: on the crossing day the found minute splits it, or —
      // with only the date on file — the whole day counts.
      const sameDay = f !== null && f.date === crossingDate ? f : null;
      const afterOf = (e: Event, i: number) =>
        e.date > crossingDate ? e.minutes : e.date < crossingDate ? 0 : sameDay === null ? e.minutes : i > sameDay.index ? e.minutes : i === sameDay.index ? e.minutes - sameDay.offset : 0;
      let obligation: Obligation | null = null;
      if (recorded) {
        obligation = { kind, jurisdiction, ruleCode: f.rule.ruleCode, workerId, workerName, clientId, crossedOn: f.date, crossedAtMinute: f.at, windowStart: f.windowStart, thresholdMinutes: f.threshold, minutesAfter: 0, earlierMinutesAfter: 0, entryIds: [], citation: f.rule.citation, message: "" };
        obligations.push(obligation);
      }
      events.forEach((e, i) => {
        const after = afterOf(e, i);
        if (after <= 0) return;
        if (!e.shift) {
          if (obligation) obligation.earlierMinutesAfter += after;
          return;
        }
        if (obligation) {
          obligation.minutesAfter += after;
          obligation.entryIds.push(...e.shift.entryIds);
        }
        if (kind === "il_equal_pay_720h") {
          // Hours paid at an equal-pay rate on file are equal pay; asked-for figures are not in yet.
          if (rateInForce(args.rates ?? [], workerId, clientId, e.date)) return;
          const asked = latestRequest(args.rates ?? [], workerId, clientId);
          const rule = ruleOn(args.rules, jurisdiction, e.date) ?? f?.rule;
          const week = workweekStart(e.date, args.workweekStartsOn);
          const w = weeks.get(week) ?? { after: 0, asked: null, lastDate: e.date, lastIndex: i, rule: rule! };
          w.after += after;
          if (asked) w.asked = asked.effectiveFrom;
          weeks.set(week, w);
        }
      });
      if (obligation && f) {
        const where = { name: workerName, threshold: hoursValue(f.threshold), client, date: { date: f.date }, months: String(f.months), windowStart: { date: f.windowStart } };
        const say: Say = [
          f.at !== null ? part("equalPayWhereAt", { ...where, clock: formatClock(f.at) }) : part("equalPayWhere", where),
          part(kind === "il_equal_pay_720h" ? "equalPayDuty720" : "equalPayDuty4160"),
          ...(obligation.earlierMinutesAfter > 0 ? [part("equalPayEarlier", { duration: { duration: obligation.earlierMinutesAfter } })] : []),
        ];
        obligation.message = english(say);
        obligation.say = say;
        warnings.push({ code: "equal_pay_obligation", workerId, workerName, workweekStart: workweekStart(f.date, args.workweekStartsOn), clientId, jurisdiction, ruleCode: f.rule.ruleCode, date: f.date, message: obligation.message, say });
      }
    }
    // Every week of this run with hours there: the last day, the 12-month total then, its rule.
    events.forEach((e, i) => {
      if (!e.shift || !window12.has(i)) return;
      const week = workweekStart(e.date, args.workweekStartsOn);
      const w = weeks.get(week) ?? { after: 0, asked: null, lastDate: e.date, lastIndex: i, rule: ruleOn(args.rules, jurisdiction, e.date)! };
      w.lastDate = e.date;
      w.lastIndex = i;
      w.rule = ruleOn(args.rules, jurisdiction, e.date)!;
      weeks.set(week, w);
    });

    for (const [week, w] of [...weeks].sort((a, b) => cmp(a[0], b[0]))) {
      const who = { workerId, workerName, workweekStart: week, clientId, jurisdiction, ruleCode: w.rule.ruleCode };
      const total = window12.get(w.lastIndex) ?? 0;
      // The heads-up stops only from the crossing on (a crossing on file for a later date does not hide it).
      const crossedBy = crossed720 !== null && crossed720 <= w.lastDate;
      if (w.after > 0) {
        const values = { name: workerName, week: { date: week }, duration: { duration: w.after }, client, threshold: hoursValue(w.rule.triggerMinutes) };
        const say = [w.asked !== null ? part("equalPayRateMissingAsked", { ...values, asked: { date: w.asked } }) : part("equalPayRateMissing", values)];
        warnings.push({ code: "equal_pay_rate_missing", ...who, message: english(say), say });
      } else if (!crossedBy && total > w.rule.warnMinutes) {
        const say = [part("approachingEqualPay", { name: workerName, week: { date: week }, duration: { duration: total }, client, months: String(w.rule.windowMonths), date: { date: w.lastDate }, threshold: hoursValue(w.rule.triggerMinutes) })];
        warnings.push({ code: "approaching_equal_pay_hours", ...who, date: w.lastDate, message: english(say), say });
      }
    }
  }
  for (const o of obligations) o.entryIds = [...new Set(o.entryIds)].sort(cmp);
  return { obligations: obligations.sort((a, b) => cmp(a.workerId, b.workerId) || cmp(a.clientId, b.clientId) || cmp(a.kind, b.kind)), warnings };
}
