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

/** The engine must reproduce the answer key exactly: every line, amount, rule id and explain string. */
export function checkRuleCase(c: RuleCase): void {
  expect(computePay(c.input)).toEqual(c.expected);
}
