/**
 * Test helper (decision 0030): every blocker, warning, line and obligation of a result carries a say
 * that says, in English, exactly its stored message or explanation, using only keys ENGINE_EN has.
 * Not exported from the package: only the tests use it.
 */
import { english, ENGINE_EN, keysOf, type EngineKey, type Say } from "./say";
import type { PayResult } from "./types";

/** Keys seen across every result checked in this test run (to report which keys no case reaches). */
export const KEYS_SEEN = new Set<string>();

/** The problems found: each item whose say is missing, uses an unknown key, or says something else. */
export function sayProblems(r: PayResult): string[] {
  const problems: string[] = [];
  const check = (what: string, say: Say | undefined, record: string) => {
    if (!Array.isArray(say)) return problems.push(`${what}: no say for "${record}"`);
    const unknown = keysOf(say).filter((k) => !Object.hasOwn(ENGINE_EN, k));
    if (unknown.length > 0) return problems.push(`${what}: unknown keys ${unknown.join(", ")}`);
    for (const k of keysOf(say)) KEYS_SEEN.add(k);
    const said = english(say);
    if (said !== record) problems.push(`${what}: the say says\n  ${said}\nbut the record is\n  ${record}`);
  };
  for (const i of r.blockers) check(`blocker ${i.code}`, i.say, i.message);
  for (const i of r.warnings) check(`warning ${i.code}`, i.say, i.message);
  for (const l of r.payLines) check(`pay line ${l.type}`, l.say, l.explain);
  for (const l of r.billLines) check(`bill line ${l.type}`, l.say, l.explain);
  for (const o of r.obligations) check(`obligation ${o.kind}`, o.say, o.message);
  return problems;
}

export const ALL_KEYS = Object.keys(ENGINE_EN) as EngineKey[];
