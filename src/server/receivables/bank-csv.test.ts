import { describe, expect, it } from "vitest";
import { bankRows, guessMapping, readBankLines, readCents, readDate } from "./bank-csv";
import { fingerprints } from "./bank-fingerprint";

describe("reading a bank CSV (H5)", () => {
  it("reads amounts as exact cents: thousands, signs, parentheses, a dollar sign; refuses three decimals", () => {
    expect(readCents("1,234.56")).toBe(123_456);
    expect(readCents("-1234.5")).toBe(-123_450);
    expect(readCents("(12.00)")).toBe(-1200);
    expect(readCents("$ 7")).toBe(700);
    expect(readCents("+3.10")).toBe(310);
    expect(readCents("")).toBe(0);
    expect(readCents("1.234")).toBeNull();
    expect(readCents("12,34")).toBeNull();
    expect(readCents("abc")).toBeNull();
  });

  it("reads dates in the format chosen, and refuses impossible ones", () => {
    expect(readDate("10/05/2026", "MM/DD/YYYY")).toBe("2026-10-05");
    expect(readDate("5/10/26", "DD/MM/YYYY")).toBe("2026-10-05");
    expect(readDate("2026-10-05", "YYYY-MM-DD")).toBe("2026-10-05");
    expect(readDate("02/30/2026", "MM/DD/YYYY")).toBeNull();
  });

  it("a header with a signed amount (Chase-style): the mapping is guessed, deposits positive, withdrawals negative", () => {
    const rows = bankRows(
      [
        "Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #",
        'CREDIT,10/14/2026,"ACH DEPOSIT PRAIRIE LINE MFG INV PLM-20261005",1425.00,ACH_CREDIT,9000.00,',
        "DEBIT,10/14/2026,OFFICE RENT,-1200.00,ACH_DEBIT,7575.00,",
        "CHECK,10/15/2026,CHECK 1042,250.00,CHECK_DEPOSIT,7825.00,1042",
      ].join("\n"),
    );
    const mapping = guessMapping(rows)!;
    expect(mapping).toEqual({ headerRow: 0, date: 1, description: 2, reference: 6, amounts: { kind: "signed", amount: 3 }, dateFormat: "MM/DD/YYYY" });
    expect(readBankLines(rows, mapping)).toEqual({
      lines: [
        { rowNumber: 2, postedOn: "2026-10-14", description: "ACH DEPOSIT PRAIRIE LINE MFG INV PLM-20261005", reference: null, amountCents: 142_500 },
        { rowNumber: 3, postedOn: "2026-10-14", description: "OFFICE RENT", reference: null, amountCents: -120_000 },
        { rowNumber: 4, postedOn: "2026-10-15", description: "CHECK 1042", reference: "1042", amountCents: 25_000 },
      ],
      problems: [],
    });
  });

  it("summary lines above the header and totals below it (Bank of America-style) are left out", () => {
    const rows = bankRows(["Description,,Summary Amt.", "Beginning balance as of 10/01/2026,,5000.00", "", "Date,Description,Amount,Running Bal.", "10/14/2026,DEPOSIT HARBORVIEW,500.00,5500.00", "Total,,500.00,"].join("\n"));
    const mapping = guessMapping(rows)!;
    expect(mapping.headerRow).toBe(2);
    expect(readBankLines(rows, mapping).lines).toEqual([{ rowNumber: 4, postedOn: "2026-10-14", description: "DEPOSIT HARBORVIEW", reference: null, amountCents: 50_000 }]);
  });

  it("deposits and withdrawals in two columns, and an unsigned amount with a type", () => {
    const split = bankRows(["Date,Description,Withdrawals,Deposits", "2026-10-14,FEE,15.00,", "2026-10-15,WIRE IN PACIFIC CREST,,2000.00"].join("\n"));
    expect(readBankLines(split, guessMapping(split)!).lines.map((l) => l.amountCents)).toEqual([-1500, 200_000]);
    const typed = bankRows(["Date,Description,Amount,Type", "10/14/2026,DEPOSIT,100.00,Credit", "10/15/2026,PAYMENT,40.00,Debit"].join("\n"));
    const m = guessMapping(typed)!;
    expect(m.amounts).toEqual({ kind: "typed", amount: 2, type: 3 });
    expect(readBankLines(typed, m).lines.map((l) => l.amountCents)).toEqual([10_000, -4000]);
  });

  it("no header row (Wells Fargo-style) is read by position; a cell it cannot read names its line", () => {
    const rows = bankRows(['"10/14/2026","1500.00","*","","DEPOSIT PRAIRIE LINE"', '"10/15/2026","1.234","*","","BAD"'].join("\n"));
    expect(guessMapping(rows)).toBeNull();
    const r = readBankLines(rows, { headerRow: null, date: 0, description: 4, reference: null, amounts: { kind: "signed", amount: 1 }, dateFormat: "MM/DD/YYYY" });
    expect(r.lines).toEqual([{ rowNumber: 1, postedOn: "2026-10-14", description: "DEPOSIT PRAIRIE LINE", reference: null, amountCents: 150_000 }]);
    expect(r.problems).toEqual([{ rowNumber: 2, field: "amount", text: "1.234" }]);
  });

  it("two identical deposits on one day are two lines; the same line in another file is the same line", () => {
    const line = { rowNumber: 2, postedOn: "2026-10-14", description: "DEPOSIT", reference: null, amountCents: 100 };
    const [a, b] = fingerprints([line, { ...line, rowNumber: 3 }]);
    expect(a).not.toBe(b);
    expect(fingerprints([{ ...line, rowNumber: 9 }])[0]).toBe(a);
  });
});
