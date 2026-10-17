import { describe, expect, it } from "vitest";
import { onboardingProgress, readDeposit, readI9, readPersonal, readSignature, readW4, routingOk, STEPS } from "./forms";

describe("onboarding answers (slice t; Gusto self-onboarding, Form W-4, Form I-9 Section 1)", () => {
  it("checks a bank routing number's check digit (ABA: 3·7·1 weights, a multiple of 10)", () => {
    expect(routingOk("011000015")).toBe(true); // the Federal Reserve Bank of Boston
    expect(routingOk("021000021")).toBe(true);
    expect(routingOk("021000022")).toBe(false);
    expect(routingOk("12345678")).toBe(false);
    expect(routingOk("abcdefghi")).toBe(false);
  });

  it("takes direct deposit only with a valid routing number and the account typed twice the same", () => {
    expect(readDeposit({ kind: "direct_deposit", routing: "021000021", account: "000123456789", confirm: "000123456789", accountType: "checking" })).toEqual({
      ok: true,
      value: { kind: "direct_deposit", routing: "021000021", account: "000123456789", accountType: "checking" },
    });
    expect(readDeposit({ kind: "direct_deposit", routing: "021000022", account: "1234", confirm: "1234", accountType: "checking" })).toEqual({ ok: false, field: "routing" });
    expect(readDeposit({ kind: "direct_deposit", routing: "021000021", account: "1234", confirm: "1243", accountType: "checking" })).toEqual({ ok: false, field: "confirm" });
    expect(readDeposit({ kind: "direct_deposit", routing: "021000021", account: "12", confirm: "12", accountType: "checking" })).toEqual({ ok: false, field: "account" });
    expect(readDeposit({ kind: "paper_check" })).toEqual({ ok: true, value: { kind: "paper_check" } });
  });

  it("reads the W-4 (2020 and later) with its amounts in integer cents", () => {
    expect(readW4({ filingStatus: "single", multipleJobs: "on", dependents: "2,000", otherIncome: "", deductions: "150.50", extraWithholding: "25", exempt: "" })).toEqual({
      ok: true,
      value: { filingStatus: "single", multipleJobs: true, dependentsCents: 200000, otherIncomeCents: 0, deductionsCents: 15050, extraWithholdingCents: 2500, exempt: false },
    });
    expect(readW4({ filingStatus: "married", dependents: "", otherIncome: "", deductions: "", extraWithholding: "" })).toEqual({ ok: false, field: "filingStatus" });
    expect(readW4({ filingStatus: "single", dependents: "-5", otherIncome: "", deductions: "", extraWithholding: "" })).toEqual({ ok: false, field: "dependents" });
    expect(readW4({ filingStatus: "single", dependents: "1.234", otherIncome: "", deductions: "", extraWithholding: "" })).toEqual({ ok: false, field: "dependents" });
  });

  it("asks the I-9 Section 1 numbers its status needs, never more", () => {
    expect(readI9({ status: "citizen" })).toEqual({ ok: true, value: { status: "citizen" } });
    expect(readI9({ status: "permanent_resident", uscisNumber: "" })).toEqual({ ok: false, field: "uscisNumber" });
    expect(readI9({ status: "permanent_resident", uscisNumber: "A-123456789" })).toEqual({ ok: true, value: { status: "permanent_resident", uscisNumber: "123456789" } });
    expect(readI9({ status: "authorized_alien", expiresOn: "2027-05-01", i94Number: "12345678901" })).toEqual({ ok: true, value: { status: "authorized_alien", expiresOn: "2027-05-01", i94Number: "12345678901" } });
    expect(readI9({ status: "authorized_alien", expiresOn: "2027-05-01" })).toEqual({ ok: false, field: "i94Number" });
    expect(readI9({ status: "authorized_alien", expiresOn: "2027-05-01", passportNumber: "X1234567", passportCountry: "" })).toEqual({ ok: false, field: "passportCountry" });
    expect(readI9({ status: "other" })).toEqual({ ok: false, field: "status" });
  });

  it("reads personal information; the date of birth must be a past date of someone at least 14", () => {
    const base = { legalFirstName: "Ana", legalLastName: "Ruiz", ssn: "900-12-3456", birthDate: "1995-04-02", addressLine: "12 Elm St", city: "Joliet", state: "IL", zip: "60431", email: "" };
    expect(readPersonal(base, "2026-10-17")).toEqual({ ok: true, value: { legalFirstName: "Ana", legalLastName: "Ruiz", ssn: "900123456", birthDate: "1995-04-02", addressLine: "12 Elm St", city: "Joliet", state: "IL", zip: "60431", email: null } });
    // Group 00 is never issued.
    expect(readPersonal({ ...base, ssn: "900-00-3456" }, "2026-10-17")).toEqual({ ok: false, field: "ssn" });
    expect(readPersonal({ ...base, birthDate: "2015-01-01" }, "2026-10-17")).toEqual({ ok: false, field: "birthDate" });
    expect(readPersonal({ ...base, state: "ZZ" }, "2026-10-17")).toEqual({ ok: false, field: "state" });
    expect(readPersonal({ ...base, zip: "6043" }, "2026-10-17")).toEqual({ ok: false, field: "zip" });
    expect(readPersonal({ ...base, email: "not an email" }, "2026-10-17")).toEqual({ ok: false, field: "email" });
  });

  it("signs only with the full legal name typed and the box ticked", () => {
    expect(readSignature({ name: " ana  ruiz ", agree: "on" }, { legalFirstName: "Ana", legalLastName: "Ruiz" })).toEqual({ ok: true, value: "ana ruiz" });
    expect(readSignature({ name: "Ana", agree: "on" }, { legalFirstName: "Ana", legalLastName: "Ruiz" })).toEqual({ ok: false, field: "name" });
    expect(readSignature({ name: "Ana Ruiz", agree: "" }, { legalFirstName: "Ana", legalLastName: "Ruiz" })).toEqual({ ok: false, field: "agree" });
  });

  it("counts the steps done and names the first one left", () => {
    expect(STEPS).toEqual(["personal", "w4", "i9", "payment", "policies", "sign"]);
    const at = new Date("2026-10-17T12:00:00Z");
    expect(onboardingProgress(null)).toEqual({ done: 0, total: 6, next: "personal", complete: false, steps: { personal: null, w4: null, i9: null, payment: null, policies: null, sign: null } });
    const p = onboardingProgress({ personalAt: at, w4At: at, i9At: null, paymentAt: at, policiesAt: null, signedAt: null });
    expect(p.done).toBe(3);
    expect(p.next).toBe("i9");
    expect(onboardingProgress({ personalAt: at, w4At: at, i9At: at, paymentAt: at, policiesAt: at, signedAt: at }).complete).toBe(true);
  });
});
