import { describe, expect, it } from "vitest";
import { agingCsv } from "./aging-csv";

const row = (clientName: string) => ({ clientName, buckets: { current: 100, d1_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0 }, totalCents: 100, daysToPay: { averageDays: 3 } });

describe("the aging as CSV", () => {
  it("review 6: a name a spreadsheet would run as a formula is kept as text, quoted or not", () => {
    const csv = agingCsv({ clients: [row('=HYPERLINK("http://x","Click"),'), row("\tcmd"), row("-2+3"), row("Plain, Inc.")], totals: { current: 400, d1_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0 }, totalCents: 400 });
    expect(csv.split("\r\n")).toEqual([
      "Client,Current,1-30,31-60,61-90,91+,Total,Days to pay",
      `"'=HYPERLINK(""http://x"",""Click""),",1.00,0.00,0.00,0.00,0.00,1.00,3`,
      "'\tcmd,1.00,0.00,0.00,0.00,0.00,1.00,3",
      "'-2+3,1.00,0.00,0.00,0.00,0.00,1.00,3",
      '"Plain, Inc.",1.00,0.00,0.00,0.00,0.00,1.00,3',
      "Total,4.00,0.00,0.00,0.00,0.00,4.00,",
      "",
    ]);
  });
});
