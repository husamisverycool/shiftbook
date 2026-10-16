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
import { formatClock, formatDuration, formatHours } from "../format";
import type { EqualPayRule, HoursWorked, Issue, Obligation, ObligationKind, ObligationOnFile, Shift, Weekday } from "../types";

export const IL_EQUAL_PAY = "il_dtlsa_equal_pay";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
type Event = { date: string; minutes: number; shift: Shift | null };
type Tier = { kind: ObligationKind; months: number; threshold: number };

const ruleOn = (rules: EqualPayRule[], jurisdiction: string, date: string) => rules.find((r) => r.jurisdiction === jurisdiction && isEffective(date, r.effectiveFrom, r.effectiveTo)) ?? null;

/** Work that counts: hours actually worked on day and temporary labor at a worksite whose state has a counter rule. */
export const countsTowardEqualPay = (rules: EqualPayRule[], s: Shift) => s.minutes > 0 && !s.reportedOnly && s.dayAndTemporaryLabor !== false && ruleOn(rules, s.jurisdiction, s.date) !== null;

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

export function equalPayCounter(args: { rules: EqualPayRule[]; shifts: Shift[]; hoursWorked: HoursWorked[]; onFile: ObligationOnFile[]; workweekStartsOn: Weekday }): { obligations: Obligation[]; warnings: Issue[] } {
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
    const client = current.find((s) => s.clientName)?.clientName ?? `client ${clientId}`;
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

    const onFile = new Map(args.onFile.filter((o) => o.workerId === workerId && o.clientId === clientId).map((o) => [o.kind, o.crossedOn]));
    const state = new Map<ObligationKind, { obligation: Obligation | null; crossedOn: string | null }>();
    for (const kind of ["il_equal_pay_720h", "il_equal_pay_4160h"] as const) state.set(kind, { obligation: null, crossedOn: onFile.get(kind) ?? null });
    const weeks = new Map<string, { after: number; lastDate: string; window: number; crossed: boolean; rule: EqualPayRule }>();

    events.forEach((e, i) => {
      const rule = ruleOn(args.rules, jurisdiction, e.date);
      if (!rule || e.date < rule.countsFrom) return;
      const tiers: Tier[] = [
        { kind: "il_equal_pay_720h", months: rule.windowMonths, threshold: rule.triggerMinutes },
        { kind: "il_equal_pay_4160h", months: rule.longWindowMonths, threshold: rule.longTriggerMinutes },
      ];
      let window12 = 0;
      for (const tier of tiers) {
        const windowStart = [addDays(addMonths(e.date, -tier.months), 1), rule.countsFrom].sort(cmp)[1]!;
        const before = prefix[i]! - prefix[lowerBound(events, windowStart)]!;
        if (tier.kind === "il_equal_pay_720h") window12 = before + e.minutes;
        const st = state.get(tier.kind)!;
        let after = 0;
        if (st.crossedOn === null && before + e.minutes > tier.threshold) {
          const offset = Math.max(0, tier.threshold - before);
          st.crossedOn = e.date;
          const at = e.shift && e.shift.startMinute !== null && before <= tier.threshold ? e.shift.startMinute + offset : null;
          const where = `${workerName} passed ${formatHours(tier.threshold)} of work at ${client} on ${e.date}${at !== null ? ` at ${formatClock(at)}` : ""} (the ${tier.months} months from ${windowStart})`;
          const duty =
            tier.kind === "il_equal_pay_720h"
              ? "from then on the Illinois equal-pay rule applies: at least the pay of the client's comparable direct hires, with equal benefits or their hourly cash value (820 ILCS 175/42). Get the client's pay, seniority and benefits data before the next pay period begins (56 Ill. Adm. Code 260.505(b)), then enter the equal-pay rate."
              : "if the client chose the wage-survey method, pay is now at least the 75th percentile for the job in the area (820 ILCS 175/42(a)(2)(B)). Get the client's data before the next pay period begins (56 Ill. Adm. Code 260.505(b)).";
          st.obligation = { kind: tier.kind, jurisdiction, ruleCode: rule.ruleCode, workerId, workerName, clientId, crossedOn: e.date, crossedAtMinute: at, windowStart, thresholdMinutes: tier.threshold, minutesAfter: 0, entryIds: [], citation: rule.citation, message: `${where}: ${duty}` };
          obligations.push(st.obligation);
          warnings.push({ code: "equal_pay_obligation", workerId, workerName, workweekStart: workweekStart(e.date, args.workweekStartsOn), clientId, jurisdiction, ruleCode: rule.ruleCode, date: e.date, message: st.obligation.message });
          after = e.minutes - offset;
        } else if (st.crossedOn !== null && (st.obligation !== null || e.date > st.crossedOn)) {
          after = e.minutes;
        }
        if (!e.shift || after <= 0) continue;
        if (st.obligation) {
          st.obligation.minutesAfter += after;
          st.obligation.entryIds.push(...e.shift.entryIds);
        }
        if (tier.kind === "il_equal_pay_720h") {
          const week = workweekStart(e.date, args.workweekStartsOn);
          const w = weeks.get(week) ?? { after: 0, lastDate: e.date, window: 0, crossed: true, rule };
          w.after += after;
          weeks.set(week, w);
        }
      }
      if (e.shift) {
        const week = workweekStart(e.date, args.workweekStartsOn);
        const w = weeks.get(week) ?? { after: 0, lastDate: e.date, window: 0, crossed: false, rule };
        w.lastDate = e.date;
        w.window = window12;
        w.crossed = state.get("il_equal_pay_720h")!.crossedOn !== null;
        w.rule = rule;
        weeks.set(week, w);
      }
    });

    for (const [week, w] of [...weeks].sort((a, b) => cmp(a[0], b[0]))) {
      const who = { workerId, workerName, workweekStart: week, clientId, jurisdiction, ruleCode: w.rule.ruleCode };
      if (w.after > 0) {
        warnings.push({ code: "equal_pay_rate_missing", ...who, message: `${workerName}, workweek starting ${week}: ${formatDuration(w.after)} worked at ${client} after passing ${formatHours(w.rule.triggerMinutes)} there are paid at the placement rate; the equal-pay rate and benefits (or their hourly cash value) are not on file, so back pay may be due once they are (820 ILCS 175/42).` });
      } else if (!w.crossed && w.window > w.rule.warnMinutes) {
        warnings.push({ code: "approaching_equal_pay_hours", ...who, date: w.lastDate, message: `${workerName}, workweek starting ${week}: ${formatDuration(w.window)} worked at ${client} in the ${w.rule.windowMonths} months to ${w.lastDate}; past ${formatHours(w.rule.triggerMinutes)} the Illinois equal-pay rule applies (820 ILCS 175/42), so ask the client now for the pay of its comparable direct hires.` });
      }
    }
  }
  for (const o of obligations) o.entryIds = [...new Set(o.entryIds)].sort(cmp);
  return { obligations: obligations.sort((a, b) => cmp(a.workerId, b.workerId) || cmp(a.clientId, b.clientId) || cmp(a.kind, b.kind)), warnings };
}
