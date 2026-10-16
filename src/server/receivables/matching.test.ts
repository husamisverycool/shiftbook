import { describe, expect, it } from "vitest";
import { suggestMatch, type OpenInvoice } from "./matching";

const W = { daysBefore: 90, daysAfter: 20 };
const clients = [
  { id: "plm", name: "Prairie Line Manufacturing (demo)" },
  { id: "heh", name: "Harborview Events & Hospitality (demo)" },
];
const inv = (id: string, clientId: string, balanceCents: number, dueOn: string, over: Partial<OpenInvoice> = {}): OpenInvoice => ({ id, number: id, clientId, poNumber: null, issuedOn: "2026-10-13", dueOn, balanceCents, ...over });
const open = [
  inv("PLM-20261005-1", "plm", 169_763, "2026-11-12", { poNumber: "PO-48213" }),
  inv("PLM-20261005-2", "plm", 63_600, "2026-11-12", { poNumber: "PO-77001" }),
  inv("PLM-20260928", "plm", 42_400, "2026-11-05", { issuedOn: "2026-10-06" }),
  inv("HEH-20261005", "heh", 50_000, "2026-11-12"),
];
const dep = (description: string, amountCents: number) => ({ postedOn: "2026-10-20", description, reference: null, amountCents });

describe("suggested matches for a deposit (H6), in Stripe's order", () => {
  it("1. an invoice number on the deposit and the exact amount: High", () => {
    expect(suggestMatch(dep("ACH CREDIT PRAIRIE LINE INV PLM-20261005-2", 63_600), open, clients, W)).toEqual({
      clientId: "plm",
      applications: [{ invoiceId: "PLM-20261005-2", amountCents: 63_600 }],
      creditCents: 0,
      shortCents: 0,
      confidence: "high",
      explain: "invoice number PLM-20261005-2 on the deposit; $636.00 equals what it owes.",
      // The same reasoning as message keys for the reader's language (decision 0030).
      said: [{ key: "refExactOne", values: { what: { say: [{ key: "whatInvoiceNumber", values: { invoices: "PLM-20261005-2" } }] }, amount: "$636.00" } }],
    });
  });

  it("…a number is matched whole: PLM-20261005-1 is not PLM-20261005-12", () => {
    expect(suggestMatch(dep("PAYMENT PLM-20261005-12", 63_600), open, clients, W)?.explain).not.toContain("invoice number");
  });

  it("…less than owed: applied oldest first, the rest left short (Medium)", () => {
    const s = suggestMatch(dep("INV PLM-20261005-1 PLM-20260928", 200_000), open, clients, W)!;
    // Owed 1,697.63 + 424.00 = 2,121.63; 2,000.00 applied: 424.00 to the older, 1,576.00 to the other; 121.63 short.
    expect(s).toMatchObject({ clientId: "plm", confidence: "medium", shortCents: 12_163, creditCents: 0 });
    expect(s.applications).toEqual([
      { invoiceId: "PLM-20260928", amountCents: 42_400 },
      { invoiceId: "PLM-20261005-1", amountCents: 157_600 },
    ]);
    expect(s.explain).toBe("invoice numbers PLM-20260928, PLM-20261005-1 on the deposit; $2,000.00 is $121.63 less than the $2,121.63 owed: applied oldest first, the rest left short.");
  });

  it("…a PO on the deposit names its invoice (Medium: a PO is not the invoice's own number)", () => {
    expect(suggestMatch(dep("REMIT PO-77001", 63_600), open, clients, W)).toMatchObject({ clientId: "plm", confidence: "medium", applications: [{ invoiceId: "PLM-20261005-2", amountCents: 63_600 }] });
  });

  it("2. the client named and an exact sum of its invoices: High; the fewest invoices first", () => {
    // 636.00 + 424.00 = 1,060.00: one group of two.
    const s = suggestMatch(dep("ACH DEPOSIT PRAIRIE LINE MANUFACTURING", 106_000), open, clients, W)!;
    expect(s).toMatchObject({ clientId: "plm", confidence: "high", creditCents: 0, shortCents: 0 });
    expect(s.applications.map((a) => a.invoiceId)).toEqual(["PLM-20260928", "PLM-20261005-2"]);
  });

  it("…no client named but only one client has invoices adding up to it: Medium", () => {
    expect(suggestMatch(dep("DEPOSIT 88213", 50_000), open, clients, W)).toMatchObject({ clientId: "heh", confidence: "medium" });
  });

  it("…an amount alone outside the window, or matching two clients, suggests nothing", () => {
    expect(suggestMatch({ ...dep("DEPOSIT", 50_000), postedOn: "2027-03-01" }, open, clients, W)).toBeNull();
    const twin = [...open, inv("XYZ-1", "xyz", 50_000, "2026-11-12")];
    expect(suggestMatch(dep("DEPOSIT", 50_000), twin, [...clients, { id: "xyz", name: "Xylo Works" }], W)).toBeNull();
  });

  it("3. the client named, no reference and no exact sum: its oldest invoices first (Medium), short or credit said", () => {
    const s = suggestMatch(dep("HARBORVIEW EVENTS & HOSPITALITY PMT", 47_500), open, clients, W)!;
    expect(s).toMatchObject({ clientId: "heh", confidence: "medium", shortCents: 2500, applications: [{ invoiceId: "HEH-20261005", amountCents: 47_500 }] });
    expect(s.explain).toContain("$25.00 left short");
  });

  it("a withdrawal, or a deposit naming no one with no exact sum, is not suggested", () => {
    expect(suggestMatch(dep("PLM-20261005-2", -63_600), open, clients, W)).toBeNull();
    expect(suggestMatch(dep("TRANSFER FROM SAVINGS", 123_456), open, clients, W)).toBeNull();
  });

  it("review 1: one exact invoice is found among many small ones (the search goes by group size, singles first)", () => {
    const small = Array.from({ length: 29 }, (_, k) => inv(`ACM-1${String(k).padStart(3, "0")}`, "acm", 30_000, "2026-10-01", { issuedOn: "2026-09-01" }));
    const big = inv("ACM-2000", "acm", 500_000, "2026-11-10", { issuedOn: "2026-10-10" });
    const many = [...small, big];
    const acme = [{ id: "acm", name: "Acme Fulfillment Centers" }];
    expect(suggestMatch(dep("ACH ACME FULFILLMENT CENTERS", 500_000), many, acme, W)).toMatchObject({ clientId: "acm", confidence: "high", applications: [{ invoiceId: "ACM-2000", amountCents: 500_000 }], shortCents: 0 });
    expect(suggestMatch(dep("DEPOSIT", 500_000), many, acme, W)).toMatchObject({ clientId: "acm", confidence: "medium", applications: [{ invoiceId: "ACM-2000", amountCents: 500_000 }] });
  });

  it("review nit: a client's name is matched as whole words (Mart Staffing is not inside WALMART STAFFING)", () => {
    const mart = [{ id: "mrt", name: "Mart Staffing" }];
    const one = [inv("MRT-1", "mrt", 12_345, "2026-11-12")];
    expect(suggestMatch(dep("WALMART STAFFING PAYROLL", 10_000), one, mart, W)).toBeNull();
    expect(suggestMatch(dep("ACH MART STAFFING PMT", 10_000), one, mart, W)).toMatchObject({ clientId: "mrt", shortCents: 2345 });
  });
});
