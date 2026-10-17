/**
 * Granite's own server messages as message keys and values (decision 0030), the same way as the
 * rules engine's: a run's own blockers and warnings, invoice problems, days to pay, a bank deposit's
 * suggested match, the margin's overtime and burden workings and the workers' comp packet's rows carry
 * `said` beside their English, and the English is made from it (`saidEnglish`), so the two cannot
 * drift. Screens say it with next-intl's `said` namespace (messages/en.json `said` equals SAID_EN).
 * Plain `{name}` placeholders only; where English changes with a number, two keys.
 */
import { fill, isIsoDate, PLAIN_SAY, renderSay, type Say, type SayPart, type SayValue } from "@shiftbook/rules";

export const SAID_EN = {
  // Joining.
  listSemicolon: "{a}; {b}",
  listPlus: "{a} + {b}",
  gap: " ",
  nameOnDate: "{name} on {date}",

  // The run's own checks (run/service.ts).
  noRateCard: "{name} on {date}: no rate card is in effect for {position}.",
  severalRateCards: "{name} on {date}: {count} rate cards are in effect for {position}.",
  noBillingProfile: "{name} on {date}: no billing profile is in effect for the client.",
  severalBillingProfiles: "{name} on {date}: {count} billing profiles are in effect for the client.",
  documentStopped: "{file}: reading stopped before it finished. Read it again, or archive it with a reason if its hours are elsewhere.",
  documentPending: "{file} is still being read; its hours are not in the totals yet.",
  documentFailed: "{file} could not be read. Read it again, or archive it with a reason if its hours are elsewhere.",
  documentFailedWhy: "{file} could not be read ({error}). Read it again, or archive it with a reason if its hours are elsewhere.",
  disputed: "{who}: the client disputed this shift; settle it in Client approvals.",
  disputedWhy: '{who}: the client disputed this shift ("{reason}"); settle it in Client approvals.',
  needsReview: "{who}: this entry still needs review ({reasons}).",
  unmatched: '"{name}" is not matched to a worker and an assignment, so it cannot be paid or billed.',
  unmatchedOn: '"{name}" on {date} is not matched to a worker and an assignment, so it cannot be paid or billed.',
  noDate: "{name}: the entry has no date.",
  noMinutes: "{name}: the entry has no worked minutes.",
  outsidePeriod: "{name} on {date}: the date is outside the pay period ({from} to {to}).",
  assignmentCancelled: "{name} on {date}: the assignment was cancelled, so these hours cannot be paid on it.",
  outsideAssignment: "{name} on {date}: the date is outside the assignment ({from} to {to}).",
  outsideAssignmentOpen: "{name} on {date}: the date is outside the assignment ({from} to open).",
  crossesMidnight: "{name} on {date}: the shift runs past midnight; split it at midnight so each day carries its own minutes.",
  holidayNotOnAssignment: "{name} on {date}: a confirmed holiday not worked is not on an assignment the worker has that day.",
  shortDayNotOnAssignment: "{name} on {date}: a confirmed short day is not on an assignment the worker has that day.",
  possibleDuplicate: "{name} on {date}: {count} entries from different timesheets, and at least one has no clock times, so the same work may be counted twice. Reject one, or confirm both are real.",
  periodNotAligned: "The pay period {from} to {to} does not start and end on workweek boundaries, so weekly overtime could be split between two periods.",
  noEntries: "There are no hours to pay in this period.",
  notApprovedOne: "{client}: 1 shift is not approved by the client yet.",
  notApprovedMany: "{client}: {count} shifts are not approved by the client yet.",
  noPayrollTarget: "No payroll system is chosen yet, so there is no payroll file to make. Choose it in the payroll file settings.",
  noPayrollIdGusto: "{name} has no Gusto employee id, so the Gusto file could not match them.",
  noPayrollIdQbd: "{name} has no QuickBooks Desktop employee name, so the QuickBooks Desktop file could not match them.",
  noPayrollIdQbo: "{name} has no QuickBooks Online display name, so the QuickBooks Online file could not match them.",
  noPayrollIdAdpWfn: "{name} has no ADP file number, so the ADP Workforce Now file could not match them.",
  noPayrollIdAdpRun: "{name} has no RUN employee id, so the RUN Powered by ADP file could not match them.",
  noPayrollIdSpreadsheet: "{name} has no spreadsheet worker id, so the spreadsheet could not match them.",
  equalPayRateDue720:
    "{name} passed 720 hours at {client} on {date}, before this pay period began ({start}), so the client's equal-pay figures are due now (820 ILCS 175/42; 56 Ill. Adm. Code 260.505(b)). On the equal-pay duty in Compliance, enter the rate, or record that the client was asked: the rate card is then paid and a correction trues it up.",
  equalPayRateDue4160:
    "{name} passed 4,160 hours at {client} on {date}. The rate on file from {from} is the wage survey's median; from then on the survey method asks for at least the 75th percentile (820 ILCS 175/42(a)(2)(B)). On the 4,160-hour duty in Compliance, enter the new rate, or record that the client was asked.",
  payBillMismatch: "Pay and bill minutes differ by {diff} for {key}.",
  lineTooLarge: "A {type} line for the workweek starting {week} is too large to store; check the rates.",
  overtimeSpike: "{name}: {now} of overtime this period against {before} in the period before.",
  vmsCreditByHand: "{client}: {number} credits invoice {original}. SAP Fieldglass takes each time sheet's invoice once, so this correction is not in an upload file: record it in SAP Fieldglass.",
  vmsAddByHand: "{client}: {number} adds to invoice {original}. SAP Fieldglass takes each time sheet's invoice once, so this correction is not in an upload file: record it in SAP Fieldglass.",
  vmsRefused: "{client}, invoice {number}: {problem}",

  // A correction (run/service.ts, run/corrections.ts).
  correctionPayDue:
    "{name}: {amount} more pay is due than has been paid for this period. Pay it as soon as possible, no later than the next regular payday: pay that was missed is already late. Overtime that could not be computed in time is due no later than the next payday after it can be computed (29 C.F.R. § 778.106). State pay-day laws also apply.",
  amountMore: "{amount} more",
  amountLess: "{amount} less",
  decisionPaidByHand: "{amount} more pay, paid by hand",
  decisionOffset: "{amount} more pay, covered by pay the worker kept from an earlier correction of this period",
  decisionRepaid: "{amount} less pay, repaid outside payroll",
  decisionConsent: "{amount} less pay, to be recovered under the worker's state rules (written consent or repayment schedule on file)",
  decisionWrittenOff: "{amount} less pay, written off",
  correctionStale: "{name}: {decisions} — no longer fits the difference ({difference} than version {version} paid). Remove it, then record what is left.",
  correctionDiffers: "{name}: {difference} than version {version} paid.",
  alreadySettled: " Already settled outside the files: {decisions}.",
  leftToSettle: " {left} left to settle: record how.",
  heldMayCover: " {amount} of pay an earlier correction of this period left with them (written off, or not yet recovered) may cover it; if it was recovered, pay it by hand.",
  correctionLess:
    "{name}: {amount} less pay than version {version} paid. The payroll file never takes pay back: record how it is settled (repaid outside payroll, recovered under the worker's state rules, or written off).",
  correctionMoves:
    "{name}: {amount} more pay, but it moves pay between rates, kinds of hours or workweeks ({moves}), which the payroll file cannot carry as additions. Pay it by hand and record that here.",
  moveLine: "{kind} at {rate} {sign}{duration}",
  correctionMore: "{name}: {amount} more pay than version {version} paid.",
  recordWhether: " Record whether that covers it, or that it is paid by hand.",
  correctionNothingDiffers: "Nothing differs from version {version}, so there is nothing to correct. Change the hours or rates, or discard this correction.",
  earningREG: "Regular",
  earningOT: "Overtime",
  earningDT: "Double time",
  earningMW_TRUEUP: "Minimum-wage top-up",
  earningREPORTING_PAY: "Reporting-time pay",
  earningHOL: "Holiday",
  earningHOL_NOT_WORKED: "Holiday not worked",
  earningDIFF: "Differential",
  earningMEAL_PREMIUM: "Meal premium",
  earningREST_PREMIUM: "Rest premium",
  earningMIN_GUARANTEE: "Minimum guarantee",
  earningBONUS: "Bonus",
  earningBONUS_OT: "Overtime on bonus",

  // Invoices the run would make (files/invoice-plan.ts).
  poMissing: "{client} requires a PO on every invoice, but the hours of {names} have none (no PO on their assignment, and none for the client).",
  invoiceNoProfile: "{client}: no billing profile is in effect on {date}, the invoice date basis, so its PO and payment terms are unknown.",
  invoiceSeveralProfiles: "{client}: {count} billing profiles are in effect on {date}, the invoice date basis, so its PO and payment terms are unknown.",
  invoiceTooLarge: "{client}: the invoice total is too large to store; check the bill rates.",
  invoiceNumberTaken: "{client}: invoice number {number} was already issued.",
  invoiceNumberTwice: "{client}: another client billed in this run has the same client code ({code}), so two invoices would be numbered {number}.",
  correctionNoProfile: "{client}: no billing profile is in effect on {date}, so the correction's payment terms are unknown.",
  correctionSeveralProfiles: "{client}: {count} billing profiles are in effect on {date}, so the correction's payment terms are unknown.",
  correctionTooLarge: "{client}: the correction's total is too large to store; check the bill rates.",
  creditNeverInvoiced: "{client}: {amount} less would be credited on hours this period never invoiced; check the bill rates.",

  // Days to pay (receivables/aging.ts).
  daysToPayNone: "No invoice paid in full in the window.",
  daysToPayOne: "{count} invoice paid in full, {total} days from issue to payment in total → {average} days on average (rounded half up); {late} days past due in total → {averageLate} days late on average.",
  daysToPayMany: "{count} invoices paid in full, {total} days from issue to payment in total → {average} days on average (rounded half up); {late} days past due in total → {averageLate} days late on average.",

  // A deposit's suggested match (receivables/matching.ts).
  whatInvoiceNumber: "invoice number {invoices} on the deposit",
  whatInvoiceNumbers: "invoice numbers {invoices} on the deposit",
  whatPo: "PO {po} on the deposit (invoice {invoices})",
  whatPoMany: "PO {po} on the deposit (invoices {invoices})",
  refExactOne: "{what}; {amount} equals what it owes.",
  refExactMany: "{what}; {amount} equals what they owe.",
  refShort: "{what}; {amount} is {difference} less than the {owed} owed: applied oldest first, the rest left short.",
  refOver: "{what}; {amount} is {difference} more than the {owed} owed: the rest left as the client's credit.",
  sumOne: "{amount} equals what invoice {invoices} owes{why}{oldest}.",
  sumMany: "{amount} equals what invoices {invoices} owe{why}{oldest}.",
  whyNamed: "; the client is named on the deposit",
  whyOnlyClient: "; the only client with invoices adding up to it",
  oldestOfSeveral: " (the oldest of several that add up to it)",
  namedOldestFirst: "The client is named on the deposit; no invoice number on it, and no group of its invoices adds up to {amount}: applied to the oldest first ({invoices}){short}{credit}.",
  leftShort: ", {amount} left short",
  leftCredit: ", {amount} left as credit",

  // Overtime not billed (margin/leakage.ts).
  overtimePaidWeek: "Overtime paid this week: {duration} for {amount}; its premium (the part above straight time) {premium}.",
  doubleTimePaidWeek: "Double time paid this week: {duration} for {amount}; its premium (the part above straight time) {premium}.",
  leakAllBilled: "All of it billed at the overtime multiplier.",
  leakTotal: "{steps} = {total}.",
  leakStraight: "{duration} billed at straight time: premium not billed {premium} × {minutes}/{paid} min",
  leakNotBilled: "{duration} not billed: premium not billed {premium} × {minutes}/{paid} min",

  // A pay line's estimated burden (margin/burden.ts).
  burdenNoTax: "No employer tax rate for {state} (counted as $0.00)",
  burdenTax: "Employer taxes ({state}) {percent} of {pay} = {amount}",
  theWorksiteState: "the worksite's state",
  anyOtherState: "any other state",
  theWorkersState: "the worker's state",
  burdenNoWcClass: "; no workers' comp class on the rate card (counted as $0.00)",
  burdenNoWcRate: "; no workers' comp rate for {state} {class} (counted as $0.00)",
  burdenWc: "; workers' comp ({state} {class}) {rate} per $100 of {base}{premium} = {amount}",
  premiumAllLeftOut: " (all of it is overtime premium, left out)",
  premiumUnknownMultiplier: " (no overtime multiplier on file for its rule: counted in full)",
  premiumLeftOut: " (the overtime premium left out: {share} of {pay})",
  burdenExact: "; burden {amount}.",
  burdenRounded: "; burden {exact} → {amount}, rounded half up once.",

  // The workers' comp packet's rows (compliance/wc-packet.ts).
  packetExplain: "{parts}.",
  packetRegular: "Regular {amount}",
  packetOvertime: "overtime {amount} at {multiplier}, its premium ({share}) {premium}",
  packetOvertimeRounded: "overtime {amount} at {multiplier}, its premium ({share}) {exact} → {premium}",
  packetDoubleTime: "double time {amount} at {multiplier}, its premium ({share}) {premium}",
  packetDoubleTimeRounded: "double time {amount} at {multiplier}, its premium ({share}) {exact} → {premium}",
  packetUnknown: "overtime {amount} with no overtime multiplier on file: counted as straight time",
  packetBonusOt: "overtime premium on bonuses {amount}",
  packetOther: "other pay {amount} ({types})",
  packetSum: "{sum} = {total}, each premium rounded half up once",
  packetStraight: "straight time {amount}",
  packetOtPremium: "overtime premium {amount}",
  packetDtPremium: "double-time premium {amount}",
  packetOtherPay: "other pay {amount}",
} as const;

