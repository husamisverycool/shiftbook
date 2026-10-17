import { describe, expect, it } from "vitest";
import { checkoutTrialEnd, freeDaysEndingSoon, planView, standing, type BillingRow } from "./access";

const NOW = new Date("2026-10-17T12:00:00Z");
/** The configured monthly price (STRIPE_PRICE_ID): only a subscription to it counts as paying. */
const PRICE = "price_test1";
const day = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);
const row = (over: Partial<BillingRow> = {}): BillingRow => ({
  trialEndsAt: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  status: null,
  currentPeriodEnd: null,
  cancelAt: null,
  stripeTrialEnd: null,
  amountCents: null,
  currency: null,
  billingInterval: null,
  stripePriceId: PRICE,
  ...over,
});

describe("who may change things (decision 0036's access rule)", () => {
  it("the demo agency always may (it never pays and never calls Stripe)", () => {
    expect(standing({ demo: true, billing: null, now: NOW, priceId: PRICE })).toEqual({ changes: true, reason: "demo" });
    expect(standing({ demo: true, billing: row({ status: "canceled" }), now: NOW, priceId: PRICE })).toEqual({ changes: true, reason: "demo" });
  });

  it("a subscription Stripe calls active or trialing may", () => {
    expect(standing({ demo: false, billing: row({ status: "active" }), now: NOW, priceId: PRICE })).toEqual({ changes: true, reason: "subscribed" });
    expect(standing({ demo: false, billing: row({ status: "trialing" }), now: NOW, priceId: PRICE })).toEqual({ changes: true, reason: "subscribed" });
  });

  it("the agency's own free days allow changes until they end, to the second", () => {
    expect(standing({ demo: false, billing: row({ trialEndsAt: day(3) }), now: NOW, priceId: PRICE })).toEqual({ changes: true, reason: "free_days" });
    expect(standing({ demo: false, billing: row({ trialEndsAt: NOW }), now: NOW, priceId: PRICE })).toEqual({ changes: false, reason: "none" });
  });

  it("after the free days, anything else pauses changes, naming why", () => {
    for (const status of ["past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"] as const) {
      expect(standing({ demo: false, billing: row({ status, trialEndsAt: day(-1) }), now: NOW, priceId: PRICE })).toEqual({ changes: false, reason: status });
    }
    expect(standing({ demo: false, billing: row({ trialEndsAt: day(-1) }), now: NOW, priceId: PRICE })).toEqual({ changes: false, reason: "none" });
    // No billing row at all (an agency made outside sign-up and the script): no free days, no subscription.
    expect(standing({ demo: false, billing: null, now: NOW, priceId: PRICE })).toEqual({ changes: false, reason: "none" });
  });

  it("a failed payment during the free days does not pause them (the free days still run)", () => {
    expect(standing({ demo: false, billing: row({ status: "past_due", trialEndsAt: day(2) }), now: NOW, priceId: PRICE })).toEqual({ changes: true, reason: "free_days" });
  });
});

describe("the billing page's plan (Linear's plan information; Stripe's statuses)", () => {
  it("demo: active (demo), no charge, nothing to open", () => {
    expect(planView({ demo: true, billing: null, now: NOW, priceId: PRICE })).toEqual({ state: "demo", date: null, nextCharge: null, canStart: false, canManage: false, changes: true });
  });

  it("free days with no subscription: until when; Start subscription; no portal before Stripe knows the agency", () => {
    expect(planView({ demo: false, billing: row({ trialEndsAt: day(10) }), now: NOW, priceId: PRICE })).toEqual({ state: "free_days", date: day(10), nextCharge: null, canStart: true, canManage: false, changes: true });
  });

  it("no subscription and no free days left: Start subscription; changes paused", () => {
    expect(planView({ demo: false, billing: row({ trialEndsAt: day(-1), stripeCustomerId: "cus_test1" }), now: NOW, priceId: PRICE })).toEqual({ state: "none", date: null, nextCharge: null, canStart: true, canManage: true, changes: false });
  });

  it("active: renews at the period's end for the price (integer cents)", () => {
    const view = planView({ demo: false, billing: row({ status: "active", stripeCustomerId: "cus_test1", stripeSubscriptionId: "sub_test1", currentPeriodEnd: day(30), amountCents: 9900, currency: "usd", billingInterval: "month" }), now: NOW, priceId: PRICE });
    expect(view).toEqual({ state: "active", date: day(30), nextCharge: { amountCents: 9900, currency: "usd", on: day(30) }, canStart: false, canManage: true, changes: true });
  });

  it("trialing in Stripe: the first charge when Stripe's trial ends", () => {
    const view = planView({ demo: false, billing: row({ status: "trialing", stripeCustomerId: "cus_test1", stripeTrialEnd: day(5), currentPeriodEnd: day(5), amountCents: 9900, currency: "usd" }), now: NOW, priceId: PRICE });
    expect(view).toMatchObject({ state: "trialing", date: day(5), nextCharge: { amountCents: 9900, currency: "usd", on: day(5) }, canStart: false, canManage: true });
  });

  it("canceled at the period's end: ends on that date, no next charge, still allowed until then", () => {
    const view = planView({ demo: false, billing: row({ status: "active", stripeCustomerId: "cus_test1", currentPeriodEnd: day(12), cancelAt: day(12), amountCents: 9900, currency: "usd" }), now: NOW, priceId: PRICE });
    expect(view).toEqual({ state: "ending", date: day(12), nextCharge: null, canStart: false, canManage: true, changes: true });
  });

  it("past due and unpaid: no new subscription (the portal fixes the card); changes paused after the free days", () => {
    expect(planView({ demo: false, billing: row({ status: "past_due", stripeCustomerId: "cus_test1" }), now: NOW, priceId: PRICE })).toEqual({ state: "past_due", date: null, nextCharge: null, canStart: false, canManage: true, changes: false });
    expect(planView({ demo: false, billing: row({ status: "unpaid", stripeCustomerId: "cus_test1" }), now: NOW, priceId: PRICE })).toMatchObject({ state: "unpaid", canStart: false, canManage: true, changes: false });
    expect(planView({ demo: false, billing: row({ status: "paused", stripeCustomerId: "cus_test1" }), now: NOW, priceId: PRICE })).toMatchObject({ state: "paused", canStart: false, canManage: true, changes: false });
  });

  it("canceled or never completed: Start subscription again", () => {
    expect(planView({ demo: false, billing: row({ status: "canceled", stripeCustomerId: "cus_test1" }), now: NOW, priceId: PRICE })).toMatchObject({ state: "canceled", canStart: true, canManage: true, changes: false });
    expect(planView({ demo: false, billing: row({ status: "incomplete_expired", stripeCustomerId: "cus_test1" }), now: NOW, priceId: PRICE })).toMatchObject({ state: "canceled", canStart: true });
    expect(planView({ demo: false, billing: row({ status: "incomplete", stripeCustomerId: "cus_test1" }), now: NOW, priceId: PRICE })).toMatchObject({ state: "incomplete", canStart: true, canManage: true });
  });

  it("a price Stripe could not give as whole cents shows the date without an amount", () => {
    expect(planView({ demo: false, billing: row({ status: "active", stripeCustomerId: "cus_test1", currentPeriodEnd: day(30) }), now: NOW, priceId: PRICE }).nextCharge).toEqual({ amountCents: null, currency: null, on: day(30) });
  });
});

