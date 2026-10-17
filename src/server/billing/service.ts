/**
 * The agency's subscription to Granite (decision 0036): Stripe's Checkout and Customer Portal for the
 * Owner, Stripe's webhook, and the billing row that decides whether the agency may change things.
 *
 * - Calls to Stripe are made outside database transactions (a slow answer never holds a lock).
 * - The demo never calls Stripe (SPEC §18): every entry point checks the agency first, and the app
 *   never builds a Stripe client in demo mode.
 * - The webhook has no session: the event's Stripe customer gives the agency through
 *   billing_agency_of_customer (ids only); the subscription is then read back from Stripe (events can
 *   arrive in any order) and written under the agency's fence, with the event's id, once.
 */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { auditBy } from "../audit";
import type { Db, Tx } from "../db/client";
import * as s from "../db/schema";
import { can } from "../permissions";
import type { Actor } from "../session";
import { checkoutTrialEnd, planView, standing, type BillingRow, type Standing } from "./access";
import { billingConfig } from "./config";
import { verifyStripeSignature } from "./signature";
import { bestSubscription, CHECKOUT_SESSION_ID, CUSTOMER_ID, StripeError, SUBSCRIPTION_ID, type StripeApi, type SubscriptionFacts } from "./stripe";

export interface BillingDeps {
  db: Db;
  /** Null in demo mode and when STRIPE_SECRET_KEY is not set. */
  stripe: StripeApi | null;
  /** The monthly price that counts as paying (STRIPE_PRICE_ID); other prices never do (security review). */
  priceId: string | null;
  now?: () => Date;
}
const nowOf = (deps: BillingDeps) => (deps.now ? deps.now() : new Date());

function inAgency<T>(db: Db, agencyId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.agency_id', ${agencyId}, true)`);
    return fn(tx);
  });
}

const BILLING_COLUMNS = {
  trialEndsAt: s.agencySubscriptions.trialEndsAt,
  stripeCustomerId: s.agencySubscriptions.stripeCustomerId,
  stripeSubscriptionId: s.agencySubscriptions.stripeSubscriptionId,
  status: s.agencySubscriptions.status,
  currentPeriodEnd: s.agencySubscriptions.currentPeriodEnd,
  cancelAt: s.agencySubscriptions.cancelAt,
  stripeTrialEnd: s.agencySubscriptions.stripeTrialEnd,
  amountCents: s.agencySubscriptions.amountCents,
  currency: s.agencySubscriptions.currency,
  billingInterval: s.agencySubscriptions.billingInterval,
  stripePriceId: s.agencySubscriptions.stripePriceId,
};

/** The agency's billing row (inside its fence), or null. */
export async function billingRowOf(tx: Tx, agencyId: string): Promise<BillingRow | null> {
  const [row] = await tx.select(BILLING_COLUMNS).from(s.agencySubscriptions).where(eq(s.agencySubscriptions.agencyId, agencyId));
  return row ?? null;
}

/**
 * Whether the agency is the demo, its billing row, and whether it may change things now; `priceId` is
 * the price that counts (STRIPE_PRICE_ID unless given).
 */
export async function agencyStanding(deps: Pick<BillingDeps, "db" | "now"> & { priceId?: string | null }, agencyId: string): Promise<{ demo: boolean; billing: BillingRow | null; standing: Standing; priceId: string | null }> {
  const now = deps.now ? deps.now() : new Date();
  const priceId = deps.priceId === undefined ? billingConfig().priceId : deps.priceId;
  return inAgency(deps.db, agencyId, async (tx) => {
    const [agency] = await tx.select({ isDemo: s.agencies.isDemo }).from(s.agencies).where(eq(s.agencies.id, agencyId));
    const demo = Boolean(agency?.isDemo);
    const billing = demo ? null : await billingRowOf(tx, agencyId);
    return { demo, billing, standing: standing({ demo, billing, now, priceId }), priceId };
  });
}

const STRIPE_LABEL = "Stripe";
const who = (actor: Actor) => ({ agencyId: actor.agencyId, userId: actor.userId, label: actor.label });

export type BillingActionError = "not_allowed" | "demo" | "not_set_up" | "already_subscribed" | "no_customer" | "stripe";
export type BillingActionResult = { ok: true; url: string } | { ok: false; error: BillingActionError };

