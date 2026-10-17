import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import { PLAIN, renderExplain } from "../../lib/explain";
import { addBusinessDays, keyOf, wantedObligations as generate, type ComplianceRule, type GenerateInput, type Placement, type Policy, type WorkerI9 } from "./generate";

/**
 * Every duty any case below works out: its English template, filled the stored sentence's way, is
 * exactly the stored sentence (decision 0028), so the Spanish screens say the same thing.
 */
const english = createTranslator({ locale: "en", messages: en, namespace: "compliance.explain" });
const wantedObligations = (input: GenerateInput) => {
  const out = generate(input);
  for (const w of out) {
    expect(renderExplain(w.explain, (key, values) => english(key as "reverify", values), PLAIN), `${w.kind} ${w.occurrence}`).toBe(w.message);
    if (w.done) expect(renderExplain(w.done.key, (key, values) => english(key as "reverify", values), PLAIN), `${w.kind} ${w.occurrence} note`).toBe(w.done.note);
  }
  return out;
};

describe("a duty's explanation on its own page", () => {
  it("says the facts alone, as one sentence, where the page already gives the rule's citation", () => {
    const e = { parts: [{ key: "maJobOrder", values: { startDate: { date: "2026-08-03" }, dueOn: { date: "2026-08-09" } } }], citation: "M.G.L. c. 149 § 159C(b); 454 CMR 24.08 (the job order confirmed in writing before the end of the first pay period)" };
    const say = (key: string, values: Record<string, string>) => english(key as "reverify", values);
    // The stored sentence keeps its citation (and the citation's own brackets).
    expect(renderExplain(e, say, PLAIN)).toBe("The placement starts 2026-08-03; due by the end of its first pay period, 2026-08-09 (M.G.L. c. 149 § 159C(b); 454 CMR 24.08 (the job order confirmed in writing before the end of the first pay period)).");
    expect(renderExplain(e, say, PLAIN, undefined, { withoutCitation: true })).toBe("The placement starts 2026-08-03; due by the end of its first pay period, 2026-08-09.");
    // Parts that carry their own citation are said as they are.
    expect(renderExplain({ ...e, citation: null }, say, PLAIN, undefined, { withoutCitation: true })).toBe("The placement starts 2026-08-03; due by the end of its first pay period, 2026-08-09");
  });
});

