import { describe, expect, it } from "vitest";
import { holdsSsn, idHoldsSsn } from "./ssn-text";

describe("SSN-shaped text", () => {
  it("finds nine digits shaped 3-2-4 with any separator, including Unicode dashes and full-width digits", () => {
    for (const t of ["912-34-5678", "912 34 5678", "912.34.5678", "912_34_5678", "912345678", "912–34–5678", "912−34−5678", "912‐34‐5678", "９１２-３４-５６７８", "912－34－5678"]) expect(holdsSsn(`see ${t} here`)).toBe(true);
  });

  it("leaves longer numbers and ids with letters alone", () => {
    expect(holdsSsn("1912345678")).toBe(false);
    expect(idHoldsSsn("EMP912345678")).toBe(false);
    expect(idHoldsSsn("912–34–5678")).toBe(true);
  });
});
