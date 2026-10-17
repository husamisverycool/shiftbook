/**
 * Writes PROPOSED golden cases to tests/goldens/_proposed/ for the owner to approve.
 * Every case states its expected result in plain English, and this script refuses to write a case
 * unless the engine's numbers equal the hand-computed numbers written here.
 *   pnpm tsx scripts/propose-goldens.ts             (every case)
 *   pnpm tsx scripts/propose-goldens.ts NAME …      (every case is checked; only these are written)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addDays, computePay, type PayInput, type Shift } from "@shiftbook/rules";
import { ExportError } from "../src/exports/errors";
import { withoutSay } from "../tests/golden-runners/shared";
import type { InvoiceFileInput } from "../src/exports/invoice-files";
import { renderExport, type ExportFixture } from "../src/exports/registry";
import { INVOICE_FILES, type InvoiceFileFormat } from "../tests/golden-runners/exports";
import { proposeCompliance } from "./propose-compliance-goldens";
import { REFERENCE_EQUAL_PAY_RULES, REFERENCE_GUARANTEE_RULES, REFERENCE_REGULAR_RATE_RULES, REFERENCE_JURISDICTION_RULES, REFERENCE_MINIMUM_WAGE_RULES, REFERENCE_OVERTIME_RULES, REFERENCE_PREMIUM_RULES } from "../src/server/rules/reference-data";

const OUT = "tests/goldens/_proposed";
/** Names to write (all are still checked against their hand answers); none: every case. */
const ONLY = process.argv.slice(2);
const writes = (name: string) => ONLY.length === 0 || ONLY.includes(name);
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
  equalPayRules: REFERENCE_EQUAL_PAY_RULES,
  regularRateRules: REFERENCE_REGULAR_RATE_RULES,
});
const MA = { jurisdiction: "MA", countyFips: "25027", placeFips: "2582000" } as const; // Worcester County; Worcester
const NJ = { jurisdiction: "NJ", countyFips: "34013", placeFips: "3451000" } as const; // Essex County; Newark
const CA = { jurisdiction: "CA", countyFips: "06071", placeFips: "0653896" } as const; // San Bernardino County; Ontario

type Expect = { pay: [string, number, number][]; bill: [string, number, number][]; blockers?: string[]; obligations?: [string, string, number | null, number][]; warnings?: string[] };

function ruleCase(name: string, summary: string, inp: PayInput, hand: Expect) {
  const result = computePay(inp);
  const pay = result.payLines.map((l) => [l.type, l.minutes, l.amountCents]);
  const bill = result.billLines.map((l) => [l.type, l.minutes, l.amountCents]);
  const blockers = result.blockers.map((b) => b.code);
  const obligations = result.obligations.map((o) => [o.kind, o.crossedOn, o.crossedAtMinute, o.minutesAfter]);
  const engine = [pay, bill, blockers, obligations, ...(hand.warnings ? [result.warnings.map((w) => w.code)] : [])];
  const handAnswer = [hand.pay, hand.bill, hand.blockers ?? [], hand.obligations ?? [], ...(hand.warnings ? [hand.warnings] : [])];
  if (JSON.stringify(engine) !== JSON.stringify(handAnswer)) {
    throw new Error(`${name}: engine disagrees with the hand-computed answer\nengine: ${JSON.stringify(engine)}\nhand:   ${JSON.stringify(handAnswer)}`);
  }
  if (!writes(name)) return;
  mkdirSync(join(OUT, "rules"), { recursive: true });
  writeFileSync(join(OUT, "rules", `${name}.json`), JSON.stringify({ name, summary, input: inp, expected: withoutSay(result) }, null, 2) + "\n");
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
  "nj-weekly-overtime-44h",
  "New Jersey worker, 44 hours (four 9-hour days and one 8-hour day) at $17.00/h, billed at $25.00/h with overtime at the 1.5x multiplier. New Jersey pays 1.5x the regular hourly wage over 40 hours in a week (N.J.S.A. 34:11-56a4(b)(1)): 40 h × $17.00 = $680.00 and 4 h × $25.50 = $102.00. Billed 40 h × $25.00 = $1,000.00 and 4 h × $37.50 = $150.00.",
  input([...WEEK.slice(0, 4).map((d) => shift(d, 540, { ...NJ, payRateCents: 1700, billRateCents: 2500 })), shift(WEEK[4]!, 480, { ...NJ, payRateCents: 1700, billRateCents: 2500 })]),
  { pay: [["REG", 2400, 68000], ["OT", 240, 10200]], bill: [["REG", 2400, 100000], ["OT", 240, 15000]] },
);

ruleCase(
  "nj-below-minimum-wage-topped-up",
  "New Jersey worker on a $15.50/h rate card in October 2026, 8 hours. The New Jersey minimum wage is $15.92/h from January 1, 2026 (N.J.S.A. 34:11-56a4(a)), so the 8 hours are paid at the rate card (8 × $15.50 = $124.00) plus a minimum-wage top-up of 8 × $0.42 = $3.36 on its own line. The client is billed at the bill rate only: 8 × $24.00 = $192.00.",
  input([shift(WEEK[0]!, 480, { ...NJ, payRateCents: 1550, billRateCents: 2400 })]),
  { pay: [["REG", 480, 12400], ["MW_TRUEUP", 480, 336]], bill: [["REG", 480, 19200]] },
);

ruleCase(
  "nj-minimum-wage-2027",
  "New Jersey worker on a $16.00/h rate card in the week of January 4, 2027, 8 hours on Monday. The New Jersey minimum wage is $16.48/h from January 1, 2027 (NJDOL release of September 29, 2026), so the 8 hours are paid at the rate card (8 × $16.00 = $128.00) plus a top-up of 8 × $0.48 = $3.84. Billed 8 × $24.00 = $192.00.",
  input([shift("2027-01-04", 480, { ...NJ, payRateCents: 1600, billRateCents: 2400 })]),
  { pay: [["REG", 480, 12800], ["MW_TRUEUP", 480, 384]], bill: [["REG", 480, 19200]] },
);

ruleCase(
  "nj-sent-not-used-four-hours",
  "A New Jersey temporary laborer at $17.00/h is sent to a client on Monday, works 1 hour and is sent home; a person confirmed the client did not use the worker, who was not placed elsewhere. The Temporary Workers' Bill of Rights requires at least 4 hours of pay at the agreed rate (N.J.S.A. 34:8D-6(g)): the hour worked is paid (1 h × $17.00 = $17.00) and 4 h − 1 h = 3 h × $17.00 = $51.00 more, not as hours worked. Billed 1 h × $25.00 = $25.00 (the minimum itself is not billed).",
  {
    ...input([shift(WEEK[0]!, 60, { ...NJ, payRateCents: 1700, billRateCents: 2500 })]),
    confirmations: [{ id: "confirmation-1", kind: "reported_short", workerId: "worker-1", assignmentId: "assignment-1", date: WEEK[0]! }],
  },
  { pay: [["REG", 60, 1700], ["MIN_GUARANTEE", 180, 5100]], bill: [["REG", 60, 2500]] },
);

ruleCase(
  "night-differential-overtime-week",
  "Illinois worker at $18.00/h, billed at $26.00/h, works 9 hours Monday to Friday (45 h). The rate card pays a Night shift differential of $1.50/h on Wednesday to Friday (27 h) and bills it at $2.00/h. A differential is in the regular rate (29 C.F.R. § 778.207(b)): straight-time earnings 45 h × $18.00 = $810.00 plus 27 h × $1.50 = $40.50 is $850.50, ÷ 45 h = a regular rate of $18.90. The last 5 hours (Friday) are overtime at $18.00 + ½ × $18.90 = $27.45/h: 5 h × $27.45 = $137.25. Pay: 40 h × $18.00 = $720.00, overtime $137.25, differential 27 h × $1.50 = $40.50; total $897.75 (= $850.50 + ½ × $18.90 × 5 h). Bill: 40 h × $26.00 = $1,040.00, overtime 5 h × $39.00 = $195.00, differential 27 h × $2.00 = $54.00.",
  input([
    ...WEEK.slice(0, 2).map((d) => shift(d, 540, { payRateCents: 1800, billRateCents: 2600 })),
    ...WEEK.slice(2, 5).map((d) => shift(d, 540, { payRateCents: 1800, billRateCents: 2600, differential: { name: "Night", payCentsPerHour: 150, billCentsPerHour: 200 } })),
  ]),
  { pay: [["REG", 2400, 72000], ["OT", 300, 13725], ["DIFF", 1620, 4050]], bill: [["REG", 2400, 104000], ["OT", 300, 19500], ["DIFF", 1620, 5400]] },
);

