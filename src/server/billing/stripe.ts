/**
 * Stripe over plain fetch (decision 0036): the four calls Tabulado makes — a customer, a Checkout
 * Session for the monthly subscription, a Customer Portal session, and reading a subscription (or a
 * Checkout Session) back. Every request carries the pinned API version; the secret key travels only in
 * the Authorization header and never appears in an error. The demo never builds this (SPEC §18).
 */
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "../db/schema";

/** The API version every request is made with (decision 0036): a released version, not the newest. */
export const STRIPE_API_VERSION = "2026-08-26.dahlia";
const API = "https://api.stripe.com/v1";

const ID = (prefix: string) => new RegExp(`^${prefix}_[A-Za-z0-9]{1,250}$`);
export const CUSTOMER_ID = ID("cus");
export const SUBSCRIPTION_ID = ID("sub");
/** Checkout Session ids carry their mode ("cs_test_…", "cs_live_…"). */
export const CHECKOUT_SESSION_ID = /^cs_[A-Za-z0-9_]{1,250}$/;

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "StripeError";
  }
}

/** Stripe's form encoding: nested objects and arrays as bracketed keys; null and undefined left out. */
export function formEncode(params: Record<string, unknown>): string {
  const out = new URLSearchParams();
  const put = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => put(`${key}[${i}]`, v));
    else if (typeof value === "object") for (const [k, v] of Object.entries(value as Record<string, unknown>)) put(`${key}[${k}]`, v);
    else out.append(key, String(value));
  };
  for (const [k, v] of Object.entries(params)) put(k, v);
  return out.toString();
}

export interface SubscriptionFacts {
  id: string;
  customer: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  /** When it ends, if canceled ahead (cancel_at, or the period's end with cancel_at_period_end). */
  cancelAt: Date | null;
  trialEnd: Date | null;
  /** The price times the quantity, in integer cents; null when Stripe gives no whole-cent amount. */
  amountCents: number | null;
  currency: string | null;
  interval: "day" | "week" | "month" | "year" | null;
  /** The item's price id: only Tabulado's own price (STRIPE_PRICE_ID) counts as paying. */
  priceId: string | null;
}

/** A price id as Stripe writes it. */
export const PRICE_ID = /^price_[A-Za-z0-9_]{1,250}$/;

const seconds = (v: unknown): Date | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? new Date(v * 1000) : null);
const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const idOf = (v: unknown): string | null => (typeof v === "string" ? v : typeof record(v)?.id === "string" ? (record(v)!.id as string) : null);

/** The few fields Tabulado uses of a Stripe subscription, or null when it cannot be trusted. */
export function subscriptionFacts(value: unknown): SubscriptionFacts | null {
  const sub = record(value);
  if (!sub) return null;
  const id = idOf(sub.id);
  const customer = idOf(sub.customer);
  const status = sub.status as SubscriptionStatus;
  if (!id || !SUBSCRIPTION_ID.test(id) || !customer || !CUSTOMER_ID.test(customer) || !SUBSCRIPTION_STATUSES.includes(status)) return null;
  const items = Array.isArray(record(sub.items)?.data) ? (record(sub.items)!.data as unknown[]) : [];
  const item = record(items[0]);
  const price = record(item?.price);
  // API versions since 2025-03-31 keep the period on the item; older ones on the subscription.
  const currentPeriodEnd = seconds(item?.current_period_end) ?? seconds(sub.current_period_end);
  const quantity = typeof item?.quantity === "number" && Number.isInteger(item.quantity) && item.quantity >= 0 ? item.quantity : 1;
  const unit = typeof price?.unit_amount === "number" && Number.isInteger(price.unit_amount) && price.unit_amount >= 0 ? price.unit_amount : null;
  const interval = record(price?.recurring)?.interval;
  const currency = typeof price?.currency === "string" && /^[a-z]{3}$/.test(price.currency) ? price.currency : null;
  return {
    id,
    customer,
    status,
    currentPeriodEnd,
    cancelAt: seconds(sub.cancel_at) ?? (sub.cancel_at_period_end === true ? currentPeriodEnd : null),
    trialEnd: seconds(sub.trial_end),
    amountCents: unit === null ? null : unit * quantity,
    currency,
    interval: interval === "day" || interval === "week" || interval === "month" || interval === "year" ? interval : null,
    priceId: typeof price?.id === "string" && PRICE_ID.test(price.id) ? price.id : null,
  };
}

