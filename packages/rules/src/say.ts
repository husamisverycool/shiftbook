/**
 * The engine's messages as message keys and values (decision 0030), so each screen says them in the
 * reader's language while the English stays the record. Every blocker, warning and pay or bill line
 * carries `say` beside its English `message` or `explain`, and the English is made from the say
 * (`english`), so the two can never drift. Pure: no I/O.
 *
 * Templates use plain `{name}` placeholders only (valid ICU for next-intl's `engine` namespace in
 * messages/*.json; a unit test keeps messages/en.json equal to ENGINE_EN). Where the English varies by
 * number ("is"/"are"), the engine picks one of two keys. Parts are said one after the other, with no
 * separator: a template that continues a sentence carries its own leading space.
 */
import { isIsoDate } from "./dates";
import { formatDuration, withThousands } from "./format";
import { floorDiv, mod } from "./int";
import type { IsoDate } from "./types";

/**
 * A value: text as the English writes it (money, rates, multipliers, counts, codes and names — US
 * formatting is right for US Spanish too), a date or a length of time written the reader's way, or a
 * nested fragment said in the reader's language.
 */
export type SayValue<K extends string = EngineKey> = string | { date: IsoDate } | { duration: number } | { say: SayPart<K>[] };

export interface SayPart<K extends string = EngineKey> {
  key: K;
  values?: Record<string, SayValue<K>>;
}

/** Parts said one after the other. */
export type Say<K extends string = EngineKey> = SayPart<K>[];