ruleCase(
  "ca-daily-overtime-with-differential",
  "California worker at $20.00/h, billed at $28.00/h, works one 10-hour Monday that carries a Night shift differential of $2.00/h (not billed). The week's regular rate includes the differential (29 C.F.R. § 778.207(b); Cal. Lab. Code § 510): (10 h × $20.00 + 10 h × $2.00) ÷ 10 h = $22.00. Daily overtime over 8 hours: 2 h at $20.00 + ½ × $22.00 = $31.00/h = $62.00. Pay: 8 h × $20.00 = $160.00, overtime $62.00, differential 10 h × $2.00 = $20.00; total $242.00. Bill: 8 h × $28.00 = $224.00 and overtime 2 h × $42.00 = $84.00; the differential is not billed.",
  input([shift(WEEK[0]!, 600, { ...CA, payRateCents: 2000, billRateCents: 2800, differential: { name: "Night", payCentsPerHour: 200, billCentsPerHour: 0 } })]),
  { pay: [["REG", 480, 16000], ["OT", 120, 6200], ["DIFF", 600, 2000]], bill: [["REG", 480, 22400], ["OT", 120, 8400]] },
);

ruleCase(
  "contract-minimum-day",
  "Illinois clerical worker (not day and temporary labor, so the Day and Temporary Labor Services Act minimum does not apply) at $17.00/h, billed at $25.00/h; the rate card promises at least 4 hours on each day at the assignment and bills that minimum. On Monday the worker is sent home after 2 hours, and a person confirms the short day (the engine computes, a person confirms). The 2 hours worked are paid (2 h × $17.00 = $34.00) and the contractual shortfall, 4 h − 2 h = 2 h × $17.00 = $34.00, is paid on its own line, not as hours worked (29 U.S.C. § 207(e)(2); 29 C.F.R. § 778.220). Billed 2 h × $25.00 = $50.00 and the minimum 2 h × $25.00 = $50.00.",
  {
    ...input([shift(WEEK[0]!, 120, { payRateCents: 1700, billRateCents: 2500, contractMinimumMinutes: 240, billsContractMinimum: true, dayAndTemporaryLabor: false })]),
    confirmations: [{ id: "confirmation-1", kind: "reported_short", workerId: "worker-1", assignmentId: "assignment-1", date: WEEK[0]! }],
  },
  { pay: [["REG", 120, 3400], ["MIN_GUARANTEE", 120, 3400]], bill: [["REG", 120, 5000], ["MIN_GUARANTEE", 120, 5000]] },
);

ruleCase(
  "holiday-and-short-day-same-day-held",
  "Illinois worker at $18.25/h whose rate card promises a 4-hour day. The agency's holiday policy pays 8 hours for a holiday not worked. Wednesday October 7 is confirmed both as a holiday not worked and as a short day on the same assignment. Holiday pay and a short day's minimums would both pay the same day, so Granite holds the week for a person to remove one of the confirmations: no lines, one blocker.",
  {
    ...input([shift(WEEK[2]!, 0, { entryIds: [], reportedOnly: true, startMinute: null, contractMinimumMinutes: 240 })]),
    holidayPolicies: [{ clientId: null, name: "Agency holidays", dates: [WEEK[2]!], workedMultiplier: { num: 3, den: 2 }, notWorkedMinutes: 480, billWorkedMultiplier: null, billNotWorked: false }],
    confirmations: [
      { id: "confirmation-1", kind: "holiday_not_worked", workerId: "worker-1", assignmentId: "assignment-1", date: WEEK[2]! },
      { id: "confirmation-2", kind: "reported_short", workerId: "worker-1", assignmentId: "assignment-1", date: WEEK[2]! },
    ],
  },
  { pay: [], bill: [], blockers: ["invalid_input"] },
);

ruleCase(
  "contract-minimum-not-on-holiday-off",
  "Illinois worker at $18.25/h, billed at $26.50/h, whose rate card promises a 4-hour day. The agency's holiday policy pays 8 hours for a holiday not worked (not billed). The worker works 8 hours Monday and has Wednesday October 7 off as a holiday, which a person confirms. The holiday is paid by its policy, 8 h × $18.25 = $146.00, and nothing more: a contractual minimum day pays only on a day a person confirmed was short, never on a holiday off. Pay: Monday 8 h × $18.25 = $146.00 plus the holiday $146.00. Billed Monday 8 h × $26.50 = $212.00.",
  {
    ...input([
      shift(WEEK[0]!, 480, { contractMinimumMinutes: 240 }),
      shift(WEEK[2]!, 0, { entryIds: [], reportedOnly: true, startMinute: null, contractMinimumMinutes: 240 }),
    ]),
    holidayPolicies: [{ clientId: null, name: "Agency holidays", dates: [WEEK[2]!], workedMultiplier: { num: 3, den: 2 }, notWorkedMinutes: 480, billWorkedMultiplier: null, billNotWorked: false }],
    confirmations: [{ id: "confirmation-1", kind: "holiday_not_worked", workerId: "worker-1", assignmentId: "assignment-1", date: WEEK[2]! }],
  },
  { pay: [["REG", 480, 14600], ["HOL_NOT_WORKED", 480, 14600]], bill: [["REG", 480, 21200]] },
);

ruleCase(
  "contract-minimum-after-day-labor-minimum",
  "Illinois day laborer at $17.00/h whose rate card promises a 6-hour day (not billed). On Monday the worker is sent, works 1 hour and is not used further; a person confirmed it. The Day and Temporary Labor Services Act owes at least 4 hours at the agreed rate (820 ILCS 175/30(g)): 4 h − 1 h = 3 h × $17.00 = $51.00. The contractual minimum counts that statutory pay: 6 h − 1 h worked − 3 h already paid = 2 h × $17.00 = $34.00 more. Pay: $17.00 + $51.00 + $34.00 = $102.00 (6 hours' pay). Billed the hour worked, 1 h × $25.00 = $25.00.",
  {
    ...input([shift(WEEK[0]!, 60, { payRateCents: 1700, billRateCents: 2500, contractMinimumMinutes: 360 })]),
    confirmations: [{ id: "confirmation-1", kind: "reported_short", workerId: "worker-1", assignmentId: "assignment-1", date: WEEK[0]! }],
  },
  { pay: [["REG", 60, 1700], ["MIN_GUARANTEE", 180, 5100], ["MIN_GUARANTEE", 120, 3400]], bill: [["REG", 60, 2500]] },
);

ruleCase(
  "client-holiday-policy-worked",
  "Illinois worker at $18.25/h, billed at $26.50/h, works 8 hours on Wednesday October 7, 2026, a holiday under the client's own policy (agency data: no law requires it), which pays and bills 1.5× for hours worked; the agency's default policy has no holiday that day. Straight time 8 h × $18.25 = $146.00, plus the holiday premium 8 h × ½ × $18.25 = $73.00 (a 1.5× premium stays out of the regular rate: 29 U.S.C. § 207(e)(6)). Billed 8 h × $26.50 = $212.00 plus 8 h × $13.25 = $106.00.",
  {
    ...input([shift(WEEK[2]!, 480, { clientId: "client-1" })]),
    holidayPolicies: [
      { clientId: null, name: "Agency holidays", dates: ["2026-11-26"], workedMultiplier: { num: 3, den: 2 }, notWorkedMinutes: 0, billWorkedMultiplier: null, billNotWorked: false },
      { clientId: "client-1", name: "Client plant shutdown day", dates: [WEEK[2]!], workedMultiplier: { num: 3, den: 2 }, notWorkedMinutes: 0, billWorkedMultiplier: { num: 3, den: 2 }, billNotWorked: false },
    ],
  },
  { pay: [["REG", 480, 14600], ["HOL", 480, 7300]], bill: [["REG", 480, 21200], ["HOL", 480, 10600]] },
);

