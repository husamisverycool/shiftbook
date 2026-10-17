/**
 * Who may change things, and what the billing page says (decision 0036). Pure: the session, the
 * screens and the tests read the same rule.
 *
 * Changes are allowed for the demo agency, for a subscription Stripe calls `active` or `trialing` to
 * Granite's own price (STRIPE_PRICE_ID; a cheaper or free plan in the same Stripe account never counts —
 * security review), and during the agency's own free days. Anything else pauses changes — never reading,
 * never sign-in, never downloads, and nothing is deleted.
 */
import type { SubscriptionStatus } from "../db/schema";

export interface BillingRow {
  trialEndsAt: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus | null;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
  stripeTrialEnd: Date | null;
  amountCents: number | null;
  currency: string | null;
  billingInterval: "day" | "week" | "month" | "year" | null;
  /** The subscription's price (its item's), compared with the configured one. */
  stripePriceId: string | null;
}

/** What the rule needs: the demo flag, the billing row, now, and the price that counts (STRIPE_PRICE_ID). */
export interface StandingInput {
  demo: boolean;
  billing: BillingRow | null;
  now: Date;
  /** The configured monthly price; with none, no subscription can be checked, so none counts. */
  priceId: string | null;
}

/** Statuses that keep changes allowed (the owner's rule: active or trialing). */
const PAYING: readonly SubscriptionStatus[] = ["active", "trialing"];

export type Standing = { changes: true; reason: "demo" | "subscribed" | "free_days" } | { changes: false; reason: Exclude<SubscriptionStatus, "active" | "trialing"> | "none" | "other_plan" };

/** Whether the row's subscription is to the configured price. */
const ownPlan = (billing: BillingRow | null, priceId: string | null) => Boolean(priceId && billing?.stripePriceId === priceId);

export function standing({ demo, billing, now, priceId }: StandingInput): Standing {
  if (demo) return { changes: true, reason: "demo" };
  const paying = Boolean(billing?.status && PAYING.includes(billing.status));
  if (paying && ownPlan(billing, priceId)) return { changes: true, reason: "subscribed" };
  if (billing?.trialEndsAt && now.getTime() < billing.trialEndsAt.getTime()) return { changes: true, reason: "free_days" };
  if (paying) return { changes: false, reason: "other_plan" };
  return { changes: false, reason: (billing?.status as Exclude<SubscriptionStatus, "active" | "trialing"> | null) ?? "none" };
}

export type PlanState = "demo" | "free_days" | "none" | "trialing" | "active" | "ending" | "past_due" | "unpaid" | "paused" | "incomplete" | "canceled" | "other_plan";

export interface PlanView {
  state: PlanState;
  /** The date the state names: the free days' end, the first charge, the renewal, the end. */
  date: Date | null;
  nextCharge: { amountCents: number | null; currency: string | null; on: Date } | null;
  /** "Start subscription" is offered (no active, trial, past-due, unpaid or paused subscription). */
  canStart: boolean;
  /** "Manage billing" is offered (Stripe knows the agency as a customer). */
  canManage: boolean;
  changes: boolean;
}

export function planView({ demo, billing, now, priceId }: StandingInput): PlanView {
  const changes = standing({ demo, billing, now, priceId }).changes;
  if (demo) return { state: "demo", date: null, nextCharge: null, canStart: false, canManage: false, changes };
  const canManage = Boolean(billing?.stripeCustomerId);
  // A live subscription to another price: not Granite's plan; it can be changed in Stripe's portal, or Granite's started.
  if (billing?.status && PAYING.includes(billing.status) && !ownPlan(billing, priceId)) return { state: "other_plan", date: null, nextCharge: null, canStart: true, canManage, changes };
  const charge = (on: Date | null) => (on ? { amountCents: billing?.amountCents ?? null, currency: billing?.currency ?? null, on } : null);
  const view = (state: PlanState, date: Date | null, nextCharge: PlanView["nextCharge"], canStart: boolean): PlanView => ({ state, date, nextCharge, canStart, canManage, changes });
  switch (billing?.status ?? null) {
    case "active":
      return billing!.cancelAt ? view("ending", billing!.cancelAt, null, false) : view("active", billing!.currentPeriodEnd, charge(billing!.currentPeriodEnd), false);
    case "trialing": {
      if (billing!.cancelAt) return view("ending", billing!.cancelAt, null, false);
      const first = billing!.stripeTrialEnd ?? billing!.currentPeriodEnd;
      return view("trialing", first, charge(first), false);
    }
    case "past_due":
      return view("past_due", null, null, false);
    case "unpaid":
      return view("unpaid", null, null, false);
    case "paused":
      return view("paused", null, null, false);
    case "incomplete":
      return view("incomplete", null, null, true);
    case "canceled":
    case "incomplete_expired":
      return view("canceled", null, null, true);
    default:
      if (billing?.trialEndsAt && now.getTime() < billing.trialEndsAt.getTime()) return view("free_days", billing.trialEndsAt, null, true);
      return view("none", null, null, true);
  }
}

/** Stripe's minimum for a Checkout trial end: 48 hours away (docs.stripe.com/api/checkout/sessions/create). */
const MIN_TRIAL_AHEAD_MS = 48 * 60 * 60 * 1000;

/**
 * A Checkout started during the free days carries their end as the subscription's trial end, so the
 * first charge comes when they end (one trial per agency); none when they are over or under 48 hours away.
 */
export function checkoutTrialEnd(billing: Pick<BillingRow, "trialEndsAt"> | null, now: Date): number | null {
  const end = billing?.trialEndsAt;
  if (!end || end.getTime() - now.getTime() < MIN_TRIAL_AHEAD_MS) return null;
  return Math.floor(end.getTime() / 1000);
}

/** The free days' last week: Home tells the Owner before changes pause (docs/patterns/home.md). */
const FREE_DAYS_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

/** When the free days end, if that is within a week and nothing else keeps changes allowed; else null. */
export function freeDaysEndingSoon(input: StandingInput): Date | null {
  const end = input.billing?.trialEndsAt;
  if (standing(input).reason !== "free_days" || !end) return null;
  return end.getTime() - input.now.getTime() <= FREE_DAYS_WARNING_MS ? end : null;
}
