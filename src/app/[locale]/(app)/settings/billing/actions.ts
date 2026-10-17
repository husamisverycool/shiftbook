"use server";

/**
 * The Owner's billing actions (decision 0036): Stripe's Checkout and Customer Portal, opened in the same
 * tab by the page. Never paused (the Owner must be able to pay), never in the demo (no Stripe calls).
 */
import { getLocale } from "next-intl/server";
import { billingConfig } from "@/server/billing/config";
import { billingDeps } from "@/server/billing/deps";
import { openPortal, startCheckout, type BillingActionResult } from "@/server/billing/service";
import { requestOrigin } from "@/server/request-info";
import { linkBaseUrl } from "@/server/services";
import { actorAllowedTo } from "@/server/session";

export async function startSubscriptionAction(): Promise<BillingActionResult> {
  const actor = await actorAllowedTo("billing");
  return startCheckout(billingDeps(), actor, { baseUrl: linkBaseUrl(await requestOrigin()), locale: await getLocale(), priceId: billingConfig().priceId });
}

export async function manageBillingAction(): Promise<BillingActionResult> {
  const actor = await actorAllowedTo("billing");
  return openPortal(billingDeps(), actor, { baseUrl: linkBaseUrl(await requestOrigin()), locale: await getLocale() });
}
