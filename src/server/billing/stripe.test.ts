import { describe, expect, it } from "vitest";
import { bestSubscription, formEncode, isStripeHosted, STRIPE_API_VERSION, StripeError, StripeHttp, subscriptionFacts, type SubscriptionFacts } from "./stripe";

/** Obviously fake (decision 0036). */
const KEY = "sk_test_not_real";

describe("Stripe's form encoding (application/x-www-form-urlencoded with bracketed keys)", () => {
  it("nests objects and arrays the way Stripe reads them, and skips empty values", () => {
    expect(
      formEncode({
        mode: "subscription",
        customer: "cus_test1",
        line_items: [{ price: "price_test1", quantity: 1 }],
        subscription_data: { trial_end: 1792800000, metadata: { agency_id: "a-b" } },
        cancel_url: "https://app.example/en/settings/billing?checkout=left",
        skipped: undefined,
        nothing: null,
      }),
    ).toBe(
      [
        "mode=subscription",
        "customer=cus_test1",
        "line_items%5B0%5D%5Bprice%5D=price_test1",
        "line_items%5B0%5D%5Bquantity%5D=1",
        "subscription_data%5Btrial_end%5D=1792800000",
        "subscription_data%5Bmetadata%5D%5Bagency_id%5D=a-b",
        "cancel_url=https%3A%2F%2Fapp.example%2Fen%2Fsettings%2Fbilling%3Fcheckout%3Dleft",
      ].join("&"),
    );
  });

  it("writes booleans as true/false", () => {
    expect(formEncode({ a: true, b: false })).toBe("a=true&b=false");
  });
});

describe("a subscription's facts, read defensively", () => {
  const sub = {
    id: "sub_test1",
    object: "subscription",
    customer: "cus_test1",
    status: "active",
    cancel_at: null,
    cancel_at_period_end: false,
    trial_end: null,
    items: { data: [{ current_period_end: 1792800000, quantity: 2, price: { id: "price_test1", unit_amount: 4900, currency: "usd", recurring: { interval: "month" } } }] },
  };

  it("takes the period end from the item (API versions since 2025-03-31) and the price times quantity in cents", () => {
    expect(subscriptionFacts(sub)).toEqual({ id: "sub_test1", customer: "cus_test1", status: "active", currentPeriodEnd: new Date(1792800000 * 1000), cancelAt: null, trialEnd: null, amountCents: 9800, currency: "usd", interval: "month", priceId: "price_test1" });
  });

  it("falls back to the subscription's own period end (older versions)", () => {
    const old = { ...sub, current_period_end: 1792700000, items: { data: [{ price: { unit_amount: 4900, currency: "usd", recurring: { interval: "month" } } }] } };
    expect(subscriptionFacts(old)?.currentPeriodEnd).toEqual(new Date(1792700000 * 1000));
  });

  it("an end at the period's end (cancel_at_period_end) or at a date (cancel_at) is when it ends", () => {
    expect(subscriptionFacts({ ...sub, cancel_at_period_end: true })?.cancelAt).toEqual(new Date(1792800000 * 1000));
    expect(subscriptionFacts({ ...sub, cancel_at: 1792750000 })?.cancelAt).toEqual(new Date(1792750000 * 1000));
  });

  it("a customer given as an expanded object, Stripe's trial end, and a price with no whole-cent amount", () => {
    const facts = subscriptionFacts({ ...sub, customer: { id: "cus_test2" }, status: "trialing", trial_end: 1792600000, items: { data: [{ current_period_end: 1792600000, quantity: 1, price: { unit_amount: null, unit_amount_decimal: "49.5", currency: "usd", recurring: { interval: "month" } } }] } });
    expect(facts).toMatchObject({ customer: "cus_test2", status: "trialing", trialEnd: new Date(1792600000 * 1000), amountCents: null, currency: "usd" });
  });

  it("nothing it cannot trust: not a subscription, an unknown status, a malformed id", () => {
    expect(subscriptionFacts(null)).toBeNull();
    expect(subscriptionFacts({ ...sub, status: "something_new" })).toBeNull();
    expect(subscriptionFacts({ ...sub, id: "sub_bad id" })).toBeNull();
    expect(subscriptionFacts({ ...sub, customer: "not a customer" })).toBeNull();
  });
});

