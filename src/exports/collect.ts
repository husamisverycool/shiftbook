/**
 * The checks every payroll file after Gusto shares (SPEC §13; slice f): each worker once with an id
 * in the target system, every line a kind of pay the file can carry under a code the agency set, and
 * — where the target multiplies a rate it stores — every hours line exactly that rate times the
 * file's multiple. A refusal names the worker, so the run can offer to skip them (pay by hand).
 */
import { addDays, exactDecimal, formatRate, type EarningType, type Fraction } from "@shiftbook/rules";
import { ExportError } from "./errors";
import { checkAmountLine, checkLine, cmp, eachLine, sameRate, sortKey, times } from "./lines";
import type { ExportFixture, ExportPayLine, ExportWorker } from "./registry";
import { defaultAs, FILE_OF, idKey, KIND_RULES, SYSTEM_NAME, SYSTEM_OF, WORKER_ID_NAME, workerIdProblem, type CarriedAs, type ExportFormat, type PayrollTarget } from "./targets";

/** Plain names for the kinds of pay, used in refusals. */
export const KIND_TEXT: Record<EarningType, string> = {
  REG: "regular hours",
  OT: "overtime",
  DT: "double time",
  MW_TRUEUP: "a minimum-wage top-up (the rate card is below the minimum wage)",
  REPORTING_PAY: "reporting-time pay for a short day",
  HOL: "a holiday premium for hours worked on a holiday",
  HOL_NOT_WORKED: "holiday pay for a holiday not worked",
  DIFF: "a shift differential",
  MEAL_PREMIUM: "a meal-period premium",
  REST_PREMIUM: "a rest-period premium",
  MIN_GUARANTEE: "a day-labor minimum for a short day",
  BONUS: "a bonus",
  BONUS_OT: "overtime on a flat-sum bonus",
};

/** How one line travels: as hours under a code at a multiple of the rate, or as dollars under a code. */
export interface Bucket {
  as: CarriedAs;
  /** The code or the file's column. */
  code: string;
  /** For hours: the multiple the target applies to the rate it uses. */
  factor: Fraction;
}

export interface CollectedLine {
  line: ExportPayLine;
  bucket: Bucket;
}

export interface CollectedWorker {
  worker: ExportWorker;
  /** The worker's id (or exact name) in the target system. */
  id: string;
  lines: CollectedLine[];
  /** Where the target pays a stored rate: the worker's one base rate (the rate × 1 every hours line comes from). */
  base: Fraction | null;
}

export interface Collected {
  workers: CollectedWorker[];
  minutesByType: Record<string, number>;
  amountsByType: Record<string, number>;
  grossCents: number;
}

export const who = (w: ExportWorker) => `${w.lastName}, ${w.firstName}`;

/** The target's options, checked to be for this format. */
export function targetOf<F extends ExportFormat>(fixture: ExportFixture, format: F): Extract<PayrollTarget, { format: F }> {
  if (fixture.target?.format !== format) throw new ExportError("unknown_format", `The payroll file settings are for ${fixture.target?.format ?? "no system"}, not ${format}.`);
  return fixture.target as Extract<PayrollTarget, { format: F }>;
}

/**
 * Every line checked and placed; workers sorted by name then id.
 * `storedRate`: the target multiplies a rate it keeps for the worker (QuickBooks, RUN), so every
 * hours line must be that one rate × the file's multiple; in a correction, the rate is the worker's
 * one regular rate in the whole period (`referenceRates`).
 */