describe("Checkout during the free days (one trial per agency)", () => {
  it("carries the free days' end when at least 48 hours away (Stripe's minimum), in whole seconds", () => {
    expect(checkoutTrialEnd(row({ trialEndsAt: day(10) }), NOW)).toBe(Math.floor(day(10).getTime() / 1000));
    expect(checkoutTrialEnd(row({ trialEndsAt: new Date(NOW.getTime() + 48 * 3600 * 1000 + 1000) }), NOW)).not.toBeNull();
  });

  it("none when the free days are over, nearly over, or never were", () => {
    expect(checkoutTrialEnd(row({ trialEndsAt: day(1) }), NOW)).toBeNull();
    expect(checkoutTrialEnd(row({ trialEndsAt: day(-3) }), NOW)).toBeNull();
    expect(checkoutTrialEnd(row(), NOW)).toBeNull();
    expect(checkoutTrialEnd(null, NOW)).toBeNull();
  });
});

describe("the free days' last week (Home's banner for the Owner)", () => {
  it("names the end within 7 days; nothing earlier, after, when subscribed, or in the demo", () => {
    expect(freeDaysEndingSoon({ demo: false, billing: row({ trialEndsAt: day(7) }), now: NOW, priceId: PRICE })).toEqual(day(7));
    expect(freeDaysEndingSoon({ demo: false, billing: row({ trialEndsAt: day(8) }), now: NOW, priceId: PRICE })).toBeNull();
    expect(freeDaysEndingSoon({ demo: false, billing: row({ trialEndsAt: day(-1) }), now: NOW, priceId: PRICE })).toBeNull();
    expect(freeDaysEndingSoon({ demo: false, billing: row({ trialEndsAt: day(2), status: "trialing" }), now: NOW, priceId: PRICE })).toBeNull();
    expect(freeDaysEndingSoon({ demo: true, billing: row({ trialEndsAt: day(2) }), now: NOW, priceId: PRICE })).toBeNull();
  });
});

describe("only Granite's price counts as paying (security review: a cheaper or free plan in the same Stripe account)", () => {
  it("an active or trialing subscription to another price pauses changes, and the page says why", () => {
    expect(standing({ demo: false, billing: row({ status: "active", stripePriceId: "price_cheap" }), now: NOW, priceId: PRICE })).toEqual({ changes: false, reason: "other_plan" });
    expect(standing({ demo: false, billing: row({ status: "trialing", stripePriceId: null }), now: NOW, priceId: PRICE })).toEqual({ changes: false, reason: "other_plan" });
    expect(planView({ demo: false, billing: row({ status: "active", stripeCustomerId: "cus_test1", stripePriceId: "price_cheap", currentPeriodEnd: day(30) }), now: NOW, priceId: PRICE })).toEqual({ state: "other_plan", date: null, nextCharge: null, canStart: true, canManage: true, changes: false });
  });

  it("with no price configured, no subscription can be checked, so none counts", () => {
    expect(standing({ demo: false, billing: row({ status: "active" }), now: NOW, priceId: null })).toEqual({ changes: false, reason: "other_plan" });
  });

  it("the free days still run whatever the subscription", () => {
    expect(standing({ demo: false, billing: row({ status: "active", stripePriceId: "price_cheap", trialEndsAt: day(3) }), now: NOW, priceId: PRICE })).toEqual({ changes: true, reason: "free_days" });
  });
});
