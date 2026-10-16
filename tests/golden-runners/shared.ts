import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { computePay, type PayInput, type PayResult } from "@shiftbook/rules";
import { expect } from "vitest";

export interface RuleCase {
  name: string;
  summary: string;
  input: PayInput;
  expected: PayResult;
}

export function loadRuleCases(dir: string): RuleCase[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as RuleCase);
}

/**
 * Every `say` removed (decision 0030): the message keys beside each English message and explain string,
 * for the reader's language. The English is the record the answer key checks; the unit tests in
 * packages/rules/src/say.test.ts prove for every case that each say says exactly its English.
 */
export function withoutSay(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(withoutSay);
  if (x === null || typeof x !== "object") return x;
  return Object.fromEntries(Object.entries(x).filter(([k]) => k !== "say").map(([k, v]) => [k, withoutSay(v)]));
}

/** The engine must reproduce the answer key exactly: every line, amount, rule id and explain string. */
export function checkRuleCase(c: RuleCase): void {
  const { payLines, billLines, blockers, warnings, obligations, ...rest } = computePay(c.input);
  expect({ ...rest, payLines: withoutSay(payLines), billLines: withoutSay(billLines), blockers: withoutSay(blockers), warnings: withoutSay(warnings), obligations: withoutSay(obligations) }).toEqual(c.expected);
}
