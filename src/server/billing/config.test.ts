import { describe, expect, it } from "vitest";
import { billingConfig, DEFAULT_TRIAL_DAYS, trialDaysFrom } from "./config";

describe("the billing settings (decision 0036; docs/hosting-settings.md)", () => {
  it("free days: a whole number from 0 to 730 (Stripe's own trial limit); unset or unreadable, the default 30 (decision 0049) — never a new agency paused for a missing setting", () => {
    expect(trialDaysFrom("14")).toBe(14);
    expect(trialDaysFrom(" 30 ")).toBe(30);
    expect(trialDaysFrom("0")).toBe(0);
    expect(DEFAULT_TRIAL_DAYS).toBe(30);
    expect(trialDaysFrom(undefined)).toBe(30);
    expect(trialDaysFrom("")).toBe(30);
    expect(trialDaysFrom("-3")).toBe(30);
    expect(trialDaysFrom("2.5")).toBe(30);
    expect(trialDaysFrom("fourteen")).toBe(30);
    expect(trialDaysFrom("731")).toBe(30);
  });

  it("reads the four settings, an empty one as missing", () => {
    expect(billingConfig({ STRIPE_SECRET_KEY: "sk_test_not_real", STRIPE_WEBHOOK_SECRET: "whsec_test_not_real", STRIPE_PRICE_ID: "price_test1", STRIPE_TRIAL_DAYS: "14" })).toEqual({ secretKey: "sk_test_not_real", webhookSecret: "whsec_test_not_real", priceId: "price_test1", trialDays: 14 });
    expect(billingConfig({ STRIPE_SECRET_KEY: "", STRIPE_PRICE_ID: " " })).toEqual({ secretKey: null, webhookSecret: null, priceId: null, trialDays: 30 });
  });
});
