import { describe, expect, it } from "vitest";
import { activityQueryString, parseActivityFilters } from "./filters";

const TODAY = "2026-10-16";

describe("the activity log's filters", () => {
  it("defaults to the past three months, everyone, everything (GitHub's default)", () => {
    expect(parseActivityFilters({}, TODAY)).toEqual({ from: "2026-07-18", to: TODAY, person: null, type: null, action: null, record: null });
  });

  it("reads what the address carries, and drops what it cannot use", () => {
    const f = parseActivityFilters({ from: "2026-10-01", to: "2026-10-10", person: "Demo Owner (demo)", type: "worker", action: "ssn_viewed", record: "worker:6f1c2a8e-0b4d-4c55-9a3e-2d7b8c9e0f11" }, TODAY);
    expect(f).toEqual({ from: "2026-10-01", to: "2026-10-10", person: "Demo Owner (demo)", type: "worker", action: "ssn_viewed", record: { type: "worker", id: "6f1c2a8e-0b4d-4c55-9a3e-2d7b8c9e0f11" } });
    // Not dates, a range the wrong way round, unknown actions and types, a malformed record: the defaults.
    expect(parseActivityFilters({ from: "yesterday", to: "2026-13-40", action: "drop table", type: "Robert'); --", record: "worker:not-an-id" }, TODAY)).toEqual(parseActivityFilters({}, TODAY));
    expect(parseActivityFilters({ from: "2026-10-10", to: "2026-10-01" }, TODAY)).toMatchObject({ from: "2026-10-01", to: "2026-10-10" });
    expect(parseActivityFilters({ person: ["a", "b"] }, TODAY).person).toBe("a");
  });

  it("writes the filters back into an address, leaving the defaults out", () => {
    expect(activityQueryString(parseActivityFilters({}, TODAY), TODAY)).toBe("");
    expect(activityQueryString({ ...parseActivityFilters({}, TODAY), action: "ssn_viewed", record: { type: "worker", id: "6f1c2a8e-0b4d-4c55-9a3e-2d7b8c9e0f11" } }, TODAY)).toBe("action=ssn_viewed&record=worker%3A6f1c2a8e-0b4d-4c55-9a3e-2d7b8c9e0f11");
  });
});
