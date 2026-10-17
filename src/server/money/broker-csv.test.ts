import { describe, expect, it } from "vitest";
import { brokerCsv } from "./broker-csv";

const figures = { minutes: 2640, straightCents: 80300, otPremiumCents: 3650, dtPremiumCents: 0, otherCents: 0, totalCents: 83950 };

describe("broker CSV", () => {
  it("writes one row per state and class and the total, money from cents", () => {
    // 44 h at $18.25: straight time 44 × $18.25 = $803.00, the overtime premium 4 × $9.125 = $36.50.
    const csv = brokerCsv({ classes: [{ state: "IL", classCode: "3632", description: "Machine shop", ...figures }], totals: figures } as never);
    expect(csv).toBe(
      ["State,Class,Description,Hours,Straight time,Overtime premium,Double-time premium,Other pay,Total pay", "IL,3632,Machine shop,44:00,803.00,36.50,0.00,0.00,839.50", "Total,,,44:00,803.00,36.50,0.00,0.00,839.50", ""].join("\r\n"),
    );
  });

  it("keeps a description a spreadsheet would run as text", () => {
    const csv = brokerCsv({ classes: [{ state: "IL", classCode: "8810", description: "=HYPERLINK(1)", ...figures }], totals: figures } as never);
    expect(csv.split("\r\n")[1]).toContain(`'=HYPERLINK(1)`);
  });
});