export function collect(fixture: ExportFixture, format: ExportFormat, opts: { storedRate: boolean; carries: string }): Collected {
  const system = SYSTEM_OF[format];
  const name = SYSTEM_NAME[system];
  const rules = KIND_RULES[format];
  const byHand = system === "spreadsheet" ? "pay it by hand" : `pay it in ${name} by hand`;
  const byId = new Map<string, ExportWorker>();
  const bySystemId = new Map<string, ExportWorker>();
  for (const w of fixture.workers) {
    if (byId.has(w.workerId)) throw new ExportError("duplicate_payroll_id", `${who(w)} is listed twice in the run's workers, so which ${WORKER_ID_NAME[system]} to use would be a guess.`);
    byId.set(w.workerId, w);
    const id = w.payrollIds[system]?.id;
    if (!id) continue;
    const key = idKey(system, id);
    const other = bySystemId.get(key);
    if (other) {
      throw new ExportError("duplicate_payroll_id", `${who(other)} and ${who(w)} both have ${WORKER_ID_NAME[system]} ${id}; ${name} would put both workers' pay on one person.`);
    }
    bySystemId.set(key, w);
  }

  const out = new Map<string, CollectedWorker>();
  const minutesByType: Record<string, number> = {};
  const amountsByType: Record<string, number> = {};
  let grossCents = 0;
  const correction = fixture.correction !== undefined;

  eachLine(fixture.payLines, (line) => {
    const worker = byId.get(line.workerId);
    if (!worker) throw new ExportError("missing_payroll_id", `Pay line for unknown worker ${line.workerId}.`);
    const rule = rules[line.type];
    if (!rule) {
      throw new ExportError("unsupported_earning_type", `${who(worker)}: ${FILE_OF[system]} carries ${opts.carries} only, so it cannot carry ${KIND_TEXT[line.type]}. Skip this worker and ${byHand}.`);
    }
    const saved = fixture.codes?.[line.type];
    // A fixed column keeps the multiple the agency declared for it (ADP's O/T Hours).
    const mapped = rule.blank === "fixed" ? { code: (rule.hours?.column ?? rule.dollars?.column)!, as: rule.hours ? ("hours" as const) : ("dollars" as const), factor: saved?.factor } : saved;
    const savedCode = typeof mapped?.code === "string" ? mapped.code : "";
    // A line with no minutes is money only (a bonus): it can only travel as dollars.
    // With no code set, a format that falls back to Shiftbook's own code sends the kind its default way.
    const fallback: CarriedAs | undefined = rule.blank === "own_code" ? (line.minutes > 0 ? defaultAs(format, line.type) : "dollars") : undefined;
    const as: CarriedAs | undefined = line.minutes === 0 && rule.dollars ? "dollars" : (mapped?.as ?? fallback);
    const way = as === "hours" ? rule.hours : as === "dollars" ? rule.dollars : undefined;
    const code = way?.column ?? (savedCode || (rule.blank === "own_code" ? line.type : ""));
    if (!way || !code) {
      throw new ExportError(
        "unsupported_earning_type",
        `${who(worker)}: ${KIND_TEXT[line.type]} has no ${name} code${savedCode && !way ? " for the way it is paid" : ""}. Set it in the payroll file settings, or skip this worker and pay it by hand.`,
      );
    }
    const id = worker.payrollIds[system]?.id;
    if (!id) throw new ExportError("missing_payroll_id", `${who(worker)} has no ${WORKER_ID_NAME[system]}, so ${name} cannot match the row.`);
    const bad = workerIdProblem(system, id, worker.payrollIds[system]?.title);
    if (bad?.field === "id") throw new ExportError("missing_payroll_id", `${who(worker)}: the ${WORKER_ID_NAME[system]} "${id}" cannot be used. ${bad.message}`);
    if (as === "dollars" && line.minutes === 0) checkAmountLine(line, who(worker));
    else checkLine(line, who(worker), correction);
    const factor = as === "hours" ? (rule.hours!.declared ? (mapped?.factor ?? rule.hours!.factor) : rule.hours!.factor) : { num: 1, den: 1 };
    const entry = out.get(worker.workerId) ?? { worker, id, lines: [], base: null };
    entry.lines.push({ line, bucket: { as: as!, code, factor } });
    out.set(worker.workerId, entry);
    if (as === "hours") minutesByType[line.type] = (minutesByType[line.type] ?? 0) + line.minutes;
    else amountsByType[line.type] = (amountsByType[line.type] ?? 0) + line.amountCents;
    grossCents += line.amountCents;
  });

  if (opts.storedRate) {
    for (const entry of out.values()) {
      const hours = entry.lines.filter((l) => l.bucket.as === "hours");
      if (hours.length === 0) continue;
      const reference = correction ? fixture.referenceRates?.[entry.worker.workerId] : undefined;
      if (correction && !reference) {
        throw new ExportError("several_pay_rates", `${who(entry.worker)} has more than one pay rate this period, so the hours this correction adds cannot be matched to the rate ${name} pays. Pay the difference by hand.`, entry.worker.workerId);
      }
      // The rate the target stores is the regular rate, however regular pay travels; with no regular
      // pay at all only kinds paid at the stored rate × 1 (holiday pay) can say what it is.
      const baseOf = (l: CollectedLine) => ({ num: l.line.rate.num * l.bucket.factor.den, den: l.line.rate.den * l.bucket.factor.num });
      const regular = entry.lines.filter((l) => l.line.type === "REG");
      const premium = hours.find((l) => !sameRate(l.bucket.factor, { num: 1, den: 1 }));
      if (!reference && regular.length === 0 && premium) {
        throw new ExportError(
          "several_pay_rates",
          `${who(entry.worker)} has ${KIND_TEXT[premium.line.type]} but no regular hours, so the stored rate ${name} multiplies is unknown. Skip this worker and pay them by hand.`,
          entry.worker.workerId,
        );
      }
      const reg = regular[0];
      if (!reference && reg && regular.some((l) => !sameRate(l.line.rate, reg.line.rate))) {
        throw new ExportError("several_pay_rates", `${who(entry.worker)} has more than one pay rate this period; ${name} pays one stored rate per worker, so this worker cannot go in the file. Skip them and pay them by hand.`, entry.worker.workerId);
      }
      const base = reference ?? (reg ? reg.line.rate : baseOf(hours[0]!));
      for (const l of hours) {
        if (sameRate(baseOf(l), base)) continue;
        const expected = times(base, l.bucket.factor);
        throw new ExportError(
          "several_pay_rates",
          l.line.type === "REG" || sameRate(l.bucket.factor, { num: 1, den: 1 })
            ? reference
              ? `${who(entry.worker)}: this correction adds ${KIND_TEXT[l.line.type]} at ${formatRate(l.line.rate)}, but ${name} pays this worker's stored rate (${formatRate(reference)} this period). Pay the difference by hand.`
              : `${who(entry.worker)} has more than one pay rate this period; ${name} pays one stored rate per worker, so this worker cannot go in the file. Skip them and pay them by hand.`
            : `${who(entry.worker)}: ${KIND_TEXT[l.line.type]} is paid at ${formatRate(l.line.rate)}, because the week's regular rate includes more than the hourly rate (a second pay rate, a bonus, a holiday premium or a minimum-wage top-up), but ${name} pays it at ${exactDecimal(l.bucket.factor.num, l.bucket.factor.den)} × the stored rate (${formatRate(expected)}). Skip this worker and pay them by hand.`,
          entry.worker.workerId,
        );
      }
      entry.base = base;
    }
  }

  const workers = [...out.values()].sort((a, b) => cmp(sortKey(a.worker.lastName), sortKey(b.worker.lastName)) || cmp(sortKey(a.worker.firstName), sortKey(b.worker.firstName)) || cmp(a.id, b.id));
  return { workers, minutesByType, amountsByType, grossCents };
}

