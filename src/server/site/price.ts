/**
 * The plan's price for the website's pricing page (slice aa): Stripe's own record of STRIPE_PRICE_ID,
 * so the page never says a price the checkout does not charge. Live mode with Stripe set up only (the
 * demo makes no outside calls, SPEC §18); kept for an hour; null when it cannot be known.
 */
import { billingConfig } from "../billing/config";
import { StripeHttp, type PriceFacts } from "../billing/stripe";
import { env } from "../env";

const KEEP_MS = 60 * 60 * 1000;
let kept: { at: number; price: PriceFacts | null } | null = null;

export async function sitePrice(now = Date.now()): Promise<PriceFacts | null> {
  const { secretKey, priceId } = billingConfig();
  if (env.mode !== "live" || !secretKey || !priceId) return null;
  if (kept && now - kept.at < KEEP_MS) return kept.price;
  let price: PriceFacts | null = null;
  try {
    price = await new StripeHttp({ secretKey }).getPrice(priceId);
  } catch {
    price = null;
  }
  kept = { at: now, price };
  return price;
}
