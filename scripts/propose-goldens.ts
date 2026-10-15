/**
 * Writes PROPOSED golden cases to tests/goldens/_proposed/ for the owner to approve.
 * Every case states its expected result in plain English, and this script refuses to write a case
 * unless the engine's numbers equal the hand-computed numbers written here.
 *   pnpm tsx scripts/propose-goldens.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computePay, type PayInput, type Shift } from "@shiftbook/rules";
import { renderExport, type ExportFixture } from "../src/exports/registry";
import { REFERENCE_GUARANTEE_RULES, REFERENCE_JURISDICTION_RULES, REFERENCE_MINIMUM_WAGE_RULES, REFERENCE_OVERTIME_RULES, REFERENCE_PREMIUM_RULES } from "../src/server/rules/reference-data";

const OUT = "tests/goldens/_proposed";
const WEEK = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];

let n = 0;
function shift(date: string, minutes: number, over: Partial<Shift> = {}): Shift {
  n += 1;
  return {
    entryIds: [`entry-${String(n).padStart(3, "0")}`],
    workerId: "worker-1",
    workerName: "Worker One",
    assignmentId: "assignment-1",
    clientId: "client-1",
    jurisdiction: "IL",
    countyFips: "17197", // Will County, IL
    placeFips: "1738570", // Joliet
    date,
    startMinute: 420,
    minutes,
    payRateCents: 1825,
    billRateCents: 2650,
    billOtMultiplier: { num: 3, den: 2 },
    billDtMultiplier: { num: 2, den: 1 },
    otBillingRule: "multiplier",
    ...over,
  };
}
const input = (shifts: Shift[]): PayInput => ({
  workweekStartsOn: 1,
  shifts,
  overtimeRules: REFERENCE_OVERTIME_RULES,
  jurisdictionRules: REFERENCE_JURISDICTION_RULES,
  minimumWageRules: REFERENCE_MINIMUM_WAGE_RULES,
  premiumRules: REFERENCE_PREMIUM_RULES,
  guaranteeRules: REFERENCE_GUARANTEE_RULES,
});
const MA = { jurisdiction: "MA", countyFips: "25027", placeFips: "2582000" } as const; // Worcester County; Worcester
const CA = { jurisdiction: "CA", countyFips: "06071", placeFips: "0653896" } as const; // San Bernardino County; Ontario

type Expect = { pay: [string, number, number][]; bill: [string, number, number][]; blockers?: string[] };

function ruleCase(name: string, summary: string, inp: PayInput, hand: Expect) {
  const result = computePay(inp);
  const pay = result.payLines.map((l) => [l.type, l.minutes, l.amountCents]);
  const bill = result.billLines.map((l) => [l.type, l.minutes, l.amountCents]);
  const blockers = result.blockers.map((b) => b.code);
  const same = JSON.stringify([pay, bill, blockers]) === JSON.stringify([hand.pay, hand.bill, hand.blockers ?? []]);
  if (!same) {
    throw new Error(`${name}: engine disagrees with the hand-computed answer\nengine: ${JSON.stringify([pay, bill, blockers])}\nhand:   ${JSON.stringify([hand.pay, hand.bill, hand.blockers ?? []])}`);
  }
  mkdirSync(join(OUT, "rules"), { recursive: true });
  writeFileSync(join(OUT, "rules", `${name}.json`), JSON.stringify({ name, summary, input: inp, expected: result }, null, 2) + "\n");
  console.log(`proposed rules/${name}`);
}

ruleCase(
  "il-straight-time-38h",
  "Illinois worker, 38 hours at $18.25/h, billed at $26.50/h. Under 40 hours, so all straight time: pay 38 × $18.25 = $693.50; bill 38 × $26.50 = $1,007.00.",
  input([...WEEK.slice(0, 4).map((d) => shift(d, 480)), shift(WEEK[4]!, 360)]),
  { pay: [["REG", 2280, 69350]], bill: [["REG", 2280, 100700]] },
);

ruleCase(
  "il-weekly-overtime-44h",
  "Illinois worker, 44 hours at $18.25/h. First 40 hours straight: $730.00. Last 4 hours at 1.5 × $18.25 = $27.375/h: $109.50. Billed at $26.50/h: $1,060.00, and overtime at 1.5 × $26.50 = $39.75/h: $159.00.",
  input([...WEEK.slice(0, 4).map((d) => shift(d, 540)), shift(WEEK[4]!, 480)]),
  { pay: [["REG", 2400, 73000], ["OT", 240, 10950]], bill: [["REG", 2400, 106000], ["OT", 240, 15900]] },
);

ruleCase(
  "ma-exactly-40h-no-overtime",
  "Massachusetts worker, exactly 40 hours at $17.00/h, billed at $25.00/h. Overtime starts only after 40 hours, so none: pay $680.00, bill $1,000.00.",
  input(WEEK.slice(0, 5).map((d) => shift(d, 480, { ...MA, payRateCents: 1700, billRateCents: 2500 }))),
  { pay: [["REG", 2400, 68000]], bill: [["REG", 2400, 100000]] },
);

ruleCase(
  "ma-overtime-rounding-shown",
  "Massachusetts worker, 40 hours 37 minutes at $18.25/h. The 37 overtime minutes at $27.375/h are exactly 1688.125 cents; rounded once, half-up, to $16.88. Billed 37 minutes at $39.75/h = 2451.25 cents, rounded to $24.51. The rounding is written in each line's explanation.",
  input([...WEEK.slice(0, 5).map((d) => shift(d, 480, MA)), shift(WEEK[5]!, 37, MA)]),
  { pay: [["REG", 2400, 73000], ["OT", 37, 1688]], bill: [["REG", 2400, 106000], ["OT", 37, 2451]] },
);

ruleCase(
  "client-overtime-billing-variants",
  "Three workers each work 44 hours at $18.25/h (pay is identical: $730.00 + $109.50). Their clients bill overtime differently: client A at the 1.5x multiplier (4h × $39.75 = $159.00), client B at straight time (4h × $26.50 = $106.00), client C not at all ($0.00, the 4 hours are still listed).",
  input(
    (["A", "B", "C"] as const).flatMap((c, i) =>
      [...WEEK.slice(0, 4).map((d) => [d, 540] as const), [WEEK[4]!, 480] as const].map(([d, m]) =>
        shift(d, m, {
          workerId: `worker-${c}`,
          workerName: `Worker ${c}`,
          assignmentId: `assignment-${c}`,
          clientId: `client-${c}`,
          otBillingRule: (["multiplier", "straight_time", "not_billable"] as const)[i],
        }),
      ),
    ),
  ),
  {
    pay: [["REG", 2400, 73000], ["OT", 240, 10950], ["REG", 2400, 73000], ["OT", 240, 10950], ["REG", 2400, 73000], ["OT", 240, 10950]],
    bill: [["REG", 2400, 106000], ["OT", 240, 15900], ["REG", 2400, 106000], ["OT", 240, 10600], ["REG", 2400, 106000], ["OT", 240, 0]],
  },
);

ruleCase(
  "overtime-falls-on-the-client-that-crossed-40h",
  "One Illinois worker, same $18.25/h pay rate at two clients: 32 hours Monday–Thursday at client A, then 10 hours Friday at client B. Hours 33–40 are straight time at B; the last 2 hours at B are overtime ($54.75) and are billed to B at 1.5 × $30.00 = $45.00/h ($90.00).",
  input([
    ...WEEK.slice(0, 4).map((d) => shift(d, 480, { assignmentId: "assignment-A", clientId: "client-A" })),
    shift(WEEK[4]!, 600, { assignmentId: "assignment-B", clientId: "client-B", billRateCents: 3000 }),
  ]),
  {
    pay: [["REG", 1920, 58400], ["REG", 480, 14600], ["OT", 120, 5475]],
    bill: [["REG", 1920, 84800], ["REG", 480, 24000], ["OT", 120, 9000]],
  },
);


ruleCase(
  "unknown-jurisdiction-blocked",
  "A worksite in Texas: no wage rules are on file for TX, so the week is blocked as an unknown jurisdiction and nothing is computed.",
  input([shift(WEEK[0]!, 480, { jurisdiction: "TX", countyFips: "48201", placeFips: "4835000" })]),
  { pay: [], bill: [], blockers: ["unknown_jurisdiction"] },
);

ruleCase(
  "overtime-rounding-half-cent-tie",
  "Massachusetts worker, 40 hours 4 minutes at $18.25/h. The 4 overtime minutes at $27.375/h are exactly 182.5 cents — a tie — which rounds half-up to $1.83 (not $1.82). Billed 4 minutes at $39.75/h = 265 cents exactly, $2.65.",
  input([...WEEK.slice(0, 5).map((d) => shift(d, 480, MA)), shift(WEEK[5]!, 4, MA)]),
  { pay: [["REG", 2400, 73000], ["OT", 4, 183]], bill: [["REG", 2400, 106000], ["OT", 4, 265]] },
);

ruleCase(
  "overtime-rounding-up",
  "Massachusetts worker, 40 hours 38 minutes at $18.25/h. The 38 overtime minutes at $27.375/h are 1733.75 cents, rounded once to $17.34. Billed 38 minutes at $39.75/h = 2517.5 cents, rounded half-up to $25.18.",
  input([...WEEK.slice(0, 5).map((d) => shift(d, 480, MA)), shift(WEEK[5]!, 38, MA)]),
  { pay: [["REG", 2400, 73000], ["OT", 38, 1734]], bill: [["REG", 2400, 106000], ["OT", 38, 2518]] },
);

ruleCase(
  "below-minimum-wage-topped-up",
  "Illinois worker on a $14.50/h rate card in October 2026, 8 hours. The Illinois minimum wage has been $15.00/h since January 1, 2025 (820 ILCS 105/4(a)(1)), so the 8 hours are paid at the rate card ($116.00) plus a minimum-wage top-up of 8 × $0.50 = $4.00 on its own line, and a warning asks for the rate card to be fixed. The client is billed at the bill rate only: 8 × $26.50 = $212.00.",
  input([shift(WEEK[0]!, 480, { payRateCents: 1450 })]),
  { pay: [["REG", 480, 11600], ["MW_TRUEUP", 480, 400]], bill: [["REG", 480, 21200]] },
);


ruleCase(
  "multi-rate-regular-rate",
  "One Illinois worker with two pay rates in a 46-hour week: 30 hours driving a forklift at $20.00/h for client A (Mon–Wed, 10 h a day), then 16 hours of general labor at $17.00/h for client B (Thu–Fri). Straight-time earnings are 30 × $20 + 16 × $17 = $872.00, so the regular rate is $872.00 ÷ 46 h = $18.9565…/h, kept exact (29 C.F.R. § 778.115). The last 6 hours, on Friday at client B, are overtime at $17.00 + ½ × $18.9565… = $26.4782…/h: $158.87. Pay: $600.00 + $170.00 + $158.87 = $928.87 (paying 1.5 × $17.00 instead would underpay $5.87). Bill: A 30 h × $28 = $840.00; B 10 h × $24 = $240.00 and overtime 6 h × $36 = $216.00.",
  input([
    ...WEEK.slice(0, 3).map((d) => shift(d, 600, { assignmentId: "assignment-A", clientId: "client-A", payRateCents: 2000, billRateCents: 2800 })),
    ...WEEK.slice(3, 5).map((d) => shift(d, 480, { assignmentId: "assignment-B", clientId: "client-B", payRateCents: 1700, billRateCents: 2400 })),
  ]),
  {
    pay: [["REG", 1800, 60000], ["REG", 600, 17000], ["OT", 360, 15887]],
    bill: [["REG", 1800, 84000], ["REG", 600, 24000], ["OT", 360, 21600]],
  },
);

ruleCase(
  "chicago-minimum-wage-rises-july-1",
  "A Chicago worksite (Cook County), rate card $16.60/h, 8 hours a day Monday June 29 to Friday July 3, 2026. Chicago's minimum wage is $16.60/h until June 30 and $17.05/h from July 1 (Chicago Municipal Code ch. 6-105), higher than Cook County's and Illinois's. Monday and Tuesday are paid at the rate card; Wednesday to Friday also get a top-up of 24 h × $0.45 = $10.80. Pay: 40 × $16.60 = $664.00 + $10.80 = $674.80. Bill: 40 × $26.50 = $1,060.00.",
  input(["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03"].map((d) => shift(d, 480, { countyFips: "17031", placeFips: "1714000", payRateCents: 1660 }))),
  { pay: [["REG", 2400, 66400], ["MW_TRUEUP", 1440, 1080]], bill: [["REG", 2400, 106000]] },
);

ruleCase(
  "cook-county-minimum-wage",
  "An Evanston worksite (Cook County, outside Chicago), rate card $15.20/h, 8 hours in October 2026. Cook County's minimum wage is $15.40/h from July 1, 2026 (Cook County Code § 42-13), above Illinois's $15.00, and no opt-out by Evanston is on file, so the county rate applies: $121.60 at the rate card plus a top-up of 8 × $0.20 = $1.60. Bill: 8 × $26.50 = $212.00.",
  input([shift(WEEK[0]!, 480, { countyFips: "17031", placeFips: "1724582", payRateCents: 1520 })]),
  { pay: [["REG", 480, 12160], ["MW_TRUEUP", 480, 160]], bill: [["REG", 480, 21200]] },
);

const caInput = (shifts: Shift[]): PayInput => ({ ...input(shifts), workweekStartsOn: 0 });
const CA_WEEK = ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"];

ruleCase(
  "ca-daily-and-seventh-day",
  "A California worker (Ontario, CA) at $18.00/h, billed at $26.00/h (overtime 1.5×, double time 2×), works all seven days of the workweek Sunday October 4 to Saturday October 10, 2026: 8, 10, 13, 8, 8, 6 and 10 hours (63 h). Monday's 2 and Tuesday's 4 hours over 8 are daily overtime; Tuesday's hour over 12 is double time. The 40 straight hours are reached on Thursday, so Friday's 6 hours are weekly overtime (daily-overtime hours never count toward the 40). Saturday is the seventh day worked: its first 8 hours are overtime, the last 2 double time (Cal. Lab. Code § 510(a)). Pay: 40 h × $18 = $720.00; overtime 2 h + 4 h + 6 h + 8 h = 20 h × $27 = $540.00; double time 1 h + 2 h = 3 h × $36 = $108.00; total $1,368.00 (treating Saturday as an ordinary day would pay $1,350.00). Bill: 40 h × $26 + 20 h × $39 + 3 h × $52 = $1,976.00.",
  caInput([480, 600, 780, 480, 480, 360, 600].map((m, i) => shift(CA_WEEK[i]!, m, { ...CA, payRateCents: 1800, billRateCents: 2600 }))),
  {
    pay: [["REG", 2400, 72000], ["OT", 360, 16200], ["OT", 360, 16200], ["OT", 480, 21600], ["DT", 60, 3600], ["DT", 120, 7200]],
    bill: [["REG", 2400, 104000], ["OT", 360, 23400], ["OT", 360, 23400], ["OT", 480, 31200], ["DT", 60, 5200], ["DT", 120, 10400]],
  },
);

ruleCase(
  "ca-seven-days-across-two-workweeks",
  "The same California worker works seven days in a row, 8 hours each, from Wednesday October 7 to Tuesday October 13, 2026, but the workweek starts on Sunday: 4 days fall in one workweek and 3 in the next, so neither week has a seventh day of work and no hour is over 8 in a day or 40 in a week (DLSE Enforcement Manual 48.1.3.2). All straight time: 32 h × $18 = $576.00 and 24 h × $18 = $432.00.",
  caInput(["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"].map((d) => shift(d, 480, { ...CA, payRateCents: 1800, billRateCents: 2600 }))),
  { pay: [["REG", 1920, 57600], ["REG", 1440, 43200]], bill: [["REG", 1920, 83200], ["REG", 1440, 62400]] },
);

ruleCase(
  "ca-meal-rest-premium-at-regular-rate",
  "A California worker works 8 hours a day Monday to Wednesday at $18.00/h (client A) and Thursday and Friday at $20.00/h (client B), 40 hours in all. The week's regular rate is the weighted average: $752.00 ÷ 40 h = $18.80/h. A person confirmed that on Thursday the worker missed both a meal period and a rest period (a second missed meal that day adds nothing: at most one of each per workday). Each premium is one hour at the regular rate, not the day's own $20.00 (Cal. Lab. Code § 226.7(c); Ferra v. Loews Hollywood Hotel (2021)): $18.80 + $18.80. Pay: $432.00 + $320.00 + $37.60 = $789.60. The premiums are not hours worked and are not billed: bill 24 h × $26.00 + 16 h × $28.75 = $1,084.00.",
  {
    ...caInput([
      ...CA_WEEK.slice(1, 4).map((d) => shift(d, 480, { ...CA, assignmentId: "assignment-A", clientId: "client-A", payRateCents: 1800, billRateCents: 2600 })),
      ...CA_WEEK.slice(4, 6).map((d) => shift(d, 480, { ...CA, assignmentId: "assignment-B", clientId: "client-B", payRateCents: 2000, billRateCents: 2875 })),
    ]),
    confirmations: [
      { id: "confirmation-1", kind: "meal_period_missed", workerId: "worker-1", assignmentId: "assignment-B", date: "2026-10-08" },
      { id: "confirmation-2", kind: "meal_period_missed", workerId: "worker-1", assignmentId: "assignment-B", date: "2026-10-08" },
      { id: "confirmation-3", kind: "rest_period_missed", workerId: "worker-1", assignmentId: "assignment-B", date: "2026-10-08" },
    ],
  },
  {
    pay: [["REG", 1440, 43200], ["REG", 960, 32000], ["MEAL_PREMIUM", 60, 1880], ["REST_PREMIUM", 60, 1880]],
    bill: [["REG", 1440, 62400], ["REG", 960, 46000]],
  },
);

ruleCase(
  "il-day-labor-four-hour-minimum",
  "An Illinois day laborer at $17.00/h works 10 hours a day Monday to Thursday at client C (40 hours), then on Friday is sent to client D, works 1 hour 30 minutes and is sent home; a person confirmed that client D did not use the worker, who was not placed elsewhere. Friday's 90 minutes are overtime (over 40 hours): 1.5 h × $25.50 = $38.25. The Day and Temporary Labor Services Act requires at least 4 hours of pay at the agreed rate when a laborer is sent and not used (820 ILCS 175/30(g); 56 Ill. Adm. Code 260.450(b)): 4 h − 1.5 h worked = 2.5 h × $17.00 = $42.50 more, not as hours worked (the safe reading: overtime already earned is not counted against it). Pay: $680.00 + $38.25 + $42.50 = $760.75. Bill: client C 40 h × $26.50 = $1,060.00; client D 1.5 h of overtime × $39.75 = $59.63 (the minimum itself is not billed).",
  {
    ...input([
      ...WEEK.slice(0, 4).map((d) => shift(d, 600, { assignmentId: "assignment-C", clientId: "client-C", payRateCents: 1700 })),
      shift(WEEK[4]!, 90, { assignmentId: "assignment-D", clientId: "client-D", payRateCents: 1700 }),
    ]),
    confirmations: [{ id: "confirmation-1", kind: "reported_short", workerId: "worker-1", assignmentId: "assignment-D", date: WEEK[4]! }],
  },
  {
    pay: [["REG", 2400, 68000], ["OT", 90, 3825], ["MIN_GUARANTEE", 150, 4250]],
    bill: [["REG", 2400, 106000], ["OT", 90, 5963]],
  },
);

ruleCase(
  "ca-reporting-time-pay",
  "A California worker at $18.00/h, scheduled for 8 hours on Friday, reports and is sent home after 2 hours (8 hours a day Monday to Thursday). California reporting-time pay is half the scheduled day, at least 2 and at most 4 hours, at the regular rate (IWC wage orders § 5(A)): half of 8 h is 4 h; 2 h were worked, so 2 h × $18.00 = $36.00 more, not as hours worked. Pay: 34 h × $18 = $612.00 + $36.00 = $648.00. Bill: 34 h × $26.00 = $884.00 (reporting pay is not billed).",
  {
    ...caInput([...CA_WEEK.slice(1, 5).map((d) => shift(d, 480, { ...CA, payRateCents: 1800, billRateCents: 2600 })), shift(CA_WEEK[5]!, 120, { ...CA, payRateCents: 1800, billRateCents: 2600 })]),
    confirmations: [{ id: "confirmation-1", kind: "reported_short", workerId: "worker-1", assignmentId: "assignment-1", date: CA_WEEK[5]!, scheduledMinutes: 480 }],
  },
  {
    pay: [["REG", 2040, 61200], ["REPORTING_PAY", 120, 3600]],
    bill: [["REG", 2040, 88400]],
  },
);

// ---------- export goldens ----------
function exportCase(name: string, summary: string, fixture: ExportFixture, handTotals: unknown) {
  const result = renderExport(fixture);
  if (JSON.stringify(result.controlTotals) !== JSON.stringify(handTotals)) {
    throw new Error(`${name}: control totals ${JSON.stringify(result.controlTotals)} ≠ hand ${JSON.stringify(handTotals)}`);
  }
  const dir = join(OUT, "exports", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, result.filename), result.bytes);
  writeFileSync(
    join(dir, "case.json"),
    JSON.stringify({ summary, fixture, expectedFile: result.filename, expectedControlTotals: result.controlTotals, notes: result.notes }, null, 2) + "\n",
  );
  console.log(`proposed exports/${name}`);
}

exportCase(
  "gusto-hours-basic",
  "Three workers for the week of 2026-10-05: one straight-time week (38h), one with 4h overtime (44h), and one with 37 overtime minutes, which Gusto receives as 0.62 hours (the note says so). Control totals: 3 workers, 7,080 regular minutes (118h), 277 overtime minutes (4h 37m), gross $2,279.88. Because 37 minutes are written as 0.62 h (rounded up), Gusto should compute $2,279.97, 9 cents more; the export's notes say so.",
  {
    format: "gusto_hours_csv",
    mappingVersion: "gusto-core-v1",
    period: { startsOn: "2026-10-05", endsOn: "2026-10-11" },
    earningCodeMap: { REG: "regular_hours", OT: "overtime_hours", DT: "double_overtime_hours" },
    workers: [
      { workerId: "w1", firstName: "Lucía", lastName: "Fernández Ruiz", payrollIds: { gusto: { id: "9a1b2c", title: "Picker (Primary)" } } },
      { workerId: "w2", firstName: "Marcus", lastName: "Bell", payrollIds: { gusto: { id: "9d3e4f", title: "Loader (Primary)" } } },
      { workerId: "w3", firstName: "Tran", lastName: "Nguyen", payrollIds: { gusto: { id: "9f5a6b", title: "Machine Operator (Primary)" } } },
    ],
    payLines: [
      { workerId: "w1", type: "REG", minutes: 2280, amountCents: 69350, rate: { num: 1825, den: 1 } },
      { workerId: "w2", type: "REG", minutes: 2400, amountCents: 73000, rate: { num: 1825, den: 1 } },
      { workerId: "w2", type: "OT", minutes: 240, amountCents: 10950, rate: { num: 5475, den: 2 } },
      { workerId: "w3", type: "REG", minutes: 2400, amountCents: 73000, rate: { num: 1825, den: 1 } },
      { workerId: "w3", type: "OT", minutes: 37, amountCents: 1688, rate: { num: 5475, den: 2 } },
    ],
  },
  { workers: 3, minutesByType: { REG: 7080, OT: 277 }, grossCents: 227988, payrollSystemGrossCents: 227997, payrollSystemDifferenceCents: 9 },
);
