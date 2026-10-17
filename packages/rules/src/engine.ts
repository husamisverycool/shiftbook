/**
 * Shiftbook pay and bill engine (SPEC §9). Pure and deterministic: the same input always gives the
 * same output; no I/O, no clock, integer math only.
 *
 * Order per worker-week (SPEC §9):
 *   1. classify minutes        — validate shifts, group into fixed workweeks, jurisdiction gate
 *   2. apply wage floor        — the highest applicable minimum wage each day; a rate card below it
 *                                is topped up on a separate line, with a warning
 *   3. straight pay            — regular minutes × the pay rate in effect for each shift
 *   4. regular rate            — the weighted average of the week's rates, exact (29 C.F.R. § 778.115)
 *   5. overtime                — weekly overtime, most protective rule once, never double counted
 *   6. confirmed premiums      — meal/rest premiums, minimum pay for a short day, holiday pay,
 *                                bonuses (a nondiscretionary bonus is in the regular rate)
 *   7. allocate to clients     — lines per assignment and rate; bill lines mirror pay-line minutes
 *
 * Anything this version cannot compute correctly blocks the worker-week instead of guessing.
 *
 * Every blocker, warning and line carries `say`, its message as keys for the reader's language
 * (decision 0030), built where the English is built; the English (`message`, `explain`) is
 * english(say), so the record and the translation can never drift.
 */
import { addDays, isEffective, isIsoDate, toDayNumber, workweekStart } from "./dates";
import { formatCents, formatMoney, formatMultiplier, formatRate } from "./format";
import { exactDecimalBig, mul, reduceFraction as reduce, reduceFractionBig, roundHalfUpBig } from "./int";
import { isLocal, placeProblem, scopeMatches } from "./places";
import { canonicalRules, ruleDataProblems } from "./rule-data";
import { hasLocalRate, MINIMUM_WAGE, selectMinimumWage } from "./rules/minimum-wage";
import { CA_REGULAR_RATE_CITATION, overtimeRate, premiumBase, premiumWorth, RATE_FLOOR_CITATION, REGULAR_RATE_CITATION, regularRateWith, worthMore } from "./rules/regular-rate";
import { CA_DAILY_DOUBLE_TIME, CA_DAILY_OVERTIME, CA_SEVENTH_DAY, CALIFORNIA_RULE_CODES, selectCaliforniaRules, splitCalifornia, type CaliforniaRules, type PremiumSplit } from "./rules/california-overtime";
import { selectWeeklyRule, splitAtThreshold, WEEKLY_OVERTIME } from "./rules/weekly-overtime";
import { CA_REPORTING_TIME, caReportingTime } from "./rules/ca-reporting-time";
import { IL_DAY_LABOR_MINIMUM, ilDayLaborMinimum } from "./rules/il-day-labor-minimum";
import { NJ_SENT_NOT_USED, njSentNotUsed } from "./rules/nj-sent-not-used";
import { MA_REPORTING_PAY, maReportingPay } from "./rules/ma-reporting-pay";
import { guaranteeRuleFor, PREMIUM_OF, premiumRuleFor } from "./rules/meal-rest-premium";
import { HOLIDAY_NOT_WORKED, HOLIDAY_NOT_WORKED_CITATION, HOLIDAY_WORKED, HOLIDAY_WORKED_CITATION, holidayTermsFor, premiumCountsInRegularRate, premiumExclusionOn, type HolidayTerms } from "./rules/holiday-pay";
import { addWorth, alvaradoWorth, BONUS, BONUS_CITATION, CA_FLAT_SUM_BONUS, CA_FLAT_SUM_CITATION } from "./rules/bonus";
import { CONTRACT_MINIMUM, CONTRACT_MINIMUM_CITATION, contractShortfall, MAX_CONTRACT_MINIMUM_MINUTES } from "./rules/contract-minimum";
import { differentialEarned, differentialKey, differentialValid, SHIFT_DIFFERENTIAL, SHIFT_DIFFERENTIAL_CITATION } from "./rules/shift-differential";
import { coveredByEqualPay, equalPayCounter } from "./rules/il-equal-pay";
import { applyEqualPayRates, duplicateEqualPayRates, equalPayRateProblemSay } from "./rules/il-equal-pay-rate";
import { andList, commaList, dateValue, english, nested, part as phrase, plusList, semicolonList, type EngineKey, type Say, type SayPart, type SayValue } from "./say";
import type { Bonus, Confirmation, ConfirmationKind, Differential, EarningType, Fraction, HolidayPolicy, Issue, JurisdictionRule, Line, PayInput, PayResult, PremiumRule, Shift } from "./types";

export const RULES_VERSION = "2026.10-c8";

/** Rule codes this engine version implements. Any other applicable rule code blocks the run. */
export const IMPLEMENTED_RULE_CODES = new Set<string>([WEEKLY_OVERTIME, MINIMUM_WAGE, ...CALIFORNIA_RULE_CODES]);
/** Federal rules that must always be present; without them nothing is computed. */
const REQUIRED_FEDERAL_RULES = [WEEKLY_OVERTIME, MINIMUM_WAGE];

const TYPE_ORDER: EarningType[] = ["REG", "OT", "DT", "MW_TRUEUP", "REPORTING_PAY", "HOL", "HOL_NOT_WORKED", "DIFF", "MEAL_PREMIUM", "REST_PREMIUM", "MIN_GUARANTEE", "BONUS", "BONUS_OT"];
const MINUTES_PER_DAY = 1440;
/** Bounds that keep every product inside safe integers: $100,000/h, factors up to 1000. */
const MAX_RATE_CENTS = 10_000_000;
const MAX_FACTOR = 1000;
const BILLING_RULES = new Set(["multiplier", "straight_time", "not_billable", "own_sites_only"]);
/** A bonus above $100,000 for one week is a typo, not an amount to pay. */
const MAX_BONUS_CENTS = 10_000_000;
/** "a confirmed missed meal period on <date>", … for each kind of confirmation this version pays. */
const CONFIRMED: Record<ConfirmationKind, EngineKey> = {
  meal_period_missed: "itemMealMissed",
  rest_period_missed: "itemRestMissed",
  reported_short: "itemShortDay",
  holiday_not_worked: "itemHolidayNotWorked",
};

/** Plain code-unit comparison: deterministic on every machine, unlike locale collation. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const uniqueSorted = (ids: string[]) => [...new Set(ids)].sort(cmp);

/** amount = minutes × rate / 60, in cents, rounded half-up exactly once (big integers: no overflow). */
function lineAmount(minutes: number, rate: Fraction): { amountCents: number; exact: string; wasExact: boolean } {
  const num = BigInt(minutes) * BigInt(rate.num);
  const den = 60n * BigInt(rate.den);
  const amountCents = roundHalfUpBig(num, den);
  return { amountCents, exact: exactDecimalBig(num, den), wasExact: BigInt(amountCents) * den === num };
}

/** A line's arithmetic: what it is, minutes × the rate (and how the rate is made) = the exact amount, rounded once. */
function arithmetic(label: Say, minutes: number, rate: Fraction, note: Say = []): { part: SayPart; amountCents: number } {
  const { amountCents, exact, wasExact } = lineAmount(minutes, rate);
  const values = { label: nested(label), duration: { duration: minutes }, minutes: String(minutes), rate: formatRate(rate), note: note.length > 0 ? nested(note) : "", exact, amount: formatCents(amountCents) };
  return { part: phrase(wasExact ? "arithmeticExact" : "arithmeticRounded", values), amountCents };
}

/** A message and the keys it is made from (decision 0030). */
const message = (say: Say) => ({ message: english(say), say });
/** A line's explanation and the keys it is made from (decision 0030). */
const explained = (say: Say) => ({ explain: english(say), say });
/** A date already known to be a real one, written the reader's way. */
const dated = (iso: string): SayValue => ({ date: iso });
const time = (minutes: number): SayValue => ({ duration: minutes });

const hasEntryIds = (s: Shift) => Array.isArray(s.entryIds) && s.entryIds.length > 0 && s.entryIds.every((id) => typeof id === "string" && id.trim() !== "");
const entryKey = (s: Shift) => (Array.isArray(s.entryIds) ? [...s.entryIds].map(String).sort(cmp).join("\u0000") : "");
const startOrMinus = (s: Shift) => (typeof s.startMinute === "number" && Number.isFinite(s.startMinute) ? s.startMinute : -1);

/** One fixed order for all shifts, so nothing downstream depends on the order they arrived in. */
function totalOrder(a: Shift, b: Shift): number {
  return (
    cmp(a.workerId, b.workerId) ||
    cmp(a.date, b.date) ||
    startOrMinus(a) - startOrMinus(b) ||
    cmp(entryKey(a), entryKey(b)) ||
    cmp(a.assignmentId, b.assignmentId) ||
    cmp(a.clientId, b.clientId) ||
    cmp(JSON.stringify([a.minutes, a.payRateCents, a.billRateCents, a.billOtMultiplier, a.billDtMultiplier, a.otBillingRule, a.jurisdiction, a.countyFips, a.placeFips]), JSON.stringify([b.minutes, b.payRateCents, b.billRateCents, b.billOtMultiplier, b.billDtMultiplier, b.otBillingRule, b.jurisdiction, b.countyFips, b.placeFips]))
  );
}

/** Why a shift cannot be used as it is (as message keys), or null. */
function validShift(s: Shift): SayPart | null {
  if (s.reportedOnly) {
    if (s.minutes !== 0 || !Array.isArray(s.entryIds) || s.entryIds.length > 0) return phrase("problemReportedOnly");
  } else {
    if (!hasEntryIds(s)) return phrase("problemNoEntryId");
    if (new Set(s.entryIds).size !== s.entryIds.length) return phrase("problemEntryTwice");
  }
  if (!isIsoDate(s.date)) return phrase("problemNotCalendarDate", { value: String(s.date) });
  const place = placeProblem(s.jurisdiction, s.countyFips, s.placeFips);
  if (place) return place;
  if (!Number.isSafeInteger(s.minutes) || s.minutes < 0) return phrase("problemMinutesWhole", { minutes: String(s.minutes) });
  if (s.minutes > MINUTES_PER_DAY) return phrase("problemMinutesOverDay", { minutes: String(s.minutes) });
  if (s.startMinute !== null) {
    if (!Number.isSafeInteger(s.startMinute) || s.startMinute < 0 || s.startMinute >= MINUTES_PER_DAY) return phrase("problemStartTime");
    if (s.startMinute + s.minutes > MINUTES_PER_DAY) return phrase("problemPastMidnight");
  }
  if (!Number.isSafeInteger(s.payRateCents) || s.payRateCents <= 0 || s.payRateCents > MAX_RATE_CENTS) return phrase("problemPayRate");
  if (!Number.isSafeInteger(s.billRateCents) || s.billRateCents <= 0 || s.billRateCents > MAX_RATE_CENTS) return phrase("problemBillRate");
  if (s.billRateExplain !== undefined && (typeof s.billRateExplain !== "string" || s.billRateExplain.length > 300)) return phrase("problemBillRateExplain");
  for (const [m, key] of [[s.billOtMultiplier, "problemOvertimeBillMultiplier"], [s.billDtMultiplier, "problemDoubleTimeBillMultiplier"]] as [Partial<Fraction> | undefined, EngineKey][]) {
    if (!m || !Number.isSafeInteger(m.num) || !Number.isSafeInteger(m.den) || m.num! <= 0 || m.den! <= 0 || m.num! > MAX_FACTOR || m.den! > MAX_FACTOR) {
      return phrase(key);
    }
  }
  if (!BILLING_RULES.has(s.otBillingRule)) return phrase("problemBillingRule", { rule: String(s.otBillingRule) });
  if (s.differential !== undefined && (s.differential === null || typeof s.differential !== "object" || !differentialValid(s.differential))) return phrase("problemDifferential");
  if (s.contractMinimumMinutes !== undefined && (!Number.isSafeInteger(s.contractMinimumMinutes) || s.contractMinimumMinutes < 0 || s.contractMinimumMinutes > MAX_CONTRACT_MINIMUM_MINUTES)) return phrase("problemContractMinimum");
  return null;
}

