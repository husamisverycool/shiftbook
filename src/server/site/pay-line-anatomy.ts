/**
 * The website's "one pay line, taken apart" (slice aa; docs/patterns/site.md, after Apple's "Take a closer
 * look"): California's daily-overtime line from the sample week, as the real rules engine writes it, split
 * into the parts the page names one at a time — the hours by day, the rule, the rate, the exact arithmetic,
 * the one rounding, and the law. Nothing here is typed by hand: every figure is the engine's own.
 */
import { REFERENCE_OVERTIME_RULES } from "../rules/reference-data";
import { SITE_PAY_RATE_CENTS, SITE_WEEK, stateWeek } from "./state-week";

export interface PayLineAnatomy {
  /** Minutes on the line, and the days they came from (date, minutes over the day's threshold). */
  minutes: number;
  days: { date: string; minutes: number }[];
  thresholdMinutes: number;
  /** "1.5", the base rate in cents, and the line's rate as the engine prints it ("$27.375/h"). */
  multiplier: string;
  baseRateCents: number;
  rate: string;
  /** The exact product in cents before rounding ("19162.5"), and the rounded amount. */
  exactCents: string;
  amountCents: number;
  rounded: boolean;
  ruleId: string;
  /** The statute, without its gloss (the text before " — "). */
  citation: string;
  explain: string;
}

type ArithmeticValues = { minutes: string; rate: string; exact: string; note?: { say?: { values?: { multiplier?: string } }[] } };

export function payLineAnatomy(): PayLineAnatomy {
  const week = stateWeek("CA");
  const line = week.lines.find((l) => l.ruleId === "ca_daily_overtime");
  if (!line) throw new Error("the sample week has no California daily-overtime line");
  const arithmetic = line.say?.[0] as unknown as { key: string; values: ArithmeticValues };
  const rule = REFERENCE_OVERTIME_RULES.find((r) => r.jurisdiction === "CA" && r.ruleCode === "ca_daily_overtime")!;
  // Each day's minutes past 8 hours, up to the 12 where double time takes over.
  const doubleFrom = REFERENCE_OVERTIME_RULES.find((r) => r.jurisdiction === "CA" && r.ruleCode === "ca_daily_double_time")!.thresholdMinutes;
  const days = SITE_WEEK.map((d) => ({ date: d.date, minutes: Math.min(Math.max(d.minutes - rule.thresholdMinutes, 0), doubleFrom - rule.thresholdMinutes) })).filter((d) => d.minutes > 0);
  return {
    minutes: line.minutes,
    days,
    thresholdMinutes: rule.thresholdMinutes,
    multiplier: arithmetic.values.note?.say?.[0]?.values?.multiplier ?? "",
    baseRateCents: SITE_PAY_RATE_CENTS,
    rate: arithmetic.values.rate,
    exactCents: arithmetic.values.exact,
    amountCents: line.amountCents,
    rounded: arithmetic.key === "arithmeticRounded",
    ruleId: line.ruleId,
    citation: rule.citation.split(" — ")[0]!,
    explain: line.explain,
  };
}
