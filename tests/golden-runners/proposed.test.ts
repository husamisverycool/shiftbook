/** Proposed goldens waiting for the owner's "approve golden <name>". */
import { describe, expect, it } from "vitest";
import { checkExportCase, loadExportCases } from "./exports";
import { checkRuleCase, loadRuleCases } from "./shared";

const ruleCases = loadRuleCases("tests/goldens/_proposed/rules");
const exportCases = loadExportCases("tests/goldens/_proposed/exports");

describe("proposed goldens", () => {
  it("loads the proposals", () => {
    expect(Array.isArray(ruleCases) && Array.isArray(exportCases)).toBe(true);
  });

  for (const c of ruleCases) it(`rules/${c.name}`, () => checkRuleCase(c));
  for (const c of exportCases) it(`exports/${c.name}`, () => checkExportCase(c));
});
