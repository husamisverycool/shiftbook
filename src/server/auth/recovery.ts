/**
 * Recovery codes (slice k, decision K1; GitHub's "Save your recovery codes"): ten one-time codes of
 * ten base32 characters (50 random bits each), shown once and stored only as SHA-256 digests. Making a
 * new set ends the old one.
 */
import { randomBytes } from "node:crypto";
import { base32Encode } from "./totp";
import { digest } from "./crypto";

export interface StoredCode {
  hash: string;
  usedAt: string | null;
}

export const RECOVERY_CODES = 10;

/** Codes like "ABCDE-FGHIJ", and what is stored. */
export function newRecoveryCodes(): { codes: string[]; stored: StoredCode[] } {
  const codes = Array.from({ length: RECOVERY_CODES }, () => {
    const text = base32Encode(randomBytes(7)).slice(0, 10);
    return `${text.slice(0, 5)}-${text.slice(5)}`;
  });
  return { codes, stored: codes.map((c) => ({ hash: digest(normalize(c)), usedAt: null })) };
}

const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z2-7]/g, "");

/** The stored codes with the given one marked used, or null when it matches no unused code. */
export function spendRecoveryCode(stored: StoredCode[], code: string, at: Date): StoredCode[] | null {
  const hash = digest(normalize(code));
  const i = stored.findIndex((c) => c.usedAt === null && c.hash === hash);
  if (i < 0) return null;
  return stored.map((c, j) => (j === i ? { ...c, usedAt: at.toISOString() } : c));
}

export const unusedCodes = (stored: StoredCode[]) => stored.filter((c) => c.usedAt === null).length;
