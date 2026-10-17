/**
 * A factor's schedule of accounts (decision 0040). By hand: two open invoices, $1,855.00 issued
 * 10/12/2026 due 11/11/2026 (30 days) and $984.50 issued 10/05/2026 due 10/20/2026 (15 days), listed
 * oldest first; total 2 invoices, $2,839.50.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { renderScheduleCsv, scheduleNumber, scheduleRefusal, type ScheduleInvoice } from "./schedule-of-accounts";

const inv = (over: Partial<ScheduleInvoice>): ScheduleInvoice => ({
  id: "i1",
  number: "INV-1001",
  kind: "invoice",
  status: "issued",
  issuedOn: "2026-10-12",
  dueOn: "2026-11-11",
  poNumber: "PO-77",
  weekEnding: "2026-10-11",
  totalCents: 185_500,
  debtor: { name: "Prairie Line Manufacturing (demo)", addressLines: ["100 Example Rd", "Joliet, IL 60431"] },
  ...over,
});
const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe("schedule of accounts", () => {
  it("lists each open invoice oldest first, with the debtor, terms and a total row, and reconciles", () => {
    const r = renderScheduleCsv({
      number: "SOA-20261017-ABC123",
      date: "2026-10-17",
      agencyName: "Cedar Row Staffing (demo)",
      invoices: [inv({}), inv({ id: "i2", number: "INV-1000", issuedOn: "2026-10-05", dueOn: "2026-10-20", poNumber: null, weekEnding: "2026-10-04", totalCents: 98_450, debtor: { name: "=Harbor Events (demo)", addressLines: ["1 Pier St"] } })],
    });
    expect(r).toMatchObject({ filename: "schedule-of-accounts-SOA-20261017-ABC123.csv", count: 2, totalCents: 283_950 });
    expect(text(r.bytes)).toBe(
      [
        "Schedule Number,Schedule Date,Client (Seller),Debtor Name,Debtor Address,Invoice Number,Invoice Date,Due Date,Terms (days),PO / Reference,Week Ending,Invoice Amount,Backup File",
        "SOA-20261017-ABC123,10/17/2026,Cedar Row Staffing (demo),'=Harbor Events (demo),1 Pier St,INV-1000,10/05/2026,10/20/2026,15,,10/04/2026,984.50,invoices/invoice-INV-1000.pdf",
        'SOA-20261017-ABC123,10/17/2026,Cedar Row Staffing (demo),Prairie Line Manufacturing (demo),"100 Example Rd, Joliet, IL 60431",INV-1001,10/12/2026,11/11/2026,30,PO-77,10/11/2026,1855.00,invoices/invoice-INV-1001.pdf',
        "Total,,,,,2 invoices,,,,,,2839.50,",
        "",
      ].join("\r\n"),
    );
  });

  it("refuses credit notes, paid, void and draft invoices: a factor buys open receivables", () => {
    expect(scheduleRefusal(inv({ kind: "credit_note", totalCents: -500 }))).toMatch(/credit note/);
    expect(scheduleRefusal(inv({ status: "paid" }))).toMatch(/is paid/);
    expect(scheduleRefusal(inv({ status: "void" }))).toMatch(/is void/);
    expect(scheduleRefusal(inv({ status: "draft" }))).toMatch(/not issued yet/);
    expect(scheduleRefusal(inv({}))).toBeNull();
    expect(() => renderScheduleCsv({ number: "S", date: "2026-10-17", agencyName: "A", invoices: [inv({ status: "paid" })] })).toThrow(/is paid/);
    expect(() => renderScheduleCsv({ number: "S", date: "2026-10-17", agencyName: "A", invoices: [] })).toThrow(/at least one/);
  });

  it("numbers a schedule by its date and its invoices, whatever their order", () => {
    const sha = (t: string) => createHash("sha256").update(t).digest("hex");
    expect(scheduleNumber("2026-10-17", ["b", "a"], sha)).toBe(scheduleNumber("2026-10-17", ["a", "b"], sha));
    expect(scheduleNumber("2026-10-17", ["a"], sha)).toMatch(/^SOA-20261017-[0-9A-F]{6}$/);
  });
});