/** What the Owner's billing actions need to know first (one short transaction). */
async function context(deps: BillingDeps, actor: Actor) {
  return inAgency(deps.db, actor.agencyId, async (tx) => {
    const [agency] = await tx.select({ name: s.agencies.name, isDemo: s.agencies.isDemo }).from(s.agencies).where(eq(s.agencies.id, actor.agencyId));
    const [person] = await tx.select({ email: s.users.email }).from(s.users).where(eq(s.users.id, actor.userId));
    return { agency, email: person?.email ?? null, billing: await billingRowOf(tx, actor.agencyId) };
  });
}

/**
 * Start subscription: a Stripe customer for the agency (once; Stripe's idempotency key and the stored id
 * keep it one), then a Checkout Session for the monthly price. During the agency's free days the first
 * charge is set for their end (one trial per agency).
 */
export async function startCheckout(deps: BillingDeps, actor: Actor, input: { baseUrl: string; locale: string; priceId: string | null }): Promise<BillingActionResult> {
  if (!can(actor, "billing")) return { ok: false, error: "not_allowed" };
  const now = nowOf(deps);
  const ctx = await context(deps, actor);
  if (!ctx.agency || ctx.agency.isDemo) return { ok: false, error: "demo" };
  if (!deps.stripe || !input.priceId) return { ok: false, error: "not_set_up" };
  if (!planView({ demo: false, billing: ctx.billing, now, priceId: input.priceId }).canStart) return { ok: false, error: "already_subscribed" };
  const locale = input.locale === "es" ? "es" : "en";
  try {
    let customer = ctx.billing?.stripeCustomerId ?? null;
    if (!customer) {
      const made = await deps.stripe.createCustomer({ agencyId: actor.agencyId, name: ctx.agency.name, email: ctx.email ?? "", idempotencyKey: `granite-customer-${actor.agencyId}` });
      customer = await inAgency(deps.db, actor.agencyId, async (tx) => {
        await tx.insert(s.agencySubscriptions).values({ agencyId: actor.agencyId, updatedAt: now }).onConflictDoNothing();
        // A second tab may have stored it first: keep the first.
        const [kept] = await tx
          .update(s.agencySubscriptions)
          .set({ stripeCustomerId: sql`coalesce(${s.agencySubscriptions.stripeCustomerId}, ${made.id})`, updatedAt: now })
          .where(eq(s.agencySubscriptions.agencyId, actor.agencyId))
          .returning({ id: s.agencySubscriptions.stripeCustomerId });
        await auditBy(tx, who(actor), [{ action: "update", entityType: "subscription", entityId: actor.agencyId, after: { stripeCustomer: "created" } }]);
        return kept!.id!;
      });
    }
    const billingUrl = `${input.baseUrl}/${locale}/settings/billing`;
    const session = await deps.stripe.createCheckoutSession({
      customer,
      priceId: input.priceId,
      agencyId: actor.agencyId,
      trialEnd: checkoutTrialEnd(ctx.billing, now),
      locale,
      successUrl: `${billingUrl}?checkout=done&session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${billingUrl}?checkout=left`,
      idempotencyKey: `granite-checkout-${randomUUID()}`,
    });
    await inAgency(deps.db, actor.agencyId, (tx) => auditBy(tx, who(actor), [{ action: "update", entityType: "subscription", entityId: actor.agencyId, after: { checkout: "opened" } }]));
    return { ok: true, url: session.url };
  } catch (error) {
    if (error instanceof StripeError) return { ok: false, error: "stripe" };
    throw error;
  }
}

/** Manage billing: Stripe's Customer Portal (card, invoices, cancel), back to Billing after. */
export async function openPortal(deps: BillingDeps, actor: Actor, input: { baseUrl: string; locale: string }): Promise<BillingActionResult> {
  if (!can(actor, "billing")) return { ok: false, error: "not_allowed" };
  const ctx = await context(deps, actor);
  if (!ctx.agency || ctx.agency.isDemo) return { ok: false, error: "demo" };
  if (!deps.stripe) return { ok: false, error: "not_set_up" };
  const customer = ctx.billing?.stripeCustomerId;
  if (!customer) return { ok: false, error: "no_customer" };
  const locale = input.locale === "es" ? "es" : "en";
  try {
    const portal = await deps.stripe.createPortalSession({ customer, returnUrl: `${input.baseUrl}/${locale}/settings/billing`, locale });
    return { ok: true, url: portal.url };
  } catch (error) {
    if (error instanceof StripeError) return { ok: false, error: "stripe" };
    throw error;
  }
}