/** The rule rows of drizzle/0029 that these cases use (the numbers are the data, not the code's). */
const rule = (code: string, over: Partial<ComplianceRule>): ComplianceRule => ({
  code,
  jurisdiction: "US",
  area: "workers",
  subjectKind: "worker",
  anchor: "hire",
  offsetDays: 0,
  businessDays: 0,
  remindDays: 0,
  fixedDates: [],
  lookbackDays: 365,
  windowDays: 0,
  socGroups: [],
  roles: [],
  citation: `${code} citation`,
  sourceUrl: "https://example.gov",
  effectiveFrom: "2000-01-01",
  effectiveTo: null,
  ...over,
});
const RULES: ComplianceRule[] = [
  rule("il_registration_renewal", { jurisdiction: "IL", area: "registrations", subjectKind: "registration", anchor: "expiry", offsetDays: -60, remindDays: 30 }),
  rule("ma_registration_renewal", { jurisdiction: "MA", area: "registrations", subjectKind: "registration", anchor: "expiry", offsetDays: -30, remindDays: 15 }),
  rule("nj_certification_renewal", { jurisdiction: "NJ", area: "registrations", subjectKind: "registration", anchor: "expiry", offsetDays: -30, remindDays: 30, effectiveFrom: "2024-09-16" }),
  rule("il_client_proof", { jurisdiction: "IL", area: "clients", subjectKind: "client", anchor: "fixed_dates", remindDays: 30, fixedDates: ["03-01", "09-01"], windowDays: 183 }),
  rule("il_client_proof_contract", { jurisdiction: "IL", area: "clients", subjectKind: "client", anchor: "start", remindDays: 7, windowDays: 183 }),
  rule("ma_job_order", { jurisdiction: "MA", area: "placements", subjectKind: "assignment", anchor: "first_pay_period_end" }),
  rule("nj_language_notice", { jurisdiction: "NJ", area: "placements", subjectKind: "assignment", anchor: "start", socGroups: ["51", "53"], effectiveFrom: "2024-09-16" }),
  rule("nj_assignment_notice", { jurisdiction: "NJ", area: "placements", subjectKind: "assignment", anchor: "start", socGroups: ["51", "53"], effectiveFrom: "2024-09-16" }),
  rule("nj_equal_pay_check", { jurisdiction: "NJ", area: "equal_pay", subjectKind: "assignment", anchor: "start", remindDays: 7, socGroups: ["51", "53"], effectiveFrom: "2024-09-16" }),
  rule("i9_section1", { windowDays: 30 }),
  rule("i9_section2", { businessDays: 3, windowDays: 30 }),
  rule("i9_reverify", { anchor: "expiry", remindDays: 90 }),
  rule("wc_policy_renewal", { area: "workers_comp", subjectKind: "policy", anchor: "expiry", remindDays: 30 }),
  rule("wc_audit", { area: "workers_comp", subjectKind: "policy", anchor: "date", remindDays: 30 }),
  rule("aca_offer", { area: "aca", subjectKind: "worker", anchor: "date", remindDays: 30, effectiveFrom: "2015-01-01" }),
];
const TODAY = "2026-10-16"; // a Friday
const base: GenerateInput = { today: TODAY, rules: RULES, registrations: [], policies: [], placements: [], workers: [], openDays: [] };
const placement = (over: Partial<Placement>): Placement => ({
  id: "a1",
  workerId: "w1",
  clientId: "c1",
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
/** What would be created: the duties within their look-back. */
const kinds = (input: Partial<GenerateInput>) =>
  wantedObligations({ ...base, ...input })
    .filter((w) => !w.tooOld)
    .map((w) => [w.kind, w.occurrence, w.dueOn, w.remindOn, w.done?.note ?? null]);
const worker = (over: Partial<WorkerI9>): WorkerI9 => ({ id: "w1", hireDate: "2026-10-15", i9Section1On: null, i9Section2On: null, workAuthExpiresOn: null, firstJobEndsOn: null, ...over });

describe("business days (I-9 Section 2: three business days after the first day; weekends skipped, holidays counted — the earlier date)", () => {
  it("Monday + 3 = Thursday; Thursday + 3 = Tuesday; Friday + 3 = Wednesday", () => {
    expect(addBusinessDays("2026-10-12", 3)).toBe("2026-10-15");
    expect(addBusinessDays("2026-10-15", 3)).toBe("2026-10-20");
    expect(addBusinessDays("2026-10-16", 3)).toBe("2026-10-21");
    expect(addBusinessDays("2026-10-17", 1)).toBe("2026-10-19");
  });

  it("an agency open on Saturdays counts them (the earlier date); Monday to Friday always count", () => {
    // Thursday 2026-10-15 + 3: Friday 16, Saturday 17, Monday 19.
    expect(addBusinessDays("2026-10-15", 3, [1, 2, 3, 4, 5, 6])).toBe("2026-10-19");
    expect(addBusinessDays("2026-10-15", 3, [6])).toBe("2026-10-19");
    expect(addBusinessDays("2026-10-15", 3, [0, 6])).toBe("2026-10-18");
  });
});

describe("registrations and certification (J3)", () => {
  it("Illinois: 60 days before it expires, reminded 30 days before that; Massachusetts: 30 days, reminded 15 before", () => {
    // 2026-12-31 − 60 days = 2026-11-01; − 30 = 2026-10-02. 2026-11-20 − 30 = 2026-10-21; − 15 = 2026-10-06.
    const registrations = [
      { id: "r1", jurisdiction: "IL" as const, branchId: null, number: "IL-0001", issuedOn: "2026-01-01", expiresOn: "2026-12-31" },
      { id: "r2", jurisdiction: "MA" as const, branchId: null, number: "MA-0002", issuedOn: "2025-11-21", expiresOn: "2026-11-20" },
    ];
    expect(kinds({ registrations })).toEqual([
      ["il_registration_renewal", "", "2026-11-01", "2026-10-02", null],
      ["ma_registration_renewal", "", "2026-10-21", "2026-10-06", null],
    ]);
    const [il] = wantedObligations({ ...base, registrations });
    expect(il).toMatchObject({ jurisdiction: "IL", subjectKind: "registration", registrationId: "r1", facts: { number: "IL-0001", expiresOn: "2026-12-31" } });
    expect(il!.message).toBe("Registration IL-0001 expires 2026-12-31; due 60 days before, on 2026-11-01 (il_registration_renewal citation).");
  });

  it("a newer registration for the same state and office renews the older one: done, saying how", () => {
    const registrations = [
      { id: "r1", jurisdiction: "IL" as const, branchId: null, number: "IL-0001", issuedOn: "2026-01-01", expiresOn: "2026-12-31" },
      { id: "r3", jurisdiction: "IL" as const, branchId: null, number: "IL-0003", issuedOn: "2026-10-10", expiresOn: "2027-12-31" },
      { id: "r4", jurisdiction: "IL" as const, branchId: "b1", number: "IL-B-4", issuedOn: "2026-01-01", expiresOn: "2026-12-31" },
    ];
    expect(kinds({ registrations })).toEqual([
      ["il_registration_renewal", "", "2026-11-01", "2026-10-02", "Renewed: IL-0003, expires 2027-12-31."],
      ["il_registration_renewal", "", "2027-11-01", "2027-10-02", null],
      ["il_registration_renewal", "", "2026-11-01", "2026-10-02", null],
    ]);
  });

  it("a duty further back than its look-back is marked too old: kept if on file, never created", () => {
    const registrations = [
      { id: "r5", jurisdiction: "NJ" as const, branchId: null, number: "NJ-5", issuedOn: null, expiresOn: "2024-09-30" },
      { id: "r6", jurisdiction: "IL" as const, branchId: null, number: "IL-6", issuedOn: null, expiresOn: "2025-08-31" },
    ];
    expect(kinds({ registrations })).toEqual([]);
    // 2024-09-30 − 30 = 2024-08-31 and 2025-08-31 − 60 = 2025-07-02, before the look-back's 2025-10-16.
    expect(wantedObligations({ ...base, registrations }).map((w) => [w.kind, w.registrationId, w.dueOn, w.tooOld])).toEqual([
      ["nj_certification_renewal", "r5", "2024-08-31", true],
      ["il_registration_renewal", "r6", "2025-07-02", true],
    ]);
  });
});

describe("Illinois proof of registration for each client (J3)", () => {
  it("each March 1 and September 1 the client has covered work, up to the next one; and once before the contract starts", () => {
    // Look-back from 2026-10-16 is 2025-10-16, so 2025's dates are too old; 2027-03-01 − 30 days = 2027-01-30.
    expect(kinds({ placements: [placement({})] })).toEqual([
      ["il_client_proof_contract", "contract:2026-02-02", "2026-02-02", "2026-01-26", null],
      ["il_client_proof", "2026-03-01", "2026-03-01", "2026-01-30", null],
      ["il_client_proof", "2026-09-01", "2026-09-01", "2026-08-02", null],
      ["il_client_proof", "2027-03-01", "2027-03-01", "2027-01-30", null],
    ]);
  });

  it("a date counts when covered work runs on it or ended within the window (183 days) before it; none for other work or cancelled", () => {
    // Ended 2026-05-15: 2026-09-01 − 183 days = 2026-03-02, so September counts; 2027-03-01 − 183 = 2026-08-30 does not.
    expect(kinds({ placements: [placement({ endDate: "2026-05-15", status: "ended" })] }).map((k) => k[1])).toEqual(["contract:2026-02-02", "2026-03-01", "2026-09-01"]);
    const w = wantedObligations({ ...base, placements: [placement({ endDate: "2026-05-15", status: "ended" })] }).find((x) => x.occurrence === "2026-09-01")!;
    expect(w.message).toBe("The client had covered work within 183 days before 2026-09-01, one of the dates (03-01, 09-01) the client checks the agency's registration (il_client_proof citation).");
    expect(kinds({ placements: [placement({ dayAndTemporaryLabor: false })] })).toEqual([]);
    expect(kinds({ placements: [placement({ status: "cancelled" })] })).toEqual([]);
    expect(kinds({ placements: [placement({ state: "CA" })] })).toEqual([]);
  });

  it("one client with two overlapping placements gets one contract proof; after a gap longer than the window, a new contract", () => {
    expect(kinds({ placements: [placement({}), placement({ id: "a2", workerId: "w2", startDate: "2026-04-06" })] }).map((k) => k[1])).toEqual(["contract:2026-02-02", "2026-03-01", "2026-09-01", "2027-03-01"]);
    // Work ended 2025-12-19; the next starts 2026-07-06, 199 days later: a new contract.
    const gap = [placement({ id: "a0", startDate: "2025-11-03", endDate: "2025-12-19", status: "ended" }), placement({ id: "a3", startDate: "2026-07-06" })];
    expect(kinds({ placements: gap }).map((k) => k[1])).toEqual(["contract:2025-11-03", "contract:2026-07-06", "2026-03-01", "2026-09-01", "2027-03-01"]);
    expect(wantedObligations({ ...base, placements: gap }).find((x) => x.occurrence === "contract:2026-07-06")!.message).toBe(
      "A placement starts 2026-07-06, more than 183 days after the client's last covered work (2025-12-19); proof of registration due by then (il_client_proof_contract citation).",
    );
    // Within the window: the same contract.
    const near = [placement({ id: "a0", startDate: "2026-01-05", endDate: "2026-01-30", status: "ended" }), placement({ id: "a3", startDate: "2026-06-01" })];
    expect(kinds({ placements: near }).filter((k) => k[0] === "il_client_proof_contract").map((k) => k[1])).toEqual(["contract:2026-01-05"]);
  });
});

describe("placement notices (J3)", () => {
  it("Massachusetts: the job order by the end of the placement's first pay period", () => {
    const w = wantedObligations({ ...base, placements: [placement({ state: "MA", startDate: "2026-10-14", firstPeriodEnd: "2026-10-18" })] });
    expect(w.map((x) => [x.kind, x.assignmentId, x.dueOn])).toEqual([["ma_job_order", "a1", "2026-10-18"]]);
    expect(w[0]!.message).toBe("The placement starts 2026-10-14; due by the end of its first pay period, 2026-10-18 (ma_job_order citation).");
  });

  it("New Jersey: a designated classification whose worker prefers another language gets the notice in both, by the start", () => {
    const nj = (over: Partial<Placement>) => kinds({ placements: [placement({ state: "NJ", startDate: "2026-10-19", workerLanguage: "es", ...over })] }).filter(([k]) => k === "nj_language_notice");
    expect(nj({})).toEqual([["nj_language_notice", "", "2026-10-19", "2026-10-19", null]]);
    expect(nj({ workerLanguage: "en" })).toEqual([]);
    expect(nj({ socCode: "43-6014" })).toEqual([]);
    expect(nj({ socCode: null })).toEqual([]);
    expect(wantedObligations({ ...base, placements: [placement({ state: "NJ", startDate: "2026-10-19", workerLanguage: "es" })] })[0]!.facts).toMatchObject({ language: "es" });
  });
});

describe("New Jersey assignment notice, form MW-23 (N.J.S.A. 34:8D-3(a))", () => {
  it("every designated-classification placement gets the notice by its start, in English as in any other language", () => {
    const nj = (over: Partial<Placement>) => kinds({ placements: [placement({ state: "NJ", startDate: "2026-10-19", ...over })] }).filter(([k]) => k === "nj_assignment_notice");
    expect(nj({ workerLanguage: "en" })).toEqual([["nj_assignment_notice", "", "2026-10-19", "2026-10-19", null]]);
    expect(nj({ workerLanguage: "es" })).toEqual([["nj_assignment_notice", "", "2026-10-19", "2026-10-19", null]]);
    expect(nj({ socCode: "43-6014" })).toEqual([]);
    expect(nj({ socCode: null })).toEqual([]);
    expect(nj({ startDate: "2024-09-01" })).toEqual([]);
    expect(kinds({ placements: [placement({ state: "IL", startDate: "2026-10-19" })] }).filter(([k]) => k === "nj_assignment_notice")).toEqual([]);
    expect(wantedObligations({ ...base, placements: [placement({ state: "NJ", startDate: "2026-10-19", workerLanguage: "pl" })] }).find((w) => w.kind === "nj_assignment_notice")!.facts).toMatchObject({ language: "pl", socCode: "51-9061" });
  });
});

describe("New Jersey equal pay from the first day (N.J.S.A. 34:8D-7(b))", () => {
  it("every designated-classification placement gets a duty to confirm its pay against the client's comparable employees, by the start, whatever the worker's language", () => {
    const nj = (over: Partial<Placement>) => kinds({ placements: [placement({ state: "NJ", startDate: "2026-10-19", ...over })] }).filter(([k]) => k === "nj_equal_pay_check");
    expect(nj({ workerLanguage: "en" })).toEqual([["nj_equal_pay_check", "", "2026-10-19", "2026-10-12", null]]);
    expect(nj({ workerLanguage: "es" })).toEqual([["nj_equal_pay_check", "", "2026-10-19", "2026-10-12", null]]);
    expect(nj({ socCode: "43-6014" })).toEqual([]);
    expect(nj({ socCode: null })).toEqual([]);
    expect(nj({ startDate: "2024-09-01" })).toEqual([]);
    expect(kinds({ placements: [placement({ state: "MA", startDate: "2026-10-19" })] }).filter(([k]) => k === "nj_equal_pay_check")).toEqual([]);
  });
});

describe("Form I-9 as dates (J3, J4)", () => {
  it("one per hire date: Section 1 by the first day, Section 2 three business days later; done once the date is recorded", () => {
    expect(kinds({ workers: [worker({ i9Section1On: "2026-10-15" })] })).toEqual([
      ["i9_section1", "2026-10-15", "2026-10-15", "2026-10-15", "Section 1 completed on 2026-10-15."],
      ["i9_section2", "2026-10-15", "2026-10-20", "2026-10-20", null],
    ]);
    const [, s2] = wantedObligations({ ...base, workers: [worker({})] });
    expect(s2!.message).toBe("Hired 2026-10-15; due 3 business days later (weekends skipped), on 2026-10-20 (i9_section2 citation).");
  });

  it("a date recorded before the hire counts within the window (30 days); an older one belongs to an earlier hire", () => {
    // Section 1 on 2026-10-01 (14 days before): done. Section 2 on 2025-01-08: not this hire's.
    const w = wantedObligations({ ...base, workers: [worker({ i9Section1On: "2026-10-01", i9Section2On: "2025-01-08" })] });
    expect(w.map((x) => [x.kind, x.done?.note ?? null, x.facts.completedOn])).toEqual([
      ["i9_section1", "Section 1 completed on 2026-10-01.", "2026-10-01"],
      ["i9_section2", null, null],
    ]);
    expect(w[1]!.message).toBe("Hired 2026-10-15; due 3 business days later (weekends skipped), on 2026-10-20; Section 2 on file is dated 2025-01-08, more than 30 days before this hire (i9_section2 citation).");
  });

  it("a job shorter than three business days: Section 2 by the first day; Saturdays counted when the agency is open then", () => {
    // Thursday 2026-10-15 to Friday 2026-10-16 is two business days.
    const short = wantedObligations({ ...base, workers: [worker({ firstJobEndsOn: "2026-10-16" })] })[1]!;
    expect([short.dueOn, short.message]).toEqual(["2026-10-15", "Hired 2026-10-15; the job ends 2026-10-16, less than 3 business days: due by the first day (i9_section2 citation)."]);
    // Ending Monday 2026-10-19 is three (Thursday, Friday, Monday): the usual date.
    expect(wantedObligations({ ...base, workers: [worker({ firstJobEndsOn: "2026-10-19" })] })[1]!.dueOn).toBe("2026-10-20");
    // Open on Saturdays from 2026-01-01: Friday, Saturday, Monday.
    const sat = wantedObligations({ ...base, openDays: [{ weekdays: [1, 2, 3, 4, 5, 6], effectiveFrom: "2026-01-01", effectiveTo: null }], workers: [worker({})] })[1]!;
    expect([sat.dueOn, sat.message]).toEqual(["2026-10-19", "Hired 2026-10-15; due 3 business days later (Monday to Friday and Saturday counted), on 2026-10-19 (i9_section2 citation)."]);
    // With Saturdays, Thursday to Saturday is three business days: not short.
    expect(wantedObligations({ ...base, openDays: [{ weekdays: [6], effectiveFrom: "2026-01-01", effectiveTo: null }], workers: [worker({ firstJobEndsOn: "2026-10-17" })] })[1]!.dueOn).toBe("2026-10-19");
  });

  it("reverification by the date the work authorization ends, reminded 90 days before; one per end date", () => {
    // 2026-12-20 − 90 days = 2026-09-21. The 2025 hire's I-9 duties are too old.
    expect(kinds({ workers: [worker({ hireDate: "2025-01-06", i9Section1On: "2025-01-06", i9Section2On: "2025-01-08", workAuthExpiresOn: "2026-12-20" })] })).toEqual([["i9_reverify", "2026-12-20", "2026-12-20", "2026-09-21", null]]);
  });

  it("no hire date, no I-9 duty", () => {
    expect(kinds({ workers: [worker({ hireDate: null })] })).toEqual([]);
  });
});

describe("workers' comp policy (J3)", () => {
  const p1: Policy = { id: "p1", carrier: "Carrier (demo)", policyNumber: "WC-1", states: ["IL", "MA"], startsOn: "2026-01-01", endsOn: "2026-12-31", auditDueOn: "2027-02-15" };
  const p2 = (states: string[]): Policy => ({ id: "p2", carrier: "Carrier (demo)", policyNumber: "WC-2", states, startsOn: "2027-01-01", endsOn: "2027-12-31", auditDueOn: null });

  it("renewal by the day it ends (a lapse is not allowed), reminded 30 days before; the audit on its date; a following policy renews it", () => {
    expect(kinds({ policies: [p1] })).toEqual([
      ["wc_policy_renewal", "", "2026-12-31", "2026-12-01", null],
      ["wc_audit", "", "2027-02-15", "2027-01-16", null],
    ]);
    expect(kinds({ policies: [p1, p2(["IL", "MA"])] })[0]).toEqual(["wc_policy_renewal", "", "2026-12-31", "2026-12-01", "Renewed: WC-2, from 2027-01-01 to 2027-12-31."]);
  });

  it("only a following policy covering every state it covered renews it (no states listed: all of them)", () => {
    const renewedBy = (policies: Policy[]) => kinds({ policies })[0]![4];
    expect(renewedBy([p1, p2(["IL"])])).toBeNull();
    expect(renewedBy([p1, p2(["IL", "MA", "NJ"])])).not.toBeNull();
    expect(renewedBy([p1, p2([])])).not.toBeNull();
    expect(renewedBy([{ ...p1, states: [] }, p2(["IL", "MA"])])).toBeNull();
  });
});

describe("ACA offer (26 C.F.R. § 54.4980H-3(d))", () => {
  const cycle = { workerId: "w1", cycle: "standard" as const, measurementStart: "2025-10-01", measurementEnd: "2026-09-30", minutes: 94_170, days: 365, averageMinutesPerWeek: 1806, fullTimeMinutesPerWeek: 1800, stabilityStart: "2026-11-30", stabilityEnd: "2027-11-29" };
  it("for each period measured full-time, coverage offered by the day before its stability period, reminded 30 days before; one per worker and period", () => {
    expect(kinds({ aca: [cycle, { ...cycle, cycle: "initial", measurementStart: "2025-11-01", measurementEnd: "2026-10-31", stabilityStart: "2026-12-01", stabilityEnd: "2027-11-30" }] })).toEqual([
      ["aca_offer", "standard:2025-10-01", "2026-11-29", "2026-10-30", null],
      ["aca_offer", "initial:2025-11-01", "2026-11-30", "2026-10-31", null],
    ]);
    const [w] = wantedObligations({ ...base, aca: [cycle] });
    expect(w).toMatchObject({ workerId: "w1", subjectKind: "worker", jurisdiction: "US" });
    expect(w!.message).toBe("Measured full-time in the standard measurement period 2025-10-01 to 2026-09-30: 1569h 30m of service over 365 days, 30h 06m a week on average (94,170 minutes × 7 = 659,190 ≥ 1,800 × 365 = 657,000); coverage for the stability period 2026-11-30 to 2027-11-29 is offered by 2026-11-29 (aca_offer citation).");
  });

  it("none before the agency enters its settings, or before the rule's date", () => {
    expect(kinds({})).toEqual([]);
    expect(kinds({ aca: [{ ...cycle, stabilityStart: "2014-12-01" }] })).toEqual([]);
  });
});

describe("keys", () => {
  it("one duty per kind, subject and occurrence", () => {
    const w = wantedObligations({ ...base, placements: [placement({})] });
    expect(new Set(w.map(keyOf)).size).toBe(w.length);
    expect(keyOf({ kind: "il_client_proof", workerId: null, clientId: "c1", assignmentId: null, registrationId: null, policyId: null, occurrence: "2026-03-01" })).toBe("il_client_proof||c1||||2026-03-01");
  });
});

describe("every wording of the explanation (decision 0028)", () => {
  it("each key the generator can use is said, and says the stored English", () => {
    const used = new Set<string>();
    const run = (input: Partial<GenerateInput>) => wantedObligations({ ...base, ...input }).forEach((w) => [...w.explain.parts, ...(w.done?.key.parts ?? [])].forEach((p) => used.add(p.key)));
    run({ registrations: [{ id: "r1", jurisdiction: "IL", branchId: null, number: "IL-0001", issuedOn: "2026-01-01", expiresOn: "2026-12-31" }] });
    run({ rules: RULES.map((r) => (r.code === "il_registration_renewal" ? { ...r, offsetDays: 10 } : r)), registrations: [{ id: "r1", jurisdiction: "IL", branchId: null, number: "IL-0001", issuedOn: "2026-01-01", expiresOn: "2026-12-31" }] });
    run({ policies: [{ id: "p1", carrier: "Carrier (demo)", policyNumber: "WC-1", states: [], startsOn: "2026-01-01", endsOn: "2026-12-31", auditDueOn: "2027-02-15" }] });
    run({ placements: [placement({}), placement({ id: "a2", startDate: "2026-12-01", endDate: null })] });
    run({ placements: [placement({ startDate: "2026-01-05", endDate: "2026-02-20", status: "ended" }), placement({ id: "a2", startDate: "2026-09-01", endDate: null })] });
    run({ placements: [placement({ endDate: "2026-05-15", status: "ended" })] });
    run({ placements: [placement({ state: "MA", startDate: "2026-10-14", firstPeriodEnd: "2026-10-18" }), placement({ id: "a3", state: "NJ", startDate: "2026-10-19", workerLanguage: "es" })] });
    run({ workers: [worker({ workAuthExpiresOn: "2027-03-31" }), worker({ id: "w2", firstJobEndsOn: "2026-10-16" }), worker({ id: "w3", i9Section1On: "2026-01-02", i9Section2On: "2025-01-08" })] });
    for (const weekdays of [[1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6, 0], [0, 1, 2, 3, 4, 5, 6]]) run({ openDays: [{ weekdays, effectiveFrom: "2026-01-01", effectiveTo: null }], workers: [worker({})] });
    run({ rules: RULES.map((r) => (r.code === "i9_section2" ? { ...r, businessDays: 0, offsetDays: 2 } : r)), workers: [worker({})] });
    const cycle = { workerId: "w1", measurementStart: "2025-10-01", measurementEnd: "2026-09-30", minutes: 94_170, days: 365, averageMinutesPerWeek: 1806, fullTimeMinutesPerWeek: 1800, stabilityStart: "2026-11-30", stabilityEnd: "2027-11-29" };
    run({ aca: [{ ...cycle, cycle: "standard" }, { ...cycle, cycle: "initial", measurementStart: "2025-11-01" }] });
    run({ registrations: [{ id: "r1", jurisdiction: "IL", branchId: null, number: "IL-0001", issuedOn: "2026-01-01", expiresOn: "2026-12-31" }, { id: "r3", jurisdiction: "IL", branchId: null, number: "IL-0003", issuedOn: "2026-10-10", expiresOn: "2027-12-31" }] });
    run({ policies: [{ id: "p1", carrier: "Carrier (demo)", policyNumber: "WC-1", states: [], startsOn: "2026-01-01", endsOn: "2026-12-31", auditDueOn: null }, { id: "p2", carrier: "Carrier (demo)", policyNumber: "WC-2", states: [], startsOn: "2027-01-01", endsOn: "2027-12-31", auditDueOn: null }] });
    run({ workers: [worker({ i9Section1On: "2026-10-15" })] });
    const generated = Object.keys(en.compliance.explain).filter((k) => !k.startsWith("equalPay") && !["noteReverified", "noteWorkAuthChanged", "noteWorkAuthRemoved", "noteRateEntered"].includes(k));
    expect([...used].sort()).toEqual(generated.sort());
  });
});
