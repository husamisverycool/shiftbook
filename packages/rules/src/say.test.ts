/**
 * Decision 0030: the engine's messages as keys say exactly the English record, for every answer key
 * (approved and proposed) and for every case of the engine's own tests (engine.say.test.ts runs them
 * again through a checking computePay).
 */
import { describe, expect, it } from "vitest";
import { loadRuleCases } from "../../../tests/golden-runners/shared";
import { computePay } from "./engine";
import { english, ENGINE_EN, fill, keysOf, placeholders, type Say } from "./say";
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

  it("a value that is not text, a date, a length of time or a { say: [...] } fragment is written as a template literal writes it", () => {
    // An input field holding a list or an object (a citation, a scope's, a worker's or a client's name) is
    // said as `${value}` said it before decision 0030; it is never taken for a fragment and never thrown on.
    const text = (value: unknown) => english([{ key: "verbatim", values: { text: value as never } }]);
    expect(text(["x", "y"])).toBe("x,y");
    expect(text([])).toBe("");
    expect(text({})).toBe("[object Object]");
    expect(text({ say: "problemEndsBeforeStarts" })).toBe("[object Object]");
    expect(text([{ say: [{ key: "problemEndsBeforeStarts" }] }])).toBe("[object Object]");
    expect(text(null)).toBe("null");
    expect(text(7)).toBe("7");
    expect(text({ say: [{ key: "problemEndsBeforeStarts" }] })).toBe("it ends before it starts");
    expect(keysOf([{ key: "verbatim", values: { a: ["x"] as never, b: {} as never, c: null as never, d: { say: "x" } as never } }])).toEqual(["verbatim"]);
    expect(keysOf([{ key: "verbatim", values: { text: { say: [{ key: "problemEndsBeforeStarts" }] } } }])).toEqual(["verbatim", "problemEndsBeforeStarts"]);
  });

  it("a citation, a scope's name or a worker's or client's name given as a list or an object is said as before, not thrown on", () => {
    // Every answer key with each such field, on every row that has it, set to a list or an object.
    const FIELDS: Record<string, string[]> = { overtimeRules: ["citation"], premiumRules: ["citation"], guaranteeRules: ["citation"], jurisdictionRules: ["citation", "scopeName"], shifts: ["workerName", "clientName"] };
    let tried = 0;
    for (const c of cases) {
      for (const [table, fields] of Object.entries(FIELDS)) {
        const rows = ((c.input as unknown as Record<string, unknown[] | undefined>)[table] ?? []) as Record<string, unknown>[];
        for (const field of fields.filter((f) => rows.some((r) => Object.hasOwn(r, f)))) {
          for (const bad of [[], {}, ["x", "y"]]) {
            const input = { ...c.input, [table]: rows.map((r) => (Object.hasOwn(r, field) ? { ...r, [field]: bad } : r)) } as typeof c.input;
            const what = `${c.name} ${table}[].${field} = ${JSON.stringify(bad)}`;
            let r: ReturnType<typeof computePay> | undefined;
            expect(() => (r = computePay(input)), what).not.toThrow();
            expect(sayProblems(r!), what).toEqual([]);
            tried += 1;
          }
        }
      }
    }
    expect(tried).toBeGreaterThan(100);
    // Said as `${value}` says it: a California daily-overtime citation given as a list.
    const ca = cases.find((x) => x.name === "ca-daily-and-seventh-day")!;
    const listed = computePay({ ...ca.input, overtimeRules: ca.input.overtimeRules.map((r) => (r.jurisdiction === "CA" ? { ...r, citation: ["x", "y"] as never } : r)) });
    expect(listed.payLines.filter((l) => l.explain.includes("(x,y)")).length).toBeGreaterThan(0);
  }, 30_000);

  it("a missing value is a bug, never a silent blank", () => {
    expect(() => fill(ENGINE_EN.dayOver24, { name: "x" }, "dayOver24")).toThrow(/dayOver24 needs a value for \{date\}/);
    expect(placeholders(ENGINE_EN.holidayPolicyConflict)).toEqual(["name", "date", "date"]);
  });
});
