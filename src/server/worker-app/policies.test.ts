/** Decision 0043: which policies a worker owes, by version (no version recorded counts as version 1). */
import { describe, expect, it } from "vitest";
import { acknowledgedVersion, policiesDue, type Policy } from "./policies";

const policy = (key: string, version: number, required = true): Policy => ({ key, version, titleEn: key, bodyEn: key, titleEs: null, bodyEs: null, required, effectiveFrom: "2026-10-01", builtIn: false });
const at = "2026-10-01T12:00:00.000Z";

describe("acknowledgedVersion", () => {
  it("is the version given, version 1 when none was recorded, and null when never acknowledged", () => {
    expect(acknowledgedVersion({ key: "safety", version: 3 })).toBe(3);
    expect(acknowledgedVersion({ key: "safety" })).toBe(1);
    expect(acknowledgedVersion(undefined)).toBeNull();
  });
});

describe("policiesDue", () => {
  const current = [policy("safety", 2), policy("harassment", 1), policy("parking", 4, false), policy("phones", 1)];

  it("owes a required policy changed since it was acknowledged, or never acknowledged; never an optional one", () => {
    const due = policiesDue(current, [
      { key: "safety", version: 1, at },
      { key: "harassment", at },
      { key: "timekeeping", version: 1, at },
    ]);
    expect(due.map((p) => p.key)).toEqual(["safety", "phones"]);
  });

  it("owes nothing once every required policy is acknowledged in its current version", () => {
    expect(policiesDue(current, [{ key: "safety", version: 2, at }, { key: "harassment", version: 1, at }, { key: "phones", version: 1, at }])).toEqual([]);
  });
});
