/**
 * Decision 0036 through the database: the Owner opens Stripe's Checkout and Customer Portal (never in
 * the demo, never without the settings); Stripe's webhook is believed only with a good signature over
 * the raw body, handles each event once, reads the subscription back (order-proof), and keeps the
 * agency's billing row; that row decides whether the agency may change things.
 */
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { agencyStanding, handleStripeEvent, openPortal, startCheckout, syncFromCheckout, type BillingDeps } from "../../src/server/billing/service";
import { stripeSignatureHeader } from "../../src/server/billing/signature";
import { StripeError, type CheckoutSessionFacts, type StripeApi, type SubscriptionFacts } from "../../src/server/billing/stripe";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER } from "../../src/server/demo/dataset";
import { clearDemoAgency, seedDemoAgency } from "../../src/server/demo/seed";
import type { Actor } from "../../src/server/session";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
/** Obviously fake (decision 0036). */
const SECRET = "whsec_test_not_real";
const DAY = 24 * 60 * 60 * 1000;
let clock = new Date();
const seconds = () => Math.floor(clock.getTime() / 1000);

/** Stripe, as far as Tabulado asks it: subscriptions and checkout sessions it "has", every call noted. */
class FakeStripe implements StripeApi {
  calls: string[] = [];
  customers = 0;
  subscriptions = new Map<string, SubscriptionFacts>();
  sessions = new Map<string, CheckoutSessionFacts>();
  lastCheckout: Parameters<StripeApi["createCheckoutSession"]>[0] | null = null;
  failing = false;
  async createCustomer(input: Parameters<StripeApi["createCustomer"]>[0]) {
    this.calls.push(`customer ${input.idempotencyKey}`);
    this.customers += 1;
    return { id: `cus_test${this.customers}` };
  }
  async createCheckoutSession(input: Parameters<StripeApi["createCheckoutSession"]>[0]) {
    this.calls.push(`checkout ${input.customer}`);
    this.lastCheckout = input;
    return { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" };
  }
  async createPortalSession(input: Parameters<StripeApi["createPortalSession"]>[0]) {
    this.calls.push(`portal ${input.customer} ${input.returnUrl}`);
    return { url: "https://billing.stripe.com/p/session/test_1" };
  }
  async getSubscription(id: string) {
    this.calls.push(`subscription ${id}`);
    if (this.failing) throw new StripeError("Tabulado could not reach Stripe (TypeError).", 0);
    const sub = this.subscriptions.get(id);
    if (!sub) throw new StripeError("Stripe refused the request (404 invalid_request_error resource_missing).", 404, "resource_missing");
    return sub;
  }
  async listSubscriptions(customer: string) {
    this.calls.push(`subscriptions of ${customer}`);
    if (this.failing) throw new StripeError("Tabulado could not reach Stripe (TypeError).", 0);
    return [...this.subscriptions.values()].filter((x) => x.customer === customer);
  }
  async getCheckoutSession(id: string) {
    this.calls.push(`session ${id}`);
    const session = this.sessions.get(id);
    if (!session) throw new StripeError("Stripe refused the request (404).", 404);
    return session;
  }
}

let stripe = new FakeStripe();
/** The configured monthly price (STRIPE_PRICE_ID): only a subscription to it counts as paying. */
const PRICE = "price_test1";
const deps = (over: Partial<BillingDeps> = {}): BillingDeps => ({ db: app.db, stripe, now: () => clock, priceId: PRICE, ...over });
const sub = (over: Partial<SubscriptionFacts> = {}): SubscriptionFacts => ({ id: "sub_test1", customer: "cus_test1", status: "active", currentPeriodEnd: new Date(clock.getTime() + 30 * DAY), cancelAt: null, trialEnd: null, amountCents: 9900, currency: "usd", interval: "month", priceId: PRICE, ...over });
let eventCount = 0;
/** A Stripe event as delivered: the raw body and the header Stripe would sign it with. */
function delivery(type: string, object: Record<string, unknown>, id = `evt_test${(eventCount += 1)}`) {
  const body = JSON.stringify({ id, object: "event", type, created: seconds(), data: { object } });
  return { id, body, header: stripeSignatureHeader(body, SECRET, seconds()) };
}
const deliver = (d: { body: string; header: string }, over: Partial<BillingDeps> = {}, secret: string | null = SECRET) => handleStripeEvent(deps(over), Buffer.from(d.body, "utf8"), d.header, secret);

let agencyId = "";
let theOwner: Actor;
async function newAgency(over: Partial<typeof s.agencySubscriptions.$inferInsert> = {}) {
  const [agency] = await owner.db.insert(s.agencies).values({ name: `Harbor Light Staffing ${Date.now()}` }).returning();
  const [person] = await owner.db.insert(s.users).values({ agencyId: agency!.id, name: "Robin Vega", email: `robin.${Date.now()}.${Math.random().toString(36).slice(2)}@harbor.example`, role: "owner" }).returning();
  await owner.db.insert(s.agencySubscriptions).values({ agencyId: agency!.id, trialEndsAt: new Date(clock.getTime() + 10 * DAY), ...over });
  return { id: agency!.id, actor: { agencyId: agency!.id, userId: person!.id, label: "Robin Vega", role: "owner" } as Actor };
}
const row = async (id = agencyId) => (await owner.db.select().from(s.agencySubscriptions).where(eq(s.agencySubscriptions.agencyId, id)))[0]!;
const log = (id = agencyId) => owner.db.select().from(s.auditEvents).where(and(eq(s.auditEvents.agencyId, id), eq(s.auditEvents.entityType, "subscription")));

beforeEach(async () => {
  clock = new Date();
  stripe = new FakeStripe();
  // A Stripe customer belongs to one agency: earlier tests' agencies let go of the test ids.
  await owner.db.update(s.agencySubscriptions).set({ stripeCustomerId: null }).where(sql`${s.agencySubscriptions.stripeCustomerId} like 'cus_test%'`);
  const made = await newAgency();
  agencyId = made.id;
  theOwner = made.actor;
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("Stripe's Checkout and Customer Portal (the Owner's; never the demo's)", () => {
  it("Start subscription: a Stripe customer made once for the agency, a Checkout Session for the monthly price, the free days' end as the trial end", async () => {
    const first = await startCheckout(deps(), theOwner, { baseUrl: "https://app.example", locale: "es", priceId: "price_test1" });
    expect(first).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    expect((await row()).stripeCustomerId).toBe("cus_test1");
    expect(stripe.lastCheckout).toMatchObject({ customer: "cus_test1", priceId: "price_test1", agencyId, locale: "es", successUrl: "https://app.example/es/settings/billing?checkout=done&session={CHECKOUT_SESSION_ID}", cancelUrl: "https://app.example/es/settings/billing?checkout=left" });
    expect(stripe.lastCheckout!.trialEnd).toBe(Math.floor((await row()).trialEndsAt!.getTime() / 1000));
    // Again (a second tab): the same customer, no second one.
    await startCheckout(deps(), theOwner, { baseUrl: "https://app.example", locale: "en", priceId: "price_test1" });
    expect(stripe.customers).toBe(1);
    expect(stripe.calls.filter((c) => c.startsWith("checkout"))).toEqual(["checkout cus_test1", "checkout cus_test1"]);
    expect((await log()).map((e) => e.after)).toEqual(expect.arrayContaining([expect.objectContaining({ stripeCustomer: "created" }), expect.objectContaining({ checkout: "opened" })]));
  });

  it("after the free days, Checkout carries no trial (one trial per agency)", async () => {
    await owner.db.update(s.agencySubscriptions).set({ trialEndsAt: new Date(clock.getTime() - DAY) }).where(eq(s.agencySubscriptions.agencyId, agencyId));
    await startCheckout(deps(), theOwner, { baseUrl: "https://app.example", locale: "en", priceId: "price_test1" });
    expect(stripe.lastCheckout!.trialEnd).toBeNull();
  });

  it("refused: not the Owner; the demo (no call to Stripe at all); payments not set up; already subscribed", async () => {
    expect(await startCheckout(deps(), { ...theOwner, role: "billing" }, { baseUrl: "https://app.example", locale: "en", priceId: "price_test1" })).toEqual({ ok: false, error: "not_allowed" });
    const demoOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: "Demo Owner (demo)", role: "owner", demo: true };
    const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
    if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
    await app.withAgency(DEMO_AGENCY.id, async (tx) => {
      await clearDemoAgency(tx);
      await seedDemoAgency(tx);
    });
    expect(await startCheckout(deps(), demoOwner, { baseUrl: "https://app.example", locale: "en", priceId: "price_test1" })).toEqual({ ok: false, error: "demo" });
    expect(await openPortal(deps(), demoOwner, { baseUrl: "https://app.example", locale: "en" })).toEqual({ ok: false, error: "demo" });
    expect(stripe.calls).toEqual([]);
    expect(await startCheckout(deps({ stripe: null }), theOwner, { baseUrl: "https://app.example", locale: "en", priceId: "price_test1" })).toEqual({ ok: false, error: "not_set_up" });
    expect(await startCheckout(deps(), theOwner, { baseUrl: "https://app.example", locale: "en", priceId: null })).toEqual({ ok: false, error: "not_set_up" });
    await owner.db.update(s.agencySubscriptions).set({ stripeCustomerId: "cus_test9", stripeSubscriptionId: "sub_test9", status: "active", stripePriceId: PRICE }).where(eq(s.agencySubscriptions.agencyId, agencyId));
    expect(await startCheckout(deps(), theOwner, { baseUrl: "https://app.example", locale: "en", priceId: "price_test1" })).toEqual({ ok: false, error: "already_subscribed" });
    expect(stripe.calls).toEqual([]);
  });

  it("Manage billing: Stripe's portal for the agency's customer, back to Billing; none before Stripe knows the agency", async () => {
    expect(await openPortal(deps(), theOwner, { baseUrl: "https://app.example", locale: "en" })).toEqual({ ok: false, error: "no_customer" });
    await owner.db.update(s.agencySubscriptions).set({ stripeCustomerId: "cus_test5" }).where(eq(s.agencySubscriptions.agencyId, agencyId));
    expect(await openPortal(deps(), theOwner, { baseUrl: "https://app.example", locale: "es" })).toEqual({ ok: true, url: "https://billing.stripe.com/p/session/test_1" });
    expect(stripe.calls).toEqual(["portal cus_test5 https://app.example/es/settings/billing"]);
    expect(await openPortal(deps(), { ...theOwner, role: "accountant" }, { baseUrl: "https://app.example", locale: "en" })).toEqual({ ok: false, error: "not_allowed" });
  });

  it("back from Checkout: the session read back records the subscription at once — only when it is this agency's customer", async () => {
    await owner.db.update(s.agencySubscriptions).set({ stripeCustomerId: "cus_test1" }).where(eq(s.agencySubscriptions.agencyId, agencyId));
    stripe.sessions.set("cs_test_other", { id: "cs_test_other", customer: "cus_someone_else", subscription: "sub_test2", status: "complete" });
    stripe.subscriptions.set("sub_test2", sub({ id: "sub_test2", customer: "cus_someone_else" }));
    expect(await syncFromCheckout(deps(), theOwner, "cs_test_other")).toBe("ignored");
    expect((await row()).status).toBeNull();
    stripe.sessions.set("cs_test_mine", { id: "cs_test_mine", customer: "cus_test1", subscription: "sub_test1", status: "complete" });
    stripe.subscriptions.set("sub_test1", sub({ status: "trialing", trialEnd: new Date(clock.getTime() + 9 * DAY) }));
    expect(await syncFromCheckout(deps(), theOwner, "cs_test_mine")).toBe("synced");
    expect(await row()).toMatchObject({ stripeSubscriptionId: "sub_test1", status: "trialing", amountCents: 9900, currency: "usd", billingInterval: "month" });
    expect(await syncFromCheckout(deps(), theOwner, "not a session id")).toBe("ignored");
  });
});

describe("Stripe's webhook (/api/billing/webhook)", () => {
  beforeEach(async () => {
    await owner.db.update(s.agencySubscriptions).set({ stripeCustomerId: "cus_test1" }).where(eq(s.agencySubscriptions.agencyId, agencyId));
  });

  it("refuses a wrong, missing or stale signature, a changed body, and any delivery while no secret is set — nothing recorded", async () => {
    stripe.subscriptions.set("sub_test1", sub());
    const d = delivery("customer.subscription.updated", { id: "sub_test1", customer: "cus_test1" });
    expect(await deliver({ body: d.body, header: stripeSignatureHeader(d.body, "whsec_other_not_real", seconds()) })).toMatchObject({ status: 400 });
    expect(await deliver({ body: d.body, header: "" })).toMatchObject({ status: 400 });
    expect(await deliver({ body: d.body.replace("sub_test1", "sub_test2"), header: d.header })).toMatchObject({ status: 400 });
    expect(await deliver({ body: d.body, header: stripeSignatureHeader(d.body, SECRET, seconds() - 301) })).toMatchObject({ status: 400 });
    expect(await deliver(d, {}, null)).toMatchObject({ status: 503 });
    expect(stripe.calls).toEqual([]);
    expect((await row()).status).toBeNull();
    expect(await owner.db.select().from(s.billingEvents).where(eq(s.billingEvents.eventId, d.id))).toHaveLength(0);
  });

  it("a subscription event: the subscription read back from Stripe is kept, logged as Stripe's change", async () => {
    stripe.subscriptions.set("sub_test1", sub());
    const d = delivery("customer.subscription.created", { id: "sub_test1", customer: "cus_test1", status: "incomplete" });
    expect(await deliver(d)).toEqual({ status: 200, outcome: "recorded" });
    expect(await row()).toMatchObject({ stripeSubscriptionId: "sub_test1", status: "active", amountCents: 9900, currency: "usd", billingInterval: "month", cancelAt: null });
    expect((await row()).currentPeriodEnd).toEqual(sub().currentPeriodEnd);
    const [event] = await log();
    expect(event).toMatchObject({ action: "update", actorLabel: "Stripe", actorUserId: null, before: { status: null }, after: expect.objectContaining({ status: "active" }) });
  });

  it("idempotent: the same event twice changes nothing the second time (and Stripe is not asked again)", async () => {
    stripe.subscriptions.set("sub_test1", sub());
    const d = delivery("customer.subscription.updated", { id: "sub_test1", customer: "cus_test1" });
    expect(await deliver(d)).toEqual({ status: 200, outcome: "recorded" });
    stripe.subscriptions.set("sub_test1", sub({ status: "past_due" }));
    expect(await deliver(d)).toEqual({ status: 200, outcome: "duplicate" });
    expect((await row()).status).toBe("active");
    expect(stripe.calls.filter((c) => c.startsWith("subscriptions of"))).toHaveLength(1);
    expect(await log()).toHaveLength(1);
    // Two deliveries of one event at once: one records it.
    const e = delivery("customer.subscription.updated", { id: "sub_test1", customer: "cus_test1" });
    const both = await Promise.all([deliver(e), deliver(e)]);
    expect(both.map((r) => r.outcome).sort()).toEqual(["duplicate", "recorded"]);
  });

  it("order-proof: an older event arriving last still leaves Stripe's current state", async () => {
    stripe.subscriptions.set("sub_test1", sub({ status: "canceled", cancelAt: null }));
    const newer = delivery("customer.subscription.deleted", { id: "sub_test1", customer: "cus_test1", status: "canceled" });
    const older = delivery("customer.subscription.updated", { id: "sub_test1", customer: "cus_test1", status: "active" });
    await deliver(newer);
    await deliver(older);
    expect((await row()).status).toBe("canceled");
  });

  it("checkout.session.completed links the subscription; a cancel at the period's end is when it ends", async () => {
    stripe.subscriptions.set("sub_test1", sub({ cancelAt: new Date(clock.getTime() + 30 * DAY) }));
    expect(await deliver(delivery("checkout.session.completed", { id: "cs_test_1", mode: "subscription", customer: "cus_test1", subscription: "sub_test1" }))).toEqual({ status: 200, outcome: "recorded" });
    expect(await row()).toMatchObject({ stripeSubscriptionId: "sub_test1", status: "active" });
    expect((await row()).cancelAt).toEqual(new Date(clock.getTime() + 30 * DAY));
  });

  it("an event about a customer Tabulado did not make, an event it does not use, or a subscription of another customer: answered and set aside", async () => {
    stripe.subscriptions.set("sub_test7", sub({ id: "sub_test7", customer: "cus_stranger" }));
    expect(await deliver(delivery("customer.subscription.updated", { id: "sub_test7", customer: "cus_stranger" }))).toEqual({ status: 200, outcome: "ignored" });
    expect(await deliver(delivery("invoice.paid", { id: "in_test1", customer: "cus_test1" }))).toEqual({ status: 200, outcome: "ignored" });
    // The event says our customer, Stripe says the subscription is someone else's: trust Stripe.
    expect(await deliver(delivery("customer.subscription.updated", { id: "sub_test7", customer: "cus_test1" }))).toEqual({ status: 200, outcome: "ignored" });
    expect((await row()).stripeSubscriptionId).toBeNull();
  });

  it("Stripe unreachable: 500, nothing recorded, so Stripe's retry is handled", async () => {
    stripe.subscriptions.set("sub_test1", sub());
    stripe.failing = true;
    const d = delivery("customer.subscription.updated", { id: "sub_test1", customer: "cus_test1" });
    expect(await deliver(d)).toMatchObject({ status: 500 });
    expect(await owner.db.select().from(s.billingEvents).where(eq(s.billingEvents.eventId, d.id))).toHaveLength(0);
    stripe.failing = false;
    expect(await deliver(d)).toEqual({ status: 200, outcome: "recorded" });
  });

  it("not JSON, or not an event: 400", async () => {
    const body = "not json";
    expect(await deliver({ body, header: stripeSignatureHeader(body, SECRET, seconds()) })).toMatchObject({ status: 400 });
    const notEvent = JSON.stringify({ hello: "world" });
    expect(await deliver({ body: notEvent, header: stripeSignatureHeader(notEvent, SECRET, seconds()) })).toMatchObject({ status: 400 });
  });

  it("two subscriptions (two checkout tabs): when the one kept is canceled, the other one, still paid, counts (security review)", async () => {
    stripe.subscriptions.set("sub_test1", sub());
    await deliver(delivery("customer.subscription.created", { id: "sub_test1", customer: "cus_test1" }));
    stripe.subscriptions.set("sub_test2", sub({ id: "sub_test2", currentPeriodEnd: new Date(clock.getTime() + 20 * DAY) }));
    await deliver(delivery("customer.subscription.created", { id: "sub_test2", customer: "cus_test1" }));
    expect((await row()).stripeSubscriptionId).toBe("sub_test1");
    // The kept one is canceled in Stripe's portal: the agency still pays through the other.
    stripe.subscriptions.set("sub_test1", sub({ status: "canceled" }));
    await deliver(delivery("customer.subscription.deleted", { id: "sub_test1", customer: "cus_test1" }));
    expect(await row()).toMatchObject({ stripeSubscriptionId: "sub_test2", status: "active" });
    await owner.db.update(s.agencySubscriptions).set({ trialEndsAt: null }).where(eq(s.agencySubscriptions.agencyId, agencyId));
    expect(await agencyStanding(deps(), agencyId)).toMatchObject({ standing: { changes: true, reason: "subscribed" } });
  });

  it("a subscription to another price in the same Stripe account (a cheaper or free plan) is kept but does not count as paying", async () => {
    await owner.db.update(s.agencySubscriptions).set({ trialEndsAt: null }).where(eq(s.agencySubscriptions.agencyId, agencyId));
    stripe.subscriptions.set("sub_free", sub({ id: "sub_free", priceId: "price_free", amountCents: 0 }));
    expect(await deliver(delivery("customer.subscription.created", { id: "sub_free", customer: "cus_test1" }))).toEqual({ status: 200, outcome: "recorded" });
    expect(await row()).toMatchObject({ stripeSubscriptionId: "sub_free", status: "active", stripePriceId: "price_free" });
    expect(await agencyStanding(deps(), agencyId)).toMatchObject({ standing: { changes: false, reason: "other_plan" } });
    // Tabulado's own price, started later, wins over it.
    stripe.subscriptions.set("sub_test1", sub());
    await deliver(delivery("customer.subscription.created", { id: "sub_test1", customer: "cus_test1" }));
    expect(await row()).toMatchObject({ stripeSubscriptionId: "sub_test1", stripePriceId: PRICE });
    expect(await agencyStanding(deps(), agencyId)).toMatchObject({ standing: { changes: true, reason: "subscribed" } });
  });

  it("two subscriptions for one agency (two checkout tabs): the better one is kept", async () => {
    stripe.subscriptions.set("sub_test1", sub());
    stripe.subscriptions.set("sub_test2", sub({ id: "sub_test2", status: "incomplete_expired" }));
    await deliver(delivery("customer.subscription.updated", { id: "sub_test1", customer: "cus_test1" }));
    await deliver(delivery("customer.subscription.updated", { id: "sub_test2", customer: "cus_test1" }));
    expect(await row()).toMatchObject({ stripeSubscriptionId: "sub_test1", status: "active" });
  });

  it("the handled-event table and the customer look-up are fenced: no agency sees them, the look-up gives only an id", async () => {
    stripe.subscriptions.set("sub_test1", sub());
    await deliver(delivery("customer.subscription.updated", { id: "sub_test1", customer: "cus_test1" }));
    expect(await app.db.select().from(s.billingEvents)).toHaveLength(0);
    expect(await app.withAgency(agencyId, (tx) => tx.select().from(s.billingEvents))).toHaveLength(0);
    const found = await app.db.execute<{ id: string | null }>(sql`select billing_agency_of_customer(${"cus_test1"}) as id`);
    expect(found[0]!.id).toBe(agencyId);
    // Another agency cannot read this agency's billing row.
    const other = await newAgency();
    expect(await app.withAgency(other.id, (tx) => tx.select().from(s.agencySubscriptions).where(eq(s.agencySubscriptions.agencyId, agencyId)))).toHaveLength(0);
  });
});

describe("the subscription decides who may change things (decision 0036)", () => {
  beforeEach(async () => {
    await owner.db.update(s.agencySubscriptions).set({ stripeCustomerId: "cus_test1" }).where(eq(s.agencySubscriptions.agencyId, agencyId));
  });
  const standingNow = () => agencyStanding(deps(), agencyId);

  it("free days → allowed; over with no subscription → paused; subscribed → allowed; past due → paused; canceled → paused", async () => {
    expect(await standingNow()).toMatchObject({ demo: false, standing: { changes: true, reason: "free_days" } });
    clock = new Date(clock.getTime() + 11 * DAY);
    expect(await standingNow()).toMatchObject({ standing: { changes: false, reason: "none" } });
    stripe.subscriptions.set("sub_test1", sub({ currentPeriodEnd: new Date(clock.getTime() + 30 * DAY) }));
    await deliver(delivery("customer.subscription.created", { id: "sub_test1", customer: "cus_test1" }));
    expect(await standingNow()).toMatchObject({ standing: { changes: true, reason: "subscribed" } });
    stripe.subscriptions.set("sub_test1", sub({ status: "past_due" }));
    await deliver(delivery("customer.subscription.updated", { id: "sub_test1", customer: "cus_test1" }));
    expect(await standingNow()).toMatchObject({ standing: { changes: false, reason: "past_due" } });
    stripe.subscriptions.set("sub_test1", sub({ status: "canceled" }));
    await deliver(delivery("customer.subscription.deleted", { id: "sub_test1", customer: "cus_test1" }));
    expect(await standingNow()).toMatchObject({ standing: { changes: false, reason: "canceled" } });
    // Nothing was deleted: the agency, its Owner and its billing history stay.
    expect(await owner.db.select().from(s.users).where(eq(s.users.agencyId, agencyId))).toHaveLength(1);
    expect((await log()).length).toBeGreaterThanOrEqual(3);
  });

  it("the demo agency is always allowed and has no billing row", async () => {
    const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
    if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
    expect(await agencyStanding(deps(), DEMO_AGENCY.id)).toMatchObject({ demo: true, billing: null, standing: { changes: true, reason: "demo" } });
  });
});