export type SaidKey = keyof typeof SAID_EN;
export type Said = Say<SaidKey>;
export type SaidPart = SayPart<SaidKey>;
export type SaidValue = SayValue<SaidKey>;

/** What the parts say in English, written the stored record's way (ISO dates, "40h 00m"). */
export function saidEnglish(said: Said): string {
  return renderSay(said, (key, values) => fill(SAID_EN[key], values, key), PLAIN_SAY);
}

/** One part. */
export const say = (key: SaidKey, values?: Record<string, SaidValue>): SaidPart => (values ? { key, values } : { key });
/** A fragment as a value. */
export const nest = (said: Said | SaidPart): SaidValue => ({ say: Array.isArray(said) ? said : [said] });
/** A date the reader's way when it is one; anything else as it was given. */
export const dated = (x: unknown): SaidValue => (typeof x === "string" && isIsoDate(x) ? { date: x } : String(x));
/** A message and its keys. */
export const message = (said: Said) => ({ message: saidEnglish(said), said });
/** An explanation and its keys. */
export const explained = (said: Said) => ({ explain: saidEnglish(said), said });

const joined = (key: SaidKey) =>
  function list(items: SaidValue[]): SaidValue {
    if (items.length === 0) return "";
    if (items.length === 1) return items[0]!;
    return nest(say(key, { a: items[0]!, b: list(items.slice(1)) }));
  };
/** "a; b; c". */
export const semicolons = joined("listSemicolon");
/** "a + b + c". */
export const pluses = joined("listPlus");