/** The correction note every file carries (decision F8; E9 for Gusto). */
export function correctionNote(fixture: ExportFixture, system: string): string[] {
  return fixture.correction
    ? [
        `Correction ${fixture.correction.version} of this pay period: only the differences against version ${fixture.correction.baseVersion}, all of them additions. Import it into the ${system} payroll that pays them (the next regular payroll or an off-cycle payroll); it does not replace the file for version ${fixture.correction.baseVersion}.`,
      ]
    : [];
}

/** Lines' workweek for dated files: the week's last day, or the period's last day when unknown. */
export function weekEnd(fixture: ExportFixture, line: ExportPayLine): string {
  if (!line.workweekStart) return fixture.period.endsOn;
  const end = addDays(line.workweekStart, 6);
  return end > fixture.period.endsOn ? fixture.period.endsOn : end;
}

/** The order kinds of pay are listed in, everywhere. */
export const KIND_ORDER: readonly EarningType[] = ["REG", "OT", "DT", "MW_TRUEUP", "REPORTING_PAY", "HOL", "HOL_NOT_WORKED", "DIFF", "MEAL_PREMIUM", "REST_PREMIUM", "MIN_GUARANTEE", "BONUS", "BONUS_OT"];

export interface CodeTotal {
  code: string;
  as: CarriedAs;
  factor: Fraction;
  types: EarningType[];
  minutes: number;
  amountCents: number;
  /** Shiftbook lines added up (each rounded once). */
  lines: number;
}

/** A worker's lines added up per code, in kind order. */
export function totalsByCode(w: CollectedWorker): CodeTotal[] {
  const out = new Map<string, CodeTotal>();
  for (const { line, bucket } of w.lines) {
    const key = `${bucket.as}|${bucket.code}`;
    const t = out.get(key) ?? { code: bucket.code, as: bucket.as, factor: bucket.factor, types: [], minutes: 0, amountCents: 0, lines: 0 };
    if (!t.types.includes(line.type)) t.types.push(line.type);
    t.minutes += line.minutes;
    t.amountCents += line.amountCents;
    t.lines += 1;
    out.set(key, t);
  }
  const rank = (t: CodeTotal) => Math.min(...t.types.map((k) => KIND_ORDER.indexOf(k)));
  return [...out.values()].sort((a, b) => rank(a) - rank(b) || cmp(a.code, b.code));
}

/** Something of this worker's goes in the file: hours to carry, or dollars that are not zero. */
export const writesSomething = (w: CollectedWorker) => w.lines.some((l) => (l.bucket.as === "hours" ? l.line.minutes : l.line.amountCents) !== 0);
