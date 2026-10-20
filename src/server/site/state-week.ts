/**
 * The website's "pick a state" week (slice aa; docs/patterns/site.md, after Stripe's country tabs): one
 * sample worker's week at a sample client, run through the real rules engine on the reference rule data
 * for each state the engine covers, so the page shows exactly what the app would pay. Sample data only.
 */
import { computePay, NO_PLACE, type Confirmation, type Issue, type Line, type Shift } from "@shiftbook/rules";
import {
  REFERENCE_GUARANTEE_RULES,
  REFERENCE_JURISDICTION_RULES,
  REFERENCE_MINIMUM_WAGE_RULES,
  REFERENCE_OVERTIME_RULES,
  REFERENCE_PREMIUM_RULES,
  REFERENCE_REGULAR_RATE_RULES,
} from "../rules/reference-data";

export const SITE_STATES = ["CA", "IL", "MA", "NJ"] as const;
export type SiteState = (typeof SITE_STATES)[number];

/** A county in each state with no local minimum wage of its own (Census FIPS). */
const COUNTY: Record<SiteState, string> = { CA: "06019", IL: "17197", MA: "25027", NJ: "34023" };

/** Monday 2026-10-05 to Saturday: hours worked, and Saturday scheduled for 8 and sent home unused. */
export const SITE_WEEK = [
  { date: "2026-10-05", minutes: 600 },
  { date: "2026-10-06", minutes: 480 },
  { date: "2026-10-07", minutes: 540 },
  { date: "2026-10-08", minutes: 480 },
  { date: "2026-10-09", minutes: 780 },
  { date: "2026-10-10", minutes: 0, scheduledMinutes: 480 },
] as const;
export const SITE_PAY_RATE_CENTS = 1825;
const SENT_HOME = "2026-10-10";

export interface SiteLine {
  type: Line["type"];
  minutes: number;
  amountCents: number;
  ruleId: string;
  explain: string;
  say: Line["say"];
  /** The day it pays for, when it is the sent-home day's minimum pay. */
  date: string | null;
}

export interface SiteWeek {
  state: SiteState;
  lines: SiteLine[];
  totalCents: number;
  blockers: Issue[];
}

function shifts(state: SiteState): Shift[] {
  return SITE_WEEK.map((d, i) => ({
    entryIds: d.minutes === 0 ? [] : [`site-${state}-${i}`],
    workerId: "sample-worker",
    workerName: "Marcus Bell",
    assignmentId: "sample-assignment",
    clientId: "sample-client",
    clientName: "Prairie Line Manufacturing",
    jurisdiction: state,
    countyFips: COUNTY[state],
    placeFips: NO_PLACE,
    date: d.date,
    startMinute: 420,
    minutes: d.minutes,
    payRateCents: SITE_PAY_RATE_CENTS,
    billRateCents: 2650,
    billOtMultiplier: { num: 3, den: 2 },
    billDtMultiplier: { num: 2, den: 1 },
    otBillingRule: "multiplier",
    dayAndTemporaryLabor: true,
    ...(d.minutes === 0 ? { reportedOnly: true } : {}),
  }));
}

const GUARANTEES = new Set(REFERENCE_GUARANTEE_RULES.map((r) => r.ruleCode));

export function stateWeek(state: SiteState): SiteWeek {
  const confirmations: Confirmation[] = [{ id: `site-${state}-sent-home`, kind: "reported_short", workerId: "sample-worker", assignmentId: "sample-assignment", date: SENT_HOME, scheduledMinutes: 480, reassigned: false }];
  const result = computePay({
    workweekStartsOn: 1,
    shifts: shifts(state),
    overtimeRules: REFERENCE_OVERTIME_RULES,
    jurisdictionRules: REFERENCE_JURISDICTION_RULES,
    minimumWageRules: REFERENCE_MINIMUM_WAGE_RULES,
    premiumRules: REFERENCE_PREMIUM_RULES,
    guaranteeRules: REFERENCE_GUARANTEE_RULES,
    regularRateRules: REFERENCE_REGULAR_RATE_RULES,
    confirmations,
  });
  const lines = result.payLines.map((l) => ({
    type: l.type,
    minutes: l.minutes,
    amountCents: l.amountCents,
    ruleId: l.ruleId,
    explain: l.explain,
    say: l.say,
    date: [...GUARANTEES].some((code) => l.ruleId.includes(code)) ? SENT_HOME : null,
  }));
  return { state, lines, totalCents: lines.reduce((n, l) => n + l.amountCents, 0), blockers: result.blockers };
}

export interface SiteDay {
  date: string;
  regular: number;
  overtime: number;
  double: number;
  /** Minutes paid for a day the worker was sent home unused. */
  sentHome: number;
}

/**
 * The week drawn by day for the chart: how the engine's minutes fall on each day. California splits
 * each day at 8 and 12 hours (Cal. Lab. Code § 510(a)); the weekly states fill 40 regular hours in day
 * order. A test proves the days add up to the engine's own lines, type by type.
 */
export function weekByDay(week: SiteWeek): SiteDay[] {
  const sentHome = week.lines.filter((l) => l.date === SENT_HOME).reduce((n, l) => n + l.minutes, 0);
  let regularSoFar = 0;
  return SITE_WEEK.map((d) => {
    if (d.minutes === 0) return { date: d.date, regular: 0, overtime: 0, double: 0, sentHome };
    let regular: number;
    let overtime: number;
    let double = 0;
    if (week.state === "CA") {
      regular = Math.min(d.minutes, 480);
      overtime = Math.min(Math.max(d.minutes - 480, 0), 240);
      double = Math.max(d.minutes - 720, 0);
    } else {
      regular = d.minutes;
      overtime = 0;
    }
    const over = Math.max(regularSoFar + regular - 2400, 0);
    regular -= over;
    overtime += over;
    regularSoFar += regular;
    return { date: d.date, regular, overtime, double, sentHome: 0 };
  });
}
