/**
 * The billing settings (decision 0036), read from the environment — set in the hosting service's
 * settings, never in the code (docs/hosting-settings.md). Values are never logged.
 */
export interface BillingConfig {
  /** STRIPE_SECRET_KEY: the account's secret API key (or a restricted key with the same rights). */
  secretKey: string | null;
  /** STRIPE_WEBHOOK_SECRET: the webhook endpoint's signing secret. */
  webhookSecret: string | null;
  /** STRIPE_PRICE_ID: the monthly price agencies subscribe to. */
  priceId: string | null;
  /** STRIPE_TRIAL_DAYS: a new agency's free days (0 for none; unset, the default). */
  trialDays: number;
}

/** Stripe allows trials of up to 730 days. */
const MAX_TRIAL_DAYS = 730;

/** Free days when the setting is missing or unreadable (decision 0049): the 30 decision 0036 gave agencies already there. */
export const DEFAULT_TRIAL_DAYS = 30;

/** A whole number of days from 0 to 730 ("0": none); anything else, the default — a new agency is never paused for a missing setting. */
export function trialDaysFrom(raw: string | undefined): number {
  const text = raw?.trim() ?? "";
  if (!/^\d{1,3}$/.test(text)) return DEFAULT_TRIAL_DAYS;
  const days = Number(text);
  return days <= MAX_TRIAL_DAYS ? days : DEFAULT_TRIAL_DAYS;
}

const setting = (value: string | undefined) => (value && value.trim() ? value.trim() : null);

export function billingConfig(source: Record<string, string | undefined> = process.env): BillingConfig {
  return {
    secretKey: setting(source.STRIPE_SECRET_KEY),
    webhookSecret: setting(source.STRIPE_WEBHOOK_SECRET),
    priceId: setting(source.STRIPE_PRICE_ID),
    trialDays: trialDaysFrom(source.STRIPE_TRIAL_DAYS),
  };
}
