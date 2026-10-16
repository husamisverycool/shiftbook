/**
 * Social Security numbers at rest (slice k, decision K5; SPEC §17, §21): envelope encryption. Each
 * SSN gets its own random 256-bit data key (AES-256-GCM, bound to the worker); the data key is
 * wrapped with the key-encryption key from outside the database (src/server/auth/crypto.ts,
 * `appKey()`), bound to the worker too. Only the last four digits are kept in clear. A keyed index
 * (HMAC-SHA256 under a key derived from the key-encryption key, per agency) finds a duplicate without
 * storing anything that reveals the number.
 *
 * Validation follows the SSA's never-issued numbers: area 000 and 666, group 00, serial 0000. Area
 * 900–999 is accepted: it holds ITINs and every test number (CLAUDE.md: test SSNs are 9xx).
 */
import { createHmac, hkdfSync, randomBytes } from "node:crypto";
import { seal, unseal, type Sealed } from "../auth/crypto";

export type SsnProblem = "format" | "area" | "group" | "serial";

/** The nine digits, written with dashes, spaces or neither (900-12-3456, 900 12 3456, 900123456); anything else is null. */
export function readSsn(text: string): string | null {
  const m = /^\s*(\d{3})[-\s]?(\d{2})[-\s]?(\d{4})\s*$/.exec(text);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

export function ssnProblem(text: string): SsnProblem | null {
  const digits = readSsn(text);
  if (!digits) return "format";
  if (digits.startsWith("000") || digits.startsWith("666")) return "area";
  if (digits.slice(3, 5) === "00") return "group";
  if (digits.slice(5) === "0000") return "serial";
  return null;
}

export const last4Of = (digits: string) => digits.slice(-4);

/** What is stored: the SSN sealed with its data key, and the data key sealed with the key-encryption key. */
export interface SealedSsn extends Sealed {
  key: Sealed;
}

export function sealSsn(digits: string, kek: Buffer, workerId: string): SealedSsn {
  const dataKey = randomBytes(32);
  try {
    return { ...seal(Buffer.from(digits, "utf8"), dataKey, `ssn:${workerId}`), key: seal(dataKey, kek, `ssn-key:${workerId}`) };
  } finally {
    dataKey.fill(0);
  }
}

export function unsealSsn(sealed: SealedSsn, kek: Buffer, workerId: string): string {
  const dataKey = unseal(sealed.key, kek, `ssn-key:${workerId}`);
  try {
    return unseal(sealed, dataKey, `ssn:${workerId}`).toString("utf8");
  } finally {
    dataKey.fill(0);
  }
}

/** The duplicate finder: the same SSN in the same agency gives the same value; nothing else does. */
export function ssnIndex(digits: string, kek: Buffer, agencyId: string): string {
  const indexKey = Buffer.from(hkdfSync("sha256", kek, "shiftbook ssn index", agencyId, 32));
  return createHmac("sha256", indexKey).update(digits, "utf8").digest("hex");
}
