/**
 * Resend signs its webhooks the Svix way (docs/research/forwarding-email-slice-y.md §2): HMAC-SHA256,
 * keyed with the base64 part of the "whsec_" secret, over "<svix-id>.<svix-timestamp>.<raw body>";
 * the svix-signature header lists "v1,<base64>" signatures, space-separated. Compared in constant time;
 * a timestamp more than five minutes off is a replay; no secret, no entry (fails closed).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const TOLERANCE_SECONDS = 300;

export interface SignatureHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function verifyWebhook(secret: string | null | undefined, headers: SignatureHeaders, body: string, now: Date = new Date()): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  if (!/^\d{1,12}$/.test(headers.timestamp)) return false;
  const sent = Number(headers.timestamp);
  if (Math.abs(Math.floor(now.getTime() / 1000) - sent) > TOLERANCE_SECONDS) return false;
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = Buffer.from(encoded, "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${body}`).digest();
  let ok = false;
  for (const part of headers.signature.split(" ")) {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) continue;
    const given = Buffer.from(value, "base64");
    // Every listed signature is checked (no early exit), each in constant time.
    if (given.length === expected.length && timingSafeEqual(given, expected)) ok = true;
  }
  return ok;
}
