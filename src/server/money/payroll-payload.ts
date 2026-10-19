/**
 * The embedded-payroll handoff (SPEC §27 item 9; docs/patterns/money/payroll/[id].md): a locked run's
 * pay lines as the per-worker payload a payroll partner needs to pay hourly W-2 workers, shaped after
 * the Check payroll (`payroll` + `payroll_items` + `earnings`) and Zeal (`employeeCheck` + `shifts`)
 * objects recorded in docs/research/money-flows-slice-w.md. Nothing is sent: the payload is previewed,
 * approved and recorded as a handoff.
 *
 * Money stays integer cents. Only at the partner boundary do amounts become decimal strings with
 * exactly two places (Check: "720.00") or numbers (Zeal), and minutes become hours; every conversion
 * is integer arithmetic, and Zeal's own hours × wage is recomputed here so any cent it would differ by
 * is listed beside the line. Never holds an SSN or bank details: the partner collects them from the
 * worker in its own onboarding (Check `onboard.remaining_steps`), and only the last four of an SSN on
 * file is named. Pure.
 */
import { floorDiv, mod, roundHalfUpBig } from "@shiftbook/rules";

export const PAYLOAD_VERSION = "granite.payroll-handoff/1";

/** Tabulado's earning types → Check earning types (hours-bearing where Check requires hours). */
const CHECK_TYPES: Record<string, string | undefined> = {
  REG: "hourly",
  OT: "overtime",
  DT: "double_overtime",
  HOL: "paid_holiday",
  HOL_NOT_WORKED: "paid_holiday",
  BONUS: "bonus",
};
/** Types Check carries without hours. */
const AMOUNT_ONLY = new Set(["BONUS", "BONUS_OT"]);
/** Zeal shift earnings by Tabulado type; anything else goes in `amount_only` with a note. */
const ZEAL_TYPES: Record<string, "hourly" | "overtime" | "doubletime" | undefined> = { REG: "hourly", OT: "overtime", DT: "doubletime", HOL: "hourly", HOL_NOT_WORKED: "hourly" };

export interface PayloadWorker {
  id: string;
  firstName: string;
  lastName: string;
  hireDate: string | null;
  /** Only whether an SSN is on file and its last four; the number itself never enters a payload. */
  ssnLast4: string | null;
}

export interface PayloadWorkplace {
  id: string;
  name: string;
  state: string;
  county: string | null;
  city: string | null;
  address: string | null;
}

export interface PayloadLine {
  id: string;
  workerId: string;
  type: string;
  minutes: number;
  rate: { num: number; den: number };
  amountCents: number;
  workweekStart: string;
  workplaceId: string | null;
  clientId: string | null;
  clientName: string | null;
  wcClassCode: string | null;
  explain: string;
}

export interface PayloadInput {
  run: { id: string; version: number; periodStart: string; periodEnd: string; payday: string; rulesVersion: string; approvedAt: string | null };
  /** The gross the run was approved and exported at: the payload must equal it to the cent. */
  runGrossCents: number;
  workers: PayloadWorker[];
  workplaces: PayloadWorkplace[];
  lines: PayloadLine[];
  /**
   * Wage-access requests this payroll repays (their hours are in it): recovered by a deduction from the
   * worker's pay, as the CFPB opinion's covered EWA requires. Gross is unchanged; the partner nets it.
   */
  recoveries?: { workerId: string; handoffId: string; amountCents: number }[];
}

export interface EarningOut {
  line_id: string;
  granite_type: string;
  partner_type: string | null;
  /** Set when the partner has no matching type: the agency's own code for the line. */
  earning_code: string | null;
  minutes: number;
  /** Hours for the partner, two places, rounded half up (the amount is exact and authoritative). */
  hours: string | null;
  rate_per_hour: string;
  amount: string;
  amount_cents: number;
  workweek_start: string;
  workplace: string | null;
  client: string | null;
  wc_class_code: string | null;
  explain: string;
}

