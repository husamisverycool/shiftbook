/**
 * Client portal link tokens (slice v; decision 0013's rules): `sbcp_` + 32 random bytes in base64url.
 * Only the SHA-256 is stored; the prefix lets every log and stored text hide a token reliably
 * (redactApprovalLinks hides both kinds).
 */
import { createHash, randomBytes } from "node:crypto";

const TOKEN = /^sbcp_[A-Za-z0-9_-]{43}$/;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function newPortalToken(): { token: string; hash: string } {
  const token = `sbcp_${randomBytes(32).toString("base64url")}`;
  return { token, hash: sha256(token) };
}

/** The stored hash for a token from a URL, or null when it is not a well-formed token. */
export function hashPortalToken(token: string): string | null {
  return TOKEN.test(token) ? sha256(token) : null;
}
