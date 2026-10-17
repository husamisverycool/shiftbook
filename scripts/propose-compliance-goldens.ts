/**
 * Proposed compliance golden cases (slice j "Done means" 5), written by scripts/propose-goldens.ts:
 * the duties' dates from the rule rows (scripts/data/compliance-rules.json, the rows the migrations
 * store; tests/integration/compliance-reference.test.ts keeps them equal), the ACA full-time test and
 * the workers' comp premium split. A case is written only when the code's answer equals the hand
 * answer written here.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addDays } from "@shiftbook/rules";
import { acaRows, type AcaLimits, type AcaSettings, type ServiceDay } from "../src/server/compliance/aca";
import { wantedObligations, type AcaOffer, type ComplianceRule, type GenerateInput, type Placement, type Policy, type Registration, type WorkerI9 } from "../src/server/compliance/generate";
import { packet, type PacketLine } from "../src/server/compliance/wc-packet";
import { computeCompliance, type ComplianceCase } from "../tests/golden-runners/compliance";

const RULES = JSON.parse(readFileSync("scripts/data/compliance-rules.json", "utf8")) as ComplianceRule[];
const TODAY = "2026-10-16";
const base: GenerateInput = { today: TODAY, rules: RULES, registrations: [], policies: [], placements: [], workers: [], openDays: [] };

export function proposeCompliance(out: string, writes: (name: string) => boolean) {
  const write = (c: ComplianceCase) => {
    if (!writes(c.name)) return;
    mkdirSync(join(out, "compliance"), { recursive: true });
    writeFileSync(join(out, "compliance", `${c.name}.json`), JSON.stringify(c, null, 2) + "\n");
    console.log(`proposed compliance/${c.name}`);
  };
  const same = (name: string, code: unknown, hand: unknown) => {
    if (JSON.stringify(code) !== JSON.stringify(hand)) throw new Error(`${name}: the code disagrees with the hand answer\ncode: ${JSON.stringify(code)}\nhand: ${JSON.stringify(hand)}`);
  };
  /** A duty as the hand answer states it: kind, occurrence, due, reminded, settled by the data, too old to create. */
  const duties = (name: string, summary: string, input: GenerateInput, hand: [string, string, string, string, boolean, boolean][]) => {
    const expected = wantedObligations(input);
    same(name, expected.map((w) => [w.kind, w.occurrence, w.dueOn, w.remindOn, w.done !== null, w.tooOld]), hand);
    // Stored as the runner compares it (computeCompliance: the English record, without its message keys).
    write({ name, summary, kind: "duties", input, expected: JSON.parse(JSON.stringify(computeCompliance({ name, summary, kind: "duties", input, expected: null } as ComplianceCase))) });
  };

  const reg = (over: Partial<Registration>): Registration => ({ id: "reg-il-2026", jurisdiction: "IL", branchId: null, number: "IL-0000", issuedOn: "2026-01-01", expiresOn: "2026-12-31", ...over });
  duties(
    "duties-registration-renewals",
    "Registrations renew before they expire, by the rule rows: Illinois 60 days before (820 ILCS 175/45), reminded 30 days earlier; Massachusetts 30 days before, reminded 15 days earlier; New Jersey 30 days before, reminded 30 days earlier. Illinois expiring 2026-12-31: due 2026-11-01, reminded 2026-10-02. Massachusetts expiring 2026-11-20: due 2026-10-21, reminded 2026-10-06. New Jersey expiring 2026-12-15: due 2026-11-15, reminded 2026-10-16. A newer Illinois registration (expiring 2027-12-31) renews the 2026 one, which is then settled by the data; its own renewal is due 2027-11-01, reminded 2027-10-02.",
    {
      ...base,
      registrations: [
        reg({}),
        reg({ id: "reg-il-2027", number: "IL-0001", issuedOn: "2026-10-10", expiresOn: "2027-12-31" }),
        reg({ id: "reg-ma", jurisdiction: "MA", number: "MA-0000", issuedOn: "2025-11-21", expiresOn: "2026-11-20" }),
        reg({ id: "reg-nj", jurisdiction: "NJ", number: "NJ-0000", issuedOn: "2025-12-16", expiresOn: "2026-12-15" }),
      ],
    },
    [
      ["il_registration_renewal", "", "2026-11-01", "2026-10-02", true, false],
      ["il_registration_renewal", "", "2027-11-01", "2027-10-02", false, false],
      ["ma_registration_renewal", "", "2026-10-21", "2026-10-06", false, false],
      ["nj_certification_renewal", "", "2026-11-15", "2026-10-16", false, false],
    ],
  );

  const placement = (over: Partial<Placement>): Placement => ({
    id: "asg-1",
    workerId: "worker-1",
    clientId: "client-il",
    state: "IL",
    dayAndTemporaryLabor: true,
    socCode: "51-9061",
    startDate: "2026-02-02",
    endDate: null,
    status: "active",
    firstPeriodEnd: "2026-02-08",
    workerLanguage: "en",
    ...over,
  });
  duties(
    "duties-illinois-client-proof",
    "An Illinois client with day and temporary labor from 2026-02-02, still running: proof of registration before the contract starts (due 2026-02-02, reminded 7 days before, 2026-01-26), and on each March 1 and September 1 while covered work runs, through the next one — 2026-03-01 (reminded 2026-01-30), 2026-09-01 (reminded 2026-08-02) and 2027-03-01 (reminded 2027-01-30); 820 ILCS 175/85(a), 56 Ill. Adm. Code 260.510.",
    { ...base, placements: [placement({})] },
    [
      ["il_client_proof_contract", "contract:2026-02-02", "2026-02-02", "2026-01-26", false, false],
      ["il_client_proof", "2026-03-01", "2026-03-01", "2026-01-30", false, false],
      ["il_client_proof", "2026-09-01", "2026-09-01", "2026-08-02", false, false],
      ["il_client_proof", "2027-03-01", "2027-03-01", "2027-01-30", false, false],
    ],
  );

  duties(
    "duties-placement-notices",
    "A Massachusetts placement starting 2026-10-07 whose first pay period ends 2026-10-11: the job order is due by then (M.G.L. c. 149 § 159C(b)). A New Jersey production placement (SOC 51) starting 2026-10-12 for a Spanish speaker: the assignment notice (form MW-23, in English and Spanish) is due when it starts (N.J.S.A. 34:8D-3(a)), so no separate notice in the worker's language. The same placement for a Polish speaker: the notice in the worker's language is due too. A New Jersey office placement (SOC 43, not a designated classification): no notice.",
    {
      ...base,
      placements: [
        placement({ id: "asg-ma", clientId: "client-ma", state: "MA", dayAndTemporaryLabor: false, socCode: "53-7062", startDate: "2026-10-07", firstPeriodEnd: "2026-10-11" }),
        placement({ id: "asg-nj", clientId: "client-nj", state: "NJ", dayAndTemporaryLabor: false, socCode: "51-2092", startDate: "2026-10-12", firstPeriodEnd: "2026-10-18", workerLanguage: "es" }),
        placement({ id: "asg-nj-pl", clientId: "client-nj", state: "NJ", dayAndTemporaryLabor: false, socCode: "51-2092", startDate: "2026-10-12", firstPeriodEnd: "2026-10-18", workerLanguage: "pl" }),
        placement({ id: "asg-nj-office", clientId: "client-nj", state: "NJ", dayAndTemporaryLabor: false, socCode: "43-9061", startDate: "2026-10-12", firstPeriodEnd: "2026-10-18" }),
      ],
    },
    [
      ["ma_job_order", "", "2026-10-11", "2026-10-11", false, false],
      // The Spanish speaker: the assignment notice (English and Spanish) and day-one equal pay
      // (N.J.S.A. 34:8D-7(b)), confirmed by the start and reminded a week before.
      ["nj_assignment_notice", "", "2026-10-12", "2026-10-12", false, false],
      ["nj_equal_pay_check", "", "2026-10-12", "2026-10-05", false, false],
      // The Polish speaker: the same, plus the notice in the worker's own language.
      ["nj_assignment_notice", "", "2026-10-12", "2026-10-12", false, false],
      ["nj_language_notice", "", "2026-10-12", "2026-10-12", false, false],
      ["nj_equal_pay_check", "", "2026-10-12", "2026-10-05", false, false],
    ],
  );

  const worker = (over: Partial<WorkerI9>): WorkerI9 => ({ id: "worker-1", hireDate: "2026-09-17", i9Section1On: null, i9Section2On: null, workAuthExpiresOn: null, firstJobEndsOn: null, ...over });
  duties(
    "duties-form-i9",
    "Form I-9 (8 C.F.R. § 274a.2(b)(1)): Section 1 by the first day; Section 2 within three business days. Hired Thursday 2026-09-17, before the agency opened on Saturdays: Friday, Monday, Tuesday — due 2026-09-22. Hired Thursday 2026-10-15, after it began opening on Saturdays (from 2026-10-01): Friday, Saturday, Monday — due 2026-10-19. A work authorization ending 2027-01-31 is reverified by then, reminded 90 days before (2026-11-02).",
    {
      ...base,
      openDays: [
        { weekdays: [1, 2, 3, 4, 5], effectiveFrom: "2000-01-01", effectiveTo: "2026-09-30" },
        { weekdays: [1, 2, 3, 4, 5, 6], effectiveFrom: "2026-10-01", effectiveTo: null },
      ],
      workers: [worker({}), worker({ id: "worker-2", hireDate: "2026-10-15", workAuthExpiresOn: "2027-01-31" })],
    },
    [
      ["i9_section1", "2026-09-17", "2026-09-17", "2026-09-17", false, false],
      ["i9_section2", "2026-09-17", "2026-09-22", "2026-09-22", false, false],
      ["i9_section1", "2026-10-15", "2026-10-15", "2026-10-15", false, false],
      ["i9_section2", "2026-10-15", "2026-10-19", "2026-10-19", false, false],
      ["i9_reverify", "2027-01-31", "2027-01-31", "2026-11-02", false, false],
    ],
  );

  const policy = (over: Partial<Policy>): Policy => ({ id: "wc-2026", carrier: "Demo Mutual", policyNumber: "WC-2026", states: ["IL", "MA"], startsOn: "2026-01-01", endsOn: "2026-12-31", auditDueOn: "2027-02-15", ...over });
  duties(
    "duties-workers-comp",
    "Workers' comp: the policy ending 2026-12-31 is renewed by that day (a lapse suspends an Illinois registration), reminded 30 days before (2026-12-01); its premium audit on 2027-02-15, reminded 2027-01-16. A following policy from 2027-01-01 covering only Illinois does not renew one that covered Illinois and Massachusetts.",
    { ...base, policies: [policy({}), policy({ id: "wc-2027", policyNumber: "WC-2027", states: ["IL"], startsOn: "2027-01-01", endsOn: "2027-12-31", auditDueOn: null })] },
    [
      ["wc_policy_renewal", "", "2026-12-31", "2026-12-01", false, false],
      ["wc_audit", "", "2027-02-15", "2027-01-16", false, false],
      ["wc_policy_renewal", "", "2027-12-31", "2027-12-01", false, false],
    ],
  );

  const offer = (over: Partial<AcaOffer>): AcaOffer => ({ workerId: "worker-1", cycle: "standard", measurementStart: "2025-10-01", measurementEnd: "2026-09-30", minutes: 94_170, days: 365, averageMinutesPerWeek: 1806, fullTimeMinutesPerWeek: 1800, stabilityStart: "2026-11-30", stabilityEnd: "2027-11-29", ...over });
  duties(
    "duties-aca-offer",
    "ACA (26 C.F.R. § 54.4980H-3(d)): each period a worker was measured full-time in calls for coverage offered by the day before its stability period, reminded 30 days before. The standard period 2025-10-01 to 2026-09-30 (stability from 2026-11-30): due 2026-11-29, reminded 2026-10-30. An initial period 2025-11-01 to 2026-10-31 (stability from 2026-12-01): due 2026-11-30, reminded 2026-10-31.",
    { ...base, aca: [offer({}), offer({ workerId: "worker-2", cycle: "initial", measurementStart: "2025-11-01", measurementEnd: "2026-10-31", stabilityStart: "2026-12-01", stabilityEnd: "2027-11-30" })] },
    [
      ["aca_offer", "standard:2025-10-01", "2026-11-29", "2026-10-30", false, false],
      ["aca_offer", "initial:2025-11-01", "2026-11-30", "2026-10-31", false, false],
    ],
  );

  const LIMITS: AcaLimits = { minMeasurementMonths: 3, maxMeasurementMonths: 12, maxAdminDays: 90, minStabilityMonths: 6, fullTimeMinutesPerWeek: 1800, breakWeeks: 13 };
  const daily = (workerId: string, from: string, count: number, minutes: number): ServiceDay[] => Array.from({ length: count }, (_, i) => ({ workerId, date: addDays(from, i), minutes }));
  const aca = (name: string, summary: string, input: Parameters<typeof acaRows>[0], hand: [string, string, string, string, string, number, number, number][]) => {
    const expected = acaRows(input);
    same(name, expected.map((r) => [r.workerName, r.cycle, r.measurementStart, r.measurementEnd, r.result, r.minutes, r.days, r.averageMinutesPerWeek]), hand);
    write({ name, summary, kind: "aca", input, expected: JSON.parse(JSON.stringify(expected)) });
  };
  const yearly: AcaSettings = { measurementMonths: 12, firstMonth: 10, adminDays: 60, stabilityMonths: 12 };
  aca(
    "aca-full-time-at-the-line",
    "Twelve-month periods from October. Two workers hired 2024-06-03, hours on file from 2025-10-01. Full-time means at least 30 hours a week on average: minutes × 7 ≥ 1,800 × days. 2025-10-01 to 2026-09-30 is 365 days, so the line is 657,000 ÷ 7 = 93,857.14 minutes. A worked 257 minutes every day: 93,805 minutes, × 7 = 656,635 < 657,000 — not full-time (29:59 a week). B worked 258: 94,170 minutes, × 7 = 659,190 ≥ 657,000 — full-time (30:06 a week). The period running since 2026-10-01 counts 15 days so far.",
    { today: TODAY, settings: yearly, limits: LIMITS, workers: [{ id: "a", name: "A", hireDate: "2024-06-03" }, { id: "b", name: "B", hireDate: "2024-06-03" }], days: [...daily("a", "2025-10-01", 380, 257), ...daily("b", "2025-10-01", 380, 258)], months: [], covered: [{ start: "2025-10-01", end: "2026-10-15" }] },
    [
      ["A", "standard", "2025-10-01", "2026-09-30", "not_full_time", 93_805, 365, 1799],
      ["A", "standard", "2026-10-01", "2027-09-30", "measuring", 3855, 15, 1799],
      ["B", "standard", "2025-10-01", "2026-09-30", "full_time", 94_170, 365, 1806],
      ["B", "standard", "2026-10-01", "2027-09-30", "measuring", 3870, 15, 1806],
    ],
  );
  aca(
    "aca-new-worker-administrative-days",
    "Six-month periods from January, 90 administrative days. A worker hired 2026-02-10 working 8 hours a day: the initial period runs 2026-03-01 to 2026-08-31 (184 days, 88,320 minutes, 56:00 a week: full-time). The 19 days from 2026-02-10 to 2026-02-28 count toward the 90 administrative days, so 71 remain: 2026-09-01 to 2026-11-10; stability from 2026-11-11 to 2027-05-10 (26 C.F.R. § 54.4980H-3(d)(3)(vi)(A)). The worker also joins the standard period running since 2026-07-01 (107 days on file so far, to 2026-10-15: 51,360 minutes).",
    { today: TODAY, settings: { measurementMonths: 6, firstMonth: 1, adminDays: 90, stabilityMonths: 6 }, limits: LIMITS, workers: [{ id: "h", name: "H", hireDate: "2026-02-10" }], days: daily("h", "2026-02-10", 248, 480), months: [], covered: [{ start: "2025-10-01", end: "2026-10-15" }] },
    [
      ["H", "initial", "2026-03-01", "2026-08-31", "full_time", 88_320, 184, 3360],
      ["H", "standard", "2026-07-01", "2026-12-31", "measuring", 51_360, 107, 3360],
    ],
  );

  const OT = { num: 3, den: 2 };
  const DT = { num: 2, den: 1 };
  const line = (over: Partial<PacketLine>): PacketLine => ({ workerId: "w", workerName: "W", state: "IL", classCode: "3632", type: "REG", minutes: 0, amountCents: 0, multiplier: null, ...over });
  const lines = [
    line({ workerId: "mb", workerName: "Marcus Bell", type: "REG", minutes: 2400, amountCents: 73_000 }),
    line({ workerId: "mb", workerName: "Marcus Bell", type: "OT", minutes: 360, amountCents: 16_425, multiplier: OT }),
    line({ workerId: "ap", workerName: "Anita Patel", type: "REG", minutes: 1440, amountCents: 43_800 }),
    line({ workerId: "jc", workerName: "Jasmine Carter", state: "CA", classCode: "8292", type: "REG", minutes: 2400, amountCents: 78_000 }),
    line({ workerId: "jc", workerName: "Jasmine Carter", state: "CA", classCode: "8292", type: "OT", minutes: 120, amountCents: 5850, multiplier: OT }),
    line({ workerId: "jc", workerName: "Jasmine Carter", state: "CA", classCode: "8292", type: "DT", minutes: 60, amountCents: 3900, multiplier: DT }),
    line({ workerId: "jc", workerName: "Jasmine Carter", state: "CA", classCode: "8292", type: "HOL_NOT_WORKED", minutes: 480, amountCents: 15_600 }),
    line({ workerId: "kt", workerName: "Kevin Tran", state: "CA", classCode: null, type: "REG", minutes: 300, amountCents: 10_000 }),
  ];
  const p = packet(lines, "state");
  same(
    "wc-packet-premium-split",
    [p.rows.map((r) => [r.state, r.classCode, r.workerName, r.straightCents, r.otPremiumCents, r.dtPremiumCents, r.otherCents, r.totalCents]), p.missing.map((m) => [m.workerName, m.totalCents]), p.totals, p.allPayCents],
    [
      [
        ["CA", "8292", "Jasmine Carter", 83_850, 1950, 1950, 15_600, 103_350],
        ["IL", "3632", "Anita Patel", 43_800, 0, 0, 0, 43_800],
        ["IL", "3632", "Marcus Bell", 83_950, 5475, 0, 0, 89_425],
      ],
      [["Kevin Tran", 10_000]],
      { minutes: 6780, straightCents: 211_600, otPremiumCents: 7425, dtPremiumCents: 1950, otherCents: 15_600, totalCents: 236_575 },
      246_575,
    ],
  );
  write({
    name: "wc-packet-premium-split",
    summary:
      "The workers' comp packet keeps the overtime premium apart by worker and class (NCRB Basic Manual Rule 2-C-2-a). Marcus Bell (IL 3632): overtime $164.25 at 1.5 has a premium of one third, $54.75; straight time $730.00 + $109.50 = $839.50. Jasmine Carter (CA 8292): overtime $58.50 at 1.5, premium $19.50; double time $39.00 at 2, premium half, $19.50; straight time $780.00 + $39.00 + $19.50 = $838.50; holiday pay $156.00 is other pay. Anita Patel: $438.00 straight. Kevin Tran has no class: listed apart, out of the totals ($100.00), but in all pay for the tie-out: $2,365.75 + $100.00 = $2,465.75.",
    kind: "wc_packet",
    input: { lines, order: "state" },
    expected: JSON.parse(JSON.stringify(p)),
  });
}
