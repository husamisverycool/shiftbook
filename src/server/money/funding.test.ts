import { describe, expect, it } from "vitest";
import { DEFAULT_FUNDING, fundingPacket, offerFor, type FundingFacts, type FundingInvoice } from "./funding";
import { fundingProblems } from "./settings";

const on = { ...DEFAULT_FUNDING, enabled: true };
const invoice: FundingInvoice = { id: "inv-1", number: "INV-1001", clientId: "c1", clientName: "Client One", issuedOn: "2026-10-01", dueOn: "2026-10-31", totalCents: 185500, balanceCents: 185500, status: "issued", kind: "invoice", poNumber: "PO-7", hasBackup: true };
const facts: FundingFacts = {
  asOf: "2026-10-17",
  clientOpenCents: 185500,
  allOpenCents: 742000,
  paidInvoices: 4,
  averageDaysToPay: 33,
  averageDaysLate: 3,
  approvedShifts: 95,
  disputedShifts: 5,
  openDisputes: 0,
  invoiceShifts: 24,
  approvedInvoiceShifts: 24,
  approvals: [{ approverName: "Approver One", decidedAt: "2026-10-13T16:00:00.000Z", approvedShifts: 24, disputedShifts: 0 }],
};

describe("invoice funding", () => {
  it("offers an advance rounded down, a flat fee rounded half up once, and the rest in reserve", () => {
    // By hand on $1,855.00: advance 90% = $1,669.50; fee 3% = $55.65; reserve $185.50; released on
    // payment $185.50 − $55.65 = $129.85.
    expect(offerFor(185500, on)).toEqual({ balanceCents: 185500, advanceCents: 166950, feeCents: 5565, reserveCents: 18550, releasedOnPaymentCents: 12985 });
    // $10.01 at 90% is 900.9 cents → 900 (down); 3% fee is 30.03 → 30; reserve 101.
    expect(offerFor(1001, on)).toEqual({ balanceCents: 1001, advanceCents: 900, feeCents: 30, reserveCents: 101, releasedOnPaymentCents: 71 });
    // $0.50 fee half: 1650 cents × 3% = 49.5 → 50 (half up).
    expect(offerFor(1650, on).feeCents).toBe(50);
  });

  it("measures concentration, dispute rate and age, and prequalifies an eligible invoice", () => {
    const p = fundingPacket(invoice, facts, on);
    // 185,500 ÷ 742,000 = 25.00% → 2500 bps; disputes 5 of 100 shifts = 500 bps; 16 days old.
    expect(p).toMatchObject({ ageDays: 16, bucket: "current", concentrationBps: 2500, disputeRateBps: 500, approved: true, eligible: true, reasons: [] });
    expect(p.offer?.advanceCents).toBe(166950);
    expect(p.schedule).toEqual({ debtor: "Client One", invoiceNumber: "INV-1001", invoiceDate: "2026-10-01", poNumber: "PO-7", amountCents: 185500 });
  });

  it("is approved only when every shift the invoice bills was approved (money review B6)", () => {
    expect(fundingPacket(invoice, { ...facts, approvedInvoiceShifts: 23 }, on)).toMatchObject({ approved: false, eligible: false, reasons: ["no_approval"] });
    expect(fundingPacket(invoice, { ...facts, invoiceShifts: 0, approvedInvoiceShifts: 0 }, on).approved).toBe(false);
  });

  it("names every reason an invoice is not eligible", () => {
    const p = fundingPacket(
      { ...invoice, issuedOn: "2026-06-01", dueOn: "2026-07-01", status: "paid", balanceCents: 0 },
      { ...facts, clientOpenCents: 400000, allOpenCents: 742000, openDisputes: 2, approvals: [], approvedInvoiceShifts: 0 },
      DEFAULT_FUNDING,
    );
    expect(p.reasons).toEqual(["disabled", "not_open", "no_balance", "too_old", "concentration", "no_approval", "open_disputes"]);
    expect(p.eligible).toBe(false);
    expect(p.offer).toBeNull();
    expect(p.bucket).toBe("d91_plus");
  });

  it("never funds a credit note, and has no dispute rate without decisions", () => {
    const p = fundingPacket({ ...invoice, kind: "credit_note" }, { ...facts, approvedShifts: 0, disputedShifts: 0 }, on);
    expect(p.reasons).toContain("credit_note");
    expect(p.disputeRateBps).toBeNull();
  });
});

describe("funding settings (money review B6)", () => {
  const rules = { enabled: true, advanceBps: 9000, feeBps: 300, maxConcentrationBps: 10000, maxAgeDays: 90, requireClientApproval: true };
  it("refuse an advance and fee that together pass 100%, which would release less than nothing", () => {
    expect(fundingProblems(rules)).toEqual([]);
    expect(fundingProblems({ ...rules, advanceBps: 9800, feeBps: 200 })).toEqual([]);
    expect(fundingProblems({ ...rules, advanceBps: 9900, feeBps: 200 })).toEqual([{ field: "feeBps", rule: "range" }]);
  });
});
