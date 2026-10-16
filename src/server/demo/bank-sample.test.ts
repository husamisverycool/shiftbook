import { describe, expect, it } from "vitest";
import { bankRows, guessMapping, readBankLines } from "../receivables/bank-csv";
import { suggestMatch } from "../receivables/matching";
import { bankSampleCsv } from "./bank-sample";

const clients = [
  { name: "Pacific Crest Distribution (demo)", invoices: [{ number: "PCD-20261005", dueOn: "2026-11-04", balanceCents: 412_350 }] },
  { name: "Prairie Line Manufacturing (demo)", invoices: [{ number: "PLM-20261005", dueOn: "2026-11-04", balanceCents: 298_000 }] },
];

describe("the demo's sample bank file", () => {
  it("reads with the guessed mapping: two deposits and a transfer today, a withdrawal yesterday", () => {
    const rows = bankRows(bankSampleCsv(clients, "2026-10-16"));
    const mapping = guessMapping(rows)!;
    expect(mapping.amounts).toEqual({ kind: "signed", amount: 2 });
    const { lines, problems } = readBankLines(rows, mapping);
    expect(problems).toEqual([]);
    expect(lines.map((l) => [l.postedOn, l.amountCents])).toEqual([
      ["2026-10-16", 412_350],
      ["2026-10-16", 295_500],
      ["2026-10-16", 500_000],
      ["2026-10-15", -1_234_567],
    ]);
  });

  it("the first deposit names its invoice and pays it exactly (High); the second names its client and is $25.00 short", () => {
    const rows = bankRows(bankSampleCsv(clients, "2026-10-16"));
    const { lines } = readBankLines(rows, guessMapping(rows)!);
    const open = clients.flatMap((c, k) => c.invoices.map((i) => ({ id: `i${k}`, clientId: `c${k}`, poNumber: null, issuedOn: "2026-10-05", ...i })));
    const ids = clients.map((c, k) => ({ id: `c${k}`, name: c.name }));
    const window = { daysBefore: 90, daysAfter: 20 };
    const exact = suggestMatch(lines[0]!, open, ids, window)!;
    expect(exact).toMatchObject({ clientId: "c0", confidence: "high", shortCents: 0, creditCents: 0 });
    const short = suggestMatch(lines[1]!, open, ids, window)!;
    expect(short).toMatchObject({ clientId: "c1", shortCents: 2500, applications: [{ invoiceId: "i1", amountCents: 295_500 }] });
    expect(suggestMatch(lines[2]!, open, ids, window)).toBeNull();
  });

  it("with nothing open it still has the transfer and the withdrawal", () => {
    const rows = bankRows(bankSampleCsv([], "2026-10-16"));
    expect(readBankLines(rows, guessMapping(rows)!).lines).toHaveLength(2);
  });
});
