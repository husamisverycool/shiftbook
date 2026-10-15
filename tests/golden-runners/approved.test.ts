/**
 * Approved goldens (read-only answer key; a hook blocks edits). `pnpm test:goldens` runs this file,
 * and Claude cannot end a turn while it fails.
 */
import { describe, expect, it } from "vitest";
import { checkExportCase, loadExportCases } from "./exports";
import { checkRuleCase, loadRuleCases } from "./shared";

const ruleCases = loadRuleCases("tests/goldens/rules");
const exportCases = loadExportCases("tests/goldens/exports");

describe("approved goldens", () => {
  it("loads the answer key", () => {
    expect(Array.isArray(ruleCases) && Array.isArray(exportCases)).toBe(true);
  });

  for (const c of ruleCases) it(`rules/${c.name}`, () => checkRuleCase(c));
  for (const c of exportCases) it(`exports/${c.name}`, () => checkExportCase(c));
});
