import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashApprovalToken, HIDDEN_LINK, newApprovalToken, redactApprovalLinks } from "./token";

describe("approval link tokens (decision 0013)", () => {
  it("are sbap_ plus 32 random bytes in base64url, and only their SHA-256 is kept", () => {
    const { token, hash } = newApprovalToken();
    expect(token).toMatch(/^sbap_[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hashApprovalToken(token)).toBe(hash);
  });

  it("are never the same twice", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newApprovalToken().token));
    expect(seen.size).toBe(200);
  });

  it("refuse anything that is not a well-formed token before touching the database", () => {
    for (const bad of ["", "sbap_", "sbap_short", "abcd_" + "A".repeat(43), "sbap_" + "A".repeat(42) + "!", "sbap_" + "A".repeat(44), " sbap_" + "A".repeat(43)]) {
      expect(hashApprovalToken(bad)).toBeNull();
    }
  });

  it("are hidden wherever a text could carry one (email log, error messages)", () => {
    const { token } = newApprovalToken();
    const text = `Open https://example.test/en/approve/${token} to review.\nOr ${token}.`;
    const hidden = redactApprovalLinks(text);
    expect(hidden).not.toContain(token);
    expect(hidden).toBe(`Open https://example.test/en/approve/${HIDDEN_LINK} to review.\nOr ${HIDDEN_LINK}.`);
  });
});
