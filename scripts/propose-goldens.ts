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
import { REFERENCE_JURISDICTION_RULES, REFERENCE_MINIMUM_WAGE_RULES, REFERENCE_OVERTIME_RULES } from "../src/server/rules/reference-data";

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
    county: "Will",
    city: "Joliet",
    date,
    startMinute: 420,
    minutes,
    payRateCents: 1825,
    billRateCents: 2650,
    billOtMultiplier: { num: 3, den: 2 },
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
});
const MA = { jurisdiction: "MA", county: "Worcester", city: "Worcester" } as const;
const CA = { jurisdiction: "CA", county: "San Bernardino", city: "Ontario" } as const;

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
  "california-blocked-until-full-rules",
  "A California worker's 10-hour day. California daily overtime, daily double time and the two seventh-day rules are not implemented yet (they come with the full rules engine), so the week is blocked with four reasons and nothing is paid or billed — it is never computed on weekly rules alone.",
  input([shift(WEEK[0]!, 600, { ...CA, payRateCents: 1950, billRateCents: 2875 })]),
  { pay: [], bill: [], blockers: ["rule_not_supported_yet", "rule_not_supported_yet", "rule_not_supported_yet", "rule_not_supported_yet"] },
);

ruleCase(
  "unknown-jurisdiction-blocked",
  "A worksite in Texas: no wage rules are on file for TX, so the week is blocked as an unknown jurisdiction and nothing is computed.",
  input([shift(WEEK[0]!, 480, { jurisdiction: "TX", county: "Harris", city: "Houston" })]),
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
  "below-minimum-wage-blocked",
  "Illinois worker paid $14.50/h in October 2026. The Illinois minimum wage has been $15.00/h since January 1, 2025 (820 ILCS 105/4(a)(1)), so the week is blocked and nothing is paid or billed until the rate is fixed.",
  input([shift(WEEK[0]!, 480, { payRateCents: 1450 })]),
  { pay: [], bill: [], blockers: ["below_minimum_wage"] },
);

ruleCase(
  "chicago-local-ordinance-blocked",
  "A worksite in Chicago (Cook County), Illinois. Chicago and Cook County have their own minimum wage ordinances that are not modeled yet, so the week is held with two reasons rather than paid at the state rate.",
  input([shift(WEEK[0]!, 480, { county: "Cook", city: "Chicago", payRateCents: 1800 })]),
  { pay: [], bill: [], blockers: ["rule_not_supported_yet", "rule_not_supported_yet"] },
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
  "Three workers for the week of 2026-10-05: one straight-time week (38h), one with 4h overtime (44h), and one with 37 overtime minutes, which Gusto receives as 0.62 hours (the note says so). Control totals: 3 workers, 7,080 regular minutes (118h), 277 overtime minutes (4h 37m), gross $2,279.88. Because 37 minutes are written as 0.62 h (rounded up), Gusto should compute $2,279.97, 9 cents more; the file's note says so.",
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
