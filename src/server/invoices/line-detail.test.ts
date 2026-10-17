import { describe, expect, it } from "vitest";
import { lineDetailEnglish, lineDetailParts } from "./line-detail";

const line = (type: string, workweekStart = "2026-10-05", poNumber: string | null = null) => ({ type, workweekStart, poNumber });

describe("an invoice line's detail, read back from the line as issued", () => {
  it("reads the kind of pay and the week", () => {
    expect(lineDetailParts("Regular · week of October 5, 2026", line("REG"))).toEqual({ type: "REG", notBillable: false, week: "2026-10-05", po: null, wasNow: null });
    expect(lineDetailParts("Overtime · week of October 5, 2026", line("OT"))).toMatchObject({ type: "OT" });
  });

  it("reads overtime the client is not billed for, the line's PO and a correction's hours", () => {
    expect(lineDetailParts("Overtime (not billable) · week of October 5, 2026 · PO PO-48213", line("OT", "2026-10-05", "PO-48213"))).toEqual({
      type: "OT",
      notBillable: true,
      week: "2026-10-05",
      po: { po: "PO-48213" },
      wasNow: null,
    });
    expect(lineDetailParts("Regular · week of October 5, 2026 · no PO", line("REG"))).toMatchObject({ po: "none" });
    expect(lineDetailParts("Regular · week of October 5, 2026 · was 8:00 h, now 6:30 h", line("REG"))).toMatchObject({ wasNow: { was: "8:00", now: "6:30" } });
  });

  it("gives nothing when the parts do not say exactly what was printed", () => {
    expect(lineDetailParts("Regular · week of October 12, 2026", line("REG"))).toBeNull();
    expect(lineDetailParts("Overtime · week of October 5, 2026", line("REG"))).toBeNull();
    expect(lineDetailParts("Regular · week of October 5, 2026 · PO PO-1", line("REG", "2026-10-05", "PO-2"))).toBeNull();
    expect(lineDetailParts("Regular · week of October 5, 2026 · something else", line("REG"))).toBeNull();
    expect(lineDetailParts("Regular", line("REG"))).toBeNull();
    expect(lineDetailParts("Regular · week of October 5, 2026", line("NOT_A_TYPE"))).toBeNull();
  });

  it("says in English exactly the detail it was read from", () => {
    for (const printed of ["Regular · week of October 5, 2026", "Overtime (not billable) · week of October 5, 2026 · no PO · was 8:00 h, now 6:30 h"]) {
      expect(lineDetailEnglish(lineDetailParts(printed, line(printed.startsWith("Regular") ? "REG" : "OT"))!)).toBe(printed);
    }
  });
});