/** What Tabulado holds for the partner's onboarding, and what the partner collects from the worker. */
export interface Readiness {
  /** Missing in Tabulado: fix before handing off. */
  missing: ("start_date" | "workplace" | "ssn" | "covers_recovery")[];
  /** Never held by Tabulado; the partner's own onboarding collects these (Check `onboard`). */
  partnerCollects: ("dob" | "residence" | "payment_method" | "withholdings")[];
}

export interface EmployeeOut {
  external_id: string;
  first_name: string;
  last_name: string;
  start_date: string | null;
  ssn: { on_file: boolean; last_four: string | null };
  readiness: Readiness;
  earnings: EarningOut[];
  gross_cents: number;
  gross: string;
  /** Deductions Tabulado knows of: wage access repaid from this paycheck (taxes are the partner's). */
  deductions: { kind: "earned_wage_access_recovery"; handoff_id: string; amount: string; amount_cents: number }[];
}

export interface NeutralPayload {
  version: typeof PAYLOAD_VERSION;
  run: { id: string; version: number; period_start: string; period_end: string; payday: string; rules_version: string; approved_at: string | null };
  pay_frequency: "weekly";
  workplaces: { external_id: string; name: string; state: string; county: string | null; city: string | null; address: string | null }[];
  employees: EmployeeOut[];
  totals: { workers: number; lines: number; gross_cents: number; gross: string; minutes_by_type: Record<string, number> };
  reconciliation: { run_gross_cents: number; payload_gross_cents: number; equal: boolean };
}

export interface ZealDifference {
  line_id: string;
  worker: string;
  exact_cents: number;
  partner_cents: number;
  difference_cents: number;
}

export interface PayrollPayload {
  neutral: NeutralPayload;
  check: Record<string, unknown>;
  zeal: { checks: Record<string, unknown>[]; amount_only: { line_id: string; employee: string; type: string; amount: number }[]; differences: ZealDifference[] };
  /** True when nothing blocks the handoff: the totals reconcile and every worker has what Tabulado must supply. */
  ready: boolean;
}

