import { describe, expect, it } from "vitest";
import { addBusinessDays, keyOf, wantedObligations, type ComplianceRule, type GenerateInput, type Placement } from "./generate";

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
  rule("il_client_proof", { jurisdiction: "IL", area: "clients", subjectKind: "client", anchor: "fixed_dates", remindDays: 30, fixedDates: ["03-01", "09-01"] }),
  rule("il_client_proof_contract", { jurisdiction: "IL", area: "clients", subjectKind: "client", anchor: "start", remindDays: 7 }),
  rule("ma_job_order", { jurisdiction: "MA", area: "placements", subjectKind: "assignment", anchor: "first_pay_period_end" }),
  rule("nj_language_notice", { jurisdiction: "NJ", area: "placements", subjectKind: "assignment", anchor: "start", socGroups: ["51", "53"], effectiveFrom: "2024-09-16" }),
  rule("i9_section1", {}),
  rule("i9_section2", { businessDays: 3 }),
  rule("i9_reverify", { anchor: "expiry", remindDays: 90 }),
  rule("wc_policy_renewal", { area: "workers_comp", subjectKind: "policy", anchor: "expiry", remindDays: 30 }),
  rule("wc_audit", { area: "workers_comp", subjectKind: "policy", anchor: "date", remindDays: 30 }),
];
const TODAY = "2026-10-16"; // a Friday
const base: GenerateInput = { today: TODAY, rules: RULES, registrations: [], policies: [], placements: [], workers: [] };
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
const kinds = (input: Partial<GenerateInput>) => wantedObligations({ ...base, ...input }).map((w) => [w.kind, w.occurrence, w.dueOn, w.remindOn, w.done?.note ?? null]);

