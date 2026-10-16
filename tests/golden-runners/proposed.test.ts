/** Proposed goldens waiting for the owner's "approve golden <name>". */
import { describe, expect, it } from "vitest";
import { checkExportCase, loadExportCases } from "./exports";
import { checkComplianceCase, loadComplianceCases } from "./compliance";
import { checkRuleCase, loadRuleCases } from "./shared";

const ruleCases = loadRuleCases("tests/goldens/_proposed/rules");
const exportCases = loadExportCases("tests/goldens/_proposed/exports");
const complianceCases = loadComplianceCases("tests/goldens/_proposed/compliance");

describe("proposed goldens", () => {
  it("loads the proposals", () => {
    expect(Array.isArray(ruleCases) && Array.isArray(exportCases) && Array.isArray(complianceCases)).toBe(true);
  });

  for (const c of ruleCases) it(`rules/${c.name}`, () => checkRuleCase(c));
  for (const c of exportCases) it(`exports/${c.name}`, () => checkExportCase(c));
  for (const c of complianceCases) it(`compliance/${c.name}`, () => checkComplianceCase(c));
});
