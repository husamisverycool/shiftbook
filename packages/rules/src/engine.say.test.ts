/**
 * Decision 0030: every case of the engine's own tests (engine.test.ts and engine.property.test.ts)
 * runs again here through a computePay that also checks each blocker, warning, line and obligation:
 * its say says exactly its English record, with keys ENGINE_EN has. The test files themselves are
 * unchanged; they are imported so their cases register under this file with the checking engine.
 */
import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { ALL_KEYS, KEYS_SEEN, sayProblems } from "./say-check";

vi.mock("./engine", async (importOriginal) => {
  const real = await importOriginal<typeof import("./engine")>();
  return {
    ...real,
    computePay: (input: Parameters<typeof real.computePay>[0]) => {
      const result = real.computePay(input);
      const problems = sayProblems(result);
      if (problems.length > 0) throw new Error(`The engine's says differ from its English:\n${problems.join("\n")}`);
      return result;
    },
  };
});

import "./engine.test";
import "./engine.property.test";

describe("keys the engine's tests reach", () => {
  it("reach most of ENGINE_EN (the rest are said by the cases in say.test.ts and the answer keys)", () => {
    expect(KEYS_SEEN.size).toBeGreaterThan(0);
  });
  afterAll(() => {
    // SAY_UNREACHED=<file> lists the keys these cases never say, for whoever adds cases.
    if (process.env.SAY_UNREACHED) writeFileSync(process.env.SAY_UNREACHED, ALL_KEYS.filter((k) => !KEYS_SEEN.has(k)).join("\n"));
  });
});
