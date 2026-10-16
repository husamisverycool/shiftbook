/**
 * Overtime the agency paid but did not bill at the overtime multiplier (SPEC §15; slice i, decision
 * I7), per client, worker and week. The weekly run already bills every paid overtime minute, so what
 * leaks is the premium on the minutes the client's terms bill at straight time or not at all
 * (`bill_overtime_straight`, `bill_overtime_own_sites_straight`, `bill_overtime_not_billable`). The
 * premium is the worker's for the week, per minute: one third of overtime pay, one half of double
 * time (the pay's multiplier is 1.5 or 2 by law); the row's total is rounded once.
 */
import { formatCents, formatDuration, roundHalfUpBig } from "@shiftbook/rules";

export interface OvertimePay {
  workerId: string;
  week: string;
  type: "OT" | "DT";
  minutes: number;
  amountCents: number;
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
}

const PREMIUM = { OT: { num: 1n, den: 3n, text: "1/3", word: "one third" }, DT: { num: 1n, den: 2n, text: "1/2", word: "one half" } } as const;
const STRAIGHT = new Set(["bill_overtime_straight", "bill_overtime_own_sites_straight"]);

export function overtimeRows(pay: OvertimePay[], bill: OvertimeBill[]): OvertimeRow[] {
  const paid = new Map<string, { minutes: number; cents: number }>();
  for (const p of pay) {
    const k = `${p.workerId}|${p.week}|${p.type}`;
    const cur = paid.get(k) ?? { minutes: 0, cents: 0 };
    paid.set(k, { minutes: cur.minutes + p.minutes, cents: cur.cents + p.amountCents });
  }
  const rows = new Map<string, { row: Omit<OvertimeRow, "premiumNotBilledCents" | "explain">; leaked: { type: "OT" | "DT"; minutes: number; how: string }[] }>();
  for (const b of bill) {
    const k = `${b.clientId}|${b.workerId}|${b.week}`;
    const r = rows.get(k) ?? { row: { clientId: b.clientId, workerId: b.workerId, week: b.week, paidMinutes: 0, multiplierMinutes: 0, straightMinutes: 0, notBilledMinutes: 0, reasons: [] }, leaked: [] };
    r.row.paidMinutes += b.minutes;
    if (b.ruleId === "bill_overtime_multiplier") r.row.multiplierMinutes += b.minutes;
    else {
      if (STRAIGHT.has(b.ruleId)) r.row.straightMinutes += b.minutes;
      else r.row.notBilledMinutes += b.minutes;
      if (!r.row.reasons.includes(b.ruleId)) r.row.reasons.push(b.ruleId);
      r.leaked.push({ type: b.type, minutes: b.minutes, how: STRAIGHT.has(b.ruleId) ? "billed at straight time" : "not billed" });
    }
    rows.set(k, r);
  }
  return [...rows.values()]
    .map(({ row, leaked }) => {
      // Σ minutes × pay × premium share ÷ paid minutes, over one denominator.
      let num = 0n;
      let den = 1n;
      const steps: string[] = [];
      for (const l of leaked) {
        const w = paid.get(`${row.workerId}|${row.week}|${l.type}`);
        if (!w || w.minutes <= 0) continue;
        const share = PREMIUM[l.type];
        const n = BigInt(w.cents) * share.num * BigInt(l.minutes);
        const d = share.den * BigInt(w.minutes);
        num = num * d + n * den;
        den = den * d;
        steps.push(`${formatDuration(l.minutes)} ${l.how}: premium not billed ${formatCents(w.cents)} × ${share.text} × ${l.minutes}/${w.minutes} min`);
      }
      const premiumNotBilledCents = roundHalfUpBig(num, den);
      const types = (["OT", "DT"] as const).filter((t) => paid.has(`${row.workerId}|${row.week}|${t}`));
      const intro = types
        .map((t) => {
          const w = paid.get(`${row.workerId}|${row.week}|${t}`)!;
          return `${t === "OT" ? "Overtime" : "Double time"} paid this week: ${formatDuration(w.minutes)} for ${formatCents(w.cents)}, ${PREMIUM[t].word} of it the premium (${formatCents(roundHalfUpBig(BigInt(w.cents) * PREMIUM[t].num, PREMIUM[t].den))}).`;
        })
        .join(" ");
      const tail = steps.length === 0 ? "All of it billed at the overtime multiplier." : `${steps.join("; ")} = ${formatCents(premiumNotBilledCents)}.`;
      return { ...row, premiumNotBilledCents, explain: `${intro} ${tail}`.trim() };
    })
    .sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0));
}
