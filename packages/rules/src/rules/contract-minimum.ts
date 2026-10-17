/**
 * RULE: a contractual minimum-hours guarantee.
 *
 * Some rate cards promise a minimum day ("at least 4 hours whenever the worker is sent"). That is a
 * contract term, not a statute: when the hours at the assignment that day fall short, the shortfall
 * is paid at the pay rate (never below that day's minimum wage) on its own line. It is pay for time
 * not worked because the work fell short, so it is not hours worked and stays out of the regular
 * rate and overtime (29 U.S.C. § 207(e)(2); 29 C.F.R. § 778.220, show-up pay). Statutory minimum pay
 * for the same day (California or Massachusetts reporting pay, the Illinois or New Jersey sent-and-
 * not-used minimum) counts toward it, so the day is never paid twice. The client is billed for it
 * only when the rate card says so.
 */
export const CONTRACT_MINIMUM = "contract_minimum_hours";
export const CONTRACT_MINIMUM_CITATION = "29 U.S.C. § 207(e)(2); 29 C.F.R. § 778.220";
/** The longest minimum day a rate card may promise: 12 hours. */
export const MAX_CONTRACT_MINIMUM_MINUTES = 720;

/** Minutes still owed for the day: the promise less the minutes worked and any statutory minimum already paid. */
export function contractShortfall(guaranteeMinutes: number, workedMinutes: number, statutoryMinutes: number): number {
  return Math.max(0, guaranteeMinutes - workedMinutes - statutoryMinutes);
}
