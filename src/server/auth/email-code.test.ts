/**
 * Emailed sign-in codes (decision 0033): six digits, kept only as an HMAC under a key derived from the
 * app key and bound to the code's row, 10 minutes, once, five wrong tries end it.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { codeMatches, EMAIL_CODE_TRIES, EMAIL_CODE_TTL_MS, emailCodeKey, emailCodeState, hashEmailCode, hideEmailCode, newEmailCode } from "./email-code";

const key = emailCodeKey(randomBytes(32));
const NOW = new Date("2026-10-16T15:00:00Z");
const ROW = "8a5f2c1e-1111-4a2b-9c3d-000000000001";

describe("emailed sign-in codes", () => {
  it("are six digits, leading zeros kept, and vary", () => {
    const codes = Array.from({ length: 200 }, () => newEmailCode());
    expect(codes.every((c) => /^\d{6}$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(190);
  });

  it("are stored as an HMAC bound to the row and the key, never as the digits", () => {
    const h = hashEmailCode(key, ROW, "012345");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("012345");
    expect(hashEmailCode(key, ROW, "012345")).toBe(h);
    expect(hashEmailCode(key, "8a5f2c1e-1111-4a2b-9c3d-000000000002", "012345")).not.toBe(h);
    expect(hashEmailCode(emailCodeKey(randomBytes(32)), ROW, "012345")).not.toBe(h);
  });

  it("match only the same six digits (spaces ignored), in constant time", () => {
    const h = hashEmailCode(key, ROW, "012345");
    expect(codeMatches(key, ROW, h, "012345")).toBe(true);
    expect(codeMatches(key, ROW, h, " 012 345 ")).toBe(true);
    expect(codeMatches(key, ROW, h, "12345")).toBe(false);
    expect(codeMatches(key, ROW, h, "012346")).toBe(false);
    expect(codeMatches(key, ROW, h, "abcdef")).toBe(false);
  });

  it("last 10 minutes, work once, and end after five wrong tries", () => {
    const row = { createdAt: NOW, expiresAt: new Date(NOW.getTime() + EMAIL_CODE_TTL_MS), usedAt: null, failures: 0 };
    expect(EMAIL_CODE_TTL_MS).toBe(10 * 60 * 1000);
    expect(EMAIL_CODE_TRIES).toBe(5);
    expect(emailCodeState(row, NOW)).toBe("open");
    expect(emailCodeState(row, new Date(NOW.getTime() + EMAIL_CODE_TTL_MS))).toBe("expired");
    expect(emailCodeState({ ...row, usedAt: NOW }, NOW)).toBe("used");
    expect(emailCodeState({ ...row, failures: 4 }, NOW)).toBe("open");
    expect(emailCodeState({ ...row, failures: 5 }, NOW)).toBe("spent");
  });

  it("are hidden in the copy of the email Shiftbook keeps", () => {
    expect(hideEmailCode("Your code: 012345. It works once.", "012345")).toBe("Your code: [code hidden]. It works once.");
    expect(hideEmailCode("012345 is your code", "012345")).toBe("[code hidden] is your code");
  });
});