/** 72050 → "720.50"; −150 → "-1.50". */
export function decimalCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${floorDiv(abs, 100)}.${String(mod(abs, 100)).padStart(2, "0")}`;
}

/** num/den scaled by 10^places, rounded half up, as a decimal string with exactly `places` places. */
function fixed(num: bigint, den: bigint, places: number): string {
  const scaled = roundHalfUpBig(num * 10n ** BigInt(places), den);
  const sign = scaled < 0 ? "-" : "";
  const abs = Math.abs(scaled);
  const unit = 10 ** places;
  return `${sign}${floorDiv(abs, unit)}.${String(mod(abs, unit)).padStart(places, "0")}`;
}

/** Minutes as hours, two places (Check). */
export const hoursOf = (minutes: number): string => fixed(BigInt(minutes), 60n, 2);
/** A rate in cents per hour (num/den) as dollars per hour, four places. */
export const ratePerHour = (rate: { num: number; den: number }): string => fixed(BigInt(rate.num), BigInt(rate.den) * 100n, 4);

/** Zeal's hours × wage in cents, from the four-place numbers we would send, rounded half up. */
function zealCents(minutes: number, rate: { num: number; den: number }): { hours: number; wage: number; cents: number } {
  const hours4 = roundHalfUpBig(BigInt(minutes) * 10_000n, 60n); // hours × 10^4
  const wage4 = roundHalfUpBig(BigInt(rate.num) * 10_000n, BigInt(rate.den) * 100n); // dollars × 10^4
  const cents = roundHalfUpBig(BigInt(hours4) * BigInt(wage4) * 100n, 100_000_000n);
  return { hours: hours4 / 10_000, wage: wage4 / 10_000, cents };
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function buildPayrollPayload(input: PayloadInput): PayrollPayload {
  const ref = (kind: string, id: string) => `granite:${kind}:${id}`;
  const workers = [...input.workers].sort((a, b) => cmp(a.lastName, b.lastName) || cmp(a.firstName, b.firstName) || cmp(a.id, b.id));
  const sites = new Map(input.workplaces.map((w) => [w.id, w]));
  const minutesByType: Record<string, number> = {};
  const employees: EmployeeOut[] = [];
  for (const w of workers) {
    const lines = input.lines.filter((l) => l.workerId === w.id).sort((a, b) => cmp(a.workweekStart, b.workweekStart) || cmp(a.type, b.type) || cmp(a.id, b.id));
    if (lines.length === 0) continue;
    const earnings: EarningOut[] = lines.map((l) => {
      minutesByType[l.type] = (minutesByType[l.type] ?? 0) + l.minutes;
      const partner = CHECK_TYPES[l.type] ?? null;
      return {
        line_id: l.id,
        granite_type: l.type,
        partner_type: partner,
        earning_code: partner ? null : l.type,
        minutes: l.minutes,
        hours: AMOUNT_ONLY.has(l.type) ? null : hoursOf(l.minutes),
        rate_per_hour: ratePerHour(l.rate),
        amount: decimalCents(l.amountCents),
        amount_cents: l.amountCents,
        workweek_start: l.workweekStart,
        workplace: l.workplaceId ? ref("worksite", l.workplaceId) : null,
        client: l.clientId ? ref("client", l.clientId) : null,
        wc_class_code: l.wcClassCode,
        explain: l.explain,
      };
    });
    const gross = earnings.reduce((t, e) => t + e.amount_cents, 0);
    const missing: Readiness["missing"] = [];
    if (!w.hireDate) missing.push("start_date");
    if (lines.some((l) => !l.workplaceId)) missing.push("workplace");
    if (!w.ssnLast4) missing.push("ssn");
    // A repayment larger than the pay would leave a negative paycheck (money review B2): held.
    const recovering = (input.recoveries ?? []).filter((r) => r.workerId === w.id).reduce((t, r) => t + r.amountCents, 0);
    const earned = lines.reduce((t, l) => t + l.amountCents, 0);
    if (recovering > earned) missing.push("covers_recovery");
    employees.push({
      external_id: ref("worker", w.id),
      first_name: w.firstName,
      last_name: w.lastName,
      start_date: w.hireDate,
      ssn: { on_file: w.ssnLast4 !== null, last_four: w.ssnLast4 },
      readiness: { missing, partnerCollects: ["dob", "residence", "payment_method", "withholdings"] },
      earnings,
      gross_cents: gross,
      gross: decimalCents(gross),
      deductions: (input.recoveries ?? [])
        .filter((r) => r.workerId === w.id)
        .sort((a, b) => cmp(a.handoffId, b.handoffId))
        .map((r) => ({ kind: "earned_wage_access_recovery" as const, handoff_id: r.handoffId, amount: decimalCents(r.amountCents), amount_cents: r.amountCents })),
    });
  }
  const payloadGross = employees.reduce((t, e) => t + e.gross_cents, 0);
  const lineCount = employees.reduce((t, e) => t + e.earnings.length, 0);
  const usedSites = [...new Set(input.lines.map((l) => l.workplaceId).filter((x): x is string => x !== null))].sort();
  const neutral: NeutralPayload = {
    version: PAYLOAD_VERSION,
    run: { id: input.run.id, version: input.run.version, period_start: input.run.periodStart, period_end: input.run.periodEnd, payday: input.run.payday, rules_version: input.run.rulesVersion, approved_at: input.run.approvedAt },
    pay_frequency: "weekly",
    workplaces: usedSites.map((id) => sites.get(id)).filter((x): x is PayloadWorkplace => x !== undefined).map((s) => ({ external_id: ref("worksite", s.id), name: s.name, state: s.state, county: s.county, city: s.city, address: s.address })),
    employees,
    totals: { workers: employees.length, lines: lineCount, gross_cents: payloadGross, gross: decimalCents(payloadGross), minutes_by_type: Object.fromEntries(Object.entries(minutesByType).sort(([a], [b]) => cmp(a, b))) },
    reconciliation: { run_gross_cents: input.runGrossCents, payload_gross_cents: payloadGross, equal: payloadGross === input.runGrossCents },
  };

  // Check: one payroll with an item per employee (docs.checkhq.com/reference/payroll).
  const check = {
    company: "granite:agency",
    period_start: input.run.periodStart,
    period_end: input.run.periodEnd,
    payday: input.run.payday,
    pay_frequency: "weekly",
    items: employees.map((e) => ({
      employee: e.external_id,
      earnings: e.earnings.map((x) => ({
        ...(x.partner_type ? { type: x.partner_type } : { earning_code: x.earning_code }),
        ...(x.hours !== null ? { hours: x.hours } : {}),
        amount: x.amount,
        ...(x.workplace ? { workplace: x.workplace } : {}),
        description: x.explain,
        metadata: { granite_line: x.line_id, granite_type: x.granite_type, ...(x.wc_class_code ? { wc_class_code: x.wc_class_code } : {}) },
      })),
      // Check's post-tax deductions are created in the partner first; the recovery travels as data for it.
      metadata: { granite_run: input.run.id, granite_run_version: String(input.run.version), ...(e.deductions.length > 0 ? { wage_access_recovery: decimalCents(e.deductions.reduce((t, d) => t + d.amount_cents, 0)) } : {}) },
    })),
    metadata: { granite_payload: PAYLOAD_VERSION },
  };

  // Zeal: one employee check per worker with a shift per line (docs.zeal.com employeeCheck, shifts).
  const differences: ZealDifference[] = [];
  const amountOnly: PayrollPayload["zeal"]["amount_only"] = [];
  const checks = employees.map((e) => ({
    companyID: "granite:agency",
    employeeID: e.external_id,
    reportingPeriodID: ref("period", `${input.run.periodStart}_${input.run.periodEnd}`),
    check_date: input.run.payday,
    approval_required: true,
    shifts: e.earnings.flatMap((x) => {
      const kind = ZEAL_TYPES[x.granite_type];
      const line = input.lines.find((l) => l.id === x.line_id)!;
      if (!kind) {
        amountOnly.push({ line_id: x.line_id, employee: e.external_id, type: x.granite_type, amount: x.amount_cents / 100 });
        return [];
      }
      const z = zealCents(x.minutes, line.rate);
      if (z.cents !== x.amount_cents) differences.push({ line_id: x.line_id, worker: e.external_id, exact_cents: x.amount_cents, partner_cents: z.cents, difference_cents: z.cents - x.amount_cents });
      return [
        {
          time: `${x.workweek_start}T12:00:00Z`,
          [kind]: { hours: z.hours, wage: z.wage, ...(x.granite_type.startsWith("HOL") ? { custom_name: x.granite_type } : {}) },
          ...(x.workplace ? { workLocationID: x.workplace } : {}),
          ...(x.client ? { customerAccountID: x.client } : {}),
          ...(x.wc_class_code ? { wcc_code: x.wc_class_code } : {}),
          metadata: { granite_line: x.line_id, amount_cents: String(x.amount_cents) },
        },
      ];
    }),
    metadata: { granite_run: input.run.id, ...(e.deductions.length > 0 ? { wage_access_recovery: decimalCents(e.deductions.reduce((t, d) => t + d.amount_cents, 0)) } : {}) },
  }));

  const ready = neutral.reconciliation.equal && employees.length > 0 && employees.every((e) => e.readiness.missing.length === 0);
  return { neutral, check, zeal: { checks, amount_only: amountOnly, differences }, ready };
}

/** The payload as the bytes a file holds (stable key order as built; two-space JSON, final newline). */
export const payloadBytes = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