describe("the HTTP client (plain fetch, decision 0036)", () => {
  function recorder(reply: { status?: number; body: unknown }) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    return { calls, fetchFn };
  }

  it("creates a customer: POST, the key as a Bearer token, the pinned version, an idempotency key, the agency in metadata", async () => {
    const { calls, fetchFn } = recorder({ body: { id: "cus_test1", object: "customer" } });
    const stripe = new StripeHttp({ secretKey: KEY, fetch: fetchFn });
    expect(await stripe.createCustomer({ agencyId: "agency-1", name: "Cedar Row Staffing", email: "owner@cedarrow.example.com", idempotencyKey: "customer-agency-1" })).toEqual({ id: "cus_test1" });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/customers");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(headers.get("stripe-version")).toBe(STRIPE_API_VERSION);
    expect(headers.get("idempotency-key")).toBe("customer-agency-1");
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(String(init.body)).toBe("name=Cedar+Row+Staffing&email=owner%40cedarrow.example.com&metadata%5Bagency_id%5D=agency-1");
  });

  it("a Checkout Session for the subscription: the price, the agency, the trial end when given, the language, both return addresses", async () => {
    const { calls, fetchFn } = recorder({ body: { id: "cs_test1", url: "https://checkout.stripe.com/c/pay/cs_test1" } });
    const stripe = new StripeHttp({ secretKey: KEY, fetch: fetchFn });
    const r = await stripe.createCheckoutSession({ customer: "cus_test1", priceId: "price_test1", agencyId: "agency-1", trialEnd: 1792800000, locale: "es", successUrl: "https://app.example/es/settings/billing?checkout=done&session={CHECKOUT_SESSION_ID}", cancelUrl: "https://app.example/es/settings/billing?checkout=left", idempotencyKey: "checkout-1" });
    expect(r).toEqual({ id: "cs_test1", url: "https://checkout.stripe.com/c/pay/cs_test1" });
    const body = new URLSearchParams(String(calls[0]!.init.body));
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(Object.fromEntries(body)).toEqual({
      mode: "subscription",
      customer: "cus_test1",
      client_reference_id: "agency-1",
      "line_items[0][price]": "price_test1",
      "line_items[0][quantity]": "1",
      "subscription_data[metadata][agency_id]": "agency-1",
      "subscription_data[trial_end]": "1792800000",
      locale: "es",
      success_url: "https://app.example/es/settings/billing?checkout=done&session={CHECKOUT_SESSION_ID}",
      cancel_url: "https://app.example/es/settings/billing?checkout=left",
    });
  });

  it("a Customer Portal session returns its short-lived address", async () => {
    const { calls, fetchFn } = recorder({ body: { id: "bps_test1", url: "https://billing.stripe.com/p/session/test_1" } });
    const stripe = new StripeHttp({ secretKey: KEY, fetch: fetchFn });
    expect(await stripe.createPortalSession({ customer: "cus_test1", returnUrl: "https://app.example/en/settings/billing", locale: "en" })).toEqual({ url: "https://billing.stripe.com/p/session/test_1" });
    expect(Object.fromEntries(new URLSearchParams(String(calls[0]!.init.body)))).toEqual({ customer: "cus_test1", return_url: "https://app.example/en/settings/billing", locale: "en" });
  });

  it("reads a subscription back by id (GET, the id checked before it goes into the address)", async () => {
    const { calls, fetchFn } = recorder({ body: { id: "sub_test1", customer: "cus_test1", status: "past_due", items: { data: [] } } });
    const stripe = new StripeHttp({ secretKey: KEY, fetch: fetchFn });
    expect(await stripe.getSubscription("sub_test1")).toMatchObject({ id: "sub_test1", status: "past_due" });
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/subscriptions/sub_test1");
    expect(calls[0]!.init.method).toBe("GET");
    await expect(stripe.getSubscription("sub_test1/../../v1/customers")).rejects.toThrow(StripeError);
    expect(calls).toHaveLength(1);
  });

  it("a refusal becomes a StripeError with Stripe's type and code, never the key", async () => {
    const { fetchFn } = recorder({ status: 400, body: { error: { type: "invalid_request_error", code: "resource_missing", message: "No such price: 'price_test1'" } } });
    const stripe = new StripeHttp({ secretKey: KEY, fetch: fetchFn });
    const error = await stripe.createPortalSession({ customer: "cus_test1", returnUrl: "https://app.example/en", locale: "en" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StripeError);
    expect(error).toMatchObject({ status: 400, code: "resource_missing" });
    expect(String((error as Error).message)).not.toContain(KEY);
  });

  it("a network failure becomes a StripeError too", async () => {
    const stripe = new StripeHttp({ secretKey: KEY, fetch: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch });
    await expect(stripe.getSubscription("sub_test1")).rejects.toMatchObject({ name: "StripeError", status: 0 });
  });

  it("refuses to be built without a key", () => {
    expect(() => new StripeHttp({ secretKey: "" })).toThrow(/STRIPE_SECRET_KEY/);
  });
});

