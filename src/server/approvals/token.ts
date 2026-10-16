/**
 * Client approval link tokens (decision 0013): `sbap_` + 32 random bytes in base64url. Only the
 * SHA-256 is stored; the prefix lets every log and stored text hide a token reliably.
 */
import { createHash, randomBytes } from "node:crypto";

const TOKEN = /^sbap_[A-Za-z0-9_-]{43}$/;
const ANY_TOKEN = /sbap_[A-Za-z0-9_-]{20,}/g;

/** What stands in for a link wherever a text is kept or shown to the agency. */
export const HIDDEN_LINK = "[approval link hidden]";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function newApprovalToken(): { token: string; hash: string } {
  const token = `sbap_${randomBytes(32).toString("base64url")}`;
  return { token, hash: sha256(token) };
}

/** The stored hash for a token from a URL, or null when it is not a well-formed token. */
export function hashApprovalToken(token: string): string | null {
  return TOKEN.test(token) ? sha256(token) : null;
}

export function redactApprovalLinks(text: string): string {
  return text.replace(ANY_TOKEN, HIDDEN_LINK);
}
