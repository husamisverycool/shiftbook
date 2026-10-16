/**
 * RULE: Illinois equal pay for day and temporary laborers — paying the equal-pay rate.
 *
 * - 820 ILCS 175/42(a) (P.A. 103-1030, eff. 2024-08-09): after more than 720 hours at the same third
 *   party client within 12 months, pay "not less than the straight-time hourly rate of pay or hourly
 *   equivalent of the lowest paid directly hired comparator employee" with the same or substantially
 *   similar seniority ((1)(A)), or with none, the lowest paid direct hire with the closest seniority
 *   ((1)(B)); at the client's sole discretion, the OEWS median base hourly rate for the job and area
 *   ((2)(A)), or after more than 4,160 hours within 48 months the 75th percentile ((2)(B)).
 * - § 42(b): substantially similar benefits, or "the hourly average cash equivalent of the actual cost
 *   of the benefits" in lieu of them.
 * - § 42(c); 56 Ill. Adm. Code 260.445, 260.505(b): the client supplies the data, before the
 *   laborer's next pay period begins.
 *
 * The client's figures are entered as dated rows per worker and client (one comparator for all the
 * worker's covered jobs at that client). From a rate row's date, a covered shift's pay rate — day and
 * temporary labor at a worksite whose state has the equal-pay rule in force that day — is raised to
 * at least the rate plus the benefits' hourly cash value; cash paid in lieu of benefits is pay, so it
 * is in the regular rate and overtime follows it (the safe reading; counsel may say otherwise). The
 * rate in force is the latest rate row on or before the date: a request ("asked") never lowers pay; it
 * only records that the figures were asked for (the run then pays the rate card and a correction trues
 * it up). Pure; amounts are integer cents.
 */
import { isIsoDate } from "../dates";
import { formatCents } from "../format";
import type { IsoDate, Shift } from "../types";

export type EqualPayMethod = "comparator" | "closest_seniority" | "survey_median" | "survey_75th";

export interface EqualPayRate {
  workerId: string;
  clientId: string;
  effectiveFrom: IsoDate;
  /** "rate": the client's figures are in; "asked": the client was asked on effectiveFrom and they are not in yet. */
  kind: "rate" | "asked";
  /** The comparator's (or the survey's) straight-time hourly rate, in cents; null when only asked. */
  rateCents: number | null;
  /** The hourly cash value of benefits paid in lieu of them, in cents (0 when the benefits are given). */
  benefitsCents: number | null;
  method: EqualPayMethod | null;
}

/** Highest rate a person may enter, the rate and the benefits together: $100,000 an hour, as for rate cards. */
const MAX_CENTS = 10_000_000;

const METHOD_TEXT: Record<EqualPayMethod, string> = {
  comparator: "the comparable direct hire's rate",
  closest_seniority: "the rate of the direct hire with the closest seniority",
  survey_median: "the area's median wage for the job (BLS OEWS)",
  survey_75th: "the area's 75th-percentile wage for the job (BLS OEWS)",
};

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** What is wrong with a row, or null. */
export function equalPayRateProblem(r: EqualPayRate): string | null {
  if (typeof r.effectiveFrom !== "string" || !isIsoDate(r.effectiveFrom)) return "the date is not a real calendar date";
  if (r.kind !== "rate" && r.kind !== "asked") return "kind must be rate or asked";
  if (r.kind === "asked") return r.rateCents === null && r.benefitsCents === null && r.method === null ? null : "a request has no figures";
  if (!Number.isSafeInteger(r.rateCents) || r.rateCents! <= 0) return "the rate must be a positive number of cents";
  if (!Number.isSafeInteger(r.benefitsCents) || r.benefitsCents! < 0) return "the benefits' cash value must be zero or more cents";
  if (r.rateCents! + r.benefitsCents! > MAX_CENTS) return "the rate and the benefits together must be at most $100,000 an hour";
  if (r.method === null || !(r.method in METHOD_TEXT)) return "the method must be named";
  return null;
}

/** Two rows for the same worker, client and date: which to use would be a guess. */
export function duplicateEqualPayRates(rates: EqualPayRate[]): EqualPayRate[] {
  const seen = new Map<string, number>();
  for (const r of rates) seen.set(`${r.workerId}|${r.clientId}|${r.effectiveFrom}`, (seen.get(`${r.workerId}|${r.clientId}|${r.effectiveFrom}`) ?? 0) + 1);
  return rates.filter((r) => (seen.get(`${r.workerId}|${r.clientId}|${r.effectiveFrom}`) ?? 0) > 1);
}

/** The rate in force for a worker at a client on a date: the latest rate row on or before it (requests never count). */
export function rateInForce(rates: EqualPayRate[], workerId: string, clientId: string, date: IsoDate): EqualPayRate | null {
  return (
    rates
      .filter((r) => r.kind === "rate" && r.workerId === workerId && r.clientId === clientId && r.effectiveFrom <= date)
      .sort((a, b) => cmp(b.effectiveFrom, a.effectiveFrom))[0] ?? null
  );
}

/** The latest request for the client's figures for a worker at a client, whatever its date. */
export function latestRequest(rates: EqualPayRate[], workerId: string, clientId: string): EqualPayRate | null {
  return (
    rates
      .filter((r) => r.kind === "asked" && r.workerId === workerId && r.clientId === clientId)
      .sort((a, b) => cmp(b.effectiveFrom, a.effectiveFrom))[0] ?? null
  );
}

/**
 * The shifts with their pay rate raised to the equal-pay rate where one is in force and higher, each
 * saying why; only shifts `covered` says the Act applies to (the caller: Illinois day and temporary
 * labor on a day the rule is in force, a shift otherwise valid).
 */
export function applyEqualPayRates(shifts: Shift[], rates: EqualPayRate[], covered: (s: Shift) => boolean): Shift[] {
  if (!rates.some((r) => r.kind === "rate")) return shifts;
  return shifts.map((s) => {
    if (!covered(s)) return s;
    const r = rateInForce(rates, s.workerId, s.clientId, s.date);
    if (!r || r.rateCents === null || r.method === null) return s;
    const benefits = r.benefitsCents ?? 0;
    const floor = r.rateCents + benefits;
    if (floor <= s.payRateCents) return s;
    const sum = benefits > 0 ? `${formatCents(r.rateCents)} + the benefits' hourly cash value ${formatCents(benefits)} = ${formatCents(floor)}` : formatCents(floor);
    return { ...s, payRateCents: floor, payRateExplain: `Illinois equal pay from ${r.effectiveFrom} (820 ILCS 175/42(a)${benefits > 0 ? ", (b)" : ""}): ${METHOD_TEXT[r.method]} ${sum}, above the rate card's ${formatCents(s.payRateCents)}.` };
  });
}
