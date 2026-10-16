/**
 * Decision 0030: the engine's messages as keys say exactly the English record, for every answer key
 * (approved and proposed) and for every case of the engine's own tests (engine.say.test.ts runs them
 * again through a checking computePay).
 */
import { describe, expect, it } from "vitest";
import { loadRuleCases } from "../../../tests/golden-runners/shared";
import { computePay } from "./engine";
import { english, ENGINE_EN, fill, placeholders, type Say } from "./say";
import { sayProblems } from "./say-check";

const cases = [...loadRuleCases("tests/goldens/rules"), ...loadRuleCases("tests/goldens/_proposed/rules")];

describe("the engine's messages as keys (decision 0030)", () => {
  it("has the answer keys to check against", () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  for (const c of cases) {
    it(`${c.name}: every say says its English record, with known keys`, () => {
      const r = computePay(c.input);
      expect(sayProblems(r)).toEqual([]);
      expect(r.payLines.length + r.billLines.length + r.blockers.length + r.warnings.length).toBeGreaterThan(0);
    });
  }

  it("templates use plain {name} placeholders only: no other braces, no apostrophe before a brace, no ICU syntax", () => {
    for (const [key, template] of Object.entries(ENGINE_EN)) {
      const rest = template.replace(/\{\w+\}/g, "");
      expect(rest, key).not.toMatch(/[{}]/);
      expect(template, key).not.toMatch(/'\{|'\}|''/);
    }
  });

  it("renders values: text as it is, dates as ISO, lengths of time as the record writes them, fragments nested", () => {
    const say: Say = [
      { key: "dayOver24", values: { name: "Ana Ruiz", date: { date: "2026-10-05" }, duration: { duration: 1500 } } },
      { key: "gap" },
      { key: "verbatim", values: { text: "{not a placeholder}" } },
      { key: "ruleDataProblem", values: { problem: { say: [{ key: "problemEndsBeforeStarts" }] } } },
    ];
    expect(english(say)).toBe("Ana Ruiz on 2026-10-05: 25h 00m recorded in one day, more than 24 hours. {not a placeholder}Rule data problem — it ends before it starts. Nothing is computed until the rule data is fixed.");
  });

  it("a missing value is a bug, never a silent blank", () => {
    expect(() => fill(ENGINE_EN.dayOver24, { name: "x" }, "dayOver24")).toThrow(/dayOver24 needs a value for \{date\}/);
    expect(placeholders(ENGINE_EN.holidayPolicyConflict)).toEqual(["name", "date", "date"]);
  });
});