describe("business days (I-9 Section 2: three business days after the first day; weekends skipped, holidays counted — the earlier date)", () => {
  it("Monday + 3 = Thursday; Thursday + 3 = Tuesday; Friday + 3 = Wednesday", () => {
    expect(addBusinessDays("2026-10-12", 3)).toBe("2026-10-15");
    expect(addBusinessDays("2026-10-15", 3)).toBe("2026-10-20");
    expect(addBusinessDays("2026-10-16", 3)).toBe("2026-10-21");
    expect(addBusinessDays("2026-10-17", 1)).toBe("2026-10-19");
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

  it("a duty dated before the rule took effect, or further back than its look-back, is not created", () => {
    const registrations = [
      { id: "r5", jurisdiction: "NJ" as const, branchId: null, number: "NJ-5", issuedOn: null, expiresOn: "2024-09-30" },
      { id: "r6", jurisdiction: "IL" as const, branchId: null, number: "IL-6", issuedOn: null, expiresOn: "2025-08-31" },
    ];
    expect(kinds({ registrations })).toEqual([]);
  });
});

describe("Illinois proof of registration for each client (J3)", () => {
  it("each March 1 and September 1 the client has covered work, up to the next one; and once before the contract starts", () => {
    // Look-back from 2026-10-16 is 2025-10-16, so 2025-03-01 and 2025-09-01 are not created.
    // 2027-03-01 − 30 days = 2027-01-30 (February 2027 has 28 days).
    expect(kinds({ placements: [placement({})] })).toEqual([
      ["il_client_proof_contract", "contract", "2026-02-02", "2026-01-26", null],
      ["il_client_proof", "2026-03-01", "2026-03-01", "2026-01-30", null],
      ["il_client_proof", "2026-09-01", "2026-09-01", "2026-08-02", null],
      ["il_client_proof", "2027-03-01", "2027-03-01", "2027-01-30", null],
    ]);
  });

  it("only the dates with a covered placement running; none for work outside day and temporary labor, or cancelled", () => {
    expect(kinds({ placements: [placement({ endDate: "2026-05-15", status: "ended" })] }).map((k) => k[1])).toEqual(["contract", "2026-03-01"]);
    expect(kinds({ placements: [placement({ dayAndTemporaryLabor: false })] })).toEqual([]);
    expect(kinds({ placements: [placement({ status: "cancelled" })] })).toEqual([]);
    expect(kinds({ placements: [placement({ state: "CA" })] })).toEqual([]);
  });

  it("one client with two placements gets one of each", () => {
    expect(kinds({ placements: [placement({}), placement({ id: "a2", workerId: "w2", startDate: "2026-04-06" })] }).map((k) => k[1])).toEqual(["contract", "2026-03-01", "2026-09-01", "2027-03-01"]);
  });
});

describe("placement notices (J3)", () => {
  it("Massachusetts: the job order by the end of the placement's first pay period", () => {
    const w = wantedObligations({ ...base, placements: [placement({ state: "MA", startDate: "2026-10-14", firstPeriodEnd: "2026-10-18" })] });
    expect(w.map((x) => [x.kind, x.assignmentId, x.dueOn])).toEqual([["ma_job_order", "a1", "2026-10-18"]]);
    expect(w[0]!.message).toBe("The placement starts 2026-10-14; due by the end of its first pay period, 2026-10-18 (ma_job_order citation).");
  });

  it("New Jersey: a designated classification whose worker prefers another language gets the notice in both, by the start", () => {
    const nj = (over: Partial<Placement>) => kinds({ placements: [placement({ state: "NJ", startDate: "2026-10-19", workerLanguage: "es", ...over })] });
    expect(nj({})).toEqual([["nj_language_notice", "", "2026-10-19", "2026-10-19", null]]);
    expect(nj({ workerLanguage: "en" })).toEqual([]);
    expect(nj({ socCode: "43-6014" })).toEqual([]);
    expect(nj({ socCode: null })).toEqual([]);
    expect(wantedObligations({ ...base, placements: [placement({ state: "NJ", startDate: "2026-10-19", workerLanguage: "es" })] })[0]!.facts).toMatchObject({ language: "es" });
  });
});

describe("Form I-9 as dates (J3, J4)", () => {
  it("Section 1 by the first day, Section 2 three business days later; done once the date is recorded", () => {
    expect(kinds({ workers: [{ id: "w1", hireDate: "2026-10-15", i9Section1On: "2026-10-15", i9Section2On: null, workAuthExpiresOn: null }] })).toEqual([
      ["i9_section1", "", "2026-10-15", "2026-10-15", "Section 1 completed on 2026-10-15."],
      ["i9_section2", "", "2026-10-20", "2026-10-20", null],
    ]);
    const [, s2] = wantedObligations({ ...base, workers: [{ id: "w1", hireDate: "2026-10-15", i9Section1On: null, i9Section2On: null, workAuthExpiresOn: null }] });
    expect(s2!.message).toBe("Hired 2026-10-15; due 3 business days later (weekends skipped), on 2026-10-20 (i9_section2 citation).");
  });

  it("reverification by the date the work authorization ends, reminded 90 days before; one per end date", () => {
    // 2026-12-20 − 90 days = 2026-09-21.
    expect(kinds({ workers: [{ id: "w1", hireDate: "2025-01-06", i9Section1On: "2025-01-06", i9Section2On: "2025-01-08", workAuthExpiresOn: "2026-12-20" }] })).toEqual([["i9_reverify", "2026-12-20", "2026-12-20", "2026-09-21", null]]);
  });

  it("no hire date, no I-9 duty", () => {
    expect(kinds({ workers: [{ id: "w1", hireDate: null, i9Section1On: null, i9Section2On: null, workAuthExpiresOn: null }] })).toEqual([]);
  });
});

describe("workers' comp policy (J3)", () => {
  it("renewal by the day it ends (a lapse is not allowed), reminded 30 days before; the audit on its date; a following policy renews it", () => {
    const p1 = { id: "p1", carrier: "Carrier (demo)", policyNumber: "WC-1", startsOn: "2026-01-01", endsOn: "2026-12-31", auditDueOn: "2027-02-15" };
    expect(kinds({ policies: [p1] })).toEqual([
      ["wc_policy_renewal", "", "2026-12-31", "2026-12-01", null],
      ["wc_audit", "", "2027-02-15", "2027-01-16", null],
    ]);
    const p2 = { id: "p2", carrier: "Carrier (demo)", policyNumber: "WC-2", startsOn: "2027-01-01", endsOn: "2027-12-31", auditDueOn: null };
    expect(kinds({ policies: [p1, p2] })[0]).toEqual(["wc_policy_renewal", "", "2026-12-31", "2026-12-01", "Renewed: WC-2, from 2027-01-01 to 2027-12-31."]);
  });
});

describe("keys", () => {
  it("one duty per kind, subject and occurrence", () => {
    const w = wantedObligations({ ...base, placements: [placement({})] });
    expect(new Set(w.map(keyOf)).size).toBe(w.length);
    expect(keyOf({ kind: "il_client_proof", workerId: null, clientId: "c1", assignmentId: null, registrationId: null, policyId: null, occurrence: "2026-03-01" })).toBe("il_client_proof||c1||||2026-03-01");
  });
});