export const ENGINE_EN = {
  // Joining: lists, a sentence gap, and text kept as it was given (a working entered elsewhere).
  listAnd: "{a} and {b}",
  listComma: "{a}, {b}",
  listSemicolon: "{a}; {b}",
  listPlus: "{a} + {b}",
  gap: " ",
  verbatim: "{text}",
  clientById: "client {id}",
  hoursWhole: "{n} hours",

  // Rule tables (rule-data.ts): nothing is computed until they are fixed.
  ruleDataProblem: "Rule data problem — {problem}. Nothing is computed until the rule data is fixed.",
  ruleDataWhere: "{where}: {problem}",
  whereOvertimeRule: "overtime rule {jurisdiction} {rule}",
  whereJurisdictionRule: "jurisdiction rule {jurisdiction} {rule}",
  whereMinimumWageRate: "minimum-wage rate {jurisdiction}",
  wherePremiumRule: "premium rule {jurisdiction} {rule}",
  whereMinimumPayRule: "minimum-pay rule {jurisdiction} {rule}",
  whereHolidayPolicy: 'holiday policy "{name}"',
  whereRegularRateRule: "regular-rate rule {jurisdiction} {rule}",
  whereEqualPayCounterRule: "equal-pay counter rule {jurisdiction} {rule}",
  whereScoped: "{where} ({scope})",
  problemJurisdictionUnknown: '"{jurisdiction}" is not US, a state or DC',
  problemEffectiveFrom: 'effective-from "{value}" is not a date',
  problemEffectiveTo: 'effective-to "{value}" is not a date',
  problemEndsBeforeStarts: "it ends before it starts",
  problemMultiplierFraction: "its multiplier must be a positive whole-number fraction",
  problemMultiplierBelowOne: "its multiplier is below 1, which would pay overtime at less than the regular rate",
  problemThreshold: "its threshold must be a whole number of minutes within a week",
  problemWeeklyEarningType: "a weekly overtime row must pay earning type OT, not {type}",
  problemFederalScope: "a federal row cannot have a local scope",
  problemCountyAndPlace: "a local row is scoped to a county or a place, not both",
  problemNotAState: '"{jurisdiction}" is not a US state or DC',
  problemScopeCounty: 'county code "{code}" is not a 5-digit code in {jurisdiction}',
  problemScopePlace: 'place code "{code}" is not a 7-digit code in {jurisdiction}',
  problemMinimumWageRate: "its rate must be a positive whole number of cents, at most $1,000 an hour",
  problemPremiumMinutes: "its minutes of pay must be a positive whole number within a week",
  problemPerWorkdayMax: "its per-workday limit must be a small positive whole number",
  problemGuaranteeMinutes: "its minutes must be whole numbers within a week",
  problemScheduledFraction: "its share of the scheduled day must be a fraction from 0 to 1",
  problemLeastMoreThanMost: "its least minutes are more than its most",
  problemRateBasis: "its rate basis must be the regular rate or the pay rate",
  problemHolidayName: "its name must be text of 1 to 100 characters",
  problemHolidayClient: "its client must be a client id, or none for the agency's default",
  problemHolidayDateCount: "it must list from 1 to 366 holiday dates",
  problemHolidayDateInvalid: "one of its holiday dates is not a real calendar date",
  problemHolidayDateTwice: "it lists the same date twice",
  problemHolidayWorkedMultiplier: "its pay for hours worked on a holiday must be a whole-number fraction of at least 1× the pay rate",
  problemHolidayNotWorkedMinutes: "its pay for a holiday not worked must be a whole number of minutes, at most a day",
  problemHolidayBillMultiplier: "its bill for hours worked on a holiday must be a whole-number fraction of at least 1× the bill rate, or none",
  problemHolidayBillNotWorked: "whether a holiday not worked is billed must be yes or no",
  problemCountsFrom: 'its counting start "{value}" is not a date',
  problemWindows: "its windows must be whole numbers of months from 1 to 120, the long one at least as long",
  problemThresholds: "its thresholds must be positive whole numbers of minutes",
  problemThresholdOrder: "its heads-up must come before its trigger, and its long trigger after it",
  problemOverlap: 'two rows are in effect at the same time (from {fromA} and from {fromB}: "{citationA}" and "{citationB}"), so which one applies would be a guess',
  problemHolidayPoliciesAgency: 'holiday policies "{a}" and "{b}" both list {date} for the agency, so which one pays would be a guess',
  problemHolidayPoliciesClient: 'holiday policies "{a}" and "{b}" both list {date} for the same client, so which one pays would be a guess',

  // A worksite's codes (places.ts) and a shift that cannot be used as it is.
  problemWorksiteState: 'worksite state "{state}" is not a US state or DC',
  problemCountyNeeded: "the worksite's county code (5-digit FIPS) is needed to check local ordinances",
  problemCountyNotInState: "county code {code} is not a county in {state}",
  problemPlaceNeeded: "the worksite's city or town code (7-digit FIPS) is needed to check city ordinances, or it must be marked as outside any city or town",
  problemPlaceNotInState: "place code {code} is not a place in {state}",
  problemReportedOnly: "a day reported without work carries no minutes and no time entry",
  problemNoEntryId: "the shift has no time entry id, so it cannot be traced to a timesheet",
  problemEntryTwice: "the same time entry is listed twice in this shift",
  problemNotCalendarDate: '"{value}" is not a real calendar date',
  problemMinutesWhole: "minutes must be a whole number ≥ 0 (got {minutes})",
  problemMinutesOverDay: "{minutes} minutes is more than one day",
  problemStartTime: "start time must be within the day",
  problemPastMidnight: "the shift runs past midnight; split it at midnight so each day carries its own minutes",
  problemPayRate: "pay rate must be a positive number of cents per hour, at most $100,000",
  problemBillRate: "bill rate must be a positive number of cents per hour, at most $100,000",
  problemBillRateExplain: "the bill rate's explanation must be text of at most 300 characters",
  problemOvertimeBillMultiplier: "the overtime bill multiplier must be a positive whole-number fraction",
  problemDoubleTimeBillMultiplier: "the double-time bill multiplier must be a positive whole-number fraction",
  problemBillingRule: 'overtime billing rule "{rule}" is not one of multiplier, straight time, not billable or own sites only',

  // The Illinois equal-pay rates on file (il-equal-pay-rate.ts).
  problemEqualPayTwoRows: "two rows for {client} from the same date",
  problemEqualPayDate: "the date is not a real calendar date",
  problemEqualPayKind: "kind must be rate or asked",
  problemEqualPayRequestFigures: "a request has no figures",
  problemEqualPayRate: "the rate must be a positive number of cents",
  problemEqualPayBenefits: "the benefits' cash value must be zero or more cents",
  problemEqualPayMax: "the rate and the benefits together must be at most $100,000 an hour",
  problemEqualPayMethod: "the method must be named",
  equalPayRateApplied: "Illinois equal pay from {date} ({citation}): {method} {amount}, above the rate card's {card}.",
  equalPayRateWithBenefits: "{rate} + the benefits' hourly cash value {benefits} = {total}",
  methodComparator: "the comparable direct hire's rate",
  methodClosestSeniority: "the rate of the direct hire with the closest seniority",
  methodSurveyMedian: "the area's median wage for the job (BLS OEWS)",
  methodSurvey75th: "the area's 75th-percentile wage for the job (BLS OEWS)",

  // A worker held entirely, or one workweek held.
  workweekStartInvalid: "The workweek start day must be 0 (Sunday) to 6 (Saturday); got {value}.",
  equalPayRateHeld: "The Illinois equal-pay rate from {date}: {problem}. All of this worker's weeks are held until it is fixed.",
  workerHeld: "{name}: {problem}. All of this worker's weeks are held until it is fixed.",
  sharedEntry: "{name}: time entry {entries} appears in more than one shift, so it would be paid twice. All of this worker's weeks are held.",
  sharedEntryAlso: "{name}: time entry {entries} appears in more than one shift (also used for {others}), so it would be paid twice. All of this worker's weeks are held.",
  problemBonusWeek: 'a bonus is entered for the week of "{value}", which is not the first day of a workweek, so it cannot be placed',
  problemConfirmationDate: 'a confirmation is for "{value}", which is not a real calendar date',
  problemEarlierHours: "earlier hours on file for {date} cannot be read ({minutes} minutes), so the Illinois equal-pay counter cannot be checked",
  problemObligationOnFile: 'an equal-pay obligation on file cannot be read ("{kind}", {date})',
  bonusHeld: "{name}, workweek starting {week}: a bonus cannot be paid because {problem}. The whole workweek is held until it is fixed.",
  problemBonusNoId: "it has no id, so it cannot be traced",
  problemBonusTwice: "bonus {id} is entered twice, so it would be paid twice",
  problemBonusAmount: "its amount must be a positive whole number of cents, at most $100,000",
  problemBonusKind: 'its kind "{kind}" is neither nondiscretionary nor flat-sum',
  weekHeldOn: "{name} on {date}: {problem}. The whole workweek is held until it is fixed.",
  problemCannotPayFor: '"{kind}" is not something this version can pay for',
  noHoursOne: "{name}, workweek starting {week}: {what} is entered for a week with no hours or reported days on file, so it cannot be paid; correct the week, or add the hours.",
  noHoursMany: "{name}, workweek starting {week}: {what} are entered for a week with no hours or reported days on file, so they cannot be paid; correct the week, or add the hours.",
  itemBonus: "a bonus of {amount}",
  itemMealMissed: "a confirmed missed meal period on {date}",
  itemRestMissed: "a confirmed missed rest period on {date}",
  itemShortDay: "a confirmed short day on {date}",
  itemHolidayNotWorked: "a confirmed holiday not worked on {date}",
  assignmentManyClients: "{name}, workweek starting {week}: assignment {assignment} is linked to {count} clients ({clients}); an assignment belongs to one client, so its hours cannot be billed.",
  dayOver24: "{name} on {date}: {duration} recorded in one day, more than 24 hours.",
  shiftsOverlap: "{name} on {date}: two shifts overlap in time, so the same minutes would be paid twice.",
  scopeFederal: "Federal",
  scopeLocal: "{local}, {jurisdiction}",
  scopeCounty: "county {code}",
  scopePlace: "place {code}",
  localMinimumWageMissing: "{name}, workweek starting {week}: {scope} has its own minimum wage ({citation}), but its rate for {date} is not on file, so this week cannot be computed.",
  ruleNotImplemented: "{name}, workweek starting {week}: {scope} rule {rule} ({citation}) is not implemented yet, so this week cannot be computed.",
  federalRuleDataMissing: "{name}, workweek starting {week}: the federal rule data ({rules}) is missing, so nothing can be computed.",
  noWageRules: "{name}, workweek starting {week}: no wage rules are on file for {jurisdiction}, so this week cannot be computed.",
  minimumWageMissingFederal: "{name} on {date}: no federal minimum-wage rate is on file for that date, so the wage floor cannot be checked.",
  minimumWageMissing: "{name} on {date}: no {jurisdiction} minimum-wage rate is on file for that date, so the wage floor cannot be checked.",
  belowMinimumWage: "{name} on {date}: pay rate {rate} is below the minimum wage of {minimum} ({citations}). A top-up line pays the difference; fix the rate card.",
  weeklyRowMissingFederal: "{name}, workweek starting {week}: federal weekly overtime applies but its rule row for this workweek is missing, so this week cannot be computed.",
  weeklyRowMissing: "{name}, workweek starting {week}: {jurisdiction} weekly overtime applies but its rule row for this workweek is missing, so this week cannot be computed.",
  weeklyRuleChangesFederal: "{name}, workweek starting {week}: the federal weekly overtime rule changes on {date}, inside this workweek; a mid-week rule change is not handled yet, so this week cannot be computed.",
  weeklyRuleChanges: "{name}, workweek starting {week}: the {jurisdiction} weekly overtime rule changes on {date}, inside this workweek; a mid-week rule change is not handled yet, so this week cannot be computed.",
  californiaMixed: "{name}, workweek starting {week}: this week mixes California and {others} worksites; how California's daily and weekly overtime counts hours worked in another state is not settled, so this week is held.",
  californiaRowMissing: "{name}, workweek starting {week}: California rule {rule} applies but its rule row for this workweek is missing, so this week cannot be computed.",
  californiaRuleChanges: "{name}, workweek starting {week}: California rule {rule} changes on {date}, inside this workweek; a mid-week rule change is not handled yet, so this week cannot be computed.",
  holidayPolicyConflict: "{name} on {date}: two holiday policies for this client list {date}, so which one pays would be a guess; fix the holiday policies.",
  holidayNotPlaced: "{name} on {date}: a confirmed holiday not worked is for an assignment the worker was not placed on that day, so it cannot be paid; correct the confirmation.",
  holidayWorkedThatDay: "{name} on {date}: a holiday not worked was confirmed, but {duration} were worked that day; hours worked on a holiday are paid as worked, so correct the confirmation.",
  holidayTwoAssignments: "{name} on {date}: a holiday not worked is confirmed on two assignments for the same day; holiday pay is paid once a day, so remove one of the confirmations.",
  holidayNoPolicy: "{name} on {date}: a holiday not worked was confirmed, but no holiday policy for this client pays {date} as a holiday not worked, so it cannot be paid; correct the confirmation or the holiday policy.",
  mealConfirmedNoHours: "{name} on {date}: a confirmed a meal period was not provided is for an assignment with no hours that day, so it cannot be paid; correct the confirmation.",
  restConfirmedNoHours: "{name} on {date}: a confirmed a rest period was not provided is for an assignment with no hours that day, so it cannot be paid; correct the confirmation.",
  shortDayNoReport: "{name} on {date}: a confirmed short day is for an assignment with no report that day, so it cannot be paid; correct the confirmation.",
  shortDayScheduleInvalid: "{name} on {date}: the scheduled hours of a confirmed short day must be more than none and at most a day.",
  bonusNoHours: "{name}, workweek starting {week}: a bonus of {amount} is for an assignment with no hours this week, so it cannot be paid; correct the bonus.",
  holidayCutOffMissing: "{name} on {date}: a holiday premium is due, but the rule saying which premiums stay out of the regular rate (29 U.S.C. § 207(e)(6)) is not on file for that date, so this week cannot be computed.",
  regularRateTooLarge: "{name}, workweek starting {week}: the week's regular rate is too large to compute exactly; check the rates and amounts entered.",
  flatSumNoHours: "{name}, workweek starting {week}: every hour this week is paid at a premium, so a flat-sum bonus has no hours to be spread over ({citation}); this week is held.",
  allocationOrderAssumed: "{name} on {date}: shifts paid or billed differently have no start time, so the order used to decide which one carries the overtime was assumed.",
  mealNotApplicable: "{name} on {date}: a meal period was not provided, but no meal-period premium applies in {jurisdiction}, so nothing is paid for it.",
  restNotApplicable: "{name} on {date}: a rest period was not provided, but no rest-period premium applies in {jurisdiction}, so nothing is paid for it.",
  shortDayNothingMore: "{name} on {date}: a short day was confirmed, but {why}, so nothing more is paid for it.",
  whyNoGuaranteeRule: "no reporting or minimum-pay rule applies in {jurisdiction}",
  whyNotDayLabor: "the Illinois day-labor minimum does not cover clerical or professional work (820 ILCS 175/5)",
  whyRuleNotComputed: "rule {rule} is not one this version computes",
  shortDayScheduleMissing: "{name} on {date}: a short day was confirmed, but {jurisdiction} reporting pay depends on the scheduled hours, which are missing; add them to the confirmation.",
  bonusKindCheckOne: "{name}, workweek starting {week}: a bonus is entered as nondiscretionary, so its overtime is paid on the regular rate over all hours worked. In California a bonus not tied to output or hours worked (for showing up, or a fixed amount a day) is a flat sum, and its overtime is higher (Alvarado v. Dart Container (2018) 4 Cal.5th 542): check how it was promised.",
  bonusKindCheckMany: "{name}, workweek starting {week}: bonuses are entered as nondiscretionary, so their overtime is paid on the regular rate over all hours worked. In California a bonus not tied to output or hours worked (for showing up, or a fixed amount a day) is a flat sum, and its overtime is higher (Alvarado v. Dart Container (2018) 4 Cal.5th 542): check how it was promised.",
  zeroPay: "{name}: pay line {type} for the workweek starting {week} computes to {amount}.",

  // The Illinois equal-pay counter (il-equal-pay.ts).
  equalPayWhere: "{name} passed {threshold} of work at {client} on {date} (the {months} months from {windowStart})",
  equalPayWhereAt: "{name} passed {threshold} of work at {client} on {date} at {clock} (the {months} months from {windowStart})",
  equalPayDuty720:
    ": from then on the Illinois equal-pay rule applies: at least the pay of the client's comparable direct hires, with equal benefits or their hourly cash value (820 ILCS 175/42). Get the client's pay, seniority and benefits data before the next pay period begins (56 Ill. Adm. Code 260.505(b)), then enter the equal-pay rate.",
  equalPayDuty4160: ": if the client chose the wage-survey method, pay is now at least the 75th percentile for the job in the area (820 ILCS 175/42(a)(2)(B)). Get the client's data before the next pay period begins (56 Ill. Adm. Code 260.505(b)).",
  equalPayEarlier: " {duration} were worked there after it before this pay period.",
  equalPayRateMissing:
    "{name}, workweek starting {week}: {duration} worked at {client} after passing {threshold} there are paid at the placement rate; the equal-pay rate and benefits (or their hourly cash value) are not on file, so back pay may be due once they are (820 ILCS 175/42).",
  equalPayRateMissingAsked:
    "{name}, workweek starting {week}: {duration} worked at {client} after passing {threshold} there are paid at the placement rate; the client was asked for its figures on {asked} and they are not in yet, so back pay may be due once they are (820 ILCS 175/42).",
  approachingEqualPay:
    "{name}, workweek starting {week}: {duration} worked at {client} in the {months} months to {date}; past {threshold} the Illinois equal-pay rule applies (820 ILCS 175/42), so ask the client now for the pay of its comparable direct hires.",

  // A line's arithmetic: what it is, minutes × rate, rounded once.
  arithmeticExact: "{label}: {duration} ({minutes} min) × {rate}{note} = {exact}¢ exactly → {amount}.",
  arithmeticRounded: "{label}: {duration} ({minutes} min) × {rate}{note} = {exact}¢ → rounded half-up once → {amount}.",
  labelRegular: "Regular",
  labelBilledRegular: "Billed regular",
  labelOvertime: "Overtime",
  labelDoubleTime: "Double time",
  labelBilledOvertime: "Billed overtime",
  labelBilledDoubleTime: "Billed double time",
  labelBilledOvertimeStraight: "Billed overtime at straight time",
  labelBilledDoubleTimeStraight: "Billed double time at straight time",
  labelMinimumWageTopUp: "Minimum-wage top-up",
  labelHolidayPremium: "Holiday premium",
  labelBilledHolidayPremium: "Billed holiday premium",
  labelMealPremium: "Meal-period premium",
  labelRestPremium: "Rest-period premium",
  labelBilledMealPremium: "Billed meal-period premium",
  labelBilledRestPremium: "Billed rest-period premium",
  labelDayLaborMinimum: "Day-labor minimum",
  labelReportingTimePay: "Reporting-time pay",
  labelBilledDayLaborMinimum: "Billed day-labor minimum",
  labelBilledReportingTimePay: "Billed reporting-time pay",
  labelHolidayNotWorked: "Holiday pay (not worked)",
  labelBilledHolidayNotWorked: "Billed holiday not worked",
  forRuleHours: " ({rule} hours)",
  noteMultiplierOfRate: " ({multiplier} × {rate})",
  noteFloorPremium: " ({rate} + {premium} × {floor}, because the minimum wage that day, {floor}, is higher than the regular rate {regularRate}; {citation})",
  noteRegularRatePremium: " ({rate} + {premium} × regular rate {regularRate})",
  noteBillMultiplier: " ({multiplier} × {rate} bill rate)",
  noteTopUp: " ({minimum} minimum wage − {rate} pay rate)",
  noteHolidayPremiumFloor: " ({multiplier} × {rate}, the minimum wage that day)",
  notePremiumFloor: " (the minimum wage that day, higher than the week's regular rate {regularRate}; {citation})",
  noteWeekRegularRate: " (the week's regular rate{flatShare})",
  flatShareNote: ": {rate} + the {bonus} flat-sum bonus ÷ {duration} not paid at a premium ({share}) ({citation})",
  noteMinimumWageThatDay: " (the minimum wage that day)",
  noteEqualPayRate: " (the Illinois equal-pay rate)",
  noteAgreedPayRate: " (the agreed pay rate)",

  // Why each line is paid or billed as it is.
  straightTimeWeekly: " Rule {rule}: hours up to the {threshold} weekly threshold in the workweek starting {week}.",
  straightTimeCalifornia: " Rule {rule}: hours not paid at a daily, seventh-day or weekly premium in the workweek starting {week}.",
  billRateFromCard: " Bill rate from the rate card{working}.",
  workingNote: " ({workings})",
  workingNoteSome: " (some shifts: {workings})",
  billRateMarkup: "{pay} × (100% + {percent}) = {exact}¢, rounded half up to {bill}",
  whyWeeklyCalifornia: " Rule {rule}: {worked} worked in the workweek starting {week} not already paid at a daily or seventh-day premium is {over} over the {threshold} threshold ({citations}; DLSE Opinion Letter 2000.01.19).",
  whyWeekly: " Rule {rule}: {worked} worked in the workweek starting {week} is {over} over the {threshold} threshold ({citations}).",
  elsewhereNote: " {elsewhere} of the first {threshold} were worked on other assignments.",
  federalGoverns: " The weekly rule pays more this week than California's daily and seventh-day rules (both apply, so the larger is paid; 29 U.S.C. § 218(a)).",
  whyDailyOvertime: " Rule {rule}: hours over {threshold} in a workday, on {dates} ({citation}).",
  whySeventhDay: " Rule {rule}: {dates} is the seventh day of work in the workweek starting {week} (all seven days were worked) ({citation}).",
  whySeventhDayOver: " Rule {rule}: hours over {threshold} on {dates}, the seventh day of work in the workweek starting {week} ({citation}).",
  regularRateWhy: " Regular rate: {earned} ÷ {worked} worked = {rate}, used unrounded ({citations}).",
  earnedStraight: "{amount} earned at straight time",
  earnedWithExtras: "({amount} earned at straight time + {extras})",
  extraNondiscretionaryBonus: "{amount} nondiscretionary bonus",
  extraFlatSumBonus: "{amount} flat-sum bonus",
  extraHolidayPremium: "{amount} holiday premium below 1.5×",
  flatSumNotInRate: " The flat-sum bonus is not in this rate: its overtime is paid on its own line ({citation}).",
  billOvertimeMultiplier: " Client bills overtime at the rate-card overtime multiplier; bill rate from the rate card{working}.",
  billDoubleTimeMultiplier: " Client bills double time at the rate-card double time multiplier; bill rate from the rate card{working}.",
  billOvertimeStraight: " Client bills overtime at straight time; bill rate from the rate card{working}.",
  billDoubleTimeStraight: " Client bills double time at straight time; bill rate from the rate card{working}.",
  billOvertimeOwnSites: " Client bills overtime at the rate-card overtime multiplier only for hours that are overtime at its own sites ({worked} worked at this client's own sites this week); bill rate from the rate card{working}.",
  billDoubleTimeOwnSites:
    " Client bills double time at the rate-card double time multiplier only for hours that are double time at its own sites ({worked} worked at this client's own sites this week); bill rate from the rate card{working}.",
  billOvertimeOwnSitesStraight:
    " Client bills overtime only for hours that are overtime at its own sites: {worked} worked at this client's own sites this week, so these hours, overtime only because of work elsewhere, are billed at straight time and the agency bears the premium; bill rate from the rate card{working}.",
  billDoubleTimeOwnSitesStraight:
    " Client bills double time only for hours that are double time at its own sites: {worked} worked at this client's own sites this week, so these hours, double time only because of work elsewhere, are billed at straight time and the agency bears the premium; bill rate from the rate card{working}.",
  notBilledOvertime: "Overtime not billed{forRule}: {duration} ({minutes} min) → {amount}. Client profile marks overtime not billable.",
  notBilledDoubleTime: "Double time not billed{forRule}: {duration} ({minutes} min) → {amount}. Client profile marks overtime not billable.",
  whyTopUp: " Rule {rule}: the pay rate is below the minimum wage on {dates} ({citations}), so the difference is paid for every hour worked.",
  whyHolidayOne:
    ' Rule {rule}: {dates} is a holiday under the holiday policy "{policy}", which pays {multiplier} × the pay rate for hours worked; straight time is on the regular and overtime lines, and this premium is paid on top of any overtime, never credited toward it.',
  whyHolidayMany:
    ' Rule {rule}: {dates} are holidays under the holiday policy "{policy}", which pays {multiplier} × the pay rate for hours worked; straight time is on the regular and overtime lines, and this premium is paid on top of any overtime, never credited toward it.',
  holidayCounted: " A holiday premium below {cutOff}× is counted in the regular rate ({citation}).",
  holidayNotCounted: " A holiday premium of {cutOff}× or more is not counted in the regular rate ({citation}).",
  billHolidayPremium: ' Client billed {multiplier} × the bill rate for hours worked on a holiday under the holiday policy "{policy}"; straight time is on the regular and overtime bill lines.',
  whyMealPremium: " Rule {rule}: a meal period was not provided on {dates}, as a person confirmed; one hour of pay at the regular rate, not hours worked, at most {max} per workday ({citation}).",
  whyRestPremium: " Rule {rule}: a rest period was not provided on {dates}, as a person confirmed; one hour of pay at the regular rate, not hours worked, at most {max} per workday ({citation}).",
  billPremium: " The client's billing profile bills confirmed meal and rest premiums, at the bill rate from the rate card.",
  whyReportingCalifornia:
    " Rule {rule}: on {date} the worker reported but was given less than half the scheduled day; half the scheduled {scheduled} is {half} (at least {least}, at most {most}); {worked} were worked, so {more} more are paid, not as hours worked ({citation}).",
  whyReportingMassachusetts:
    " Rule {rule}: on {date} the worker, scheduled for {scheduled}, reported and was not given the expected hours; at least {due} are owed for the day; {worked} were worked, so {more} more are paid, not as hours worked ({citation}).",
  whyDayLaborReassigned:
    " Rule {rule}: on {date} the worker was sent to the client, not used, and placed elsewhere the same shift, so the shift is paid at least {due}; {worked} were worked, so {more} more are paid at the agreed rate, not as hours worked ({citation}).",
  whyDayLabor: " Rule {rule}: on {date} the worker was sent to the client and not used for {due}; {worked} were worked there, so {more} more are paid at the agreed rate, not as hours worked ({citation}).",
  billMinimumPay: " The client's billing profile bills minimum pay for a short day, at the bill rate from the rate card.",
  whyHolidayNotWorked:
    ' Rule {rule}: {date} is a holiday under the holiday policy "{policy}", the worker did not work that day, and a person confirmed the worker is eligible; it is pay, not hours worked, so it counts toward neither overtime nor the regular rate ({citation}).',
  billHolidayNotWorked: ' Client billed for a holiday not worked under the holiday policy "{policy}", at the bill rate from the rate card.',
  bonusLine: "Bonus: {amount} for the workweek starting {week}, as a person entered and classified it; a lump sum, not hours. Rule {rule}: {how}.",
  howNondiscretionary: "nondiscretionary (promised for the work, not decided at the agency's sole discretion), so it is part of the week's pay and counted in the regular rate ({citation})",
  howNondiscretionaryOvertime:
    "nondiscretionary (promised for the work, not decided at the agency's sole discretion), so it is part of the week's pay and counted in the regular rate, on which this week's overtime is paid ({citation})",
  howFlatSumCalifornia: "a flat-sum bonus; in California its overtime is paid on its own lines, on the bonus divided by the hours not paid at a premium ({citation})",
  howFlatSumCaliforniaNoOvertime: "a flat-sum bonus; in California its overtime would be paid on its own lines, on the bonus divided by the hours not paid at a premium, and this week has no overtime ({citation})",
  howFlatSumFederalGoverns: "a flat-sum bonus, counted in the regular rate this week because the federal weekly rule pays more than California's rules (29 U.S.C. § 218(a); {citation})",
  howFlatSumElsewhere: "a flat-sum bonus; outside California it counts like any nondiscretionary bonus, in the regular rate ({citation})",
  howFlatSumElsewhereOvertime: "a flat-sum bonus; outside California it counts like any nondiscretionary bonus, in the regular rate, on which this week's overtime is paid ({citation})",
  flatSumOvertimeExact: "Flat-sum bonus overtime at {multiplier}×: {bonus} ÷ {duration} not paid at a premium = {share}; {worked} ({minutes} min) × {multiplier} × {shareMoney} = {exact}¢ exactly → {amount}.",
  flatSumOvertimeRounded: "Flat-sum bonus overtime at {multiplier}×: {bonus} ÷ {duration} not paid at a premium = {share}; {worked} ({minutes} min) × {multiplier} × {shareMoney} = {exact}¢ → rounded half-up once → {amount}.",
  whyFlatSumOvertime:
    " Rule {rule}: in California, overtime on a flat-sum bonus is paid at the full overtime or double-time multiple of the bonus's hourly share, because the bonus was earned by the hours not paid at a premium alone ({citation}).",
} as const;