/** How good a subscription's state is (active first, canceled last). */
const RANK: Record<SubscriptionStatus, number> = { active: 6, trialing: 5, past_due: 4, unpaid: 3, paused: 3, incomplete: 2, canceled: 1, incomplete_expired: 1 };

/**
 * The subscription that counts for an agency among its customer's (two Checkout tabs can make two;
 * security review): those to Tabulado's own price first, then the best state, then the later period's
 * end. Only other prices: the best of those (the billing page then says it is not Tabulado's plan).
 */
export function bestSubscription(subscriptions: readonly SubscriptionFacts[], priceId: string | null): SubscriptionFacts | null {
  const score = (x: SubscriptionFacts) => [priceId && x.priceId === priceId ? 1 : 0, RANK[x.status], x.currentPeriodEnd?.getTime() ?? 0];
  let best: SubscriptionFacts | null = null;
  for (const x of subscriptions) {
    if (!best) {
      best = x;
      continue;
    }
    const [a, b] = [score(x), score(best)];
    const i = a.findIndex((v, k) => v !== b[k]);
    if (i >= 0 && a[i]! > b[i]!) best = x;
  }
  return best;
}

/** An address Stripe hosts (checkout.stripe.com, billing.stripe.com): the only kind the page is sent to. */
export function isStripeHosted(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "stripe.com" || u.hostname.endsWith(".stripe.com")) && !u.username && !u.password;
  } catch {
    return false;
  }
}

export interface CheckoutSessionFacts {
  id: string;
  customer: string | null;
  subscription: string | null;
  status: string | null;
}

/** What Tabulado asks of Stripe; tests give a fake. */
export interface StripeApi {
  createCustomer(input: { agencyId: string; name: string; email: string; idempotencyKey: string }): Promise<{ id: string }>;
  createCheckoutSession(input: { customer: string; priceId: string; agencyId: string; trialEnd: number | null; locale: string; successUrl: string; cancelUrl: string; idempotencyKey: string }): Promise<{ id: string; url: string }>;
  createPortalSession(input: { customer: string; returnUrl: string; locale: string }): Promise<{ url: string }>;
  getSubscription(id: string): Promise<SubscriptionFacts>;
  /** Every subscription of the customer, whatever its status (the newest 100). */
  listSubscriptions(customer: string): Promise<SubscriptionFacts[]>;
  getCheckoutSession(id: string): Promise<CheckoutSessionFacts>;
  /** A price's amount and interval, for the website's pricing page (slice aa). */
  getPrice?(id: string): Promise<PriceFacts>;
}

export interface PriceFacts {
  /** Integer cents; null when Stripe gives no whole-cent amount (tiered or custom prices). */
  unitAmountCents: number | null;
  currency: string | null;
  interval: "day" | "week" | "month" | "year" | null;
}