ruleCase(
  "holiday-premium-with-differential-held",
  "Illinois worker at $18.25/h works 8 hours on Wednesday October 7, 2026, a holiday under the agency's policy paying 1.5× for hours worked, on a shift that also carries a Night differential of $1.50/h. Whether a holiday premium stays out of the regular rate compares it with the rate for like work on other days (29 C.F.R. § 778.203); with a differential on the shift Granite does not work that comparison out, so the week is held for a person instead of guessed: no lines, one blocker.",
  {
    ...input([shift(WEEK[2]!, 480, { differential: { name: "Night", payCentsPerHour: 150, billCentsPerHour: 0 } })]),
    holidayPolicies: [{ clientId: null, name: "Agency holidays", dates: [WEEK[2]!], workedMultiplier: { num: 3, den: 2 }, notWorkedMinutes: 0, billWorkedMultiplier: null, billNotWorked: false }],
  },
  { pay: [], bill: [], blockers: ["rule_not_supported_yet"] },
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

ruleCase(
  "ca-minimum-wage-rises-new-year",
  "An Ontario, California worker on a $16.60/h rate card works 8 hours a day Monday December 29, 2025 to Friday January 2, 2026 (the workweek starts Monday). The state minimum is $16.50/h in 2025 and $16.90/h from January 1, 2026 (Cal. Lab. Code § 1182.12), and it is owed for each hour, not averaged over the week (Armenta v. Osmose). Monday to Wednesday are paid at the rate card; Thursday and Friday also get a top-up of 16 h × $0.30 = $4.80 on its own line, with a warning to fix the rate card. Pay: 40 h × $16.60 = $664.00 + $4.80 = $668.80. Bill: 40 h × $26.00 = $1,040.00.",
  { ...input(["2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"].map((d) => shift(d, 480, { ...CA, payRateCents: 1660, billRateCents: 2600 }))), workweekStartsOn: 1 },
  { pay: [["REG", 2400, 66400], ["MW_TRUEUP", 960, 480]], bill: [["REG", 2400, 104000]] },
);

ruleCase(
  "ca-seventh-day-billing-variants",
  "The California seven-day week of ca-daily-and-seventh-day ($1,368.00 of pay, unchanged) billed to two other clients: one bills overtime and double time at straight time — 63 h × $26.00 = $1,638.00; the other does not bill overtime — 40 h × $26.00 = $1,040.00, with the 20 overtime and 3 double-time hours listed at $0.00.",
  caInput(
    (["straight_time", "not_billable"] as const).flatMap((rule, i) =>
      [480, 600, 780, 480, 480, 360, 600].map((m, d) => shift(CA_WEEK[d]!, m, { ...CA, workerId: `worker-${i + 1}`, workerName: `Worker ${i + 1}`, assignmentId: `assignment-${i + 1}`, clientId: `client-${i + 1}`, payRateCents: 1800, billRateCents: 2600, otBillingRule: rule })),
    ),
  ),
  {
    pay: [
      ["REG", 2400, 72000], ["OT", 360, 16200], ["OT", 360, 16200], ["OT", 480, 21600], ["DT", 60, 3600], ["DT", 120, 7200],
      ["REG", 2400, 72000], ["OT", 360, 16200], ["OT", 360, 16200], ["OT", 480, 21600], ["DT", 60, 3600], ["DT", 120, 7200],
    ],
    bill: [
      ["REG", 2400, 104000], ["OT", 360, 15600], ["OT", 360, 15600], ["OT", 480, 20800], ["DT", 60, 2600], ["DT", 120, 5200],
      ["REG", 2400, 104000], ["OT", 360, 0], ["OT", 360, 0], ["OT", 480, 0], ["DT", 60, 0], ["DT", 120, 0],
    ],
  },
);

const THANKSGIVING = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"];
const maWorker = (letter: string) => ({ ...MA, workerId: `worker-${letter}`, workerName: `Worker ${letter}`, assignmentId: `assignment-${letter}`, payRateCents: 1900, billRateCents: 2700 });

ruleCase(
  "ma-thanksgiving-holiday-policy",
  "Three Worcester, Massachusetts workers at $19.00/h, billed at $27.00/h, in Thanksgiving week 2026 (Thursday November 26). The agency's holiday policy (agency data: no law here requires holiday pay) pays 1.5× for hours worked on the holiday and 8 hours for a holiday not worked when a person confirms the worker is eligible; it bills worked holiday hours at 1.5× and does not bill a holiday not worked. Worker A works 8 hours Monday to Friday: 40 h × $19 = $760.00 plus the holiday premium 8 h × 0.5 × $19 = $76.00 = $836.00; billed 40 h × $27 + 8 h × $13.50 = $1,188.00. Worker B works 8 hours on the four other days and is confirmed eligible for the holiday: 32 h × $19 = $608.00 plus 8 h of holiday pay × $19 = $152.00 = $760.00, which is not hours worked (no overtime from it); billed 32 h × $27 = $864.00. Worker C works 9 hours a day (45 h): 40 h × $19 = $760.00, overtime 5 h × $28.50 = $142.50, and the holiday premium on Thursday's 9 hours, 9 h × $9.50 = $85.50, paid on top of the overtime (a 1.5× holiday premium stays out of the regular rate: 29 U.S.C. § 207(e)(6)) = $988.00; billed 40 h × $27 + 5 h × $40.50 + 9 h × $13.50 = $1,404.00.",
  {
    ...input([
      ...THANKSGIVING.map((d) => shift(d, 480, maWorker("A"))),
      ...THANKSGIVING.filter((d) => d !== "2026-11-26").map((d) => shift(d, 480, maWorker("B"))),
      shift("2026-11-26", 0, { ...maWorker("B"), entryIds: [], reportedOnly: true, startMinute: null }),
      ...THANKSGIVING.map((d) => shift(d, 540, maWorker("C"))),
    ]),
    holidayPolicies: [{ clientId: null, name: "Agency holidays", dates: ["2026-11-26"], workedMultiplier: { num: 3, den: 2 }, notWorkedMinutes: 480, billWorkedMultiplier: { num: 3, den: 2 }, billNotWorked: false }],
    confirmations: [{ id: "confirmation-1", kind: "holiday_not_worked", workerId: "worker-B", assignmentId: "assignment-B", date: "2026-11-26" }],
  },
  {
    pay: [["REG", 2400, 76000], ["HOL", 480, 7600], ["REG", 1920, 60800], ["HOL_NOT_WORKED", 480, 15200], ["REG", 2400, 76000], ["OT", 300, 14250], ["HOL", 540, 8550]],
    bill: [["REG", 2400, 108000], ["HOL", 480, 10800], ["REG", 1920, 86400], ["REG", 2400, 108000], ["OT", 300, 20250], ["HOL", 540, 12150]],
  },
);

ruleCase(
  "il-nondiscretionary-bonus-in-regular-rate",
  "An Illinois worker at $18.25/h works 9 hours Monday to Thursday and 8 on Friday (44 h) and earns a $50.00 bonus for meeting the week's output target, which a person classified as nondiscretionary (promised for the work). The bonus is part of the week's pay, so it goes into the regular rate (29 C.F.R. §§ 778.208–778.211): ($803.00 straight time + $50.00) ÷ 44 h = $19.3863…/h. Overtime: 4 h × ($18.25 + 0.5 × $19.3863…) = $111.7727… → $111.77 (without the bonus it would be $109.50). Pay: 40 h × $18.25 = $730.00 + $111.77 + $50.00 = $891.77. Bill: 40 h × $26.50 + 4 h × $39.75 = $1,219.00 (the bonus is not billed).",
  {
    ...input([...WEEK.slice(0, 4).map((d) => shift(d, 540)), shift(WEEK[4]!, 480)]),
    bonuses: [{ id: "bonus-1", workerId: "worker-1", assignmentId: "assignment-1", workweekStart: WEEK[0]!, amountCents: 5000, kind: "nondiscretionary" }],
  },
  { pay: [["REG", 2400, 73000], ["OT", 240, 11177], ["BONUS", 0, 5000]], bill: [["REG", 2400, 106000], ["OT", 240, 15900]] },
);

ruleCase(
  "ca-flat-sum-bonus-overtime",
  "The California seven-day week of ca-daily-and-seventh-day ($1,368.00 of pay: 40 straight hours, 20 h of overtime, 3 h of double time) with a $50.00 flat-sum bonus for the week (a fixed amount for showing up, not tied to output). In California the overtime on a flat-sum bonus is the bonus divided by the hours not paid at a premium, times the full overtime or double-time multiple (Alvarado v. Dart Container (2018) 4 Cal.5th 542): $50 ÷ 40 h = $1.25/h; 20 h × 1.5 × $1.25 + 3 h × 2 × $1.25 = $37.50 + $7.50 = $45.00. The bonus does not also go into the regular rate used for the other overtime ($18.00). Federal law (the bonus in the regular rate over all 63 hours) would add less: 23 h × 0.5 × $0.7936… = $9.13. Pay: $1,368.00 + $50.00 + $45.00 = $1,463.00. Bill unchanged: $1,976.00.",
  {
    ...caInput([480, 600, 780, 480, 480, 360, 600].map((m, i) => shift(CA_WEEK[i]!, m, { ...CA, payRateCents: 1800, billRateCents: 2600 }))),
    bonuses: [{ id: "bonus-1", workerId: "worker-1", assignmentId: "assignment-1", workweekStart: CA_WEEK[0]!, amountCents: 5000, kind: "flat_sum" }],
  },
  {
    pay: [["REG", 2400, 72000], ["OT", 360, 16200], ["OT", 360, 16200], ["OT", 480, 21600], ["DT", 60, 3600], ["DT", 120, 7200], ["BONUS", 0, 5000], ["BONUS_OT", 1200, 3750], ["BONUS_OT", 180, 750]],
    bill: [["REG", 2400, 104000], ["OT", 360, 23400], ["OT", 360, 23400], ["OT", 480, 31200], ["DT", 60, 5200], ["DT", 120, 10400]],
  },
);

ruleCase(
  "il-s42-720h-crossing-midweek",
  "An Illinois day laborer in Joliet at $17.00/h, billed at $24.00/h, has already worked 700 hours (42,000 minutes) at the same client in the past 12 months (105 days of 6 h 40 m from November 2, 2025). In the week of Monday October 12, 2026 the worker works 8 hours a day, 7:00 to 15:00. The counter after each day: Monday 42,480, Tuesday 42,960; on Wednesday it reaches 43,200 minutes (720 hours) at 11:00, so the minute from 11:00 is the first over 720 hours in the 12 months from October 15, 2025 (820 ILCS 175/42(a)). Hours after the crossing this week: 4 h on Wednesday + 8 h + 8 h = 20 h. The equal-pay rate needs the client's comparator data, so pay is unchanged — 40 h × $17.00 = $680.00; bill 40 h × $24.00 = $960.00 — and the result records an obligation (crossed on October 14 at 11:00, client data due before the next pay period: 56 Ill. Adm. Code 260.505(b)) with warnings that equal pay now applies and that 20 h were paid at the placement rate.",
  {
    ...input(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"].map((d) => shift(d, 480, { payRateCents: 1700, billRateCents: 2400, clientName: "Client X" }))),
    hoursWorked: Array.from({ length: 105 }, (_, i) => ({ workerId: "worker-1", clientId: "client-1", date: addDays("2025-11-02", i), minutes: 400 })),
  },
  { pay: [["REG", 2400, 68000]], bill: [["REG", 2400, 96000]], obligations: [["il_equal_pay_720h", "2026-10-14", 660, 1200]], warnings: ["equal_pay_obligation", "equal_pay_rate_missing"] },
);

ruleCase(
  "il-s42-equal-pay-rate-paid",
  "The week after the 720-hour crossing of il-s42-720h-crossing-midweek (crossed on October 14, 2026, on file). The client's figures are in from Monday October 19: a comparable direct hire earns $18.50 an hour, and benefits are paid in lieu at an hourly cash value of $1.25 (820 ILCS 175/42(a)(1)(A), (b)). The worker, on a $17.00 rate card billed at $24.00, works 9 hours a day, Monday to Friday (45 h). From October 19 the pay rate is at least $18.50 + $1.25 = $19.75, so the regular rate is $19.75 and overtime is 1.5 × $19.75 = $29.625: pay 40 h × $19.75 = $790.00 and 5 h × $29.625 = $148.125 → $148.13 (rounded half up once). Billing stays on the rate card: 40 h × $24.00 = $960.00 and 5 h × $36.00 = $180.00. Each pay line says why its rate is above the card's; no warning that the equal-pay rate is missing.",
  {
    ...input(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"].map((d) => shift(d, 540, { payRateCents: 1700, billRateCents: 2400, clientName: "Client X" }))),
    obligationsOnFile: [{ kind: "il_equal_pay_720h", workerId: "worker-1", clientId: "client-1", crossedOn: "2026-10-14" }],
    equalPayRates: [{ workerId: "worker-1", clientId: "client-1", effectiveFrom: "2026-10-19", kind: "rate", rateCents: 1850, benefitsCents: 125, method: "comparator" }],
  },
  { pay: [["REG", 2400, 79000], ["OT", 300, 14813]], bill: [["REG", 2400, 96000], ["OT", 300, 18000]], warnings: [] },
);

ruleCase(
  "multi-rate-own-sites-overtime-billing",
  "The two-rate week of multi-rate-regular-rate (pay unchanged: $928.87), with client B billed overtime only for hours that are overtime at its own sites. The worker spent only 16 hours at B's site (Thursday and Friday), so none of the 6 overtime hours on B's line would be overtime had the worker worked only there: they are billed at straight time, 6 h × $24.00 = $144.00, and the agency bears the $56.87 premium. Bill: A 30 h × $28.00 = $840.00; B 10 h × $24.00 + 6 h × $24.00 = $384.00.",
  input([
    ...WEEK.slice(0, 3).map((d) => shift(d, 600, { assignmentId: "assignment-A", clientId: "client-A", payRateCents: 2000, billRateCents: 2800 })),
    ...WEEK.slice(3, 5).map((d) => shift(d, 480, { assignmentId: "assignment-B", clientId: "client-B", payRateCents: 1700, billRateCents: 2400, otBillingRule: "own_sites_only" })),
  ]),
  {
    pay: [["REG", 1800, 60000], ["REG", 600, 17000], ["OT", 360, 15887]],
    bill: [["REG", 1800, 84000], ["REG", 600, 24000], ["OT", 360, 14400]],
  },
);

// ---------- export goldens ----------
function exportCase(name: string, summary: string, fixture: ExportFixture, handTotals: unknown) {
  const result = renderExport(fixture);
  if (JSON.stringify(result.controlTotals) !== JSON.stringify(handTotals)) {
    throw new Error(`${name}: control totals ${JSON.stringify(result.controlTotals)} ≠ hand ${JSON.stringify(handTotals)}`);
  }
  if (!writes(name)) return;
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

exportCase(
  "gusto-hours-correction",
  "Correction 2 of the week of 2026-10-05, against version 1 (slice e, decision E9): only additions. Lucía 2 more regular hours (120 min × $18.25/h = $36.50). Marcus 2 more hours that are all overtime, with no regular hours in the file: checked against his regular rate in the whole period ($18.25 → 1.5× = $27.375/h; 120 min = $54.75). Tran 60 more overtime minutes: 97 min ($44.26, from $44.25625) minus 37 min ($16.88, from $16.875) = $27.38 — the difference of two amounts each rounded once (two stored lines), so within a cent of 60 min × $27.375/h = $27.375. Every line is checked against each worker's one regular rate in the whole period ($18.25/h), the rate Gusto pays. Control totals: 3 workers, 120 regular minutes, 180 overtime minutes, gross $118.63; Gusto computes the same ($36.50 + $54.75 + $27.38 from 1.00 h × $27.375 = $27.375 rounded half up). The note says the file only adds to version 1's.",
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
      { workerId: "w1", type: "REG", minutes: 120, amountCents: 3650, rate: { num: 1825, den: 1 }, parts: 2 },
      { workerId: "w2", type: "OT", minutes: 120, amountCents: 5475, rate: { num: 5475, den: 2 }, parts: 2 },
      { workerId: "w3", type: "OT", minutes: 60, amountCents: 2738, rate: { num: 5475, den: 2 }, parts: 2 },
    ],
    correction: { version: 2, baseVersion: 1 },
    referenceRates: { w1: { num: 1825, den: 1 }, w2: { num: 1825, den: 1 }, w3: { num: 1825, den: 1 } },
  },
  { workers: 3, minutesByType: { REG: 120, OT: 180 }, grossCents: 11863, payrollSystemGrossCents: 11863, payrollSystemDifferenceCents: 0 },
);

// ---------- slice f: every other payroll system ----------

/** A case whose answer is a refusal naming the worker (the run offers to skip them; pay by hand). */
function exportRefusal(name: string, summary: string, fixture: ExportFixture, hand: { code: string; workerId?: string; message: string }) {
  let error: unknown = null;
  try {
    renderExport(fixture);
  } catch (e) {
    error = e;
  }
  if (!(error instanceof ExportError) || error.code !== hand.code || error.workerId !== hand.workerId || error.message !== hand.message) {
    throw new Error(`${name}: expected refusal ${JSON.stringify(hand)}, got ${error instanceof Error ? `${(error as ExportError).code}: ${error.message}` : "a file"}`);
  }
  if (!writes(name)) return;
  const dir = join(OUT, "exports", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "case.json"), JSON.stringify({ summary, fixture, expectedError: hand }, null, 2) + "\n");
  console.log(`proposed exports/${name}`);
}

/** Checks the file's text against the hand-written rows before proposing the case. */
function exportCaseWithText(name: string, summary: string, fixture: ExportFixture, handTotals: unknown, handText: string) {
  const got = new TextDecoder().decode(renderExport(fixture).bytes);
  if (got !== handText) throw new Error(`${name}: file\n${JSON.stringify(got)}\n≠ hand\n${JSON.stringify(handText)}`);
  exportCase(name, summary, fixture, handTotals);
}

// Decision 0040: Paychex Flex and Paylocity, the same week by hand — Álvarez 40 h at $18.25 ($730.00),
// 37 overtime minutes at $27.375 ($16.88, written 0.62 h, which the system pays as $16.97), a $150.00
// bonus; Okafor 38 h at $18.25 ($693.50). Granite gross $1,590.38; the system's $1,590.47 (+$0.09).
const WEEK_0040: ExportFixture["payLines"] = [
  { workerId: "w2", type: "REG", minutes: 2280, amountCents: 69_350, rate: { num: 1825, den: 1 }, workweekStart: "2026-10-05" },
  { workerId: "w1", type: "REG", minutes: 2400, amountCents: 73_000, rate: { num: 1825, den: 1 }, workweekStart: "2026-10-05" },
  { workerId: "w1", type: "OT", minutes: 37, amountCents: 1688, rate: { num: 5475, den: 2 }, workweekStart: "2026-10-05" },
  { workerId: "w1", type: "BONUS", minutes: 0, amountCents: 15_000, rate: { num: 15_000, den: 1 }, workweekStart: "2026-10-05" },
];
const TOTALS_0040 = { workers: 2, minutesByType: { REG: 4680, OT: 37 }, amountsByType: { BONUS: 15_000 }, grossCents: 159_038, payrollSystemGrossCents: 159_047, payrollSystemDifferenceCents: 9 };
exportCaseWithText(
  "paychex-flex-spi-basic",
  "Paychex Flex Standard Payroll Import, sixteen columns: hours rows carry their rate and no amount; the bonus carries its amount and no hours or rate (Paychex: \"Amount must be empty if Hours is nonzero\"). The agency declares that its \"Overtime 1.5x\" pay component multiplies the rate by 1.5, so overtime's $27.375 is written as $27.375 ÷ 1.5 = 18.2500. Paychex pays 40.00 × 18.2500 = $730.00, 0.62 × 18.2500 × 1.5 = 16.9725 → $16.97 (Granite $16.88, +$0.09), $150.00 and 38.00 × 18.2500 = $693.50: $1,590.47 against Granite's $1,590.38.",
  {
    format: "paychex_flex_csv",
    mappingVersion: "paychex-flex-spi-v1",
    period: { startsOn: "2026-10-05", endsOn: "2026-10-11" },
    earningCodeMap: {},
    target: { format: "paychex_flex_csv", clientId: "ABC12345" },
    codes: { REG: { code: "Hourly", as: "hours" }, OT: { code: "Overtime 1.5x", as: "hours", factor: { num: 3, den: 2 } }, BONUS: { code: "Bonus", as: "dollars" } },
    workers: [
      { workerId: "w1", firstName: "Ana", lastName: "Álvarez", payrollIds: { paychex: { id: "A123" } } },
      { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: { paychex: { id: "B456" } } },
    ],
    payLines: WEEK_0040,
  },
  TOTALS_0040,
  [
    "Client ID,Worker ID,Org,Job Number,Pay Component,Rate,Rate Number,Hours,Units,Line Date,Amount,Check Seq Number,Override State,Override Local,Override Local Jurisdiction,Labor Assignment",
    "ABC12345,A123,,,Hourly,18.2500,,40.00,,10/11/2026,,,,,,",
    "ABC12345,A123,,,Overtime 1.5x,18.2500,,0.62,,10/11/2026,,,,,,",
    "ABC12345,A123,,,Bonus,,,,,10/11/2026,150.00,,,,,",
    "ABC12345,B456,,,Hourly,18.2500,,38.00,,10/11/2026,,,,,,",
    "",
  ].join("\r\n"),
);
exportCaseWithText(
  "paylocity-time-import-basic",
  "Paylocity time import batch: Id, Det (E), detCode, Hours, Amount, Rate, rateCode. Hours rows with their rate and no amount, the bonus as an amount. The agency declares that its OT15 earning code multiplies the rate by 1.5, so overtime's $27.375 is written as 18.2500. Same week and totals as paychex-flex-spi-basic: Paylocity pays 0.62 × 18.2500 × 1.5 = $16.97 for overtime and $1,590.47 in all, against Granite's $1,590.38 (+$0.09 on the 37 overtime minutes written as 0.62 h).",
  {
    format: "paylocity_time_csv",
    mappingVersion: "paylocity-timeimprt-v1",
    period: { startsOn: "2026-10-05", endsOn: "2026-10-11" },
    earningCodeMap: {},
    target: { format: "paylocity_time_csv" },
    codes: { REG: { code: "REG", as: "hours" }, OT: { code: "OT15", as: "hours", factor: { num: 3, den: 2 } }, BONUS: { code: "BON", as: "dollars" } },
    workers: [
      { workerId: "w1", firstName: "Ana", lastName: "Álvarez", payrollIds: { paylocity: { id: "A123" } } },
      { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: { paylocity: { id: "B456" } } },
    ],
    payLines: WEEK_0040,
  },
  TOTALS_0040,
  ["Id,Det,detCode,Hours,Amount,Rate,rateCode", "A123,E,REG,40.00,,18.2500,", "A123,E,OT15,0.62,,18.2500,", "A123,E,BON,,150.00,,", "B456,E,REG,38.00,,18.2500,", ""].join("\r\n"),
);

const R1825 = { num: 1825, den: 1 };
const OT1825 = { num: 5475, den: 2 };
const THREE = (system: "qbd" | "qbo" | "adp_wfn" | "adp_run" | "spreadsheet", ids: [string, string, string]): ExportFixture["workers"] => [
  { workerId: "w1", firstName: "Lucía", lastName: "Fernández Ruiz", payrollIds: { [system]: { id: ids[0] } } },
  { workerId: "w2", firstName: "Marcus", lastName: "Bell", payrollIds: { [system]: { id: ids[1] } } },
  { workerId: "w3", firstName: "Tran", lastName: "Nguyen", payrollIds: { [system]: { id: ids[2] } } },
];
const WEEK_LINES: ExportFixture["payLines"] = [
  { workerId: "w1", type: "REG", minutes: 2280, amountCents: 69350, rate: R1825, workweekStart: "2026-10-05" },
  { workerId: "w2", type: "REG", minutes: 2400, amountCents: 73000, rate: R1825, workweekStart: "2026-10-05" },
  { workerId: "w2", type: "OT", minutes: 240, amountCents: 10950, rate: OT1825, workweekStart: "2026-10-05" },
  { workerId: "w3", type: "REG", minutes: 2400, amountCents: 73000, rate: R1825, workweekStart: "2026-10-05" },
  { workerId: "w3", type: "OT", minutes: 37, amountCents: 1688, rate: OT1825, workweekStart: "2026-10-05" },
];
const PERIOD = { startsOn: "2026-10-05", endsOn: "2026-10-11" };
const QBD_CODES = { REG: { code: "Hourly Rate", as: "hours" as const }, OT: { code: "Overtime Rate", as: "hours" as const }, DT: { code: "Double-time Rate", as: "hours" as const } };
const iifRow = (emp: string, item: string, duration: string) => `TIMEACT\t10/11/26\t\t${emp}\t\t${item}\t${duration}\t\t\tY\t0`;
const IIF_HEAD = "!TIMEACT\tDATE\tJOB\tEMP\tITEM\tPITEM\tDURATION\tPROJ\tNOTE\tXFERTOPAYROLL\tBILLINGSTATUS";

exportCaseWithText(
  "qbd-iif-basic",
  "QuickBooks Desktop 2022 and later (decision F2), the gusto-hours-basic week: Lucía 38 h, Marcus 40 h + 4 h overtime, Tran 40 h + 37 overtime minutes. Each worker's week per payroll item goes on the week's last day (10/11/26), split into the fewest rows of at most 23:59, as equal as whole minutes allow: 38 h → 19:00 + 19:00; 40 h → 20:00 + 20:00. Durations are exact minutes, so QuickBooks pays exactly what Shiftbook computed at the stored rate × the item's multiple: 2,280 min × $18.25/h = $693.50; 2,400 min × $18.25/h = $730.00 (twice); 240 min × $27.375/h = $109.50; 37 min × $27.375/h = $16.88125 → $16.88. Gross $2,279.88 both ways; no notes.",
  { format: "qbd_iif", mappingVersion: "qbd-iif-v1", period: PERIOD, earningCodeMap: {}, target: { format: "qbd_iif", version: "2022_or_later" }, codes: QBD_CODES, workers: THREE("qbd", ["Fernandez Ruiz, Lucia", "Bell, Marcus", "Nguyen, Tran"]), payLines: WEEK_LINES },
  { workers: 3, minutesByType: { REG: 7080, OT: 277 }, grossCents: 227988, payrollSystemGrossCents: 227988, payrollSystemDifferenceCents: 0 },
  [
    IIF_HEAD,
    iifRow("Bell, Marcus", "Hourly Rate", "20:00"),
    iifRow("Bell, Marcus", "Hourly Rate", "20:00"),
    iifRow("Bell, Marcus", "Overtime Rate", "4:00"),
    iifRow("Fernandez Ruiz, Lucia", "Hourly Rate", "19:00"),
    iifRow("Fernandez Ruiz, Lucia", "Hourly Rate", "19:00"),
    iifRow("Nguyen, Tran", "Hourly Rate", "20:00"),
    iifRow("Nguyen, Tran", "Hourly Rate", "20:00"),
    iifRow("Nguyen, Tran", "Overtime Rate", "0:37"),
    "",
  ].join("\r\n"),
);

exportCaseWithText(
  "qbd-iif-2021-timer-header",
  "QuickBooks Desktop 2021 and earlier (decision F2): the same file starts with the Timer header naming the company file (VER 8, REL 0, the company name, IMPORTEDBEFORE N, FROMTIMER Y, the company file number from a Timer Lists export). One worker: Lucía 38 h = 19:00 + 19:00 on 10/11/26, $693.50 both ways.",
  {
    format: "qbd_iif",
    mappingVersion: "qbd-iif-v1",
    period: PERIOD,
    earningCodeMap: {},
    target: { format: "qbd_iif", version: "2021_or_earlier", companyName: "Sample Staffing LLC", companyCreateTime: "1208544781" },
    codes: QBD_CODES,
    workers: THREE("qbd", ["Fernandez Ruiz, Lucia", "Bell, Marcus", "Nguyen, Tran"]).slice(0, 1),
    payLines: WEEK_LINES.slice(0, 1),
  },
  { workers: 1, minutesByType: { REG: 2280 }, grossCents: 69350, payrollSystemGrossCents: 69350, payrollSystemDifferenceCents: 0 },
  ["!TIMERHDR\tVER\tREL\tCOMPANYNAME\tIMPORTEDBEFORE\tFROMTIMER\tCOMPANYCREATETIME", "TIMERHDR\t8\t0\tSample Staffing LLC\tN\tY\t1208544781", IIF_HEAD, iifRow("Fernandez Ruiz, Lucia", "Hourly Rate", "19:00"), iifRow("Fernandez Ruiz, Lucia", "Hourly Rate", "19:00"), ""].join("\r\n"),
);

exportRefusal(
  "qbd-iif-refuses-bonus",
  "IIF time activities carry hours only (research §1.6), so a $150.00 bonus cannot travel in the QuickBooks Desktop file: the export is refused naming Marcus, so the run can offer to skip him and pay him by hand.",
  {
    format: "qbd_iif",
    mappingVersion: "qbd-iif-v1",
    period: PERIOD,
    earningCodeMap: {},
    target: { format: "qbd_iif", version: "2022_or_later" },
    codes: QBD_CODES,
    workers: THREE("qbd", ["Fernandez Ruiz, Lucia", "Bell, Marcus", "Nguyen, Tran"]),
    payLines: [...WEEK_LINES, { workerId: "w2", type: "BONUS", minutes: 0, amountCents: 15000, rate: { num: 15000, den: 1 }, workweekStart: "2026-10-05" }],
  },
  {
    code: "unsupported_earning_type",
    workerId: "w2",
    message: "Bell, Marcus: the QuickBooks Desktop file carries hours (regular, overtime, double time, holiday not worked) only, so it cannot carry a bonus. Skip this worker and pay it in QuickBooks Desktop by hand.",
  },
);

exportCaseWithText(
  "qbo-time-basic",
  "QuickBooks Online through the documented importers (decision F3): regular hours only, one row per worker and week (rows of at most 23:59) on the week's last day, as H:MM, against the customer the agency set, not billable. Lucía 38 h (19:00 + 19:00) and Marcus 40 h (20:00 + 20:00). QuickBooks Online pays exact minutes × the stored rate: $693.50 + $730.00 = $1,423.50 both ways. Names with a comma are quoted.",
  {
    format: "qbo_time_csv",
    mappingVersion: "qbo-time-v1",
    period: PERIOD,
    earningCodeMap: {},
    target: { format: "qbo_time_csv", customer: "Payroll time" },
    codes: {},
    workers: THREE("qbo", ["Lucía Fernández Ruiz", "Bell, Marcus", "Tran Nguyen"]),
    payLines: [WEEK_LINES[0]!, WEEK_LINES[1]!],
  },
  { workers: 2, minutesByType: { REG: 4680 }, grossCents: 142350, payrollSystemGrossCents: 142350, payrollSystemDifferenceCents: 0 },
  ["Date,Name,Customer,Hours,Billable", '10/11/2026,"Bell, Marcus",Payroll time,20:00,No', '10/11/2026,"Bell, Marcus",Payroll time,20:00,No', "10/11/2026,Lucía Fernández Ruiz,Payroll time,19:00,No", "10/11/2026,Lucía Fernández Ruiz,Payroll time,19:00,No", ""].join("\r\n"),
);

exportRefusal(
  "qbo-time-refuses-overtime",
  "The QuickBooks Online importers set no payroll item, so every row lands as regular pay (research §2.2): Marcus's 4 overtime hours cannot travel in the file. The export is refused naming Marcus (pay his week by hand in QuickBooks Online).",
  { format: "qbo_time_csv", mappingVersion: "qbo-time-v1", period: PERIOD, earningCodeMap: {}, target: { format: "qbo_time_csv", customer: "Payroll time" }, codes: {}, workers: THREE("qbo", ["Lucía Fernández Ruiz", "Bell, Marcus", "Tran Nguyen"]), payLines: WEEK_LINES.slice(0, 3) },
  { code: "unsupported_earning_type", workerId: "w2", message: "Bell, Marcus: the QuickBooks Online file carries regular hours only, so it cannot carry overtime. Skip this worker and pay it in QuickBooks Online by hand." },
);

const ADP_CODES = { REG: { code: "Reg Hours", as: "hours" as const }, OT: { code: "O/T Hours", as: "hours" as const, factor: { num: 3, den: 2 } }, DT: { code: "D", as: "hours" as const, factor: { num: 2, den: 1 } }, BONUS: { code: "B", as: "dollars" as const } };
exportCaseWithText(
  "adp-wfn-basic",
  "ADP Workforce Now paydata (decision F4), the gusto-hours-basic week plus a $150.00 bonus for Marcus. One row per worker and Temp Rate ($18.2500), hours to two decimals rounded up, dollars under code B on their own row, blanks never zeros, CRLF, batch 26101101 (period end 10/11/26, version 01), file PRXYZEPI.csv. Granite: $2,279.88 + $150.00 = $2,429.88. ADP: 40.00 × 18.25 = $730.00 and 4.00 × 18.25 × 1.5 = $109.50 and $150.00 (Marcus); 38.00 × 18.25 = $693.50 (Lucía); 40.00 × 18.25 = $730.00 and 0.62 × 18.25 × 1.5 = $16.9725 → $16.97 (Tran: 37 min written as 0.62 h, rounded up) = $2,429.97, 9 cents more; the notes say so and name the multiples assumed.",
  { format: "adp_wfn_paydata", mappingVersion: "adp-wfn-v1", period: PERIOD, earningCodeMap: {}, target: { format: "adp_wfn_paydata", companyCode: "XYZ" }, codes: ADP_CODES, workers: THREE("adp_wfn", ["000101", "000102", "000103"]), payLines: [...WEEK_LINES, { workerId: "w2", type: "BONUS", minutes: 0, amountCents: 15000, rate: { num: 15000, den: 1 } }] },
  { workers: 3, minutesByType: { REG: 7080, OT: 277 }, amountsByType: { BONUS: 15000 }, grossCents: 242988, payrollSystemGrossCents: 242997, payrollSystemDifferenceCents: 9 },
  ["Co Code,Batch ID,File #,Temp Rate,Reg Hours,O/T Hours,Earnings 3 Code,Earnings 3 Amount", "XYZ,26101101,000102,18.2500,40.00,4.00,,", "XYZ,26101101,000102,,,,B,150.00", "XYZ,26101101,000101,18.2500,38.00,,,", "XYZ,26101101,000103,18.2500,40.00,0.62,,", ""].join("\r\n"),
);

exportCaseWithText(
  "adp-wfn-weighted-overtime",
  "Overtime at a worked-week regular rate (decision F4): Ben works 20 h at $18.25 and 20 h at $20.00, then 2 h overtime at $28.75/h (1.5 × $19.1666…). Each line's Temp Rate is its rate ÷ the column's multiple, so the overtime goes on its own row at Temp Rate 19.1667 (= $28.75 ÷ 1.5, to four decimals). ADP: 20.00 × 18.25 = $365.00; 2.00 × 19.1667 × 1.5 = $57.50010 → $57.50; 20.00 × 20.00 = $400.00; total $822.50, exactly Granite's ($365.00 + $400.00 + $57.50). Only the multiples note.",
  {
    format: "adp_wfn_paydata",
    mappingVersion: "adp-wfn-v1",
    period: PERIOD,
    earningCodeMap: {},
    target: { format: "adp_wfn_paydata", companyCode: "XYZ" },
    codes: ADP_CODES,
    workers: [{ workerId: "w1", firstName: "Ben", lastName: "Okafor", payrollIds: { adp_wfn: { id: "000456" } } }],
    payLines: [
      { workerId: "w1", type: "REG", minutes: 1200, amountCents: 36500, rate: R1825 },
      { workerId: "w1", type: "REG", minutes: 1200, amountCents: 40000, rate: { num: 2000, den: 1 } },
      { workerId: "w1", type: "OT", minutes: 120, amountCents: 5750, rate: { num: 5750, den: 2 } },
    ],
  },
  { workers: 1, minutesByType: { REG: 2400, OT: 120 }, grossCents: 82250, payrollSystemGrossCents: 82250, payrollSystemDifferenceCents: 0 },
  ["Co Code,Batch ID,File #,Temp Rate,Reg Hours,O/T Hours", "XYZ,26101101,000456,18.2500,20.00,", "XYZ,26101101,000456,19.1667,,2.00", "XYZ,26101101,000456,20.0000,20.00,", ""].join("\r\n"),
);

exportRefusal(
  "adp-wfn-refuses-unmapped-code",
  "A holiday premium (8 h × $9.125/h = $73.00) has no ADP code in the agency's settings, so the file cannot say what it pays: the export is refused naming Lucía, with the fix (set the code, or skip her and pay it by hand).",
  {
    format: "adp_wfn_paydata",
    mappingVersion: "adp-wfn-v1",
    period: PERIOD,
    earningCodeMap: {},
    target: { format: "adp_wfn_paydata", companyCode: "XYZ" },
    codes: ADP_CODES,
    workers: THREE("adp_wfn", ["000101", "000102", "000103"]),
    payLines: [WEEK_LINES[0]!, { workerId: "w1", type: "HOL", minutes: 480, amountCents: 7300, rate: { num: 1825, den: 2 } }],
  },
  { code: "unsupported_earning_type", workerId: "w1", message: "Fernández Ruiz, Lucía: a holiday premium for hours worked on a holiday has no ADP Workforce Now code. Set it in the payroll file settings, or skip this worker and pay it by hand." },
);

const RUN_CODES = { REG: { code: "REG", as: "hours" as const }, OT: { code: "OT", as: "hours" as const }, DT: { code: "DT", as: "hours" as const }, BONUS: { code: "BONUS", as: "dollars" as const } };
const runRow = (id: string, code: string, hours: string, dollars: string) => `ABC1234,W,10/05/2026,10/11/2026,${id},${code},${hours},${dollars},0,,BASE`;
exportCaseWithText(
  "adp-run-basic",
  "RUN Powered by ADP time sheet import (decision F5), the gusto-hours-basic week plus Marcus's $150.00 bonus: the version row, the headings, then one row per worker and earnings code at rate code BASE, weekly (W, a 7-day period). RUN pays the stored rate × 1 or 1.5: Marcus 40.00 × $18.25 = $730.00, 4.00 × $18.25 × 1.5 = $109.50, $150.00; Lucía 38.00 × $18.25 = $693.50; Tran $730.00 and 0.62 × $18.25 × 1.5 = $16.9725 → $16.97 (37 min rounded up to 0.62 h). RUN $2,429.97 against Granite's $2,429.88: 9 cents, in the notes.",
  { format: "adp_run_csv", mappingVersion: "adp-run-v1", period: PERIOD, earningCodeMap: {}, target: { format: "adp_run_csv", companyCode: "ABC1234" }, codes: RUN_CODES, workers: THREE("adp_run", ["101", "102", "103"]), payLines: [...WEEK_LINES, { workerId: "w2", type: "BONUS", minutes: 0, amountCents: 15000, rate: { num: 15000, den: 1 } }] },
  { workers: 3, minutesByType: { REG: 7080, OT: 277 }, amountsByType: { BONUS: 15000 }, grossCents: 242988, payrollSystemGrossCents: 242997, payrollSystemDifferenceCents: 9 },
  [
    "##GENERIC## V1.0",
    "Company Code,Pay Frequency,Pay Period Start,Pay Period End,Employee ID,Earnings Code,Pay Hours,Dollars,Separate Check,Worked Department,Rate Code",
    runRow("102", "REG", "40.00", ""),
    runRow("102", "OT", "4.00", ""),
    runRow("102", "BONUS", "", "150.00"),
    runRow("101", "REG", "38.00", ""),
    runRow("103", "REG", "40.00", ""),
    runRow("103", "OT", "0.62", ""),
    "",
  ].join("\r\n"),
);

exportRefusal(
  "adp-run-refuses-weighted-overtime",
  "RUN pays overtime hours at 1.5 × the stored BASE rate and takes rate codes, not rates (research §4.4). Marcus's overtime is at $28.00/h because his week's regular rate includes more than $18.25 (1.5 × $18.25 = $27.375), so the hours cannot be carried: the export is refused naming him (pay by hand, or map overtime as dollars).",
  {
    format: "adp_run_csv",
    mappingVersion: "adp-run-v1",
    period: PERIOD,
    earningCodeMap: {},
    target: { format: "adp_run_csv", companyCode: "ABC1234" },
    codes: RUN_CODES,
    workers: THREE("adp_run", ["101", "102", "103"]),
    payLines: [WEEK_LINES[1]!, { workerId: "w2", type: "OT", minutes: 60, amountCents: 2800, rate: { num: 2800, den: 1 } }],
  },
  {
    code: "several_pay_rates",
    workerId: "w2",
    message: "Bell, Marcus: overtime is paid at $28.00/h, because the week's regular rate includes more than the hourly rate (a second pay rate, a bonus, a holiday premium or a minimum-wage top-up), but RUN Powered by ADP pays it at 1.5 × the stored rate ($27.375/h). Skip this worker and pay them by hand.",
  },
);

const SHEET = {
  fileName: "payroll-{start}-to-{end}.csv",
  delimiter: "comma" as const,
  header: true,
  dateFormat: "MM/DD/YYYY" as const,
  columns: [
    { field: "worker_id" as const, header: "Worker ID" },
    { field: "last_name" as const, header: "Last name" },
    { field: "first_name" as const, header: "First name" },
    { field: "week_end" as const, header: "Week ending" },
    { field: "earning_code" as const, header: "Earning code" },
    { field: "hours" as const, header: "Hours" },
    { field: "rate" as const, header: "Rate" },
    { field: "amount" as const, header: "Amount" },
  ],
};
exportCaseWithText(
  "spreadsheet-basic",
  "A spreadsheet in the agency's layout (decision F6), the gusto-hours-basic week: one row per pay line, hours to two decimals rounded up, rates to four decimals, amounts to the cent; a blank code falls back to Granite's own (REG), overtime under the agency's code OT15. The amount column carries Granite's exact pay, so the receiver pays what is written: $2,279.88 both ways.",
  {
    format: "spreadsheet_csv",
    mappingVersion: "spreadsheet-v1",
    period: PERIOD,
    earningCodeMap: {},
    target: { format: "spreadsheet_csv", layout: SHEET },
    codes: { REG: { code: "", as: "hours" }, OT: { code: "OT15", as: "hours" } },
    workers: THREE("spreadsheet", ["SB-0001", "SB-0002", "SB-0003"]),
    payLines: WEEK_LINES,
  },
  { workers: 3, minutesByType: { REG: 7080, OT: 277 }, grossCents: 227988, payrollSystemGrossCents: 227988, payrollSystemDifferenceCents: 0 },
  [
    "Worker ID,Last name,First name,Week ending,Earning code,Hours,Rate,Amount",
    "SB-0002,Bell,Marcus,10/11/2026,REG,40.00,18.2500,730.00",
    "SB-0002,Bell,Marcus,10/11/2026,OT15,4.00,27.3750,109.50",
    "SB-0001,Fernández Ruiz,Lucía,10/11/2026,REG,38.00,18.2500,693.50",
    "SB-0003,Nguyen,Tran,10/11/2026,REG,40.00,18.2500,730.00",
    "SB-0003,Nguyen,Tran,10/11/2026,OT15,0.62,27.3750,16.88",
    "",
  ].join("\r\n"),
);

exportCaseWithText(
  "spreadsheet-tab-no-header",
  "A factoring company's layout: TAB-delimited, no header row, ISO dates, a fixed client column first, the file named for the period's end; with no amount column the receiver pays hours × the written rate: Lucía 38.00 × 18.2500 = $693.50 (exact).",
  {
    format: "spreadsheet_csv",
    mappingVersion: "spreadsheet-v1",
    period: PERIOD,
    earningCodeMap: {},
    target: {
      format: "spreadsheet_csv",
      layout: {
        fileName: "factor-{end}.txt",
        delimiter: "tab",
        header: false,
        dateFormat: "YYYY-MM-DD",
        columns: [
          { field: "fixed", header: "Client", value: "SAMPLE STAFFING" },
          { field: "worker_id", header: "Employee" },
          { field: "week_start", header: "Week" },
          { field: "earning_code", header: "Code" },
          { field: "hours", header: "Hours" },
          { field: "rate", header: "Rate" },
        ],
      },
    },
    codes: { REG: { code: "ST", as: "hours" } },
    workers: THREE("spreadsheet", ["SB-0001", "SB-0002", "SB-0003"]),
    payLines: WEEK_LINES.slice(0, 1),
  },
  { workers: 1, minutesByType: { REG: 2280 }, grossCents: 69350, payrollSystemGrossCents: 69350, payrollSystemDifferenceCents: 0 },
  "SAMPLE STAFFING\tSB-0001\t2026-10-05\tST\t38.00\t18.2500\r\n",
);

exportRefusal(
  "spreadsheet-refuses-dollars-without-amount",
  "A layout with no amount column cannot carry money that is not hours × a rate: Marcus's $150.00 bonus is refused, naming him, with the fix (add an amount column, or skip him and pay it by hand).",
  {
    format: "spreadsheet_csv",
    mappingVersion: "spreadsheet-v1",
    period: PERIOD,
    earningCodeMap: {},
    target: { format: "spreadsheet_csv", layout: { ...SHEET, columns: SHEET.columns.filter((c) => c.field !== "amount") } },
    codes: {},
    workers: THREE("spreadsheet", ["SB-0001", "SB-0002", "SB-0003"]),
    payLines: [WEEK_LINES[1]!, { workerId: "w2", type: "BONUS", minutes: 0, amountCents: 15000, rate: { num: 15000, den: 1 }, workweekStart: "2026-10-05" }],
  },
  { code: "unsupported_earning_type", workerId: "w2", message: "Bell, Marcus: the spreadsheet has no amount column, so it cannot carry a bonus. Add an amount column, or skip this worker and pay it by hand." },
);

// ---------- slice g: the files made with each invoice ----------

/** An invoice file's case: the file must equal the hand-written rows, byte for byte. */
function invoiceFileCase(name: string, summary: string, format: InvoiceFileFormat, input: InvoiceFileInput, handText: string) {
  const kind = INVOICE_FILES[format];
  const got = new TextDecoder().decode(kind.make(input));
  if (got !== handText) throw new Error(`${name}: file\n${JSON.stringify(got)}\n≠ hand\n${JSON.stringify(handText)}`);
  if (!writes(name)) return;
  const dir = join(OUT, "exports", name);
  mkdirSync(dir, { recursive: true });
  const filename = kind.filename(input.number);
  writeFileSync(join(dir, filename), got);
  writeFileSync(join(dir, "case.json"), JSON.stringify({ summary, fixture: null, invoiceFile: { format, input }, expectedFile: filename }, null, 2) + "\n");
  console.log(`proposed exports/${name}`);
}

function invoiceFileRefusal(name: string, summary: string, format: InvoiceFileFormat, input: InvoiceFileInput, hand: { code: string; message: string }) {
  let error: unknown = null;
  try {
    INVOICE_FILES[format].make(input);
  } catch (e) {
    error = e;
  }
  if (!(error instanceof ExportError) || error.code !== hand.code || error.workerId !== undefined || error.message !== hand.message) {
    throw new Error(`${name}: expected refusal ${JSON.stringify(hand)}, got ${error instanceof Error ? `${(error as ExportError).code}: ${error.message}` : "a file"}`);
  }
  if (!writes(name)) return;
  const dir = join(OUT, "exports", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "case.json"), JSON.stringify({ summary, fixture: null, invoiceFile: { format, input }, expectedError: hand }, null, 2) + "\n");
  console.log(`proposed exports/${name}`);
}