function chronological(a: Shift, b: Shift): number {
  if (a.date !== b.date) return toDayNumber(a.date) - toDayNumber(b.date);
  const sa = a.startMinute ?? 0;
  const sb = b.startMinute ?? 0;
  if (sa !== sb) return sa - sb;
  return cmp(entryKey(a), entryKey(b));
}

type Site = { jurisdiction: string; countyFips: string; placeFips: string | null };
const siteKey = (s: Site) => `${s.jurisdiction}|${s.countyFips}|${s.placeFips ?? ""}`;

/** Jurisdiction rows for a worksite on a date: statewide rows plus rows for its county or place. */
function rowsFor(rules: JurisdictionRule[], site: Site, date: string) {
  return rules.filter((r) => r.jurisdiction === site.jurisdiction && scopeMatches(r, site) && isEffective(date, r.effectiveFrom, r.effectiveTo));
}

function scopeLabel(row: JurisdictionRule): SayValue {
  if (row.jurisdiction === "US") return nested(phrase("scopeFederal"));
  const local: SayValue | null = row.scopeName ?? (row.countyFips ? nested(phrase("scopeCounty", { code: row.countyFips })) : row.placeFips ? nested(phrase("scopePlace", { code: row.placeFips })) : null);
  return local ? nested(phrase("scopeLocal", { local, jurisdiction: row.jurisdiction })) : row.jurisdiction;
}

/** Shifts on one line share assignment, client, rates and billing rule. */
const lineKey = (s: Shift) => [s.assignmentId, s.clientId, s.payRateCents, s.billRateCents, s.billOtMultiplier.num, s.billOtMultiplier.den, s.billDtMultiplier.num, s.billDtMultiplier.den, s.otBillingRule].join("|");

interface Bucket {
  key: string;
  /** Why the shifts' pay rate is above their rate card's (the Illinois equal-pay rate), each once. */
  payWhy: Worded[];
  assignmentId: string;
  clientId: string;
  firstIndex: number;
  sample: Shift;
  regular: number;
  overtime: number;
  regularEntries: string[];
  overtimeEntries: string[];
  /** Premium minutes by rule, kind and the premium's base (the regular rate, or a day's higher minimum wage). */
  overtimeParts: {
    key: string;
    ruleCode: string;
    type: "OT" | "DT";
    multiplier: Fraction;
    citation: string;
    thresholdMinutes: number;
    base: Fraction;
    floorApplies: boolean;
    minutes: number;
    entries: string[];
    dates: string[];
  }[];
  /** Minutes paid below the minimum wage, by that minimum: each gets the difference on a top-up line. */
  trueUps: { floor: number; minutes: number; entries: string[]; dates: string[]; citations: string[] }[];
  /** Minutes worked on a holiday with a premium paid, by the policy paid, its cut-off and the rate the premium is on. */
  holiday: { key: string; policy: HolidayPolicy; multiplier: Fraction; cutOff: Fraction; rateCents: number; minutes: number; entries: string[]; dates: string[] }[];
  /** Minutes worked on a holiday with a premium billed, by the policy billed. */
  holidayBill: { key: string; policy: HolidayPolicy; multiplier: Fraction; minutes: number; entries: string[] }[];
  /** How the bill rate came about on the regular and the overtime line: each distinct working (never splits a line). */
  billRate: { regular: BillRateWorking; overtime: BillRateWorking };
  /** Minutes worked with a shift differential, by differential. */
  diffs: { key: string; d: Differential; minutes: number; entries: string[]; dates: string[] }[];
}

/** A sentence given with a shift (a working, a reason), and its keys when they say exactly it. */
type Worded = { explain: string; say: Say };
/** The keys for a sentence a shift brings, used only when they say exactly that sentence; else the sentence as it is. */
function worded(explain: string, say: Say | undefined): Worded {
  try {
    if (Array.isArray(say) && english(say) === explain) return { explain, say };
  } catch {
    // Keys this version does not know: the sentence is said as it was given.
  }
  return { explain, say: [phrase("verbatim", { text: explain })] };
}

/** The distinct workings of a line's bill rate, and whether some shift's rate was entered as is. */
type BillRateWorking = { explains: Worded[]; typed: boolean };
const noteWorking = (w: BillRateWorking, s: Shift) => {
  if (!s.billRateExplain) w.typed = true;
  else if (!w.explains.some((x) => x.explain === s.billRateExplain)) w.explains.push(worded(s.billRateExplain, s.billRateSay));
};

/** " (working; working)" for a bill line — "some shifts:" when others' rate was entered as is — or "" when none was worked out. */
const billRateNote = (w: BillRateWorking): SayValue =>
  w.explains.length === 0 ? "" : nested(phrase(w.typed ? "workingNoteSome" : "workingNote", { workings: semicolonList(w.explains.map((x) => nested(x.say))) }));

function emptyResult(blockers: Issue[]): PayResult {
  return { rulesVersion: RULES_VERSION, payLines: [], billLines: [], blockers, warnings: [], obligations: [] };
}