/**
 * The subscription that counts, as Stripe has it now, kept on the agency's row (its row locked): the best
 * of the customer's subscriptions (Granite's price first, then the best state; security review — a second
 * subscription still paid counts when the kept one is canceled), or none.
 */
async function recordSubscription(tx: Tx, agencyId: string, facts: SubscriptionFacts | null, by: { userId: string | null; label: string }, now: Date): Promise<"recorded" | "unchanged"> {
  const [current] = await tx.select().from(s.agencySubscriptions).where(eq(s.agencySubscriptions.agencyId, agencyId)).for("update");
  if (!current) return "unchanged";
  if (!facts && !current.stripeSubscriptionId) return "unchanged";
  const next = {
    stripeSubscriptionId: facts?.id ?? null,
    status: facts?.status ?? null,
    currentPeriodEnd: facts?.currentPeriodEnd ?? null,
    cancelAt: facts?.cancelAt ?? null,
    stripeTrialEnd: facts?.trialEnd ?? null,
    amountCents: facts?.amountCents ?? null,
    currency: facts?.currency ?? null,
    billingInterval: facts?.interval ?? null,
    stripePriceId: facts?.priceId ?? null,
  };
  await tx.update(s.agencySubscriptions).set({ ...next, updatedAt: now }).where(eq(s.agencySubscriptions.agencyId, agencyId));
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  const changed =
    current.stripeSubscriptionId !== next.stripeSubscriptionId ||
    current.status !== next.status ||
    iso(current.currentPeriodEnd) !== iso(next.currentPeriodEnd) ||
    iso(current.cancelAt) !== iso(next.cancelAt) ||
    current.amountCents !== next.amountCents ||
    current.stripePriceId !== next.stripePriceId;
  if (changed)
    await auditBy(tx, { agencyId, userId: by.userId, label: by.label }, [
      {
        action: "update",
        entityType: "subscription",
        entityId: agencyId,
        before: { subscription: current.stripeSubscriptionId, status: current.status, periodEnd: iso(current.currentPeriodEnd), endsAt: iso(current.cancelAt), price: current.stripePriceId },
        after: { subscription: next.stripeSubscriptionId, status: next.status, periodEnd: iso(next.currentPeriodEnd), endsAt: iso(next.cancelAt), amountCents: next.amountCents, currency: next.currency, price: next.stripePriceId },
      },
    ]);
  return "recorded";
}

/**
 * Back from Checkout (`?checkout=done&session=…`): the session read back from Stripe; when it belongs
 * to this agency's customer, its subscription is recorded at once (the webhook may come later).
 */
export async function syncFromCheckout(deps: BillingDeps, actor: Actor, sessionId: string): Promise<"synced" | "pending" | "ignored"> {
  if (!deps.stripe || !CHECKOUT_SESSION_ID.test(sessionId) || !can(actor, "billing")) return "ignored";
  const ctx = await context(deps, actor);
  const customer = ctx.billing?.stripeCustomerId;
  if (!ctx.agency || ctx.agency.isDemo || !customer) return "ignored";
  try {
    const session = await deps.stripe.getCheckoutSession(sessionId);
    if (session.customer !== customer) return "ignored";
    if (!session.subscription) return "pending";
    const best = bestSubscription(await deps.stripe.listSubscriptions(customer), deps.priceId);
    if (!best) return "pending";
    await inAgency(deps.db, actor.agencyId, (tx) => recordSubscription(tx, actor.agencyId, best, { userId: actor.userId, label: actor.label }, nowOf(deps)));
    return "synced";
  } catch (error) {
    if (error instanceof StripeError) return "pending";
    throw error;
  }
}

/** The events that change a subscription (the rest are answered and set aside). */
const SUBSCRIPTION_EVENTS = /^customer\.subscription\.(created|updated|deleted|paused|resumed|trial_will_end|pending_update_applied|pending_update_expired)$/;

export type WebhookOutcome = { status: 200; outcome: "recorded" | "duplicate" | "ignored" } | { status: 400 | 413 | 500 | 503; outcome: string };

