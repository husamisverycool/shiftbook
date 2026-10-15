import { describe, expect, it } from "vitest";
import { dateIn } from "./settings";

describe("today where the agency is", () => {
  it("follows the time zone across midnight and daylight-saving changes", () => {
    expect(dateIn("America/Chicago", new Date("2026-10-16T01:30:00Z"))).toBe("2026-10-15"); // 8:30 pm in Chicago
    expect(dateIn("America/Chicago", new Date("2026-10-16T05:30:00Z"))).toBe("2026-10-16");
    expect(dateIn("America/Chicago", new Date("2026-11-01T05:30:00Z"))).toBe("2026-11-01"); // daylight saving ends that night
    expect(dateIn("America/Chicago", new Date("2027-01-01T05:59:00Z"))).toBe("2026-12-31");
  });

  it("reads an unknown zone as UTC instead of failing", () => {
    expect(dateIn("Chicago", new Date("2026-10-16T01:30:00Z"))).toBe("2026-10-16");
    expect(dateIn(42, new Date("2026-10-16T01:30:00Z"))).toBe("2026-10-16");
  });
});
