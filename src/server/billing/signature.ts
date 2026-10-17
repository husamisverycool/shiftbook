/**
 * Stripe's webhook signature, checked by hand (decision 0036; docs.stripe.com/webhooks, "Verify
 * webhook signatures manually"): the `Stripe-Signature` header carries `t=<unix seconds>` and one or
 * more `v1=<hex>` signatures; each is HMAC-SHA256 of `<t>.<raw body>` under the endpoint's signing
 * secret. Only `v1` counts (anything else could be a downgrade), the comparison is constant-time, and
 * the time must be within five minutes of ours (a replay is refused). Pure: no I/O, nothing logged.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Stripe's libraries' default tolerance: five minutes either way. */
export const TOLERANCE_SECONDS = 300;

export type SignatureCheck = { ok: true; timestamp: number } | { ok: false; reason: "missing_secret" | "missing_header" | "malformed" | "mismatch" | "too_old" };

const bytesOf = (body: string | Uint8Array) => (typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body));

function expected(body: string | Uint8Array, secret: string, timestamp: number): Buffer {
  return createHmac("sha256", secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), bytesOf(body)]))
    .digest();
}

/** The raw body exactly as received (never re-serialized JSON), the header, the secret, and now in seconds. */
export function verifyStripeSignature(body: string | Uint8Array, header: string | null | undefined, secret: string | null | undefined, nowSeconds: number, tolerance = TOLERANCE_SECONDS): SignatureCheck {
  if (!(tolerance > 0)) throw new Error("A webhook tolerance must be more than zero seconds (zero would turn the recency check off).");
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (!header) return { ok: false, reason: "missing_header" };
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const at = part.indexOf("=");
    if (at <= 0) continue;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key === "t") timestamp = /^\d{1,12}$/.test(value) ? Number(value) : Number.NaN;
    else if (key === "v1") signatures.push(value);
  }
  if (timestamp === null || Number.isNaN(timestamp) || signatures.length === 0) return { ok: false, reason: "malformed" };
  const want = expected(body, secret, timestamp);
  const matches = signatures.some((candidate) => {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) return false;
    const given = Buffer.from(candidate, "hex");
    return given.length === want.length && timingSafeEqual(given, want);
  });
  if (!matches) return { ok: false, reason: "mismatch" };
  if (Math.abs(nowSeconds - timestamp) > tolerance) return { ok: false, reason: "too_old" };
  return { ok: true, timestamp };
}

/** The header Stripe would send for this body at this time (for tests and local tools). */
export function stripeSignatureHeader(body: string | Uint8Array, secret: string, timestamp: number): string {
  return `t=${timestamp},v1=${expected(body, secret, timestamp).toString("hex")}`;
}