/** A transaction in webhook mode (app.billing): the handled-event table is visible. */
function inWebhookMode<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.billing', 'on', true)`);
    return fn(tx);
  });
}

/** Stripe events are small; anything larger is not one. */
export const MAX_WEBHOOK_BYTES = 512 * 1024;

/**
 * Stripe's webhook: the signature over the raw body first (nothing is read before it), then the event
 * once. A failure answers 5xx and records nothing, so Stripe's retry is handled.
 */
export async function handleStripeEvent(deps: BillingDeps, rawBody: Uint8Array, signature: string | null, webhookSecret: string | null): Promise<WebhookOutcome> {
  if (!webhookSecret) return { status: 503, outcome: "not set up" };
  if (rawBody.byteLength > MAX_WEBHOOK_BYTES) return { status: 413, outcome: "too large" };
  const now = nowOf(deps);
  const checked = verifyStripeSignature(rawBody, signature, webhookSecret, Math.floor(now.getTime() / 1000));
  if (!checked.ok) return { status: 400, outcome: `signature ${checked.reason}` };
  let event: { id?: unknown; type?: unknown; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(Buffer.from(rawBody).toString("utf8"));
  } catch {
    return { status: 400, outcome: "not json" };
  }
  const id = typeof event?.id === "string" && /^evt_[A-Za-z0-9_]{1,250}$/.test(event.id) ? event.id : null;
  const type = typeof event?.type === "string" && event.type.length <= 120 ? event.type : null;
  const object = event?.data?.object && typeof event.data.object === "object" ? event.data.object : null;
  if (!id || !type || !object) return { status: 400, outcome: "not an event" };

  // Seen before: answered at once, Stripe not asked again.
  const seen = await inWebhookMode(deps.db, (tx) => tx.select({ id: s.billingEvents.eventId }).from(s.billingEvents).where(eq(s.billingEvents.eventId, id)));
  if (seen.length > 0) return { status: 200, outcome: "duplicate" };

  const remember = (fn?: (tx: Tx) => Promise<unknown>) =>
    inWebhookMode(deps.db, async (tx) => {
      const [fresh] = await tx.insert(s.billingEvents).values({ eventId: id, type, receivedAt: now }).onConflictDoNothing().returning({ id: s.billingEvents.eventId });
      if (!fresh) return "duplicate" as const;
      if (fn) await fn(tx);
      return "done" as const;
    });
  const ignore = async (): Promise<WebhookOutcome> => ((await remember()) === "duplicate" ? { status: 200, outcome: "duplicate" } : { status: 200, outcome: "ignored" });

  const customer = typeof object.customer === "string" && CUSTOMER_ID.test(object.customer) ? object.customer : null;
  const subscriptionId = type === "checkout.session.completed" ? (object.mode === "subscription" ? object.subscription : null) : SUBSCRIPTION_EVENTS.test(type) ? object.id : null;
  if (!customer || typeof subscriptionId !== "string" || !SUBSCRIPTION_ID.test(subscriptionId)) return ignore();
  const [found] = await deps.db.execute<{ id: string | null }>(sql`select billing_agency_of_customer(${customer}) as id`);
  const agencyId = found?.id ?? null;
  if (!agencyId || !deps.stripe) return agencyId ? { status: 503, outcome: "not set up" } : ignore();

  // Every subscription of the customer, as Stripe has them now (order-proof; a second one still paid
  // counts when the kept one ends — security review); only the customer's own are kept.
  let best: SubscriptionFacts | null;
  try {
    best = bestSubscription((await deps.stripe.listSubscriptions(customer)).filter((x) => x.customer === customer), deps.priceId);
  } catch {
    return { status: 500, outcome: "stripe unreachable" };
  }
  const result: { outcome: "recorded" | "unchanged" } = { outcome: "unchanged" };
  const done = await remember(async (tx) => {
    await tx.execute(sql`select set_config('app.agency_id', ${agencyId}, true)`);
    result.outcome = await recordSubscription(tx, agencyId, best, { userId: null, label: STRIPE_LABEL }, now);
  });
  if (done === "duplicate") return { status: 200, outcome: "duplicate" };
  return { status: 200, outcome: result.outcome === "recorded" ? "recorded" : "ignored" };
}