export function computePay(input: PayInput): PayResult {
  if (!Number.isInteger(input.workweekStartsOn) || input.workweekStartsOn < 0 || input.workweekStartsOn > 6) {
    return emptyResult([{ code: "invalid_input", ...message([phrase("workweekStartInvalid", { value: String(input.workweekStartsOn) })]) }]);
  }

  const rules = canonicalRules(input);
  const ruleProblems = ruleDataProblems(rules);
  if (ruleProblems.length > 0) return emptyResult(ruleProblems);

  const blockers: Issue[] = [];
  const warnings: Issue[] = [];
  const payLines: Line[] = [];
  const billLines: Line[] = [];
  // A worker with a shift that cannot be placed in any week is held entirely.
  const heldWorkers = new Set<string>();
  // The Illinois equal-pay rate raises a covered shift's pay rate from its date (the engine alone says
  // why). A malformed or doubled row holds only its worker.
  const allRates = input.equalPayRates ?? [];
  const doubled = new Set(duplicateEqualPayRates(allRates));
  for (const r of allRates) {
    const problem = doubled.has(r) ? phrase("problemEqualPayTwoRows", { client: String(r.clientId) }) : equalPayRateProblemSay(r);
    if (problem === null || heldWorkers.has(r.workerId)) continue;
    heldWorkers.add(r.workerId);
    blockers.push({ code: "invalid_input", workerId: r.workerId, ...message([phrase("equalPayRateHeld", { date: dateValue(r.effectiveFrom), problem: nested(problem) })]) });
  }
  const rates = allRates.filter((r) => !heldWorkers.has(r.workerId));
  const shiftsInOrder = applyEqualPayRates(
    input.shifts.map((s) => (s.payRateExplain === undefined && s.payRateSay === undefined ? s : { ...s, payRateExplain: undefined, payRateSay: undefined })),
    rates,
    (s) => validShift(s) === null && coveredByEqualPay(rules.equalPayRules, s),
  ).sort(totalOrder);
  for (const shift of shiftsInOrder) {
    if (!isIsoDate(shift.date)) {
      heldWorkers.add(shift.workerId);
      const problem = phrase("problemNotCalendarDate", { value: String(shift.date) });
      blockers.push({ code: "invalid_input", workerId: shift.workerId, workerName: shift.workerName, entryIds: shift.entryIds, ...message([phrase("workerHeld", { name: String(shift.workerName), problem: nested(problem) })]) });
    }
  }
  // A time entry used by more than one shift would be paid twice: every worker involved is held.
  const uses = new Map<string, Shift[]>();
  for (const shift of shiftsInOrder) {
    if (!Array.isArray(shift.entryIds)) continue;
    for (const id of new Set(shift.entryIds)) uses.set(id, [...(uses.get(id) ?? []), shift]);
  }
  const shared = new Map<string, { name: string; ids: Set<string>; others: Set<string> }>();
  for (const [id, list] of uses) {
    if (list.length < 2) continue;
    for (const s of list) {
      const entry = shared.get(s.workerId) ?? { name: s.workerName, ids: new Set<string>(), others: new Set<string>() };
      entry.ids.add(id);
      for (const o of list) if (o.workerId !== s.workerId) entry.others.add(o.workerName);
      shared.set(s.workerId, entry);
    }
  }
  for (const [workerId, { name, ids, others }] of [...shared].sort((a, b) => cmp(a[0], b[0]))) {
    if (heldWorkers.has(workerId)) continue;
    heldWorkers.add(workerId);
    const list = [...ids].sort(cmp);
    const values = { name: String(name), entries: list.join(", ") };
    const say = [others.size > 0 ? phrase("sharedEntryAlso", { ...values, others: [...others].sort(cmp).join(", ") }) : phrase("sharedEntry", values)];
    blockers.push({ code: "invalid_input", workerId, workerName: name, entryIds: list, ...message(say) });
  }
  // An assignment belongs to one client; one linked to several cannot be billed correctly.
  const clientsOf = new Map<string, Set<string>>();
  for (const s of shiftsInOrder) clientsOf.set(s.assignmentId, (clientsOf.get(s.assignmentId) ?? new Set<string>()).add(s.clientId));

  // Bonuses and confirmations are entered by people. One whose week cannot be placed holds the
  // worker; any other problem holds its week; one for a week with no hours on file is never dropped.
  const nameOf = (workerId: string) =>
    shiftsInOrder.find((s) => s.workerId === workerId)?.workerName ??
    [...(input.bonuses ?? []), ...(input.confirmations ?? [])].find((x) => x.workerId === workerId && typeof x.workerName === "string" && x.workerName.trim() !== "")?.workerName ??
    workerId;
  const enteredProblems = new Map<string, Issue[]>();
  const bonusesOf = new Map<string, Bonus[]>();
  const confirmationsOf = new Map<string, Confirmation[]>();
  const holdWorker = (workerId: string, problem: SayPart) => {
    if (heldWorkers.has(workerId)) return;
    heldWorkers.add(workerId);
    blockers.push({ code: "invalid_input", workerId, workerName: nameOf(workerId), ...message([phrase("workerHeld", { name: String(nameOf(workerId)), problem: nested(problem) })]) });
  };
  const bonusIds = new Map<string, number>();
  for (const b of input.bonuses ?? []) bonusIds.set(String(b.id), (bonusIds.get(String(b.id)) ?? 0) + 1);
  for (const b of [...(input.bonuses ?? [])].sort((x, y) => cmp(String(x.id), String(y.id)))) {
    if (heldWorkers.has(b.workerId)) continue;
    if (!isIsoDate(b.workweekStart) || workweekStart(b.workweekStart, input.workweekStartsOn) !== b.workweekStart) {
      holdWorker(b.workerId, phrase("problemBonusWeek", { value: dateValue(b.workweekStart) }));
      continue;
    }
    const key = `${b.workerId}\u0000${b.workweekStart}`;
    const problem =
      typeof b.id !== "string" || b.id.trim() === ""
        ? phrase("problemBonusNoId")
        : bonusIds.get(b.id)! > 1
          ? phrase("problemBonusTwice", { id: b.id })
          : !Number.isSafeInteger(b.amountCents) || b.amountCents <= 0 || b.amountCents > MAX_BONUS_CENTS
            ? phrase("problemBonusAmount")
            : b.kind !== "nondiscretionary" && b.kind !== "flat_sum"
              ? phrase("problemBonusKind", { kind: String(b.kind) })
              : null;
    if (problem) {
      const name = nameOf(b.workerId);
      const say = [phrase("bonusHeld", { name: String(name), week: dated(b.workweekStart), problem: nested(problem) })];
      enteredProblems.set(key, [...(enteredProblems.get(key) ?? []), { code: "invalid_input", workerId: b.workerId, workerName: name, workweekStart: b.workweekStart, ...message(say) }]);
    } else {
      bonusesOf.set(key, [...(bonusesOf.get(key) ?? []), b]);
    }
  }
  for (const c of [...(input.confirmations ?? [])].sort((x, y) => cmp(String(x.date), String(y.date)) || cmp(String(x.id), String(y.id)))) {
    if (heldWorkers.has(c.workerId)) continue;
    if (!isIsoDate(c.date)) {
      holdWorker(c.workerId, phrase("problemConfirmationDate", { value: String(c.date) }));
      continue;
    }
    const key = `${c.workerId}\u0000${workweekStart(c.date, input.workweekStartsOn)}`;
    if (!Object.hasOwn(CONFIRMED, c.kind)) {
      const name = nameOf(c.workerId);
      const say = [phrase("weekHeldOn", { name: String(name), date: dated(c.date), problem: nested(phrase("problemCannotPayFor", { kind: String(c.kind) })) })];
      enteredProblems.set(key, [...(enteredProblems.get(key) ?? []), { code: "invalid_input", workerId: c.workerId, workerName: name, date: c.date, ...message(say) }]);
      continue;
    }
    confirmationsOf.set(key, [...(confirmationsOf.get(key) ?? []), c]);
  }

  // Earlier hours and obligations on file feed the Illinois equal-pay counter: one that cannot be
  // read holds its worker (a wrong count could hide a crossing).
  for (const h of [...(input.hoursWorked ?? [])].sort((a, b) => cmp(String(a.workerId), String(b.workerId)) || cmp(String(a.date), String(b.date)))) {
    if (typeof h.clientId !== "string" || !isIsoDate(h.date) || !Number.isSafeInteger(h.minutes) || h.minutes < 0) {
      holdWorker(h.workerId, phrase("problemEarlierHours", { date: dateValue(h.date), minutes: String(h.minutes) }));
    }
  }
  for (const o of [...(input.obligationsOnFile ?? [])].sort((a, b) => cmp(String(a.workerId), String(b.workerId)))) {
    if ((o.kind !== "il_equal_pay_720h" && o.kind !== "il_equal_pay_4160h") || !isIsoDate(o.crossedOn) || typeof o.clientId !== "string") {
      holdWorker(o.workerId, phrase("problemObligationOnFile", { kind: String(o.kind), date: dateValue(o.crossedOn) }));
    }
  }

  // 1. classify minutes: group by worker and fixed workweek; remember invalid shifts per week.
  const weeks = new Map<string, Shift[]>();
  const invalid = new Map<string, Issue[]>();
  for (const shift of shiftsInOrder) {
    if (heldWorkers.has(shift.workerId)) continue;
    const problem = validShift(shift);
    const week = workweekStart(shift.date, input.workweekStartsOn);
    const key = `${shift.workerId}\u0000${week}`;
    if (problem) {
      const list = invalid.get(key) ?? [];
      const say = [phrase("weekHeldOn", { name: String(shift.workerName), date: dated(shift.date), problem: nested(problem) })];
      list.push({ code: "invalid_input", workerId: shift.workerId, workerName: shift.workerName, workweekStart: week, date: shift.date, entryIds: shift.entryIds, ...message(say) });
      invalid.set(key, list);
    }
    if (shift.minutes === 0 && !problem && !shift.reportedOnly) continue;
    const list = weeks.get(key) ?? [];
    list.push(shift);
    weeks.set(key, list);
  }

  for (const key of [...new Set([...weeks.keys(), ...invalid.keys(), ...enteredProblems.keys(), ...bonusesOf.keys(), ...confirmationsOf.keys()])].sort(cmp)) {
    const [workerId, week] = key.split("\u0000") as [string, string];
    if (heldWorkers.has(workerId)) continue;
    const shifts = [...(weeks.get(key) ?? [])].sort(chronological);
    const who = { workerId, workerName: shifts[0]?.workerName ?? nameOf(workerId), workweekStart: week };
    // Who and when, as every message of this week starts.
    const named = { name: String(who.workerName), week: dated(week) };
    const weekBlockers: Issue[] = [...(invalid.get(key) ?? []), ...(enteredProblems.get(key) ?? [])];
    if (weekBlockers.length === 0 && shifts.length === 0) {
      const what = [
        ...(bonusesOf.get(key) ?? []).map((b) => nested(phrase("itemBonus", { amount: formatCents(b.amountCents) }))),
        ...(confirmationsOf.get(key) ?? []).map((c) => nested(phrase(CONFIRMED[c.kind], { date: dated(c.date) }))),
      ];
      weekBlockers.push({ code: "invalid_input", ...who, ...message([phrase(what.length > 1 ? "noHoursMany" : "noHoursOne", { ...named, what: andList(what) })]) });
    }
    if (weekBlockers.length > 0) {
      blockers.push(...weekBlockers);
      continue;
    }
    const first = shifts[0]!;
    // Who and on which day, as the messages about one day start.
    const about = (date: string) => ({ name: String(first.workerName), date: dated(date) });
    const weekOf = { name: String(first.workerName), week: dated(week) };

    for (const assignmentId of [...new Set(shifts.map((s) => s.assignmentId))].sort(cmp)) {
      const clients = [...(clientsOf.get(assignmentId) ?? [])].sort(cmp);
      if (clients.length > 1) {
        weekBlockers.push({ code: "invalid_input", ...who, ...message([phrase("assignmentManyClients", { ...weekOf, assignment: assignmentId, count: String(clients.length), clients: clients.join(", ") })]) });
      }
    }

    // A day can hold at most 24 hours, and shifts with known start times must not overlap.
    const byDay = new Map<string, Shift[]>();
    for (const s of shifts) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
    for (const [date, dayShifts] of [...byDay].sort((a, b) => cmp(a[0], b[0]))) {
      const minutes = dayShifts.reduce((sum, s) => sum + s.minutes, 0);
      if (minutes > MINUTES_PER_DAY) {
        weekBlockers.push({ code: "invalid_input", ...who, date, ...message([phrase("dayOver24", { ...about(date), duration: time(minutes) })]) });
        continue;
      }
      const timed = dayShifts.filter((s) => s.startMinute !== null).sort((a, b) => a.startMinute! - b.startMinute! || cmp(entryKey(a), entryKey(b)));
      for (let i = 1; i < timed.length; i++) {
        const prev = timed[i - 1]!;
        if (timed[i]!.startMinute! < prev.startMinute! + prev.minutes) {
          weekBlockers.push({ code: "invalid_input", ...who, date, entryIds: [...prev.entryIds, ...timed[i]!.entryIds], ...message([phrase("shiftsOverlap", about(date))]) });
          break;
        }
      }
    }

    // Jurisdiction gate, checked on every day worked. Every federal rule and every rule of each
    // worksite's state, county and place must be implemented by this version; a local minimum-wage
    // rule also needs its local rate on file.
    const dates = [...byDay.keys()].sort(cmp);
    const reported = new Set<string>();
    const gate = (row: JurisdictionRule, date: string) => {
      const k = `${row.jurisdiction}|${row.countyFips ?? ""}|${row.placeFips ?? ""}|${row.ruleCode}`;
      if (reported.has(k)) return;
      if (isLocal(row) && row.ruleCode === MINIMUM_WAGE) {
        if (hasLocalRate(rules.minimumWageRules, row.jurisdiction, row, date)) return;
        reported.add(k);
        weekBlockers.push({ code: "rule_data_missing", ...who, jurisdiction: row.jurisdiction, ruleCode: row.ruleCode, date, ...message([phrase("localMinimumWageMissing", { ...weekOf, scope: scopeLabel(row), citation: String(row.citation), date: dated(date) })]) });
        return;
      }
      if (IMPLEMENTED_RULE_CODES.has(row.ruleCode) && !isLocal(row)) return;
      reported.add(k);
      weekBlockers.push({ code: "rule_not_supported_yet", ...who, jurisdiction: row.jurisdiction, ruleCode: row.ruleCode, date, ...message([phrase("ruleNotImplemented", { ...weekOf, scope: scopeLabel(row), rule: String(row.ruleCode), citation: String(row.citation) })]) });
    };

    const federal = new Set<string>();
    for (const date of dates) {
      for (const row of rules.jurisdictionRules.filter((r) => r.jurisdiction === "US" && isEffective(date, r.effectiveFrom, r.effectiveTo))) {
        federal.add(row.ruleCode);
        gate(row, date);
      }
    }
    const missingFederal = REQUIRED_FEDERAL_RULES.filter((c) => !federal.has(c));
    if (missingFederal.length > 0) {
      weekBlockers.push({ code: "rule_data_missing", ...who, jurisdiction: "US", ...message([phrase("federalRuleDataMissing", { ...weekOf, rules: missingFederal.join(", ") })]) });
    }
    const sites = [...new Map(shifts.map((s) => [siteKey(s), { jurisdiction: s.jurisdiction, countyFips: s.countyFips, placeFips: s.placeFips }])).values()].sort((a, b) => cmp(siteKey(a), siteKey(b)));
    const statesListingWeekly = new Set<string>();
    for (const site of sites) {
      const siteDates = [...new Set(shifts.filter((s) => siteKey(s) === siteKey(site)).map((s) => s.date))].sort(cmp);
      const known = siteDates.some((d) => rules.jurisdictionRules.some((r) => r.jurisdiction === site.jurisdiction && isEffective(d, r.effectiveFrom, r.effectiveTo)));
      if (!known) {
        weekBlockers.push({ code: "unknown_jurisdiction", ...who, jurisdiction: site.jurisdiction, ...message([phrase("noWageRules", { ...weekOf, jurisdiction: String(site.jurisdiction) })]) });
        continue;
      }
      for (const date of siteDates) {
        for (const row of rowsFor(rules.jurisdictionRules, site, date)) {
          if (row.ruleCode === WEEKLY_OVERTIME && !isLocal(row)) statesListingWeekly.add(row.jurisdiction);
          gate(row, date);
        }
      }
    }
    const states = [...new Set(shifts.map((s) => s.jurisdiction))].sort(cmp);
    if (weekBlockers.length > 0) {
      blockers.push(...weekBlockers);
      continue;
    }

    // 2. wage floor: the highest of the federal, state and local minimum wage on each day worked.
    const seen = new Set<string>();
    const floorOf = new Map<Shift, number>();
    const floorCitations = new Map<Shift, string[]>();
    const weekWarnings: Issue[] = [];
    for (const s of shifts) {
      const floor = selectMinimumWage(rules.minimumWageRules, s, s.date);
      if (!floor.ok) {
        const k = `missing|${floor.missing}`;
        if (!seen.has(k)) {
          seen.add(k);
          const say = [floor.missing === "US" ? phrase("minimumWageMissingFederal", about(s.date)) : phrase("minimumWageMissing", { ...about(s.date), jurisdiction: String(floor.missing) })];
          weekBlockers.push({ code: "rule_data_missing", ...who, jurisdiction: floor.missing, ruleCode: MINIMUM_WAGE, date: s.date, ...message(say) });
        }
        continue;
      }
      floorOf.set(s, floor.rateCents);
      floorCitations.set(s, floor.citations);
      const k = `${s.payRateCents}|${floor.rateCents}`;
      if (s.payRateCents < floor.rateCents && !seen.has(k)) {
        seen.add(k);
        const say = [phrase("belowMinimumWage", { ...about(s.date), rate: formatRate({ num: s.payRateCents, den: 1 }), minimum: formatRate({ num: floor.rateCents, den: 1 }), citations: floor.citations.join("; ") })];
        weekWarnings.push({ code: "below_minimum_wage", ...who, jurisdiction: s.jurisdiction, ruleCode: MINIMUM_WAGE, date: s.date, entryIds: s.entryIds, ...message(say) });
      }
    }

    // 5. overtime: the federal row and each listing state's row must cover the whole workweek; then
    // the most protective weekly rule across them is applied once.
    const selection = selectWeeklyRule(rules.overtimeRules, ["US", ...states], ["US", ...statesListingWeekly], week);
    if (!selection.ok) {
      const federal = selection.jurisdiction === "US";
      const whose = { ...weekOf, jurisdiction: String(selection.jurisdiction) };
      if (selection.reason === "missing") {
        weekBlockers.push({ code: "rule_data_missing", ...who, jurisdiction: selection.jurisdiction, ruleCode: WEEKLY_OVERTIME, ...message([federal ? phrase("weeklyRowMissingFederal", weekOf) : phrase("weeklyRowMissing", whose)]) });
      } else {
        const say = [federal ? phrase("weeklyRuleChangesFederal", { ...weekOf, date: dated(selection.date) }) : phrase("weeklyRuleChanges", { ...whose, date: dated(selection.date) })];
        weekBlockers.push({ code: "rule_not_supported_yet", ...who, jurisdiction: selection.jurisdiction, ruleCode: WEEKLY_OVERTIME, date: selection.date, ...message(say) });
      }
      blockers.push(...weekBlockers);
      continue;
    }
    const weekly = selection.rule;
    const citations = weekly.citations.join("; ");

    // California counts hours day by day (daily, double-time and seventh-day overtime) before the
    // week; elsewhere only the week counts. A week mixing California with another state is held.
    const california = states.includes("CA");
    const weeklySplits: PremiumSplit[] = splitAtThreshold(shifts, weekly.thresholdMinutes).map(({ shift, regular, overtime }) => ({
      shift,
      regular,
      premiums: overtime > 0 ? [{ ruleCode: WEEKLY_OVERTIME, type: "OT" as const, multiplier: weekly.multiplier, minutes: overtime, citation: citations, thresholdMinutes: weekly.thresholdMinutes }] : [],
    }));
    let splits: PremiumSplit[] = weeklySplits;
    let caSplits: PremiumSplit[] | null = null;
    let caRules: CaliforniaRules | null = null;
    if (california) {
      const others = states.filter((st) => st !== "CA");
      if (others.length > 0) {
        weekBlockers.push({ code: "rule_not_supported_yet", ...who, jurisdiction: "CA", ...message([phrase("californiaMixed", { ...weekOf, others: others.join(", ") })]) });
        blockers.push(...weekBlockers);
        continue;
      }
      const codes = [...new Set(rules.jurisdictionRules.filter((r) => r.jurisdiction === "CA" && !isLocal(r) && dates.some((d) => isEffective(d, r.effectiveFrom, r.effectiveTo))).map((r) => r.ruleCode))];
      const ca = selectCaliforniaRules(rules.overtimeRules, codes, week);
      if (!ca.ok) {
        weekBlockers.push(
          ca.reason === "missing"
            ? { code: "rule_data_missing", ...who, jurisdiction: "CA", ruleCode: ca.ruleCode, ...message([phrase("californiaRowMissing", { ...weekOf, rule: String(ca.ruleCode) })]) }
            : { code: "rule_not_supported_yet", ...who, jurisdiction: "CA", ruleCode: ca.ruleCode, date: ca.date, ...message([phrase("californiaRuleChanges", { ...weekOf, rule: String(ca.ruleCode), date: dateValue(ca.date) })]) },
        );
        blockers.push(...weekBlockers);
        continue;
      }
      caRules = ca.rules;
      caSplits = splitCalifornia(shifts, week, ca.rules, { ...weekly, citation: citations });
    }
    const totalMinutes = shifts.reduce((sum, s) => sum + s.minutes, 0);
    const premiumOf = (x: PremiumSplit) => x.premiums.reduce((sum, p) => sum + p.minutes, 0);

    // Confirmed premiums must be for a day the worker worked on that assignment; a short day or a
    // holiday not worked, for a day the worker was placed there.
    const confirmed = confirmationsOf.get(key) ?? [];
    const holidaysNotWorked: { c: Confirmation; sample: Shift; terms: HolidayTerms }[] = [];
    const policyConflict = (date: string) => ({ code: "rule_data_invalid" as const, ...who, date, ...message([phrase("holidayPolicyConflict", about(date))]) });
    for (const c of confirmed) {
      const onDay = shifts.filter((s) => s.assignmentId === c.assignmentId && s.date === c.date);
      if (c.kind === "holiday_not_worked") {
        const workedThatDay = shifts.filter((s) => s.date === c.date).reduce((sum, s) => sum + s.minutes, 0);
        const found = onDay.length > 0 ? holidayTermsFor(rules.holidayPolicies, onDay[0]!.clientId, c.date) : null;
        if (!found) {
          weekBlockers.push({ code: "invalid_input", ...who, date: c.date, ...message([phrase("holidayNotPlaced", about(c.date))]) });
        } else if (workedThatDay > 0) {
          weekBlockers.push({ code: "invalid_input", ...who, date: c.date, ...message([phrase("holidayWorkedThatDay", { ...about(c.date), duration: time(workedThatDay) })]) });
        } else if (holidaysNotWorked.some((h) => h.c.date === c.date)) {
          if (!holidaysNotWorked.some((h) => h.c.date === c.date && h.c.assignmentId === c.assignmentId)) {
            weekBlockers.push({ code: "invalid_input", ...who, date: c.date, ...message([phrase("holidayTwoAssignments", about(c.date))]) });
          }
        } else if (found.ambiguous) {
          weekBlockers.push(policyConflict(c.date));
        } else if (!found.terms || found.terms.notWorkedMinutes === 0) {
          weekBlockers.push({ code: "invalid_input", ...who, date: c.date, ...message([phrase("holidayNoPolicy", about(c.date))]) });
        } else {
          holidaysNotWorked.push({ c, sample: onDay[0]!, terms: found.terms });
        }
        continue;
      }
      const reported = c.kind === "reported_short";
      if (!onDay.some((s) => reported || s.minutes > 0)) {
        // (Only meal, rest and short-day confirmations reach here: each kind has its own sentence.)
        const key: EngineKey = reported ? "shortDayNoReport" : PREMIUM_OF[c.kind]!.say.confirmedNoHours;
        weekBlockers.push({ code: "invalid_input", ...who, date: c.date, ...message([phrase(key, about(c.date))]) });
      } else if (reported && c.scheduledMinutes !== undefined && c.scheduledMinutes !== null && (!Number.isSafeInteger(c.scheduledMinutes) || c.scheduledMinutes <= 0 || c.scheduledMinutes > MINUTES_PER_DAY)) {
        weekBlockers.push({ code: "invalid_input", ...who, date: c.date, ...message([phrase("shortDayScheduleInvalid", about(c.date))]) });
      }
    }

    // A bonus belongs to an assignment the worker had hours on that week.
    const weekBonuses = bonusesOf.get(key) ?? [];
    for (const b of weekBonuses) {
      if (!shifts.some((s) => s.assignmentId === b.assignmentId && s.minutes > 0)) {
        weekBlockers.push({ code: "invalid_input", ...who, ...message([phrase("bonusNoHours", { ...weekOf, amount: formatCents(b.amountCents) })]) });
      }
    }

    // Hours worked on a holiday, when a policy pays or bills a premium for them; a paid premium needs
    // the rule saying which premiums stay out of the regular rate.
    const holidayOf = new Map<Shift, HolidayTerms>();
    const cutOffOf = new Map<Shift, Fraction>();
    const conflictDays = new Set<string>();
    for (const s of shifts.filter((x) => x.minutes > 0)) {
      const found = holidayTermsFor(rules.holidayPolicies, s.clientId, s.date);
      if (found.ambiguous) {
        if (!conflictDays.has(`${s.clientId}|${s.date}`)) weekBlockers.push(policyConflict(s.date));
        conflictDays.add(`${s.clientId}|${s.date}`);
        continue;
      }
      const terms = found.terms;
      const bm = terms?.bill?.billWorkedMultiplier;
      if (!terms || (!terms.pay && !(bm && bm.num > bm.den))) continue;
      holidayOf.set(s, terms);
      if (!terms.pay) continue;
      const cut = premiumExclusionOn(rules.regularRateRules, s.date);
      if (cut) cutOffOf.set(s, cut.multiplier);
      else if (!conflictDays.has("cut")) {
        conflictDays.add("cut");
        weekBlockers.push({ code: "rule_data_missing", ...who, jurisdiction: "US", date: s.date, ...message([phrase("holidayCutOffMissing", about(s.date))]) });
      }
    }

    if (weekBlockers.length > 0) {
      blockers.push(...weekBlockers);
      continue;
    }

    // 4. regular rate: the weighted average of the week's rates, exact (one rate: that rate).
    // Every minute counts at least at that day's minimum wage (a rate card below it is topped up).
    // Pay beyond the hourly rates goes in too: nondiscretionary bonuses, holiday premiums below 1.5×,
    // and flat-sum bonuses — except in California, where a flat-sum bonus has its own overtime.
    const effective = (s: Shift) => Math.max(s.payRateCents, floorOf.get(s)!);
    const worked = shifts.map((s) => ({ minutes: s.minutes, payRateCents: effective(s) }));
    const hasHours = shifts.some((s) => s.minutes > 0);
    const nondiscretionary = weekBonuses.filter((b) => b.kind === "nondiscretionary");
    const flat = weekBonuses.filter((b) => b.kind === "flat_sum");
    const flatCents = flat.reduce((sum, b) => sum + b.amountCents, 0);
    const smallHolidayPremiums = [...holidayOf]
      .filter(([s, t]) => t.pay !== null && premiumCountsInRegularRate(t.workedMultiplier, cutOffOf.get(s)!))
      .map(([s, t]) => ({ num: mul(s.minutes, effective(s), t.workedMultiplier.num - t.workedMultiplier.den), den: mul(60, t.workedMultiplier.den) }));
    const asCents = (bs: Bonus[]) => bs.map((b) => ({ num: b.amountCents, den: 1 }));
    // Shift differentials are pay for the hours worked: in the regular rate (29 C.F.R. § 778.207(b)).
    const differentials = shifts.filter((s) => s.differential && s.minutes > 0).map((s) => differentialEarned(s.minutes, s.differential!));
    // A week of reported days without work has no hours to average: its rate is the day's own.
    const rateWith = (extra: Fraction[]) => (hasHours ? regularRateWith(worked, extra) : { num: Math.max(...shifts.map(effective)), den: 1 });
    const rrHourly = rateWith([...differentials, ...asCents(nondiscretionary), ...smallHolidayPremiums]);
    const rrAll = rateWith([...differentials, ...asCents(nondiscretionary), ...smallHolidayPremiums, ...asCents(flat)]);
    const nonOvertime = caSplits ? caSplits.reduce((sum, x) => sum + x.regular, 0) : 0;
    if (!rrHourly || !rrAll) {
      blockers.push({ code: "invalid_input", ...who, ...message([phrase("regularRateTooLarge", weekOf)]) });
      continue;
    }
    if (caSplits && flat.length > 0 && nonOvertime === 0) {
      blockers.push({ code: "rule_not_supported_yet", ...who, jurisdiction: "CA", ...message([phrase("flatSumNoHours", { ...weekOf, citation: CA_FLAT_SUM_CITATION })]) });
      continue;
    }
    let regularRate = caSplits ? rrHourly : rrAll;
    const singleRate = new Set(worked.map((w) => w.payRateCents)).size === 1 && shifts.every((s) => s.payRateCents >= floorOf.get(s)!) && weekBonuses.length === 0 && smallHolidayPremiums.length === 0 && differentials.length === 0;

    // California pays at least what the federal weekly rule would: both apply, so when the weekly
    // rule's premiums are worth more (a minimum wage rising mid-week, or a flat-sum bonus, can do it)
    // they are paid instead. A flat-sum bonus's own overtime counts on California's side.
    let federalGoverns = false;
    if (caSplits) {
      const premiumParts = caSplits.flatMap((x) => x.premiums);
      const californiaWorth = flat.length > 0 ? addWorth(premiumWorth(caSplits, rrHourly, floorOf), alvaradoWorth(premiumParts, flatCents, nonOvertime)) : premiumWorth(caSplits, rrHourly, floorOf);
      if (worthMore(premiumWorth(weeklySplits, rrAll, floorOf), californiaWorth)) {
        federalGoverns = true;
        regularRate = rrAll;
      } else splits = caSplits;
    }
    const flatInRate = flat.length > 0 && (!caSplits || federalGoverns);
    const flatOvertime = flat.length > 0 && caSplits !== null && !federalGoverns;
    // California's own premiums (meal, rest, reporting time) are paid at its regular rate (Ferra): with
    // a flat-sum bonus, the bonus's share is spread over the hours not paid at a premium (Alvarado).
    let premiumRate: Fraction = regularRate;
    let premiumRateNote: SayValue = "";
    if (caSplits && flat.length > 0) {
      const withShare = reduceFractionBig(BigInt(rrHourly.num) * BigInt(nonOvertime) + BigInt(flatCents) * 60n * BigInt(rrHourly.den), BigInt(rrHourly.den) * BigInt(nonOvertime));
      if (!withShare) {
        blockers.push({ code: "invalid_input", ...who, ...message([phrase("regularRateTooLarge", weekOf)]) });
        continue;
      }
      premiumRate = withShare;
      const share = reduce({ num: mul(flatCents, 60), den: nonOvertime });
      premiumRateNote = nested(phrase("flatShareNote", { rate: formatRate(rrHourly), bonus: formatCents(flatCents), duration: time(nonOvertime), share: formatRate(share), citation: CA_FLAT_SUM_CITATION }));
    }
    /** " (the week's regular rate…)": the rate a premium or minimum pay is paid at. */
    const weekRegularRate: Say = [phrase("noteWeekRegularRate", { flatShare: premiumRateNote })];
    const californiaDaily = caSplits !== null && !federalGoverns;
    // A client billed overtime only for its own sites: the overtime and double time its own hours
    // alone would make this week (by the same rules), billed at its multipliers; the rest at straight time.
    // Each line keeps the premium minutes its own shifts carry in that client-alone split.
    const ownWorked = new Map<string, number>();
    const ownBudget = new Map<string, Record<"OT" | "DT", number>>();
    for (const clientId of [...new Set(shifts.filter((s) => s.otBillingRule === "own_sites_only").map((s) => s.clientId))].sort(cmp)) {
      const own = shifts.filter((s) => s.clientId === clientId);
      const ownSplits: { shift: Shift; premiums: { type: "OT" | "DT"; minutes: number }[] }[] =
        californiaDaily && caRules ? splitCalifornia(own, week, caRules, { ...weekly, citation: citations }) : splitAtThreshold(own, weekly.thresholdMinutes).map(({ shift, overtime }) => ({ shift, premiums: [{ type: "OT" as const, minutes: overtime }] }));
      for (const x of ownSplits) {
        const budget = ownBudget.get(lineKey(x.shift)) ?? { OT: 0, DT: 0 };
        for (const p of x.premiums) budget[p.type] += p.minutes;
        ownBudget.set(lineKey(x.shift), budget);
      }
      ownWorked.set(clientId, own.reduce((sum, s) => sum + s.minutes, 0));
    }
    const weeklyMinutes = splits.reduce((sum, x) => sum + x.premiums.filter((p) => p.ruleCode === WEEKLY_OVERTIME).reduce((s2, p) => s2 + p.minutes, 0), 0);
    const straightEligible = splits.reduce((sum, x) => sum + x.regular, 0) + weeklyMinutes;

    // Overtime allocation follows the order of work; flag days where that order was assumed.
    const otDays = new Set(splits.filter((x) => premiumOf(x) > 0).map((x) => x.shift.date));
    for (const date of [...otDays].sort(cmp)) {
      const sameDay = byDay.get(date) ?? [];
      if (new Set(sameDay.map(lineKey)).size > 1 && sameDay.some((s) => s.startMinute === null)) {
        warnings.push({ code: "allocation_order_assumed", ...who, date, ...message([phrase("allocationOrderAssumed", about(date))]) });
      }
    }

    // 7. allocate to assignments (and so to clients) at the rates in effect for each shift.
    const buckets = new Map<string, Bucket>();
    splits.forEach((split, index) => {
      const { shift, regular } = split;
      const premium = premiumOf(split);
      const k = lineKey(shift);
      const b = buckets.get(k) ?? { key: k, assignmentId: shift.assignmentId, clientId: shift.clientId, firstIndex: index, sample: shift, regular: 0, overtime: 0, regularEntries: [], overtimeEntries: [], overtimeParts: [], trueUps: [], holiday: [], holidayBill: [], billRate: { regular: { explains: [], typed: false }, overtime: { explains: [], typed: false } }, payWhy: [], diffs: [] };
      if (shift.payRateExplain && !b.payWhy.some((x) => x.explain === shift.payRateExplain)) b.payWhy.push(worded(shift.payRateExplain, shift.payRateSay));
      if (regular > 0) noteWorking(b.billRate.regular, shift);
      if (premium > 0) noteWorking(b.billRate.overtime, shift);
      b.regular += regular;
      b.overtime += premium;
      if (regular > 0) b.regularEntries.push(...shift.entryIds);
      if (premium > 0) b.overtimeEntries.push(...shift.entryIds);
      for (const p of split.premiums) {
        const { base, floorApplies } = premiumBase(regularRate, floorOf.get(shift)!);
        const partKey = `${p.ruleCode}|${p.type}|${base.num}/${base.den}`;
        const part =
          b.overtimeParts.find((x) => x.key === partKey) ??
          b.overtimeParts[b.overtimeParts.push({ key: partKey, ruleCode: p.ruleCode, type: p.type, multiplier: p.multiplier, citation: p.citation, thresholdMinutes: p.thresholdMinutes, base, floorApplies, minutes: 0, entries: [], dates: [] }) - 1]!;
        part.minutes += p.minutes;
        part.entries.push(...shift.entryIds);
        if (!part.dates.includes(shift.date)) part.dates.push(shift.date);
      }
      const floor = floorOf.get(shift)!;
      if (shift.payRateCents < floor && shift.minutes > 0) {
        const t = b.trueUps.find((x) => x.floor === floor) ?? b.trueUps[b.trueUps.push({ floor, minutes: 0, entries: [], dates: [], citations: [] }) - 1]!;
        t.minutes += shift.minutes;
        t.entries.push(...shift.entryIds);
        if (!t.dates.includes(shift.date)) t.dates.push(shift.date);
        for (const c of floorCitations.get(shift) ?? []) if (!t.citations.includes(c)) t.citations.push(c);
      }
      const terms = holidayOf.get(shift);
      const cutOff = cutOffOf.get(shift);
      if (terms?.pay && cutOff) {
        const rateCents = effective(shift);
        const hKey = JSON.stringify([terms.pay.clientId, terms.pay.name, terms.workedMultiplier, cutOff, rateCents]);
        const h = b.holiday.find((x) => x.key === hKey) ?? b.holiday[b.holiday.push({ key: hKey, policy: terms.pay, multiplier: terms.workedMultiplier, cutOff, rateCents, minutes: 0, entries: [], dates: [] }) - 1]!;
        h.minutes += shift.minutes;
        h.entries.push(...shift.entryIds);
        if (!h.dates.includes(shift.date)) h.dates.push(shift.date);
      }
      const d = shift.differential;
      if (d && shift.minutes > 0) {
        const dKey = differentialKey(d);
        const x = b.diffs.find((y) => y.key === dKey) ?? b.diffs[b.diffs.push({ key: dKey, d, minutes: 0, entries: [], dates: [] }) - 1]!;
        x.minutes += shift.minutes;
        x.entries.push(...shift.entryIds);
        if (!x.dates.includes(shift.date)) x.dates.push(shift.date);
      }
      const bm = terms?.bill?.billWorkedMultiplier;
      if (terms?.bill && bm && bm.num > bm.den) {
        const bKey = JSON.stringify([terms.bill.clientId, terms.bill.name, bm]);
        const hb = b.holidayBill.find((x) => x.key === bKey) ?? b.holidayBill[b.holidayBill.push({ key: bKey, policy: terms.bill, multiplier: bm, minutes: 0, entries: [] }) - 1]!;
        hb.minutes += shift.minutes;
        hb.entries.push(...shift.entryIds);
      }
      buckets.set(k, b);
    });

    const weekPay: Line[] = [];
    const weekBill: Line[] = [];
    /** Dates as "a, b and c", each written the reader's way. */
    const listDates = (dates: string[]) => andList(dates.map(dated));
    // What the regular rate is made of, for the explain strings.
    const straightEarned = reduce({ num: worked.reduce((sum, w) => sum + mul(w.minutes, w.payRateCents), 0), den: 60 });
    const smallHolidayTotal = smallHolidayPremiums.reduce((sum, f) => addWorth(sum, { num: BigInt(f.num), den: BigInt(f.den) }), { num: 0n, den: 1n });
    const diffTotals = new Map<string, { num: bigint; den: bigint }>();
    for (const s of shifts.filter((x) => x.differential && x.minutes > 0)) {
      const e = differentialEarned(s.minutes, s.differential!);
      diffTotals.set(s.differential!.name, addWorth(diffTotals.get(s.differential!.name) ?? { num: 0n, den: 1n }, { num: BigInt(e.num), den: BigInt(e.den) }));
    }
    const inRate = [
      ...[...diffTotals].sort((a, b) => cmp(a[0], b[0])).map(([name, w]) => nested(phrase("extraDifferential", { amount: formatMoney(reduceFractionBig(w.num, w.den)!), name }))),
      ...nondiscretionary.map((b) => nested(phrase("extraNondiscretionaryBonus", { amount: formatCents(b.amountCents) }))),
      ...(flatInRate ? flat.map((b) => nested(phrase("extraFlatSumBonus", { amount: formatCents(b.amountCents) }))) : []),
      ...(smallHolidayPremiums.length > 0 ? [nested(phrase("extraHolidayPremium", { amount: formatMoney(reduceFractionBig(smallHolidayTotal.num, smallHolidayTotal.den)!) }))] : []),
    ];
    const inRateCitations = [...(differentials.length > 0 ? [SHIFT_DIFFERENTIAL_CITATION] : []), ...(nondiscretionary.length > 0 || flatInRate ? [BONUS_CITATION] : []), ...(smallHolidayPremiums.length > 0 ? ["29 C.F.R. § 778.203"] : [])];
    for (const b of [...buckets.values()].sort((x, y) => x.firstIndex - y.firstIndex)) {
      const base = { workerId: first.workerId, assignmentId: b.assignmentId, clientId: b.clientId, workweekStart: week };
      const payRate: Fraction = { num: b.sample.payRateCents, den: 1 };
      const billRate: Fraction = { num: b.sample.billRateCents, den: 1 };
      // " <why the pay rate is above the rate card's>" for each reason, once.
      const rateWhy: Say = b.payWhy.flatMap((x) => [phrase("gap"), ...x.say]);

      // 3. straight pay
      if (b.regular > 0) {
        const pay = arithmetic([phrase("labelRegular")], b.regular, payRate);
        const scope = californiaDaily
          ? phrase("straightTimeCalifornia", { rule: "straight_time", week: dated(week) })
          : phrase("straightTimeWeekly", { rule: "straight_time", threshold: time(weekly.thresholdMinutes), week: dated(week) });
        weekPay.push({ ...base, type: "REG", minutes: b.regular, rate: payRate, amountCents: pay.amountCents, ruleId: "straight_time", ...explained([pay.part, scope, ...rateWhy]), entryIds: uniqueSorted(b.regularEntries) });
        const bill = arithmetic([phrase("labelBilledRegular")], b.regular, billRate);
        weekBill.push({ ...base, type: "REG", minutes: b.regular, rate: billRate, amountCents: bill.amountCents, ruleId: "bill_regular", ...explained([bill.part, phrase("billRateFromCard", { working: billRateNote(b.billRate.regular) })]), entryIds: uniqueSorted(b.regularEntries) });
      }

      // 5. overtime and double time: straight time + the premium on the regular rate, by rule; then billing
      if (b.overtime > 0) {
        const elsewhere = splits.filter((x) => x.shift.assignmentId !== b.assignmentId).reduce((sum, x) => sum + x.regular, 0);
        const elsewhereNote: Say = elsewhere > 0 ? [phrase("elsewhereNote", { elsewhere: time(elsewhere), threshold: time(weekly.thresholdMinutes) })] : [];
        const straight = formatRate(payRate).replace("/h", "");
        const rrText = formatRate(regularRate);
        const earned = inRate.length === 0 ? phrase("earnedStraight", { amount: formatMoney(straightEarned) }) : phrase("earnedWithExtras", { amount: formatMoney(straightEarned), extras: plusList(inRate) });
        const flatNote: Say = flatOvertime ? [phrase("flatSumNotInRate", { citation: CA_FLAT_SUM_CITATION })] : [];
        const rrCitations = [REGULAR_RATE_CITATION, ...(california ? [CA_REGULAR_RATE_CITATION] : []), ...inRateCitations].join("; ");
        const rrWhy: Say = [phrase("regularRateWhy", { earned: nested(earned), worked: time(totalMinutes), rate: rrText, citations: rrCitations }), ...flatNote];
        const whyFor = (part: Bucket["overtimeParts"][number]): Say => {
          const on = listDates(part.dates);
          switch (part.ruleCode) {
            case WEEKLY_OVERTIME:
              return californiaDaily
                ? [phrase("whyWeeklyCalifornia", { rule: WEEKLY_OVERTIME, worked: time(straightEligible), week: dated(week), over: time(weeklyMinutes), threshold: time(weekly.thresholdMinutes), citations }), ...elsewhereNote]
                : [phrase("whyWeekly", { rule: WEEKLY_OVERTIME, worked: time(totalMinutes), week: dated(week), over: time(weeklyMinutes), threshold: time(weekly.thresholdMinutes), citations }), ...elsewhereNote, ...(federalGoverns ? [phrase("federalGoverns")] : [])];
            case CA_DAILY_OVERTIME:
            case CA_DAILY_DOUBLE_TIME:
              return [phrase("whyDailyOvertime", { rule: part.ruleCode, threshold: time(part.thresholdMinutes), dates: on, citation: part.citation })];
            case CA_SEVENTH_DAY:
              return [phrase("whySeventhDay", { rule: CA_SEVENTH_DAY, dates: on, week: dated(week), citation: part.citation })];
            default:
              return [phrase("whySeventhDayOver", { rule: part.ruleCode, threshold: time(part.thresholdMinutes), dates: on, week: dated(week), citation: part.citation })];
          }
        };
        const ordered = [...b.overtimeParts.filter((p) => p.type === "OT"), ...b.overtimeParts.filter((p) => p.type === "DT")];
        for (const part of ordered) {
          const m = part.multiplier;
          const premium = formatMultiplier({ num: m.num - m.den, den: m.den });
          const otRate = overtimeRate(b.sample.payRateCents, part.base, m);
          const note =
            singleRate && !part.floorApplies
              ? phrase("noteMultiplierOfRate", { multiplier: formatMultiplier(m), rate: straight })
              : part.floorApplies
                ? phrase("noteFloorPremium", { rate: straight, premium, floor: formatRate(part.base), regularRate: rrText, citation: RATE_FLOOR_CITATION })
                : phrase("noteRegularRatePremium", { rate: straight, premium, regularRate: rrText });
          const pay = arithmetic([phrase(part.type === "DT" ? "labelDoubleTime" : "labelOvertime")], part.minutes, otRate, [note]);
          weekPay.push({ ...base, type: part.type, minutes: part.minutes, rate: otRate, amountCents: pay.amountCents, ruleId: part.ruleCode, ...explained([pay.part, ...whyFor(part), ...(singleRate ? [] : rrWhy), ...rateWhy]), entryIds: uniqueSorted(part.entries) });
        }

        // Billing mirrors the pay lines by rule (a minimum-wage base never splits a bill line).
        const billParts = new Map<string, { type: "OT" | "DT"; ruleCode: string; minutes: number; entries: string[] }>();
        for (const part of ordered) {
          const k2 = `${part.ruleCode}|${part.type}`;
          const bp = billParts.get(k2) ?? { type: part.type, ruleCode: part.ruleCode, minutes: 0, entries: [] };
          bp.minutes += part.minutes;
          bp.entries.push(...part.entries);
          billParts.set(k2, bp);
        }
        const rule = b.sample.otBillingRule;
        for (const bp of billParts.values()) {
          const dt = bp.type === "DT";
          const note = bp.ruleCode === WEEKLY_OVERTIME ? elsewhereNote : [];
          // In California a line can carry several rules' hours: the bill line says whose it mirrors.
          const forRule: Say = caSplits !== null ? [phrase("forRuleHours", { rule: bp.ruleCode })] : [];
          const working = billRateNote(b.billRate.overtime);
          const atMultiplier = (minutes: number, why: SayPart) => {
            const m = dt ? b.sample.billDtMultiplier : b.sample.billOtMultiplier;
            const rate = reduce({ num: mul(b.sample.billRateCents, m.num), den: m.den });
            const bill = arithmetic([phrase(dt ? "labelBilledDoubleTime" : "labelBilledOvertime"), ...forRule], minutes, rate, [phrase("noteBillMultiplier", { multiplier: formatMultiplier(m), rate: formatRate(billRate).replace("/h", "") })]);
            weekBill.push({ ...base, type: bp.type, minutes, rate, amountCents: bill.amountCents, ruleId: "bill_overtime_multiplier", ...explained([bill.part, why, ...note]), entryIds: uniqueSorted(bp.entries) });
          };
          const atStraightTime = (minutes: number, ruleId: string, why: SayPart) => {
            const bill = arithmetic([phrase(dt ? "labelBilledDoubleTimeStraight" : "labelBilledOvertimeStraight"), ...forRule], minutes, billRate);
            weekBill.push({ ...base, type: bp.type, minutes, rate: billRate, amountCents: bill.amountCents, ruleId, ...explained([bill.part, why, ...note]), entryIds: uniqueSorted(bp.entries) });
          };
          if (rule === "multiplier") {
            atMultiplier(bp.minutes, phrase(dt ? "billDoubleTimeMultiplier" : "billOvertimeMultiplier", { working }));
          } else if (rule === "straight_time") {
            atStraightTime(bp.minutes, "bill_overtime_straight", phrase(dt ? "billDoubleTimeStraight" : "billOvertimeStraight", { working }));
          } else if (rule === "own_sites_only") {
            const budget = ownBudget.get(b.key) ?? { OT: 0, DT: 0 };
            const ownMinutes = Math.min(budget[bp.type], bp.minutes);
            budget[bp.type] -= ownMinutes;
            const worked = time(ownWorked.get(b.clientId) ?? 0);
            if (ownMinutes > 0) atMultiplier(ownMinutes, phrase(dt ? "billDoubleTimeOwnSites" : "billOvertimeOwnSites", { worked, working }));
            if (bp.minutes > ownMinutes) {
              atStraightTime(bp.minutes - ownMinutes, "bill_overtime_own_sites_straight", phrase(dt ? "billDoubleTimeOwnSitesStraight" : "billOvertimeOwnSitesStraight", { worked, working }));
            }
          } else {
            const say = [phrase(dt ? "notBilledDoubleTime" : "notBilledOvertime", { forRule: forRule.length > 0 ? nested(forRule) : "", duration: time(bp.minutes), minutes: String(bp.minutes), amount: formatCents(0) }), ...note];
            weekBill.push({ ...base, type: bp.type, minutes: bp.minutes, rate: { num: 0, den: 1 }, amountCents: 0, ruleId: "bill_overtime_not_billable", ...explained(say), entryIds: uniqueSorted(bp.entries) });
          }
        }
      }
      // 2 (paid). minimum-wage top-up for every minute paid below that day's minimum
      for (const t of b.trueUps) {
        const rate: Fraction = { num: t.floor - b.sample.payRateCents, den: 1 };
        const pay = arithmetic([phrase("labelMinimumWageTopUp")], t.minutes, rate, [phrase("noteTopUp", { minimum: formatRate({ num: t.floor, den: 1 }).replace("/h", ""), rate: formatRate(payRate).replace("/h", "") })]);
        // Less than half a cent rounds to nothing: no line (the warning still asks for the rate card to be fixed).
        if (pay.amountCents === 0) continue;
        const why = phrase("whyTopUp", { rule: MINIMUM_WAGE, dates: commaList(t.dates.map(dated)), citations: t.citations.join("; ") });
        weekPay.push({ ...base, type: "MW_TRUEUP", minutes: t.minutes, rate, amountCents: pay.amountCents, ruleId: MINIMUM_WAGE, ...explained([pay.part, why, ...rateWhy]), entryIds: uniqueSorted(t.entries) });
      }
      // 6. holiday premium on hours worked on a holiday: paid on top of straight time and any overtime.
      for (const h of b.holiday) {
        const k = h.multiplier;
        const extra = { num: k.num - k.den, den: k.den };
        const rate = reduce({ num: mul(h.rateCents, extra.num), den: extra.den });
        const of = { multiplier: formatMultiplier(extra), rate: formatMoney({ num: h.rateCents, den: 1 }) };
        const pay = arithmetic([phrase("labelHolidayPremium")], h.minutes, rate, [h.rateCents > b.sample.payRateCents ? phrase("noteHolidayPremiumFloor", of) : phrase("noteMultiplierOfRate", of)]);
        const cut = formatMultiplier(h.cutOff);
        const counts = phrase(premiumCountsInRegularRate(k, h.cutOff) ? "holidayCounted" : "holidayNotCounted", { cutOff: cut, citation: HOLIDAY_WORKED_CITATION });
        const why = phrase(h.dates.length > 1 ? "whyHolidayMany" : "whyHolidayOne", { rule: HOLIDAY_WORKED, dates: listDates(h.dates), policy: h.policy.name, multiplier: formatMultiplier(k) });
        if (pay.amountCents > 0) weekPay.push({ ...base, type: "HOL", minutes: h.minutes, rate, amountCents: pay.amountCents, ruleId: HOLIDAY_WORKED, ...explained([pay.part, why, counts, ...rateWhy]), entryIds: uniqueSorted(h.entries) });
      }
      // Billed by the client's own holiday policy when it has one, else the agency's.
      for (const h of b.holidayBill) {
        const extra = { num: h.multiplier.num - h.multiplier.den, den: h.multiplier.den };
        const rate = reduce({ num: mul(b.sample.billRateCents, extra.num), den: extra.den });
        const bill = arithmetic([phrase("labelBilledHolidayPremium")], h.minutes, rate, [phrase("noteBillMultiplier", { multiplier: formatMultiplier(extra), rate: formatRate(billRate).replace("/h", "") })]);
        const why = phrase("billHolidayPremium", { multiplier: formatMultiplier(h.multiplier), policy: h.policy.name });
        if (bill.amountCents > 0) weekBill.push({ ...base, type: "HOL", minutes: h.minutes, rate, amountCents: bill.amountCents, ruleId: "bill_holiday_premium", ...explained([bill.part, why]), entryIds: uniqueSorted(h.entries) });
      }
      // 6. shift differentials: on top of straight time and overtime, at the rate card's cents per hour.
      for (const x of b.diffs) {
        const rate: Fraction = { num: x.d.payCentsPerHour, den: 1 };
        const pay = arithmetic([phrase("labelDifferential", { name: x.d.name })], x.minutes, rate);
        const why = phrase("whyDifferential", { rule: SHIFT_DIFFERENTIAL, name: x.d.name, rate: formatRate(rate), dates: listDates(x.dates), citation: SHIFT_DIFFERENTIAL_CITATION });
        if (pay.amountCents > 0) weekPay.push({ ...base, type: "DIFF", minutes: x.minutes, rate, amountCents: pay.amountCents, ruleId: SHIFT_DIFFERENTIAL, ...explained([pay.part, why]), entryIds: uniqueSorted(x.entries) });
        if (x.d.billCentsPerHour > 0) {
          const billDiff: Fraction = { num: x.d.billCentsPerHour, den: 1 };
          const bill = arithmetic([phrase("labelBilledDifferential", { name: x.d.name })], x.minutes, billDiff);
          if (bill.amountCents > 0) weekBill.push({ ...base, type: "DIFF", minutes: x.minutes, rate: billDiff, amountCents: bill.amountCents, ruleId: "bill_shift_differential", ...explained([bill.part, phrase("billDifferential", { name: x.d.name, rate: formatRate(billDiff) })]), entryIds: uniqueSorted(x.entries) });
        }
      }
    }

    // 6. confirmed premiums: an hour at the week's regular rate per confirmed missed period, capped per workday.
    const premiums = new Map<string, { assignmentId: string; clientId: string; kind: ConfirmationKind; rule: PremiumRule; rate: Fraction; floorApplies: boolean; billRateCents: number; billed: boolean; minutes: number; dates: string[]; entries: string[] }>();
    const perDay = new Map<string, number>();
    const notApplicable = new Set<string>();
    for (const c of confirmed.filter((x) => x.kind === "meal_period_missed" || x.kind === "rest_period_missed")) {
      const day = shifts.filter((s) => s.assignmentId === c.assignmentId && s.date === c.date);
      const what = PREMIUM_OF[c.kind]!;
      const rule = premiumRuleFor(rules.premiumRules, day[0]!.jurisdiction, what.ruleCode, c.date);
      if (!rule) {
        const k = `${day[0]!.jurisdiction}|${c.kind}`;
        if (!notApplicable.has(k)) {
          notApplicable.add(k);
          weekWarnings.push({ code: "premium_not_applicable", ...who, jurisdiction: day[0]!.jurisdiction, date: c.date, ...message([phrase(what.say.notApplicable, { ...about(c.date), jurisdiction: String(day[0]!.jurisdiction) })]) });
        }
        continue;
      }
      const dayKey = `${c.date}|${rule.ruleCode}`;
      if ((perDay.get(dayKey) ?? 0) >= rule.perWorkdayMax) continue;
      perDay.set(dayKey, (perDay.get(dayKey) ?? 0) + 1);
      const billed = day[0]!.billsPremiums === true;
      // The regular rate is never below the day's minimum wage (DLSE; 29 C.F.R. § 778.107).
      const { base, floorApplies } = premiumBase(premiumRate, floorOf.get(day[0]!)!);
      const k = `${c.assignmentId}|${rule.ruleCode}|${base.num}/${base.den}|${billed ? day[0]!.billRateCents : 0}`;
      const p = premiums.get(k) ?? { assignmentId: c.assignmentId, clientId: day[0]!.clientId, kind: c.kind, rule, rate: base, floorApplies, billRateCents: day[0]!.billRateCents, billed, minutes: 0, dates: [], entries: [] };
      p.minutes += rule.premiumMinutes;
      if (!p.dates.includes(c.date)) p.dates.push(c.date);
      for (const s of day) p.entries.push(...s.entryIds);
      premiums.set(k, p);
    }
    for (const p of premiums.values()) {
      const what = PREMIUM_OF[p.kind]!;
      const note = p.floorApplies ? [phrase("notePremiumFloor", { regularRate: formatRate(premiumRate), citation: RATE_FLOOR_CITATION })] : weekRegularRate;
      const pay = arithmetic([phrase(what.say.label)], p.minutes, p.rate, note);
      const why = phrase(what.say.why, { rule: p.rule.ruleCode, dates: commaList(p.dates.map(dated)), max: String(p.rule.perWorkdayMax), citation: p.rule.citation });
      weekPay.push({ workerId: first.workerId, assignmentId: p.assignmentId, clientId: p.clientId, workweekStart: week, type: what.type, minutes: p.minutes, rate: p.rate, amountCents: pay.amountCents, ruleId: p.rule.ruleCode, ...explained([pay.part, why]), entryIds: uniqueSorted(p.entries) });
      if (p.billed) {
        const billRate: Fraction = { num: p.billRateCents, den: 1 };
        const bill = arithmetic([phrase(what.say.billedLabel)], p.minutes, billRate);
        weekBill.push({ workerId: first.workerId, assignmentId: p.assignmentId, clientId: p.clientId, workweekStart: week, type: what.type, minutes: p.minutes, rate: billRate, amountCents: bill.amountCents, ruleId: "bill_premium", ...explained([bill.part, phrase("billPremium")]), entryIds: uniqueSorted(p.entries) });
      }
    }

    // 6. minimum pay for a confirmed short day: California reporting time, Massachusetts reporting pay,
    // the Illinois day-labor minimum, New Jersey's sent-and-not-used minimum. Not hours worked; never
    // counted toward overtime.
    const shortDays = new Set<string>();
    /** Minutes of minimum pay required by law already paid, per assignment and day (a contractual minimum counts them). */
    const statutoryPaid = new Map<string, number>();
    for (const c of confirmed.filter((x) => x.kind === "reported_short")) {
      if (shortDays.has(`${c.assignmentId}|${c.date}`)) continue;
      shortDays.add(`${c.assignmentId}|${c.date}`);
      const day = shifts.filter((s) => s.assignmentId === c.assignmentId && s.date === c.date);
      const sample = day[0]!;
      const atAssignment = day.reduce((sum, s) => sum + s.minutes, 0);
      const atClient = shifts.filter((s) => s.clientId === sample.clientId && s.date === c.date).reduce((sum, s) => sum + s.minutes, 0);
      const allDay = shifts.filter((s) => s.date === c.date).reduce((sum, s) => sum + s.minutes, 0);
      const rule = guaranteeRuleFor(rules.guaranteeRules, sample.jurisdiction, c.date);
      const notHere = (why: SayPart) => {
        weekWarnings.push({ code: "premium_not_applicable", ...who, jurisdiction: sample.jurisdiction, date: c.date, ...message([phrase("shortDayNothingMore", { ...about(c.date), why: nested(why) })]) });
      };
      if (!rule) {
        notHere(phrase("whyNoGuaranteeRule", { jurisdiction: String(sample.jurisdiction) }));
        continue;
      }
      const sentNotUsed = rule.ruleCode === IL_DAY_LABOR_MINIMUM || rule.ruleCode === NJ_SENT_NOT_USED;
      if (sentNotUsed && sample.dayAndTemporaryLabor === false) {
        notHere(phrase("whyNotDayLabor"));
        continue;
      }
      const needsSchedule = rule.ruleCode === CA_REPORTING_TIME || rule.ruleCode === MA_REPORTING_PAY;
      if (needsSchedule && !c.scheduledMinutes) {
        blockers.push({ code: "invalid_input", ...who, date: c.date, ...message([phrase("shortDayScheduleMissing", { ...about(c.date), jurisdiction: String(sample.jurisdiction) })]) });
        weekPay.length = 0;
        break;
      }
      let shortfall: number;
      // The rule's sentence: "Rule <code>: <what happened that day>, not as hours worked (<citation>)."
      let story: SayPart;
      const ruled = { rule: rule.ruleCode, date: dated(c.date), citation: rule.citation };
      if (rule.ruleCode === CA_REPORTING_TIME) {
        const r = caReportingTime(rule, c.scheduledMinutes!, atAssignment);
        shortfall = r.shortfall;
        story = phrase("whyReportingCalifornia", { ...ruled, scheduled: time(c.scheduledMinutes!), half: time(r.halfMinutes), least: time(rule.minMinutes ?? 0), most: time(rule.maxMinutes ?? r.halfMinutes), worked: time(atAssignment), more: time(shortfall) });
      } else if (rule.ruleCode === MA_REPORTING_PAY) {
        const r = maReportingPay(rule, c.scheduledMinutes!, atAssignment);
        shortfall = r.shortfall;
        story = phrase("whyReportingMassachusetts", { ...ruled, scheduled: time(c.scheduledMinutes!), due: time(r.dueMinutes), worked: time(atAssignment), more: time(shortfall) });
      } else if (sentNotUsed) {
        const r = (rule.ruleCode === NJ_SENT_NOT_USED ? njSentNotUsed : ilDayLaborMinimum)(rule, c.reassigned === true, atClient, allDay);
        shortfall = r.shortfall;
        story = c.reassigned
          ? phrase("whyDayLaborReassigned", { ...ruled, due: time(r.dueMinutes), worked: time(allDay), more: time(shortfall) })
          : phrase("whyDayLabor", { ...ruled, due: time(r.dueMinutes), worked: time(atClient), more: time(shortfall) });
      } else {
        notHere(phrase("whyRuleNotComputed", { rule: String(rule.ruleCode) }));
        continue;
      }
      if (shortfall <= 0) continue;
      const rate: Fraction = rule.basis === "regular_rate" ? premiumBase(premiumRate, floorOf.get(sample)!).base : { num: effective(sample), den: 1 };
      const type: EarningType = sentNotUsed ? "MIN_GUARANTEE" : "REPORTING_PAY";
      const dayLabor = type === "MIN_GUARANTEE";
      const basisNote = rule.basis === "regular_rate" ? weekRegularRate : [phrase(sample.payRateCents < effective(sample) ? "noteMinimumWageThatDay" : sample.payRateExplain ? "noteEqualPayRate" : "noteAgreedPayRate")];
      const guaranteeWhy: Say = sample.payRateExplain ? [phrase("gap"), ...worded(sample.payRateExplain, sample.payRateSay).say] : [];
      const pay = arithmetic([phrase(dayLabor ? "labelDayLaborMinimum" : "labelReportingTimePay")], shortfall, rate, basisNote);
      statutoryPaid.set(`${c.assignmentId}|${c.date}`, (statutoryPaid.get(`${c.assignmentId}|${c.date}`) ?? 0) + shortfall);
      weekPay.push({ workerId: first.workerId, assignmentId: c.assignmentId, clientId: sample.clientId, workweekStart: week, type, minutes: shortfall, rate, amountCents: pay.amountCents, ruleId: rule.ruleCode, ...explained([pay.part, story, ...guaranteeWhy]), entryIds: uniqueSorted(day.flatMap((s) => s.entryIds)) });
      if (sample.billsGuarantees === true) {
        const billRate: Fraction = { num: sample.billRateCents, den: 1 };
        const bill = arithmetic([phrase(dayLabor ? "labelBilledDayLaborMinimum" : "labelBilledReportingTimePay")], shortfall, billRate);
        weekBill.push({ workerId: first.workerId, assignmentId: c.assignmentId, clientId: sample.clientId, workweekStart: week, type, minutes: shortfall, rate: billRate, amountCents: bill.amountCents, ruleId: "bill_minimum_pay", ...explained([bill.part, phrase("billMinimumPay")]), entryIds: uniqueSorted(day.flatMap((s) => s.entryIds)) });
      }
    }
    if (blockers.some((b) => b.workerId === first.workerId && b.workweekStart === week)) continue;

    // 6. a contractual minimum day from the rate card: the shortfall at the pay rate, after any minimum
    // pay the law requires for the same day. Not hours worked; never counted toward overtime.
    const contractDays = new Map<string, Shift[]>();
    for (const s of shifts.filter((x) => (x.contractMinimumMinutes ?? 0) > 0)) {
      const k = `${s.assignmentId}|${s.date}`;
      contractDays.set(k, [...(contractDays.get(k) ?? []), s]);
    }
    for (const [k, day] of [...contractDays].sort((a, b) => cmp(a[0], b[0]))) {
      const sample = day[0]!;
      const due = Math.max(...day.map((s) => s.contractMinimumMinutes ?? 0));
      const worked = shifts.filter((s) => `${s.assignmentId}|${s.date}` === k).reduce((sum, s) => sum + s.minutes, 0);
      const statutory = statutoryPaid.get(k) ?? 0;
      const shortfall = contractShortfall(due, worked, statutory);
      if (shortfall <= 0) continue;
      const rate: Fraction = { num: effective(sample), den: 1 };
      const pay = arithmetic([phrase("labelContractMinimum")], shortfall, rate, [phrase(sample.payRateCents < effective(sample) ? "noteMinimumWageThatDay" : sample.payRateExplain ? "noteEqualPayRate" : "noteAgreedPayRate")]);
      const story = phrase("whyContractMinimum", {
        rule: CONTRACT_MINIMUM,
        due: time(due),
        date: dated(sample.date),
        worked: time(worked),
        statutory: statutory > 0 ? nested(phrase("contractCountsStatutory", { paid: time(statutory) })) : "",
        more: time(shortfall),
        citation: CONTRACT_MINIMUM_CITATION,
      });
      const entryIds = uniqueSorted(day.flatMap((s) => s.entryIds));
      weekPay.push({ workerId: first.workerId, assignmentId: sample.assignmentId, clientId: sample.clientId, workweekStart: week, type: "MIN_GUARANTEE", minutes: shortfall, rate, amountCents: pay.amountCents, ruleId: CONTRACT_MINIMUM, ...explained([pay.part, story]), entryIds });
      if (sample.billsContractMinimum === true) {
        const billRate: Fraction = { num: sample.billRateCents, den: 1 };
        const bill = arithmetic([phrase("labelBilledContractMinimum")], shortfall, billRate);
        weekBill.push({ workerId: first.workerId, assignmentId: sample.assignmentId, clientId: sample.clientId, workweekStart: week, type: "MIN_GUARANTEE", minutes: shortfall, rate: billRate, amountCents: bill.amountCents, ruleId: "bill_contract_minimum", ...explained([bill.part, phrase("billContractMinimum")]), entryIds });
      }
    }

    // 6. pay for a holiday not worked, confirmed by a person: pay, not hours worked.
    for (const { c, sample, terms } of holidaysNotWorked) {
      const rate: Fraction = { num: effective(sample), den: 1 };
      const minutes = terms.notWorkedMinutes;
      const pay = arithmetic([phrase("labelHolidayNotWorked")], minutes, rate, [phrase(sample.payRateCents < effective(sample) ? "noteMinimumWageThatDay" : sample.payRateExplain ? "noteEqualPayRate" : "noteAgreedPayRate")]);
      const why = phrase("whyHolidayNotWorked", { rule: HOLIDAY_NOT_WORKED, date: dated(c.date), policy: terms.notWorked!.name, citation: HOLIDAY_NOT_WORKED_CITATION });
      const line = { workerId: first.workerId, assignmentId: c.assignmentId, clientId: sample.clientId, workweekStart: week, type: "HOL_NOT_WORKED" as const, minutes, entryIds: [] };
      const rateWhyHere: Say = sample.payRateExplain ? [phrase("gap"), ...worded(sample.payRateExplain, sample.payRateSay).say] : [];
      weekPay.push({ ...line, rate, amountCents: pay.amountCents, ruleId: HOLIDAY_NOT_WORKED, ...explained([pay.part, why, ...rateWhyHere]) });
      // Billed by the client's own policy (or the agency's when it has none): its minutes, if any.
      const billMinutes = terms.bill?.billNotWorked ? terms.bill.notWorkedMinutes : 0;
      if (terms.bill && billMinutes > 0) {
        const billRate: Fraction = { num: sample.billRateCents, den: 1 };
        const bill = arithmetic([phrase("labelBilledHolidayNotWorked")], billMinutes, billRate);
        weekBill.push({ ...line, minutes: billMinutes, rate: billRate, amountCents: bill.amountCents, ruleId: "bill_holiday_not_worked", ...explained([bill.part, phrase("billHolidayNotWorked", { policy: terms.bill.name })]) });
      }
    }

    // 6. bonuses: the amount as entered; its effect on overtime is already in the regular rate, or —
    // a California flat-sum bonus — on its own overtime line.
    const hasPremiums = splits.some((x) => x.premiums.length > 0);
    // In California a bonus not tied to output or hours is a flat sum, whose overtime is higher: a
    // person classifies every bonus, so one entered as nondiscretionary in an overtime week is flagged.
    if (caSplits && caSplits.some((x) => x.premiums.length > 0) && nondiscretionary.length > 0) {
      weekWarnings.push({ code: "bonus_kind_check", ...who, jurisdiction: "CA", ...message([phrase(nondiscretionary.length > 1 ? "bonusKindCheckMany" : "bonusKindCheckOne", weekOf)]) });
    }
    for (const bonus of [...weekBonuses].sort((x, y) => cmp(x.id, y.id))) {
      const on = shifts.filter((s) => s.assignmentId === bonus.assignmentId && s.minutes > 0);
      const how =
        bonus.kind === "nondiscretionary"
          ? phrase(hasPremiums ? "howNondiscretionaryOvertime" : "howNondiscretionary", { citation: BONUS_CITATION })
          : flatOvertime
            ? hasPremiums
              ? phrase("howFlatSumCalifornia", { citation: CA_FLAT_SUM_CITATION })
              : phrase("howFlatSumCaliforniaNoOvertime", { citation: CA_FLAT_SUM_CITATION })
            : caSplits
              ? phrase("howFlatSumFederalGoverns", { citation: BONUS_CITATION })
              : phrase(hasPremiums ? "howFlatSumElsewhereOvertime" : "howFlatSumElsewhere", { citation: BONUS_CITATION });
      const bonusRule = flatOvertime && bonus.kind === "flat_sum" ? CA_FLAT_SUM_BONUS : BONUS;
      weekPay.push({
        workerId: first.workerId,
        assignmentId: bonus.assignmentId,
        clientId: on[0]!.clientId,
        workweekStart: week,
        type: "BONUS",
        minutes: 0,
        rate: { num: 0, den: 1 },
        amountCents: bonus.amountCents,
        ruleId: bonusRule,
        ...explained([phrase("bonusLine", { amount: formatCents(bonus.amountCents), week: dated(week), rule: bonusRule, how: nested(how) })]),
        entryIds: uniqueSorted(on.flatMap((s) => s.entryIds)),
      });
    }
    if (flatOvertime) {
      // One line per multiple (DLSE Enforcement Manual 49.2.4.3): rate = multiple × the bonus's hourly share.
      const byMultiple = new Map<string, { multiplier: Fraction; minutes: number; entries: string[] }>();
      for (const x of splits) {
        for (const p of x.premiums) {
          const g = byMultiple.get(`${p.multiplier.num}/${p.multiplier.den}`) ?? { multiplier: p.multiplier, minutes: 0, entries: [] };
          g.minutes += p.minutes;
          g.entries.push(...x.shift.entryIds);
          byMultiple.set(`${p.multiplier.num}/${p.multiplier.den}`, g);
        }
      }
      const parts = [...byMultiple.values()].filter((g) => g.minutes > 0).sort((a, b) => mul(a.multiplier.num, b.multiplier.den) - mul(b.multiplier.num, a.multiplier.den));
      for (const bonus of [...flat].sort((x, y) => cmp(x.id, y.id))) {
        const share = reduce({ num: mul(bonus.amountCents, 60), den: nonOvertime });
        const on = shifts.find((s) => s.assignmentId === bonus.assignmentId && s.minutes > 0)!;
        for (const g of parts) {
          const rate = reduce({ num: mul(bonus.amountCents, 60, g.multiplier.num), den: mul(nonOvertime, g.multiplier.den) });
          const { amountCents, exact, wasExact } = lineAmount(g.minutes, rate);
          if (amountCents === 0) continue;
          const text = phrase(wasExact ? "flatSumOvertimeExact" : "flatSumOvertimeRounded", {
            multiplier: formatMultiplier(g.multiplier),
            bonus: formatCents(bonus.amountCents),
            duration: time(nonOvertime),
            share: formatRate(share),
            worked: time(g.minutes),
            minutes: String(g.minutes),
            shareMoney: formatMoney(share),
            exact,
            amount: formatCents(amountCents),
          });
          const why = phrase("whyFlatSumOvertime", { rule: CA_FLAT_SUM_BONUS, citation: CA_FLAT_SUM_CITATION });
          weekPay.push({ workerId: first.workerId, assignmentId: bonus.assignmentId, clientId: on.clientId, workweekStart: week, type: "BONUS_OT", minutes: g.minutes, rate, amountCents, ruleId: CA_FLAT_SUM_BONUS, ...explained([text, why]), entryIds: uniqueSorted(g.entries) });
        }
      }
    }

    const zero = weekPay.filter((l) => l.minutes > 0 && l.amountCents <= 0);
    if (zero.length > 0) {
      blockers.push(...zero.map((l) => ({ code: "zero_or_negative_pay" as const, ...who, entryIds: l.entryIds, ...message([phrase("zeroPay", { name: String(first.workerName), type: l.type, week: dated(week), amount: formatCents(l.amountCents) })]) })));
      continue;
    }
    payLines.push(...weekPay);
    billLines.push(...weekBill);
    warnings.push(...weekWarnings);
  }

  // The Illinois equal-pay counter runs over every usable shift of every worker not held: the hours
  // were worked whether or not something else holds their week.
  const counted = shiftsInOrder.filter((s) => !heldWorkers.has(s.workerId) && validShift(s) === null);
  const equalPay = equalPayCounter({ rules: rules.equalPayRules, shifts: counted, hoursWorked: input.hoursWorked ?? [], onFile: input.obligationsOnFile ?? [], workweekStartsOn: input.workweekStartsOn, rates });
  warnings.push(...equalPay.warnings);

  const order = (a: Line, b: Line) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
  return {
    rulesVersion: RULES_VERSION,
    payLines: sortLines(payLines, order),
    billLines: sortLines(billLines, order),
    blockers,
    warnings,
    obligations: equalPay.obligations,
  };
}

/** Keeps the per-week chronological order of buckets, with types in a fixed order inside each. */
function sortLines(lines: Line[], typeOrder: (a: Line, b: Line) => number): Line[] {
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      if (a.line.workerId !== b.line.workerId) return cmp(a.line.workerId, b.line.workerId);
      if (a.line.workweekStart !== b.line.workweekStart) return cmp(a.line.workweekStart, b.line.workweekStart);
      return a.index - b.index || typeOrder(a.line, b.line);
    })
    .map((x) => x.line);
}

/** Exposed for tests of week boundaries. */
export const _internal = { addDays };
