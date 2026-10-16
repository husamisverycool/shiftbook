import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fileGrant, GRANT_SECONDS, grantHolds } from "./file-grant";

const kek = randomBytes(32);
const LINK = "6f1c2a8e-0b4d-4c55-9a3e-2d7b8c9e0f11";
const OWNER = "00000000-0000-4000-a000-000000000001";
const OTHER = "00000000-0000-4000-a000-000000000003";
const NOW = 1_792_100_000;

describe("a worker's file grant", () => {
  it("holds for the same link and person until it lapses", () => {
    const g = fileGrant(kek, LINK, OWNER, NOW);
    expect(g.expires).toBe(NOW + GRANT_SECONDS);
    expect(grantHolds(kek, LINK, OWNER, g.expires, g.signature, NOW + 30)).toBe(true);
    expect(grantHolds(kek, LINK, OWNER, g.expires, g.signature, NOW + GRANT_SECONDS + 1)).toBe(false);
  });

  it("refuses another person, another file, a changed time, another key or a forged signature", () => {
    const g = fileGrant(kek, LINK, OWNER, NOW);
    expect(grantHolds(kek, LINK, OTHER, g.expires, g.signature, NOW)).toBe(false);
    expect(grantHolds(kek, "6f1c2a8e-0b4d-4c55-9a3e-2d7b8c9e0f12", OWNER, g.expires, g.signature, NOW)).toBe(false);
    expect(grantHolds(kek, LINK, OWNER, g.expires + 600, g.signature, NOW)).toBe(false);
    expect(grantHolds(randomBytes(32), LINK, OWNER, g.expires, g.signature, NOW)).toBe(false);
    expect(grantHolds(kek, LINK, OWNER, g.expires, "x".repeat(g.signature.length), NOW)).toBe(false);
    // A time far ahead is refused even when signed: a grant never lasts longer than two minutes.
    const late = fileGrant(kek, LINK, OWNER, NOW + 3600);
    expect(grantHolds(kek, LINK, OWNER, late.expires, late.signature, NOW)).toBe(false);
  });
});
