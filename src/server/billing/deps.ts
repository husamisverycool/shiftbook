/**
 * Billing's wiring (decision 0036): Stripe only in live mode with STRIPE_SECRET_KEY set; never in the
 * demo (SPEC §18: no outside calls).
 */
import { db } from "../db";
import { env } from "../env";
import { billingConfig } from "./config";
import type { BillingDeps } from "./service";
import { StripeHttp } from "./stripe";

export function billingDeps(): BillingDeps {
  const { secretKey } = billingConfig();
  return { db, stripe: env.mode === "live" && secretKey ? new StripeHttp({ secretKey }) : null };
}
