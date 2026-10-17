/**
 * RULE: shift differentials.
 *
 * A shift differential (more per hour for nights, weekends or other set hours) is agency pay, set on
 * the rate card, not a statute. Once paid it is part of the regular rate: extra compensation paid as
 * a premium for night work or undesirable hours "must be included in the regular rate"
 * (29 C.F.R. § 778.207(b)), so overtime in a week with differentials is paid on a regular rate that
 * includes them (§ 778.115, weighted). California follows the federal rule here (DLSE Enforcement
 * Manual 49.1.2). The differential itself is paid on its own line, minutes × the differential's
 * cents per hour, rounded once; the client is billed the rate card's bill differential, if any.
 * Which shifts carry it (night hours, weekend days) is decided from the rate card's dated rows before
 * the engine runs; the engine pays what each shift carries.
 */
import type { Differential, Fraction } from "../types";

export const SHIFT_DIFFERENTIAL = "shift_differential";
export const SHIFT_DIFFERENTIAL_CITATION = "29 C.F.R. § 778.207(b)";
/** The largest differential accepted, in cents per hour ($100.00). */
export const MAX_DIFFERENTIAL_CENTS = 10_000;

/** True when a differential can be used as given. */
export function differentialValid(d: Differential): boolean {
  return (
    typeof d.name === "string" &&
    d.name.trim() !== "" &&
    d.name.length <= 60 &&
    Number.isSafeInteger(d.payCentsPerHour) &&
    d.payCentsPerHour > 0 &&
    d.payCentsPerHour <= MAX_DIFFERENTIAL_CENTS &&
    Number.isSafeInteger(d.billCentsPerHour) &&
    d.billCentsPerHour >= 0 &&
    d.billCentsPerHour <= MAX_DIFFERENTIAL_CENTS
  );
}

/** The differential earned on a shift, exact, in cents: minutes × cents per hour ÷ 60 (for the regular rate). */
export function differentialEarned(minutes: number, d: Differential): Fraction {
  return { num: minutes * d.payCentsPerHour, den: 60 };
}

/** One key per differential, so a line never mixes two. */
export const differentialKey = (d: Differential) => `${d.name}|${d.payCentsPerHour}|${d.billCentsPerHour}`;