const BILL_REG = { num: 2650, den: 1 };
const BILL_OT = { num: 3975, den: 1 };
const INVOICE_LINES: InvoiceFileInput["lines"] = [
  { workerName: "Marcus Bell", worksite: "Joliet Plant 2", poNumber: "PO-1001", workweekStart: "2026-10-05", type: "REG", minutes: 2400, rate: BILL_REG, amountCents: 106_000, timeSheetIds: ["9TS0000001"], vmsWorkerId: "9JS0000001" },
  { workerName: "Marcus Bell", worksite: "Joliet Plant 2", poNumber: "PO-1001", workweekStart: "2026-10-05", type: "OT", minutes: 240, rate: BILL_OT, amountCents: 15_900, timeSheetIds: ["9TS0000001"], vmsWorkerId: "9JS0000001" },
  { workerName: "Tran Nguyen", worksite: "Joliet Plant 2", poNumber: "PO-1001", workweekStart: "2026-10-05", type: "REG", minutes: 2400, rate: BILL_REG, amountCents: 106_000, timeSheetIds: ["9TS0000002"], vmsWorkerId: "9JS0000002" },
  { workerName: "Tran Nguyen", worksite: "Joliet Plant 2", poNumber: "PO-1001", workweekStart: "2026-10-05", type: "OT", minutes: 37, rate: BILL_OT, amountCents: 2451, timeSheetIds: ["9TS0000002"], vmsWorkerId: "9JS0000002" },
  { workerName: "Lucía Fernández Ruiz", worksite: "Joliet Plant 2", poNumber: "PO-48213", workweekStart: "2026-10-05", type: "REG", minutes: 2280, rate: BILL_REG, amountCents: 100_700, timeSheetIds: ["9TS0000003"], vmsWorkerId: "9JS0000003" },
];
const INVOICE_HEAD = "Invoice Number,Invoice Date,Period Start,Period End,Worker,Worksite,PO Number,Week Ending,Earning Type,Hours,Minutes,Rate,Amount\r\n";

