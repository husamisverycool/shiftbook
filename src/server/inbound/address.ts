/**
 * The agency's forwarding address (decision 0042): timesheets+<token>@<inbound domain>. The token is 20
 * base32 letters (100 random bits), so the address cannot be guessed; it names the agency, and a new
 * one ends the old (Expensify's and Ramp's single receipts address, made per agency).
 */
import { randomBytes } from "node:crypto";

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

export function newInboundToken(): string {
  const bytes = randomBytes(13);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < 20) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

export const addressOf = (token: string, domain: string) => `timesheets+${token}@${domain}`;

/** The address in "Name <a@b>" or "a@b", lower-cased; null when there is none. */
export function emailOf(value: string): string | null {
  const inner = /<([^<>\s]+)>/.exec(value)?.[1] ?? value.trim();
  return /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(inner) ? inner.toLowerCase() : null;
}

/** The token of the first recipient at the inbound domain written as the agency's address. */
export function tokenFromRecipients(recipients: string[], domain: string): string | null {
  const at = `@${domain.toLowerCase()}`;
  for (const r of recipients) {
    const email = emailOf(r);
    if (!email?.endsWith(at)) continue;
    const m = /^timesheets\+([a-z2-7]{20})@/.exec(email);
    if (m) return m[1]!;
  }
  return null;
}
