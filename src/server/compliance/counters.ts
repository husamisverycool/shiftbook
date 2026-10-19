/**
 * The Illinois equal-pay hours counters (SPEC §4 HoursCounter, §16; slice j decision J5): each
 * worker's hours of day and temporary labor at each client in the rule's 12- and 48-month windows
 * ending today, with the hours worked there before Tabulado (opening balances, counted on the date
 * they run to, the safe reading the run uses too). Pure: the windows, thresholds and heads-up are the
 * rule row's (820 ILCS 175/42); crossings come from the duties on file, never worked out here.
 */
import { addDays, addMonths, isEffective, type EqualPayRule } from "@shiftbook/rules";

export interface WorkedDay {
  workerId: string;
  clientId: string;
  date: string;
  minutes: number;
}

export interface OpeningBalance {
  workerId: string;
  clientId: string;
  /** The last day of the work it stands for. */
  throughOn: string;
  minutes: number;
}

export interface CrossingOnFile {
  kind: "il_equal_pay_720h" | "il_equal_pay_4160h";
  workerId: string;
  clientId: string;
  crossedOn: string;
}

export interface CounterRow {
  workerId: string;
  clientId: string;
  /** Minutes in the 12-month window (and its first day), balances included. */
  minutes12: number;
  windowStart12: string;
  /** Minutes in the 48-month window (and its first day), balances included. */
  minutes48: number;
  windowStart48: string;
  /** Of which from opening balances, in the 48-month window. */
  balanceMinutes: number;
  triggerMinutes: number;
  longTriggerMinutes: number;
  crossed720: string | null;
  crossed4160: string | null;
  /** Past the heads-up and not yet crossed. */
  near: boolean;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The first day of a window of `months` ending `today`, not before the day work starts to count. */
const windowStart = (today: string, months: number, countsFrom: string) => [addDays(addMonths(today, -months), 1), countsFrom].sort(cmp)[1]!;

export function counters(args: { today: string; jurisdiction: string; rules: EqualPayRule[]; worked: WorkedDay[]; balances: OpeningBalance[]; crossings: CrossingOnFile[] }): CounterRow[] {
  const rule = args.rules.find((r) => r.jurisdiction === args.jurisdiction && isEffective(args.today, r.effectiveFrom, r.effectiveTo));
  if (!rule) return [];
  const from12 = windowStart(args.today, rule.windowMonths, rule.countsFrom);
  const from48 = windowStart(args.today, rule.longWindowMonths, rule.countsFrom);
  const rows = new Map<string, CounterRow>();
  const row = (workerId: string, clientId: string) => {
    const key = `${workerId}|${clientId}`;
    let r = rows.get(key);
    if (!r) {
      r = { workerId, clientId, minutes12: 0, windowStart12: from12, minutes48: 0, windowStart48: from48, balanceMinutes: 0, triggerMinutes: rule.triggerMinutes, longTriggerMinutes: rule.longTriggerMinutes, crossed720: null, crossed4160: null, near: false };
      rows.set(key, r);
    }
    return r;
  };
  const add = (workerId: string, clientId: string, date: string, minutes: number, balance: boolean) => {
    const r = row(workerId, clientId);
    if (date > args.today || minutes <= 0) return;
    if (date >= from12) r.minutes12 += minutes;
    if (date >= from48) {
      r.minutes48 += minutes;
      if (balance) r.balanceMinutes += minutes;
    }
  };
  for (const w of args.worked) add(w.workerId, w.clientId, w.date, w.minutes, false);
  for (const b of args.balances) add(b.workerId, b.clientId, b.throughOn, b.minutes, true);
  for (const c of args.crossings) {
    const r = row(c.workerId, c.clientId);
    if (c.kind === "il_equal_pay_720h") r.crossed720 = c.crossedOn;
    else r.crossed4160 = c.crossedOn;
  }
  for (const r of rows.values()) r.near = r.crossed720 === null && r.minutes12 > rule.warnMinutes;
  return [...rows.values()].sort((a, b) => b.minutes12 - a.minutes12 || cmp(a.workerId, b.workerId) || cmp(a.clientId, b.clientId));
}