invoiceFileCase(
  "invoice-csv-basic",
  "Invoice PLM-20261005 issued 2026-10-13 for the week of 2026-10-05 (decision G8): one row per invoice line, in the invoice's order. Marcus 40 h at $26.50 = $1,060.00 and 4 h overtime at $39.75 = $159.00; Tran 40 h = $1,060.00 and 37 overtime minutes = 37 × $39.75 ÷ 60 = $24.5125, billed $24.51 (rounded once on the invoice; the CSV repeats the invoice's cents, never recomputes); Lucía 38 h = $1,007.00 under the client's PO PO-48213. Hours are shown to two decimals, 37 minutes as 0.62 (0.6167 rounded half up), with the exact minutes beside them; rates to four decimals. The week ends 2026-10-11. Total $3,310.51.",
  "invoice_csv",
  { number: "PLM-20261005", issuedOn: "2026-10-13", period: PERIOD, lines: INVOICE_LINES },
  INVOICE_HEAD +
    "PLM-20261005,2026-10-13,2026-10-05,2026-10-11,Marcus Bell,Joliet Plant 2,PO-1001,2026-10-11,REG,40.00,2400,26.5000,1060.00\r\n" +
    "PLM-20261005,2026-10-13,2026-10-05,2026-10-11,Marcus Bell,Joliet Plant 2,PO-1001,2026-10-11,OT,4.00,240,39.7500,159.00\r\n" +
    "PLM-20261005,2026-10-13,2026-10-05,2026-10-11,Tran Nguyen,Joliet Plant 2,PO-1001,2026-10-11,REG,40.00,2400,26.5000,1060.00\r\n" +
    "PLM-20261005,2026-10-13,2026-10-05,2026-10-11,Tran Nguyen,Joliet Plant 2,PO-1001,2026-10-11,OT,0.62,37,39.7500,24.51\r\n" +
    "PLM-20261005,2026-10-13,2026-10-05,2026-10-11,Lucía Fernández Ruiz,Joliet Plant 2,PO-48213,2026-10-11,REG,38.00,2280,26.5000,1007.00\r\n",
);