export class StripeHttp implements StripeApi {
  private readonly secretKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: { secretKey: string | undefined; fetch?: typeof fetch }) {
    if (!options.secretKey) throw new Error("Payments are not set up: STRIPE_SECRET_KEY is not set in the environment settings.");
    this.secretKey = options.secretKey;
    this.fetchFn = options.fetch ?? fetch;
  }

  private async call(method: "GET" | "POST", path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.secretKey}`, "Stripe-Version": STRIPE_API_VERSION };
    if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    let response: Response;
    try {
      response = await this.fetchFn(`${API}${path}`, { method, headers, body: method === "POST" ? formEncode(params ?? {}) : undefined, signal: AbortSignal.timeout(20_000) });
    } catch (error) {
      throw new StripeError(`Tabulado could not reach Stripe (${error instanceof Error ? error.name : "error"}).`, 0);
    }
    const answer = record(await response.json().catch(() => null)) ?? {};
    if (!response.ok) {
      const e = record(answer.error);
      const code = typeof e?.code === "string" ? e.code : null;
      const type = typeof e?.type === "string" ? e.type : "error";
      throw new StripeError(`Stripe refused the request (${response.status} ${type}${code ? ` ${code}` : ""}).`, response.status, code);
    }
    return answer;
  }

  async getPrice(id: string): Promise<PriceFacts> {
    if (!PRICE_ID.test(id)) throw new StripeError("Not a price id.", 400);
    const r = await this.call("GET", `/prices/${id}`);
    const unit = typeof r.unit_amount === "number" && Number.isInteger(r.unit_amount) && r.unit_amount >= 0 ? r.unit_amount : null;
    const interval = record(r.recurring)?.interval;
    return {
      unitAmountCents: unit,
      currency: typeof r.currency === "string" && /^[a-z]{3}$/.test(r.currency) ? r.currency : null,
      interval: interval === "day" || interval === "week" || interval === "month" || interval === "year" ? interval : null,
    };
  }

  async createCustomer(input: { agencyId: string; name: string; email: string; idempotencyKey: string }) {
    const r = await this.call("POST", "/customers", { name: input.name, email: input.email, metadata: { agency_id: input.agencyId } }, input.idempotencyKey);
    const id = idOf(r.id);
    if (!id || !CUSTOMER_ID.test(id)) throw new StripeError("Stripe answered without a customer id.", 502);
    return { id };
  }

  async createCheckoutSession(input: { customer: string; priceId: string; agencyId: string; trialEnd: number | null; locale: string; successUrl: string; cancelUrl: string; idempotencyKey: string }) {
    const r = await this.call(
      "POST",
      "/checkout/sessions",
      {
        mode: "subscription",
        customer: input.customer,
        client_reference_id: input.agencyId,
        line_items: [{ price: input.priceId, quantity: 1 }],
        subscription_data: { metadata: { agency_id: input.agencyId }, trial_end: input.trialEnd },
        locale: input.locale,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      },
      input.idempotencyKey,
    );
    if (typeof r.id !== "string" || !isStripeHosted(r.url)) throw new StripeError("Stripe answered without a checkout address.", 502);
    return { id: r.id, url: r.url };
  }

  async createPortalSession(input: { customer: string; returnUrl: string; locale: string }) {
    const r = await this.call("POST", "/billing_portal/sessions", { customer: input.customer, return_url: input.returnUrl, locale: input.locale });
    if (!isStripeHosted(r.url)) throw new StripeError("Stripe answered without a portal address.", 502);
    return { url: r.url };
  }

  async getSubscription(id: string) {
    if (!SUBSCRIPTION_ID.test(id)) throw new StripeError("Not a subscription id.", 400);
    const facts = subscriptionFacts(await this.call("GET", `/subscriptions/${id}`));
    if (!facts) throw new StripeError("Stripe answered with a subscription Tabulado cannot read.", 502);
    return facts;
  }

  async listSubscriptions(customer: string) {
    if (!CUSTOMER_ID.test(customer)) throw new StripeError("Not a customer id.", 400);
    const r = await this.call("GET", `/subscriptions?customer=${customer}&status=all&limit=100`);
    const data = Array.isArray(r.data) ? r.data : [];
    return data.map(subscriptionFacts).filter((x): x is SubscriptionFacts => x !== null && x.customer === customer);
  }

  async getCheckoutSession(id: string) {
    if (!CHECKOUT_SESSION_ID.test(id)) throw new StripeError("Not a checkout session id.", 400);
    const r = await this.call("GET", `/checkout/sessions/${id}`);
    return { id, customer: idOf(r.customer), subscription: idOf(r.subscription), status: typeof r.status === "string" ? r.status : null };
  }
}
