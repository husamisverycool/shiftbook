import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { stripeSignatureHeader, TOLERANCE_SECONDS, verifyStripeSignature } from "./signature";

/** Obviously fake (decision 0036): never a real secret in the code. */
const SECRET = "whsec_test_not_real";
const BODY = '{"id":"evt_test1","type":"customer.subscription.updated","data":{"object":{"id":"sub_test1","customer":"cus_test1"}}}';
const T = 1_792_200_000;
/** Stripe's scheme by hand: HMAC-SHA256 of "<t>.<raw body>" under the endpoint's secret, in hex. */
const sign = (body: string, secret = SECRET, t = T) => createHmac("sha256", secret).update(`${t}.${body}`, "utf8").digest("hex");

describe("Stripe's webhook signature (docs.stripe.com/webhooks, verify manually)", () => {
  it("accepts the v1 signature of the raw body at the stated time", () => {
    expect(verifyStripeSignature(BODY, `t=${T},v1=${sign(BODY)}`, SECRET, T)).toEqual({ ok: true, timestamp: T });
    // Within five minutes either way (clocks drift).
    expect(verifyStripeSignature(BODY, `t=${T},v1=${sign(BODY)}`, SECRET, T + TOLERANCE_SECONDS).ok).toBe(true);
    expect(verifyStripeSignature(BODY, `t=${T},v1=${sign(BODY)}`, SECRET, T - TOLERANCE_SECONDS).ok).toBe(true);
  });

  it("accepts the same body as bytes", () => {
    expect(verifyStripeSignature(Buffer.from(BODY, "utf8"), `t=${T},v1=${sign(BODY)}`, SECRET, T).ok).toBe(true);
  });

  it("matches the header the test helper writes (the one the integration tests send)", () => {
    expect(stripeSignatureHeader(BODY, SECRET, T)).toBe(`t=${T},v1=${sign(BODY)}`);
  });

  it("accepts any one of several v1 signatures (a secret being rolled) and ignores other schemes (v0)", () => {
    const header = `t=${T},v1=${sign(BODY, "whsec_old_not_real")},v1=${sign(BODY)},v0=${"0".repeat(64)}`;
    expect(verifyStripeSignature(BODY, header, SECRET, T).ok).toBe(true);
  });

  it("refuses a body changed by one character, re-serialized JSON, or another secret", () => {
    const header = `t=${T},v1=${sign(BODY)}`;
    expect(verifyStripeSignature(BODY.replace("sub_test1", "sub_test2"), header, SECRET, T)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyStripeSignature(JSON.stringify(JSON.parse(BODY), null, 2), header, SECRET, T)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyStripeSignature(BODY, header, "whsec_other_not_real", T)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("refuses a signature over another time (the timestamp is part of what is signed)", () => {
    expect(verifyStripeSignature(BODY, `t=${T + 1},v1=${sign(BODY)}`, SECRET, T)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("refuses a replay older (or newer) than five minutes", () => {
    expect(verifyStripeSignature(BODY, `t=${T},v1=${sign(BODY)}`, SECRET, T + TOLERANCE_SECONDS + 1)).toEqual({ ok: false, reason: "too_old" });
    expect(verifyStripeSignature(BODY, `t=${T},v1=${sign(BODY)}`, SECRET, T - TOLERANCE_SECONDS - 1)).toEqual({ ok: false, reason: "too_old" });
  });

  it("refuses a missing or malformed header, and only v0 (a downgrade)", () => {
    expect(verifyStripeSignature(BODY, null, SECRET, T)).toEqual({ ok: false, reason: "missing_header" });
    expect(verifyStripeSignature(BODY, "", SECRET, T)).toEqual({ ok: false, reason: "missing_header" });
    expect(verifyStripeSignature(BODY, `v1=${sign(BODY)}`, SECRET, T)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyStripeSignature(BODY, `t=${T}`, SECRET, T)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyStripeSignature(BODY, `t=abc,v1=${sign(BODY)}`, SECRET, T)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyStripeSignature(BODY, `t=${T},v0=${sign(BODY)}`, SECRET, T)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyStripeSignature(BODY, `t=${T},v1=not-hex`, SECRET, T)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyStripeSignature(BODY, `t=${T},v1=${sign(BODY).slice(0, 63)}`, SECRET, T)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("refuses everything when no secret is set (never an open door)", () => {
    expect(verifyStripeSignature(BODY, `t=${T},v1=${sign(BODY, "")}`, "", T)).toEqual({ ok: false, reason: "missing_secret" });
    expect(verifyStripeSignature(BODY, `t=${T},v1=${sign(BODY)}`, undefined, T)).toEqual({ ok: false, reason: "missing_secret" });
  });

  it("never allows a tolerance of zero or less (Stripe: zero turns the recency check off)", () => {
    expect(() => verifyStripeSignature(BODY, `t=${T},v1=${sign(BODY)}`, SECRET, T, 0)).toThrow();
  });
});
