import { describe, expect, it } from "vitest";
import { parseHours, parseMonth } from "./aca-service";

describe("reading an ACA hours file (second opinion: spreadsheets write months and hours their own ways)", () => {
  it("months as a spreadsheet writes them, as the month's first day", () => {
    for (const v of ["2025-10", "2025-10-01", "10/2025", "10/1/2025", "10/01/2025", "Oct-25", "Oct 2025", "October 2025", "oct-2025", "Sept 2025"]) {
      expect([v, parseMonth(v)]).toEqual([v, v.startsWith("Sept") ? "2025-09-01" : "2025-10-01"]);
    }
    expect(parseMonth("2025-9")).toBe("2025-09-01");
    for (const v of ["2025-13", "2025-10-15", "10/15/2025", "Octo 2025", "", "2025"]) expect([v, parseMonth(v)]).toEqual([v, null]);
  });

  it("hours whole, h:mm, with thousands commas, or a decimal that makes whole minutes", () => {
    expect([parseHours("140"), parseHours("121:30"), parseHours("1,200"), parseHours("162.5"), parseHours("162.25"), parseHours("0")]).toEqual([8400, 7290, 72_000, 9750, 9735, 0]);
    // 0.33 hours is 19.8 minutes: not a whole minute.
    expect([parseHours("162.33"), parseHours("1:75"), parseHours("lots"), parseHours("-4")]).toEqual([null, null, null, null]);
  });
});
