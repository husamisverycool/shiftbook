import { describe, expect, it } from "vitest";
import { HIDDEN_LINK, redactApprovalLinks } from "../approvals/token";
import { hashPortalToken, newPortalToken } from "./token";

describe("portal link tokens", () => {
  it("are sbcp_ and 43 base64url characters; only well-formed ones hash", () => {
    const { token, hash } = newPortalToken();
    expect(token).toMatch(/^sbcp_[A-Za-z0-9_-]{43}$/);
    expect(hashPortalToken(token)).toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPortalToken(`${token}x`)).toBeNull();
    expect(hashPortalToken(token.replace("sbcp_", "sbap_"))).toBeNull();
  });

  it("are hidden in any kept text, as approval links are", () => {
    const { token } = newPortalToken();
    expect(redactApprovalLinks(`open https://app.example/en/portal/${token}/invoices`)).toBe(`open https://app.example/en/portal/${HIDDEN_LINK}/invoices`);
  });
});
