import { describe, expect, it } from "vitest";
import { readPayrollSample } from "./samples";

describe("reading a sample of the payroll system's import file", () => {
  it("Paychex: finds the client id and the pay components, with or without the header row", () => {
    const rows = ["ZX123456,1001,,,Hourly,18.0000,,40.00,,10/11/2026,,,,,,", "ZX123456,1001,,,Overtime,27.0000,,2.00,,10/11/2026,,,,,,", "ZX123456,1002,,,Hourly,17.5000,,38.00,,10/11/2026,,,,,,"];
    const header = "Client ID,Worker ID,Org,Job Number,Pay Component,Rate,Rate Number,Hours,Units,Line Date,Amount,Check Seq Number,Override State,Override Local,Override Local Jurisdiction,Labor Assignment";
    for (const text of [rows.join("\n"), [header, ...rows].join("\r\n")]) {
      expect(readPayrollSample("paychex_flex_csv", text)).toEqual({ layoutMatches: true, clientId: "ZX123456", codes: ["Hourly", "Overtime"], rows: 3, problems: [] });
    }
  });

  it("Paylocity: finds the detCodes and checks the seven columns' order", () => {
    expect(readPayrollSample("paylocity_time_csv", "Id,Det,detCode,Hours,Amount,Rate,rateCode\n2001,E,REG,40,,,\n2001,E,OT,3,,,OT\n2002,E,BON,,50.00,,")).toEqual({ layoutMatches: true, clientId: null, codes: ["REG", "OT", "BON"], rows: 3, problems: [] });
    const swapped = readPayrollSample("paylocity_time_csv", "Det,Id,detCode,Hours,Amount,Rate,rateCode\nE,2001,REG,40,,,");
    expect(swapped.problems[0]).toMatch(/not in the order Paylocity reads them/);
  });

  it("says when a file is empty or holds two client ids", () => {
    expect(readPayrollSample("paychex_flex_csv", "").problems).toEqual(["The file is empty."]);
    expect(readPayrollSample("paychex_flex_csv", "AA111111,1,,,Hourly,1,,1,,10/11/2026,,,,,,\nBB222222,2,,,Hourly,1,,1,,10/11/2026,,,,,,").problems).toEqual(["The file holds more than one client id; Granite writes one."]);
  });
});
