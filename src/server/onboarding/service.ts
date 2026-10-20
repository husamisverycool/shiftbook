/**
 * The onboarding emails (slice ab; docs/patterns/_emails/onboarding.md): the welcome once the agency's
 * first Owner finishes two-step sign-in, and — from the host's daily sweep — one setup reminder while
 * "Finish setting up" has steps left (at most two), and the free days ending (7 and 3 days before).
 * Only to the agency's active Owner; never for the demo. Kept with the agency's other emails
 * (email_messages), which also says what was already sent.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { listPeriods } from "../convert/queries";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { SETUP_STEPS, setupSteps, type SetupStep } from "../home/queries";
import { inboundDomain } from "../inbound/config";
import { addressOf } from "../inbound/address";
import { ensureAddress } from "../inbound/service";
import type { MailTransport } from "../mail/transport";
import type { RenderedEmail } from "../mail/layout";
import { settingOn } from "../settings";
import { nudgeDue, trialEmailDue } from "./due";
import { renderSetupNudgeEmail, renderTrialEndingEmail, renderWelcomeEmail } from "./emails";

export interface OnboardingDeps {
  mailTransport: (agencyId: string) => MailTransport;
  baseUrl: string;
  now?: () => Date;
}
type WithAgency = <T>(agencyId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;
type Kind = "welcome" | "setup_nudge" | "trial_ending";

/** Where each guide step's button goes (Home's own links, without a pay period). */
const STEP_PATH: Record<SetupStep, string> = {
  agency: "/settings/agency",
  payroll: "/settings/payroll",
  team: "/settings/members",
  clients: "/clients",
  placements: "/job-orders",
  convert: "/convert",
  forwarding: "/settings/connections",
  approval: "/approvals",
  files: "/convert",
  subscription: "/settings/billing",
};

const nowOf = (deps: OnboardingDeps) => (deps.now ? deps.now() : new Date());
const localeOf = (l: string) => (l === "es" ? "es" : "en");

async function ownerOf(tx: Tx) {
  const [agency] = await tx.select().from(s.agencies);
  if (!agency || agency.isDemo) return null;
  const [owner] = await tx
    .select()
    .from(s.users)
    .where(and(eq(s.users.role, "owner"), eq(s.users.status, "active")))
    .orderBy(asc(s.users.createdAt))
    .limit(1);
  if (!owner) return null;
  const zone = await settingOn<unknown>(tx, "time_zone", new Date().toISOString().slice(0, 10));
  const [billing] = await tx.select().from(s.agencySubscriptions);
  return { agency, owner, timeZone: typeof zone === "string" ? zone : "America/Chicago", billing: billing ?? null };
}

async function sentOf(tx: Tx, kind: Kind) {
  return tx.select({ createdAt: s.emailMessages.createdAt }).from(s.emailMessages).where(eq(s.emailMessages.kind, kind)).orderBy(desc(s.emailMessages.createdAt));
}

/**
 * One agency's onboarding emails are decided one at a time (security review L3): the check of what was
 * sent and the record of what will be sent share a transaction under this lock, so two sweeps or two
 * setups finishing at once never send the same email twice.
 */
