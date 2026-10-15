import { afterAll, describe, expect, it } from "vitest";
import { jurisdictionRules, overtimeRules } from "../../src/server/db/schema";
import { REFERENCE_JURISDICTION_RULES, REFERENCE_OVERTIME_RULES } from "../../src/server/rules/reference-data";
import { openAppDb } from "./helpers";

const app = openAppDb();
afterAll(() => app.close());

describe("reference wage-rule data in the database matches src/server/rules/reference-data.ts", () => {
  it("overtime rules", async () => {
    const rows = await app.db.select().from(overtimeRules);
    const fromDb = rows.map((r) => ({
      jurisdiction: r.jurisdiction,
      ruleCode: r.ruleCode,
      kind: r.kind,
      thresholdMinutes: r.thresholdMinutes,
      multiplier: { num: r.multiplierNum, den: r.multiplierDen },
      earningType: r.earningType,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      citation: r.citation,
    }));
    const key = (r: { jurisdiction: string; ruleCode: string }) => `${r.jurisdiction}:${r.ruleCode}`;
    expect([...fromDb].sort((a, b) => key(a).localeCompare(key(b)))).toEqual(
      [...REFERENCE_OVERTIME_RULES].sort((a, b) => key(a).localeCompare(key(b))),
    );
  });

  it("jurisdiction rules", async () => {
    const rows = await app.db.select().from(jurisdictionRules);
    const fromDb = rows.map(({ jurisdiction, ruleCode, effectiveFrom, effectiveTo, citation }) => ({
      jurisdiction,
      ruleCode,
      effectiveFrom,
      effectiveTo,
      citation,
    }));
    const key = (r: { jurisdiction: string; ruleCode: string }) => `${r.jurisdiction}:${r.ruleCode}`;
    expect([...fromDb].sort((a, b) => key(a).localeCompare(key(b)))).toEqual(
      [...REFERENCE_JURISDICTION_RULES].sort((a, b) => key(a).localeCompare(key(b))),
    );
  });
});
