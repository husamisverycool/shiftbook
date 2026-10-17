/**
 * Workers' mobile numbers (slice t): US numbers only (the North American Numbering Plan: the area code
 * and the exchange never start with 0 or 1), kept as E.164. Sign-in finds a number by a keyed digest
 * (HMAC-SHA256 under a key derived from the app key), the same across agencies — a number may belong
 * to a worker at more than one agency — so the sign-in tables never hold the number itself.
 */
import { createHmac, hkdfSync } from "node:crypto";

/** "(312) 555-0142", "312.555.0142", "+1 312 555 0142" → "+13125550142"; anything else is null. */
export function readPhone(text: string): string | null {
  if (typeof text !== "string") return null;
  const digits = text.replace(/[\s().\-+]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null;
  return `+1${national}`;
}

/** "+13125550142" → "(•••) •••-0142". */
export const maskPhone = (e164: string) => `(•••) •••-${e164.slice(-4)}`;

/** The sign-in index of a number: the same everywhere for one number, revealing nothing of it. */
export function phoneIndex(e164: string, kek: Buffer): string {
  const key = Buffer.from(hkdfSync("sha256", kek, "shiftbook", "worker phone index", 32));
  return createHmac("sha256", key).update(e164, "utf8").digest("hex");
}
