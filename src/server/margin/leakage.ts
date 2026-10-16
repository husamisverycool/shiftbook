/**
 * Overtime the agency paid but did not bill at the overtime multiplier (SPEC §15; slice i, decision
 * I7), per client, worker and week. The weekly run already bills every paid overtime minute, so what
 * leaks is the premium on the minutes the client's terms bill at straight time or not at all
 * (`bill_overtime_straight`, `bill_overtime_own_sites_straight`, `bill_overtime_not_billable`). The
 * premium is the worker's for the week, per minute: the part of the pay above straight time, from
 * each pay line's overtime rule multiplier ((m − 1)/m of the pay); the row's total is rounded once.
 */
import { formatCents, roundHalfUpBig } from "@shiftbook/rules";
import { explained, nest, say, semicolons, type Said, type SaidValue } from "../said";

export interface OvertimePay {
  workerId: string;
  week: string;
  type: "OT" | "DT";
  minutes: number;
  amountCents: number;
  /** The pay line's overtime rule multiplier, or null when none is on file (no premium counted). */
  multiplier: { num: number; den: number } | null;
}

export interface OvertimeBill {
  workerId: string;
  week: string;
  clientId: string;
  type: "OT" | "DT";
  minutes: number;
  ruleId: string;
}

export interface OvertimeRow {
  clientId: string;
  workerId: string;
  week: string;
  paidMinutes: number;
  multiplierMinutes: number;
  straightMinutes: number;
  notBilledMinutes: number;
  premiumNotBilledCents: number;
  /** The client's terms behind what was not billed at the multiplier, in the order met. */
  reasons: string[];
  explain: string;
  /** The working as message keys for the reader's language (decision 0030). */
  said: Said;
}

const STRAIGHT = new Set(["bill_overtime_straight", "bill_overtime_own_sites_straight"]);
interface Paid {
  minutes: number;
  cents: number;
  /** The premium paid, as an exact fraction of cents. */
  premium: { num: bigint; den: bigint };
}

/** a/b + c/d over one denominator. */
const add = (x: { num: bigint; den: bigint }, n: bigint, d: bigint) => ({ num: x.num * d + n * x.den, den: x.den * d });

export function overtimeRows(pay: OvertimePay[], bill: OvertimeBill[]): OvertimeRow[] {
  const paid = new Map<string, Paid>();
  for (const p of pay) {
    const k = `${p.workerId}|${p.week}|${p.type}`;
    const cur = paid.get(k) ?? { minutes: 0, cents: 0, premium: { num: 0n, den: 1n } };
    const m = p.multiplier;
    const premium = m && m.num > m.den ? add(cur.premium, BigInt(p.amountCents) * BigInt(m.num - m.den), BigInt(m.num)) : cur.premium;
    paid.set(k, { minutes: cur.minutes + p.minutes, cents: cur.cents + p.amountCents, premium });
  }
  const rows = new Map<string, { row: Omit<OvertimeRow, "premiumNotBilledCents" | "explain" | "said">; leaked: { type: "OT" | "DT"; minutes: number; straight: boolean }[] }>();
  for (const b of bill) {
    const k = `${b.clientId}|${b.workerId}|${b.week}`;
    const r = rows.get(k) ?? { row: { clientId: b.clientId, workerId: b.workerId, week: b.week, paidMinutes: 0, multiplierMinutes: 0, straightMinutes: 0, notBilledMinutes: 0, reasons: [] }, leaked: [] };
    r.row.paidMinutes += b.minutes;
    if (b.ruleId === "bill_overtime_multiplier") r.row.multiplierMinutes += b.minutes;
    else {
      if (STRAIGHT.has(b.ruleId)) r.row.straightMinutes += b.minutes;
      else r.row.notBilledMinutes += b.minutes;
      if (!r.row.reasons.includes(b.ruleId)) r.row.reasons.push(b.ruleId);
      r.leaked.push({ type: b.type, minutes: b.minutes, straight: STRAIGHT.has(b.ruleId) });
    }
    rows.set(k, r);
  }
  return [...rows.values()]
    .map(({ row, leaked }) => {
      // Σ the week's premium × leaked minutes ÷ paid minutes, over one denominator.
      let total = { num: 0n, den: 1n };
      const steps: SaidValue[] = [];
      for (const l of leaked) {
        const w = paid.get(`${row.workerId}|${row.week}|${l.type}`);
        if (!w || w.minutes <= 0) continue;
        total = add(total, w.premium.num * BigInt(l.minutes), w.premium.den * BigInt(w.minutes));
        const values = { duration: { duration: l.minutes }, premium: formatCents(roundHalfUpBig(w.premium.num, w.premium.den)), minutes: String(l.minutes), paid: String(w.minutes) };
        steps.push(nest(say(l.straight ? "leakStraight" : "leakNotBilled", values)));
      }
      const premiumNotBilledCents = roundHalfUpBig(total.num, total.den);
      const types = (["OT", "DT"] as const).filter((t) => paid.has(`${row.workerId}|${row.week}|${t}`));
      // Each kind paid, then what was not billed at the multiplier, a sentence each (one space between).
      const intro = types.map((t) => {
        const w = paid.get(`${row.workerId}|${row.week}|${t}`)!;
        return say(t === "OT" ? "overtimePaidWeek" : "doubleTimePaidWeek", { duration: { duration: w.minutes }, amount: formatCents(w.cents), premium: formatCents(roundHalfUpBig(w.premium.num, w.premium.den)) });
      });
      const tail = steps.length === 0 ? say("leakAllBilled") : say("leakTotal", { steps: semicolons(steps), total: formatCents(premiumNotBilledCents) });
      const said: Said = [...intro, tail].flatMap((p, i) => (i === 0 ? [p] : [say("gap"), p]));
      return { ...row, premiumNotBilledCents, ...explained(said) };
    })
    .sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0));
}
