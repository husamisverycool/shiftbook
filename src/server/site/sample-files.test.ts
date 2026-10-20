import { describe, expect, it } from "vitest";
import { SITE_FILE_FORMATS, siteSampleFiles } from "./sample-files";

/**
 * The website's "where the week goes" tabs (slice aa) show the file each payroll system imports, made by
 * the real exporters from one sample week, so the page shows exactly what the app writes.
 */
describe("the website's sample payroll files", () => {
  const files = siteSampleFiles();

  it("makes one file per payroll system on the page", () => {
    expect(files.map((f) => f.format)).toEqual([...SITE_FILE_FORMATS]);
  });

  it("every file carries the same week: $2,279.88 by Tabulado's lines", () => {
    // 38h + 40h + 40h at $18.25, 4h and 37 min at $27.375 (each line rounded once): 69,350 + 73,000 + 10,950 + 73,000 + 1,688.
    for (const f of files) expect(f.controlTotals.grossCents).toBe(227988);
  });

  it("shows the file's own first lines and its own name", () => {
    for (const f of files) {
      expect(f.preview.length).toBeGreaterThan(1);
      expect(f.filename).toMatch(/\.(csv|txt|iif)$/i);
    }
  });

  it("says where a system's own rounding differs from Tabulado's, to the cent", () => {
    const gusto = files.find((f) => f.format === "gusto_hours_csv")!;
    const run = files.find((f) => f.format === "adp_run_csv")!;
    expect(run.controlTotals.payrollSystemDifferenceCents).toBe(9);
    expect(run.notes.join(" ")).toContain("0.62 h");
    expect(gusto.notes.length).toBeGreaterThan(0);
  });
});
