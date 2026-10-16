/**
 * Emailed sign-in codes (decision 0033; Linear's and Vercel's emailed code): six digits from a
 * cryptographic source, stored only as an HMAC-SHA256 under a key derived from the app key and bound
 * to the code's row (a copy of the table alone cannot be searched for the million codes), 10
 * minutes, once; five wrong tries end it.
 */
import { createHmac, hkdfSync, randomInt, timingSafeEqual } from "node:crypto";

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CODE_TRIES = 5;
/** At most one code a minute per person (a held-down button, or someone flooding their inbox). */
export const EMAIL_CODE_RESEND_MS = 60 * 1000;
export const HIDDEN_EMAIL_CODE = "[code hidden]";

export const newEmailCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** The codes' own key, derived from the app key (never the app key itself). */
export const emailCodeKey = (appKey: Buffer): Buffer => Buffer.from(hkdfSync("sha256", appKey, "shiftbook", "email sign-in code", 32));

export const hashEmailCode = (key: Buffer, rowId: string, code: string): string => createHmac("sha256", key).update(`${rowId}|${code}`, "utf8").digest("hex");

/** The typed code (spaces ignored) against the stored HMAC, in constant time. */
export function codeMatches(key: Buffer, rowId: string, stored: string, typed: string): boolean {
  const digits = typed.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(digits)) return false;
  const a = Buffer.from(hashEmailCode(key, rowId, digits), "hex");
  const b = Buffer.from(stored, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type EmailCodeState = "open" | "expired" | "used" | "spent";
export function emailCodeState(row: { expiresAt: Date; usedAt: Date | null; failures: number }, now: Date): EmailCodeState {
  if (row.usedAt) return "used";
  if (row.failures >= EMAIL_CODE_TRIES) return "spent";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "open";
}

/** The kept copy of the email: the code replaced. */
export const hideEmailCode = (text: string, code: string): string => text.split(code).join(HIDDEN_EMAIL_CODE);