invoiceFileCase(
  "invoice-csv-credit-note",
  "Credit note PLM-20261005-CN-01 issued 2026-10-20 (slice e, decision E11, with G8): Marcus's Monday was 2 hours shorter, so 2 overtime hours at $39.75 are credited: −120 minutes, −2.00 hours, −$79.50, written with a minus sign. A week of 2026-10-05 in a period that ends 2026-10-11.",
  "invoice_csv",
  { number: "PLM-20261005-CN-01", issuedOn: "2026-10-20", period: PERIOD, lines: [{ ...INVOICE_LINES[1]!, minutes: -120, amountCents: -7950 }] },
  INVOICE_HEAD + "PLM-20261005-CN-01,2026-10-20,2026-10-05,2026-10-11,Marcus Bell,Joliet Plant 2,PO-1001,2026-10-11,OT,-2.00,-120,39.7500,-79.50\r\n",
);

invoiceFileCase(
  "fieldglass-time-sheet-invoice-basic",
  "SAP Fieldglass Time Sheet Invoice Upload for invoice PLM-20261005 (decision G9; research §4.2): the header rows Type and Transaction, one blank line, the column headings, then one row per approved time sheet, sorted by time sheet id. Each time sheet's billing total is the sum of the invoice lines from it: 9TS0000001 Marcus $1,060.00 + $159.00 = $1,219.00; 9TS0000002 Tran $1,060.00 + $24.51 = $1,084.51; 9TS0000003 Lucía $1,007.00. Paid amount is 0.00 (nothing is paid when the invoice is uploaded). Total $3,310.51, the invoice's total.",
  "fieldglass_time_sheet_invoice",
  { number: "PLM-20261005", issuedOn: "2026-10-13", period: PERIOD, lines: INVOICE_LINES },
  "Type,Time Sheet Invoice Upload\r\nTransaction,True\r\n\r\nInvoice Code,TIMESHEET ID,Job Seeker ID,Paid Amount,Total Billing Amount\r\n" +
    "PLM-20261005,9TS0000001,9JS0000001,0.00,1219.00\r\n" +
    "PLM-20261005,9TS0000002,9JS0000002,0.00,1084.51\r\n" +
    "PLM-20261005,9TS0000003,9JS0000003,0.00,1007.00\r\n",
);

invoiceFileRefusal(
  "fieldglass-refuses-two-time-sheets",
  "Tran's 37 overtime minutes came from two Fieldglass time sheets (one per half of the week): the line's $24.51 cannot be split between them without inventing a rounding, so the upload is refused, naming Tran and both time sheets. The run shows it as a blocker before any file is made.",
  "fieldglass_time_sheet_invoice",
  { number: "PLM-20261005", issuedOn: "2026-10-13", period: PERIOD, lines: [INVOICE_LINES[2]!, { ...INVOICE_LINES[3]!, timeSheetIds: ["9TS0000002", "9TS0000004"] }] },
  { code: "unsupported_earning_type", message: "Tran Nguyen: the OT line for the week ending 2026-10-11 has hours from two SAP Fieldglass time sheets (9TS0000002, 9TS0000004), and its amount cannot be split between them." },
);

// The compliance answer keys: the duties' dates, the ACA full-time test, the workers' comp premium split.
proposeCompliance(OUT, writes);