export type EngineKey = keyof typeof ENGINE_EN;

/** How dates and lengths of time are written. */
export interface SayFormat {
  date: (iso: string) => string;
  duration: (minutes: number) => string;
}

/** The stored English's own way: ISO dates, "40h 00m". */
export const PLAIN_SAY: SayFormat = { date: (d) => d, duration: formatDuration };

/** Each `{name}` in a template, in order (the same name may appear more than once). */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
}

/** A template with each `{name}` replaced by its value; a missing value is a bug in the caller. */
export function fill(template: string, values: Record<string, string>, key = "?"): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (!Object.hasOwn(values, name)) throw new Error(`Message ${key} needs a value for {${name}}.`);
    return values[name]!;
  });
}

/**
 * A nested fragment: exactly `{ say: [...] }`. An input field holding some other list or object (a
 * citation, a scope's or a person's name) is text, never a fragment.
 */
function isFragment<K extends string>(v: unknown): v is { say: SayPart<K>[] } {
  return typeof v === "object" && v !== null && !Array.isArray(v) && Array.isArray((v as { say?: unknown }).say);
}

/**
 * The parts in a language: `t` says a key with its values already written out; dates and lengths of
 * time are written by `f`; a nested fragment is said the same way first.
 */
export function renderSay<K extends string>(say: Say<K>, t: (key: K, values: Record<string, string>) => string, f: SayFormat): string {
  const text = (v: SayValue<K>): string => {
    // Anything but a date, a length of time or a fragment is text, as a template literal writes it
    // (a name entered as a number, or a citation entered as a list, is still said as it was before keys).
    if (typeof v !== "object" || v === null || Array.isArray(v)) return String(v);
    if ("date" in v) return f.date(v.date);
    if ("duration" in v) return f.duration(v.duration);
    return isFragment<K>(v) ? renderSay(v.say, t, f) : String(v);
  };
  return say.map((p) => t(p.key, Object.fromEntries(Object.entries(p.values ?? {}).map(([k, v]) => [k, text(v)])))).join("");
}

