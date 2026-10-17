/**
 * Paychex Flex SPI and Paylocity time import (decision 0040). By hand, the run below:
 *   Álvarez (Paychex A123): REG 2400 min at $18.25 = $730.00; OT 37 min at $27.375 = $16.88 (Granite);
 *   a $150.00 bonus. Okafor (B456): REG 2280 min at $18.25 = $693.50. Granite gross $1,590.38.
 *   Written: 40.00 h, 0.62 h (37 min = 0.6166… h, rounded up), 38.00 h; the bonus as $150.00.
 *   The system pays 0.62 × 27.3750 = 16.9725 → $16.97 for the overtime row (+$0.09), the rest exact:
 *   $730.00 + $16.97 + $150.00 + $693.50 = $1,590.47 (+$0.09).
 */
import { describe, expect, it } from "vitest";
import { renderPaychexFlex } from "./paychex-flex";
import { renderPaylocity } from "./paylocity";
import { renderExport, type ExportFixture } from "./registry";
import { codeMapProblems, targetProblems, workerIdProblem } from "./targets";

const REG = { num: 1825, den: 1 };
const lines: ExportFixture["payLines"] = [
  { workerId: "w2", type: "REG", minutes: 2280, amountCents: 69_350, rate: REG, workweekStart: "2026-10-05" },
  { workerId: "w1", type: "REG", minutes: 2400, amountCents: 73_000, rate: REG, workweekStart: "2026-10-05" },
  { workerId: "w1", type: "OT", minutes: 37, amountCents: 1688, rate: { num: 5475, den: 2 }, workweekStart: "2026-10-05" },
  { workerId: "w1", type: "BONUS", minutes: 0, amountCents: 15_000, rate: { num: 15_000, den: 1 }, workweekStart: "2026-10-05" },
];
const workers = (system: "paychex" | "paylocity"): ExportFixture["workers"] => [
  { workerId: "w1", firstName: "Ana", lastName: "Álvarez", payrollIds: { [system]: { id: "A123" } } },
  { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: { [system]: { id: "B456" } } },
];
const codes = { REG: { code: "Hourly", as: "hours" as const }, OT: { code: "Overtime", as: "hours" as const }, BONUS: { code: "Bonus", as: "dollars" as const } };
const paychex = (over: Partial<ExportFixture> = {}): ExportFixture => ({
  format: "paychex_flex_csv",
  mappingVersion: "paychex-flex-spi-v1",
  period: { startsOn: "2026-10-05", endsOn: "2026-10-11" },
  earningCodeMap: {},
  target: { format: "paychex_flex_csv", clientId: "ABC12345" },
  codes,
  workers: workers("paychex"),
  payLines: lines,
  ...over,
});
const paylocity = (over: Partial<ExportFixture> = {}): ExportFixture => ({
  ...paychex(),
  format: "paylocity_time_csv",
  mappingVersion: "paylocity-timeimprt-v1",
  target: { format: "paylocity_time_csv" },
  codes: { REG: { code: "REG", as: "hours" }, OT: { code: "OT", as: "hours" }, BONUS: { code: "BON", as: "dollars" } },
  workers: workers("paylocity"),
  ...over,
});
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const TOTALS = { workers: 2, minutesByType: { REG: 4680, OT: 37 }, amountsByType: { BONUS: 15_000 }, grossCents: 159_038, payrollSystemGrossCents: 159_047, payrollSystemDifferenceCents: 9 };

describe("Paychex Flex Standard Payroll Import", () => {
  it("writes the sixteen columns in order: hours with their rate, dollars in Amount, never both", () => {
    const r = renderPaychexFlex(paychex());
    expect(r.filename).toBe("paychex-flex-2026-10-05-to-2026-10-11.csv");
    expect(text(r.bytes)).toBe(
      [
        "Client ID,Worker ID,Org,Job Number,Pay Component,Rate,Rate Number,Hours,Units,Line Date,Amount,Check Seq Number,Override State,Override Local,Override Local Jurisdiction,Labor Assignment",
        "ABC12345,A123,,,Hourly,18.2500,,40.00,,10/11/2026,,,,,,",
        "ABC12345,A123,,,Overtime,27.3750,,0.62,,10/11/2026,,,,,,",
        "ABC12345,A123,,,Bonus,,,,,10/11/2026,150.00,,,,,",
        "ABC12345,B456,,,Hourly,18.2500,,38.00,,10/11/2026,,,,,,",
        "",
      ].join("\r\n"),
    );
  });

  it("states what Paychex pays and reconciles to the run", () => {
    const r = renderExport(paychex());
    expect(r.controlTotals).toEqual(TOTALS);
    expect(r.notes).toEqual([
      "Álvarez, Ana — OT: 37 min written as 0.62 h (0.6166… h exactly, rounded up to the next hundredth so no worked time is lost). Paychex Flex pays 0.62 h × 27.3750 = $16.97; Granite computed $16.88 (+$0.09).",
    ]);
  });

  it("refuses a kind of pay with no pay component, naming the worker", () => {
    expect(() => renderPaychexFlex(paychex({ codes: { REG: codes.REG, BONUS: codes.BONUS } }))).toThrow(/Álvarez, Ana/);
  });

  it("checks the client id, the pay components and the worker ids", () => {
    expect(targetProblems({ format: "paychex_flex_csv", clientId: "ABC12345" })).toEqual([]);
    expect(targetProblems({ format: "paychex_flex_csv", clientId: "TOO-LONG-1" }).map((p) => p.rule)).toEqual(["paychex_client_id"]);
    expect(codeMapProblems("paychex_flex_csv", { REG: { code: "Hourly", as: "hours" } })).toEqual([]);
    expect(codeMapProblems("paychex_flex_csv", { REG: { code: "Hourly,1", as: "hours" } }).map((p) => p.rule)).toEqual(["code_form_paychex_flex_csv"]);
    expect(workerIdProblem("paychex", "A123")).toBeNull();
    expect(workerIdProblem("paychex", "912-34-5678")?.rule).toBe("no_ssn");
  });
});

describe("Paylocity time import (TimeImprt)", () => {
  it("writes Id, Det, detCode, Hours, Amount, Rate, rateCode with Det always E", () => {
    const r = renderPaylocity(paylocity());
    expect(r.filename).toBe("paylocity-time-import-2026-10-05-to-2026-10-11.csv");
    expect(text(r.bytes)).toBe(["Id,Det,detCode,Hours,Amount,Rate,rateCode", "A123,E,REG,40.00,,18.2500,", "A123,E,OT,0.62,,27.3750,", "A123,E,BON,,150.00,,", "B456,E,REG,38.00,,18.2500,", ""].join("\r\n"));
  });

  it("reconciles to the run and says what Paylocity pays", () => {
    const r = renderExport(paylocity());
    expect(r.controlTotals).toEqual(TOTALS);
    expect(r.notes[0]).toContain("Paylocity pays 0.62 h × 27.3750 = $16.97; Granite computed $16.88 (+$0.09).");
  });

  it("refuses a worker with no Paylocity id", () => {
    expect(() => renderPaylocity(paylocity({ workers: [workers("paylocity")[0]!, { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: {} }] }))).toThrow(/Okafor, Ben/);
  });
});