async function lockOnboarding(tx: Tx, agencyId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`onboarding emails:${agencyId}`}, 0))`);
}

interface Planned {
  id: string;
  to: { email: string; name: string };
  mail: RenderedEmail;
}

/** Recorded with the agency's other emails, in the deciding transaction. */
async function record(tx: Tx, agencyId: string, kind: Kind, to: { email: string; name: string }, mail: RenderedEmail, now: Date): Promise<Planned> {
  const [row] = await tx.insert(s.emailMessages).values({ agencyId, kind, toEmail: to.email, toName: to.name, subject: mail.subject, textBody: mail.text, status: "sending", createdAt: now }).returning({ id: s.emailMessages.id });
  return { id: row!.id, to, mail };
}

/** Sends a recorded email; a failure is recorded too (the sweep does not retry it). */
async function send(deps: OnboardingDeps, withAgency: WithAgency, agencyId: string, p: Planned): Promise<boolean> {
  try {
    const { providerId } = await deps.mailTransport(agencyId).send({ id: p.id, fromName: "Tabulado", replyTo: null, to: p.to, ...p.mail });
    await withAgency(agencyId, (tx) => tx.update(s.emailMessages).set({ status: "sent", providerId, sentAt: new Date() }).where(eq(s.emailMessages.id, p.id)));
    return true;
  } catch (error) {
    await withAgency(agencyId, (tx) => tx.update(s.emailMessages).set({ status: "failed", error: error instanceof Error ? error.message : String(error) }).where(eq(s.emailMessages.id, p.id)));
    return false;
  }
}

/** The welcome, once per agency, to its first Owner (called when that Owner finishes two-step sign-in). */
export async function sendWelcome(deps: OnboardingDeps, withAgency: WithAgency, agencyId: string, userId: string): Promise<boolean> {
  const now = nowOf(deps);
  const ready = await withAgency(agencyId, async (tx) => {
    await lockOnboarding(tx, agencyId);
    const who = await ownerOf(tx);
    if (!who || who.owner.id !== userId) return null;
    if ((await sentOf(tx, "welcome")).length > 0) return null;
    const domain = inboundDomain();
    const forwardingAddress = domain ? addressOf((await ensureAddress(tx, agencyId)).token, domain) : null;
    const locale = localeOf(who.owner.preferredLocale);
    const mail = renderWelcomeEmail({ name: who.owner.name, locale, agencyName: who.agency.name, trialEndsAt: who.billing?.trialEndsAt ?? null, timeZone: who.timeZone, forwardingAddress, homeUrl: `${deps.baseUrl}/${locale}` });
    return record(tx, agencyId, "welcome", { email: who.owner.email, name: who.owner.name }, mail, now);
  });
  if (!ready) return false;
  return send(deps, withAgency, agencyId, ready);
}

/** The daily sweep's part: a setup reminder and a free-days notice when due. Returns how many went. */
export async function onboardingSweep(deps: OnboardingDeps, withAgency: WithAgency, agencyId: string): Promise<number> {
  const now = nowOf(deps);
  const plan = await withAgency(agencyId, async (tx) => {
    await lockOnboarding(tx, agencyId);
    const who = await ownerOf(tx);
    if (!who) return [];
    const locale = localeOf(who.owner.preferredLocale);
    const to = { email: who.owner.email, name: who.owner.name };
    const out: { kind: Kind; mail: RenderedEmail }[] = [];
    const steps = await setupSteps(tx, (await listPeriods(tx)).some((p) => p.started));
    const left = SETUP_STEPS.filter((k) => !steps[k]);
    const nudges = await sentOf(tx, "setup_nudge");
    if (nudgeDue({ createdAt: who.agency.createdAt, now, sent: nudges.map((n) => n.createdAt), stepsLeft: left.length })) {
      const step = left[0]!;
      out.push({ kind: "setup_nudge", mail: renderSetupNudgeEmail({ name: who.owner.name, locale, agencyName: who.agency.name, step, link: `${deps.baseUrl}/${locale}${STEP_PATH[step]}`, left: left.length }) });
    }
    const trial = await sentOf(tx, "trial_ending");
    const subscribed = Boolean(who.billing?.stripeSubscriptionId && who.billing.status && ["active", "trialing"].includes(who.billing.status));
    const due = trialEmailDue({ trialEndsAt: who.billing?.trialEndsAt ?? null, now, lastSentAt: trial[0]?.createdAt ?? null, subscribed });
    if (due && who.billing?.trialEndsAt) {
      out.push({ kind: "trial_ending", mail: renderTrialEndingEmail({ name: who.owner.name, locale, agencyName: who.agency.name, trialEndsAt: who.billing.trialEndsAt, daysLeft: due.daysLeft, timeZone: who.timeZone, billingUrl: `${deps.baseUrl}/${locale}/settings/billing` }) });
    }
    const planned: Planned[] = [];
    for (const o of out) planned.push(await record(tx, agencyId, o.kind, to, o.mail, now));
    return planned;
  });
  let sent = 0;
  for (const p of plan) if (await send(deps, withAgency, agencyId, p)) sent += 1;
  return sent;
}