/** What the parts say in English, written the stored record's way. */
export function english(say: Say): string {
  return renderSay(say, (key, values) => fill(ENGINE_EN[key], values, key), PLAIN_SAY);
}

/** Every key a say uses, nested fragments included. */
export function keysOf<K extends string>(say: Say<K>): K[] {
  return say.flatMap((p) => [p.key, ...Object.values(p.values ?? {}).flatMap((v) => (isFragment<K>(v) ? keysOf(v.say) : []))]);
}

// Building says (the engine's own helpers).

/** One part. */
export const part = (key: EngineKey, values?: Record<string, SayValue>): SayPart => (values ? { key, values } : { key });
/** A fragment as a value. */
export const nested = (say: Say | SayPart): SayValue => ({ say: Array.isArray(say) ? say : [say] });
/** A date the reader's way when it is one; anything else as it was given. */
export const dateValue = (x: unknown): SayValue => (typeof x === "string" && isIsoDate(x) ? { date: x } : String(x));
export const minutesValue = (minutes: number): SayValue => ({ duration: minutes });

const joined = (key: EngineKey, last: EngineKey) =>
  function list(items: SayValue[]): SayValue {
    if (items.length === 0) return "";
    if (items.length === 1) return items[0]!;
    if (items.length === 2) return nested(part(last, { a: items[0]!, b: items[1]! }));
    return nested(part(key, { a: items[0]!, b: list(items.slice(1)) }));
  };
/** "a", "a and b", "a, b and c". */
export const andList = joined("listComma", "listAnd");
/** "a", "a, b", "a, b, c". */
export const commaList = joined("listComma", "listComma");
/** "a; b; c". */
export const semicolonList = joined("listSemicolon", "listSemicolon");
/** "a + b + c". */
export const plusList = joined("listPlus", "listPlus");

/** "720 hours" (whole hours, grouped as English groups them), or a length of time. */
export const hoursValue = (minutes: number): SayValue => (mod(minutes, 60) === 0 ? nested(part("hoursWhole", { n: withThousands(String(floorDiv(minutes, 60))) })) : { duration: minutes });