describe("only Stripe's own pages are opened", () => {
  it("https on stripe.com or a subdomain; nothing else", () => {
    expect(isStripeHosted("https://checkout.stripe.com/c/pay/cs_test_1")).toBe(true);
    expect(isStripeHosted("https://billing.stripe.com/p/session/test_1")).toBe(true);
    expect(isStripeHosted("http://checkout.stripe.com/c/pay/cs_test_1")).toBe(false);
    expect(isStripeHosted("https://checkout.stripe.com.evil.example/x")).toBe(false);
    expect(isStripeHosted("https://evilstripe.com/x")).toBe(false);
    expect(isStripeHosted("https://user:pw@checkout.stripe.com/x")).toBe(false);
    expect(isStripeHosted("javascript:alert(1)")).toBe(false);
    expect(isStripeHosted(null)).toBe(false);
  });

  it("a session whose address is not Stripe's is refused", async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ id: "cs_test1", url: "https://example.com/pay" }), { status: 200 })) as unknown as typeof fetch;
    const stripe = new StripeHttp({ secretKey: KEY, fetch: fetchFn });
    await expect(stripe.createCheckoutSession({ customer: "cus_test1", priceId: "price_test1", agencyId: "a", trialEnd: null, locale: "en", successUrl: "https://app.example/s", cancelUrl: "https://app.example/c", idempotencyKey: "k" })).rejects.toThrow(StripeError);
  });
});

describe("the customer's subscriptions, and the one that counts (security review)", () => {
  const facts = (over: Partial<SubscriptionFacts>): SubscriptionFacts => ({ id: "sub_a", customer: "cus_test1", status: "active", currentPeriodEnd: new Date(1792800000 * 1000), cancelAt: null, trialEnd: null, amountCents: 9900, currency: "usd", interval: "month", priceId: "price_test1", ...over });

  it("Granite's price first, then the best state: active, trialing, past due…, canceled last; the later period on a tie", () => {
    const canceled = facts({ id: "sub_c", status: "canceled" });
    const trialing = facts({ id: "sub_t", status: "trialing" });
    const active = facts({ id: "sub_a", status: "active" });
    const pastDue = facts({ id: "sub_p", status: "past_due" });
    expect(bestSubscription([canceled, trialing, active, pastDue], "price_test1")?.id).toBe("sub_a");
    expect(bestSubscription([canceled, trialing, pastDue], "price_test1")?.id).toBe("sub_t");
    expect(bestSubscription([canceled, pastDue], "price_test1")?.id).toBe("sub_p");
    expect(bestSubscription([facts({ id: "sub_old", currentPeriodEnd: new Date(1792700000 * 1000) }), facts({ id: "sub_new" })], "price_test1")?.id).toBe("sub_new");
    // A cheaper plan never wins over Granite's, even active over canceled.
    expect(bestSubscription([facts({ id: "sub_cheap", priceId: "price_cheap" }), canceled], "price_test1")?.id).toBe("sub_c");
    // Only other plans: the best of them (the page says it is not Granite's plan).
    expect(bestSubscription([facts({ id: "sub_cheap", priceId: "price_cheap" })], "price_test1")?.id).toBe("sub_cheap");
    expect(bestSubscription([], "price_test1")).toBeNull();
  });

  it("lists every subscription of the customer (all statuses), keeping only those that are the customer's", async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "sub_a", customer: "cus_test1", status: "active", items: { data: [] } }, { id: "sub_x", customer: "cus_other", status: "active", items: { data: [] } }, { nonsense: true }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const stripe = new StripeHttp({ secretKey: KEY, fetch: fetchFn });
    expect((await stripe.listSubscriptions("cus_test1")).map((x) => x.id)).toEqual(["sub_a"]);
    expect(calls).toEqual(["https://api.stripe.com/v1/subscriptions?customer=cus_test1&status=all&limit=100"]);
    await expect(stripe.listSubscriptions("cus_bad id")).rejects.toThrow(StripeError);
  });
});
