/**
 * The other ways in (decision 0033): an identity at Google, Microsoft or an agency's own provider,
 * linked to one person by the rules in linking.ts; emailed six-digit codes (to sign in, to prove the
 * mailbox before a first link, to confirm it's them); an agency's single sign-on settings. Like
 * service.ts, these run in sign-in mode (the person is found before the agency is known) and then
 * fence themselves to the person's agency. After any first factor the second step follows exactly as
 * after a password (nextStep), except for the demo people in demo mode, who skip it as "Continue as"
 * does (decision K3).
 *
 * After the security review: provider sign-ins are throttled by the identity, not its email (L2); a
 * first link at sign-in needs a code sent to the mailbox unless the provider hosts it (H2a); a person
 * with another identity from that provider is refused (H2b); every link is announced by email (H2c);
 * wrong emailed codes count as wrong authenticator codes, and codes are capped per person and per
 * address (M1); the SSO lookup is capped per address (L1).
 *
 * Nothing here logs or returns a code, a secret, or an ID token.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { auditBy } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { DEMO_AGENCY } from "../demo/dataset";
import { DEMO_PEOPLE } from "../demo/people";
import type { OutgoingMail } from "../mail/transport";
import { can } from "../permissions";
import { appKey, digest, seal, unseal } from "./crypto";
import { DEMO_IDP_ORIGIN, DEMO_SSO_ISSUER } from "./demo-idp-config";
import { codeMatches, EMAIL_CODE_RESEND_MS, EMAIL_CODE_TTL_MS, emailCodeKey, emailCodeState, hashEmailCode, hideEmailCode, newEmailCode } from "./email-code";
import { decideIdentitySignIn, type IdentityRefusal, type Person } from "./linking";
import { forgetDiscovery, type ProviderId, type VerifiedIdentity } from "./oidc";
import {
  codeLocked,
  countCodeFailure,
  deliver,
  enterAgency,
  linkFor,
  lockedLogin,
  log,
  mustConfirm,
  nextStep,
  normalEmail,
  noteThrottle,
  startSession,
  throttled,
  throttleKeys,
  withAuth,
  type AuthDeps,
  type ByOwner,
  type LinkMail,
  type SessionInfo,
} from "./service";

const nowOf = (d: AuthDeps) => (d.now ? d.now() : new Date());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Emailed codes per person (every purpose together) and requests per address (review M1). */
export const CODES_PER_HOUR = 5;
export const CODES_PER_DAY = 10;
export const CODE_REQUESTS_PER_ADDRESS_HOUR = 30;
/** SSO lookups per address in 15 minutes (review L1). */
export const SSO_LOOKUPS_PER_ADDRESS = 20;
/** An agency's client secret, at least this long (review L5): providers issue far longer ones. */
export const SSO_SECRET_MIN = 16;

type User = typeof s.users.$inferSelect;
type Agency = typeof s.agencies.$inferSelect;
interface Found {
  user: User;
  agency: Agency;
}
const personOf = (f: Found | null): Person | null => (f ? { userId: f.user.id, agencyId: f.user.agencyId, status: f.user.status } : null);

// ---------- the mail these flows send ----------

export type CodePurpose = "sign_in" | "link" | "confirm";
export type CodeMailRender = (code: string, user: { name: string; locale: string; agencyName: string }, context: { purpose: CodePurpose; provider?: ProviderId }) => LinkMail;
export type LinkedMailRender = (input: { provider: ProviderId; providerEmail: string | null; name: string; locale: string; agencyName: string; accountUrl: string; at: Date }) => LinkMail;
/** How these flows email people: the code email, the "an account was connected" notice, the app's address for its link. */
export interface IdentityMail {
  code: CodeMailRender;
  linked: LinkedMailRender;
  baseUrl: string;
  /** Sends after the response (live mode); without it, before returning. */
  later?: (job: () => Promise<unknown>) => void;
}

interface Pending {
  agencyId: string;
  mail: OutgoingMail;
}

async function sendAll(deps: AuthDeps, pending: Pending[], later?: (job: () => Promise<unknown>) => void): Promise<void> {
  for (const p of pending) {
    if (later) later(() => deliver(deps, p.agencyId, p.mail));
    else await deliver(deps, p.agencyId, p.mail);
  }
}

async function queueMail(tx: Tx, found: Found, kind: s.EmailKind, mail: LinkMail, kept: { subject: string; text: string }, now: Date): Promise<Pending> {
  const { user, agency } = found;
  const [message] = await tx
    .insert(s.emailMessages)
    .values({ agencyId: agency.id, kind, toEmail: user.email, toName: user.name, subject: kept.subject, textBody: kept.text, status: "sending", createdAt: now })
    .returning({ id: s.emailMessages.id });
  return { agencyId: agency.id, mail: { id: message!.id, fromName: agency.name, replyTo: agency.email, to: { email: user.email, name: user.name }, subject: mail.subject, text: mail.text, html: mail.html } };
}

/** The notice that an outside account now signs in as this person (GitHub's "added to your account" email). */
async function queueLinkedNotice(tx: Tx, found: Found, provider: ProviderId, providerEmail: string | null, mail: IdentityMail, now: Date): Promise<Pending> {
  const rendered = mail.linked({ provider, providerEmail, name: found.user.name, locale: found.user.preferredLocale, agencyName: found.agency.name, accountUrl: `${mail.baseUrl}/${found.user.preferredLocale}/settings/account`, at: now });
  return queueMail(tx, found, "identity_linked", rendered, rendered, now);
}

// ---------- people ----------

/** The person and their agency; this transaction then sees that agency. */
async function personById(tx: Tx, userId: string, agencyId: string): Promise<Found | null> {
  await enterAgency(tx, agencyId);
  const [user] = await tx.select().from(s.users).where(eq(s.users.id, userId));
  const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, agencyId));
  return user && agency ? { user, agency } : null;
}

/**
 * The member an email belongs to: their login names the agency (an email belongs to one person in
 * one agency). In demo mode, also the demo agency's people, who have no login of their own until
 * they set a password.
 */
async function memberByEmail(tx: Tx, email: string, demoMode: boolean): Promise<Found | null> {
  const wanted = normalEmail(email);
  if (!/^[^\s@]+@[^\s@]+$/.test(wanted) || wanted.length > 254) return null;
  const [login] = await tx.select({ userId: s.userLogins.userId, agencyId: s.userLogins.agencyId }).from(s.userLogins).where(eq(s.userLogins.email, wanted));
  if (login) return personById(tx, login.userId, login.agencyId);
  if (!demoMode) return null;
  await enterAgency(tx, DEMO_AGENCY.id);
  const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (!agency?.isDemo) return null;
  const [user] = await tx.select().from(s.users).where(and(eq(s.users.agencyId, DEMO_AGENCY.id), sql`lower(${s.users.email}) = ${wanted}`));
  return user ? { user, agency } : null;
}

/** A demo person in demo mode skips the second step, as "Continue as" does (decision K3). */
const isDemoPerson = (f: Found, demoMode: boolean) => demoMode && f.agency.isDemo && DEMO_PEOPLE.some((p) => p.id === f.user.id);

/** A session begun; `demo` for a demo person's demo session (the visitor's language wins, as with Continue as). */
export type Begun = { ok: true; token: string; next: "done" | "code" | "setup"; locale: string; demo: boolean };

/** A session after a first factor; the second step is the same as after a password. */
async function begin(tx: Tx, found: Found, firstFactor: string, demoMode: boolean, userAgent: string | null, now: Date): Promise<Begun> {
  await enterAgency(tx, found.user.agencyId);
  const demo = isDemoPerson(found, demoMode);
  const [login] = await tx.select({ totpEnabledAt: s.userLogins.totpEnabledAt }).from(s.userLogins).where(eq(s.userLogins.userId, found.user.id));
  const next = demo ? "done" : nextStep({ role: found.user.role, secondStepAt: null, hasAuthenticator: Boolean(login?.totpEnabledAt) });
  const token = await startSession(tx, found.user, { demo, next, userAgent, now, firstFactor });
  if (next === "done") await log(tx, found.user, [{ action: "sign_in", entityType: "user", entityId: found.user.id, after: { method: firstFactor } }], demo);
  return { ok: true, token, next, locale: found.user.preferredLocale, demo };
}

const connected = (provider: ProviderId, email: string | null, how: string) => ({ identity: "connected", provider, email, how });

/** The email lower-cased; "verified" (and "the provider hosts it") only with an email to verify. */
const tidy = (identity: VerifiedIdentity): VerifiedIdentity => {
  const email = identity.email ? normalEmail(identity.email) : null;
  const emailVerified = Boolean(email) && identity.emailVerified;
  return { ...identity, email, emailVerified, mailboxProven: emailVerified && identity.mailboxProven };
};

const identityRow = (tx: Tx, identity: { issuer: string; subject: string }) =>
  tx
    .select()
    .from(s.userIdentities)
    .where(and(eq(s.userIdentities.issuer, identity.issuer), eq(s.userIdentities.subject, identity.subject), isNull(s.userIdentities.removedAt)))
    .then((rows) => rows[0] ?? null);
const hasProviderIdentity = async (tx: Tx, userId: string, provider: ProviderId) =>
  (await tx.select({ id: s.userIdentities.id }).from(s.userIdentities).where(and(eq(s.userIdentities.userId, userId), eq(s.userIdentities.provider, provider), isNull(s.userIdentities.removedAt)))).length > 0;

// ---------- emailed codes: issued within caps, checked as authenticator codes are ----------

/** Counts a request from an address (a digest, in the throttle table) and says whether it is within the cap. */
async function addressWithin(tx: Tx, kind: string, address: string | null, limit: number, windowMs: number, now: Date): Promise<boolean> {
  if (!address) return true;
  const key = digest(`${kind}|${address}`);
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(s.signInFailures)
    .where(and(eq(s.signInFailures.keyHash, key), gt(s.signInFailures.at, new Date(now.getTime() - windowMs))));
  if ((row?.n ?? 0) >= limit) return false;
  await tx.insert(s.signInFailures).values({ keyHash: key, at: now });
  return true;
}

/**
 * A new code for this person and purpose, or null: at most one a minute, five an hour and ten a day
 * (every purpose together). Only a code actually sent replaces the pending one, so requests beyond the
 * caps never void a code its owner is about to type (review M1).
 */
async function issueCode(tx: Tx, found: Found, purpose: CodePurpose, now: Date): Promise<{ id: string; code: string } | null> {
  const userId = found.user.id;
  const [counts] = await tx
    .select({
      minute: sql<number>`count(*) filter (where ${s.emailSignInCodes.createdAt} > ${new Date(now.getTime() - EMAIL_CODE_RESEND_MS).toISOString()}::timestamptz and ${s.emailSignInCodes.purpose} = ${purpose})::int`,
      hour: sql<number>`count(*) filter (where ${s.emailSignInCodes.createdAt} > ${new Date(now.getTime() - HOUR).toISOString()}::timestamptz)::int`,
      day: sql<number>`count(*)::int`,
    })
    .from(s.emailSignInCodes)
    .where(and(eq(s.emailSignInCodes.userId, userId), gt(s.emailSignInCodes.createdAt, new Date(now.getTime() - 24 * HOUR))));
  if ((counts?.minute ?? 0) > 0 || (counts?.hour ?? 0) >= CODES_PER_HOUR || (counts?.day ?? 0) >= CODES_PER_DAY) return null;
  await tx.update(s.emailSignInCodes).set({ usedAt: now }).where(and(eq(s.emailSignInCodes.userId, userId), eq(s.emailSignInCodes.purpose, purpose), isNull(s.emailSignInCodes.usedAt)));
  const id = randomUUID();
  const code = newEmailCode();
  await tx.insert(s.emailSignInCodes).values({ id, agencyId: found.user.agencyId, userId, purpose, codeHash: hashEmailCode(emailCodeKey(appKey()), id, code), createdAt: now, expiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_MS) });
  return { id, code };
}

/** The code email for a purpose; the copy Granite keeps hides the code. */
async function queueCodeMail(tx: Tx, found: Found, code: string, render: CodeMailRender, context: { purpose: CodePurpose; provider?: ProviderId }, now: Date): Promise<Pending> {
  const mail = render(code, { name: found.user.name, locale: found.user.preferredLocale, agencyName: found.agency.name }, context);
  return queueMail(tx, found, "sign_in_code", mail, { subject: hideEmailCode(mail.subject, code), text: hideEmailCode(mail.text, code) }, now);
}

/**
 * A typed code against the person's open code for that purpose (and that row, when given). Wrong
 * ones count as wrong authenticator codes (10 in 15 minutes lock codes for 15 minutes, 100 in a row
 * for a day — review M1); five end that code; a right one clears the counts.
 */
async function checkEmailCode(tx: Tx, found: Found, purpose: CodePurpose, code: string, now: Date, demoMode: boolean, rowId?: string): Promise<"ok" | "invalid" | "locked"> {
  const login = await lockedLogin(tx, found.user.id);
  await enterAgency(tx, found.user.agencyId);
  if (login && codeLocked(login, now)) return "locked";
  const conditions = [eq(s.emailSignInCodes.userId, found.user.id), eq(s.emailSignInCodes.purpose, purpose), isNull(s.emailSignInCodes.usedAt)];
  if (rowId) conditions.push(eq(s.emailSignInCodes.id, rowId));
  const [row] = await tx.select().from(s.emailSignInCodes).where(and(...conditions)).orderBy(desc(s.emailSignInCodes.createdAt)).limit(1).for("update");
  const open = row && emailCodeState(row, now) === "open";
  if (!row || !open || !codeMatches(emailCodeKey(appKey()), row.id, row.codeHash, code)) {
    if (row && open) await tx.update(s.emailSignInCodes).set({ failures: row.failures + 1 }).where(eq(s.emailSignInCodes.id, row.id));
    const locked = login ? await countCodeFailure(tx, login, now) : false;
    await log(tx, found.user, [{ action: "sign_in_failed", entityType: "user", entityId: found.user.id, after: { step: `email code (${purpose})`, locked } }], isDemoPerson(found, demoMode));
    return locked ? "locked" : "invalid";
  }
  await tx.update(s.emailSignInCodes).set({ usedAt: now }).where(eq(s.emailSignInCodes.id, row.id));
  if (login) await tx.update(s.userLogins).set({ codeFailedCount: 0, codeFailedSince: null, codeFailuresInRow: 0, codeLockedUntil: null }).where(eq(s.userLogins.userId, login.userId));
  return "ok";
}

// ---------- signing in with an identity ----------

/** A first link waiting for the code sent to the member's mailbox (review H2a); kept sealed in the browser. */
export interface PendingLink {
  provider: ProviderId;
  issuer: string;
  subject: string;
  email: string | null;
  userId: string;
  agencyId: string;
  codeId: string;
  /** The member's address, partly hidden, for the page ("l***@cedarrow.example.com"). */
  hint: string;
}

export type IdentitySignInResult = Begun | { ok: false; error: IdentityRefusal | "locked" } | { ok: false; error: "proof"; pending: PendingLink };

/** The address partly hidden, never showing its length: GitHub's "hint of the email the code was sent to". */
const hintOf = (email: string) => {
  const at = email.indexOf("@");
  return `${at > 1 ? email[0] : ""}***${email.slice(at)}`;
};

/**
 * A verified identity from Google, Microsoft or (with `sso`) an agency's own provider. Refusals count
 * in the same throttle as wrong passwords, keyed by the identity (issuer and subject) and address.
 */
export async function signInWithIdentity(
  deps: AuthDeps,
  input: { provider: ProviderId; identity: VerifiedIdentity; sso: { agencyId: string; userId: string } | null; demoMode: boolean; userAgent: string | null; address: string | null },
  mail: IdentityMail,
): Promise<IdentitySignInResult> {
  const now = nowOf(deps);
  const identity = tidy(input.identity);
  const keys = throttleKeys(`${identity.issuer}|${identity.subject}`, input.address);
  const { result, pending } = await withAuth(deps, async (tx): Promise<{ result: IdentitySignInResult; pending: Pending[] }> => {
    if (await throttled(tx, keys, now)) return { result: { ok: false, error: "locked" }, pending: [] };
    const row = await identityRow(tx, identity);
    const linked = row ? await personById(tx, row.userId, row.agencyId) : null;
    const byEmail = !row && identity.emailVerified && identity.email ? await memberByEmail(tx, identity.email, input.demoMode) : null;
    const byEmailHasProvider = byEmail ? await hasProviderIdentity(tx, byEmail.user.id, input.provider) : false;
    const decision = decideIdentitySignIn({ linked: personOf(linked), byEmail: personOf(byEmail), emailVerified: identity.emailVerified, mailboxProven: identity.mailboxProven, byEmailHasProvider, sso: input.sso });
    if (!decision.ok) {
      await noteThrottle(tx, keys, now);
      const known = linked ?? byEmail;
      if (known && (!input.sso || known.user.agencyId === input.sso.agencyId)) {
        await enterAgency(tx, known.user.agencyId);
        await log(tx, known.user, [{ action: "sign_in_failed", entityType: "user", entityId: known.user.id, after: { step: input.provider, reason: decision.reason } }]);
      }
      return { result: { ok: false, error: decision.reason }, pending: [] };
    }
    const found = (linked ?? byEmail)!;
    await enterAgency(tx, found.user.agencyId);
    if (decision.proof) {
      // Prove the mailbox now: a code to the member's address, typed on the next page.
      const issued = await issueCode(tx, found, "link", now);
      if (!issued) return { result: { ok: false, error: "locked" }, pending: [] };
      const sent = await queueCodeMail(tx, found, issued.code, mail.code, { purpose: "link", provider: input.provider }, now);
      return {
        result: { ok: false, error: "proof", pending: { provider: input.provider, issuer: identity.issuer, subject: identity.subject, email: identity.email, userId: found.user.id, agencyId: found.user.agencyId, codeId: issued.id, hint: hintOf(found.user.email) } },
        pending: [sent],
      };
    }
    const notices: Pending[] = [];
    if (row) await tx.update(s.userIdentities).set({ lastUsedAt: now }).where(eq(s.userIdentities.id, row.id));
    else {
      const added = await tx
        .insert(s.userIdentities)
        .values({ agencyId: found.user.agencyId, userId: found.user.id, provider: input.provider, issuer: identity.issuer, subject: identity.subject, email: identity.email, createdAt: now, lastUsedAt: now })
        .onConflictDoNothing()
        .returning({ id: s.userIdentities.id });
      if (added.length > 0) {
        await log(tx, found.user, [{ action: "update", entityType: "user", entityId: found.user.id, after: connected(input.provider, identity.email, "verified email at sign-in") }], isDemoPerson(found, input.demoMode));
        notices.push(await queueLinkedNotice(tx, found, input.provider, identity.email, mail, now));
      }
    }
    if (keys[0]) await tx.delete(s.signInFailures).where(eq(s.signInFailures.keyHash, keys[0]));
    return { result: await begin(tx, found, input.provider, input.demoMode, input.userAgent, now), pending: notices };
  });
  await sendAll(deps, pending, mail.later);
  return result;
}

/** The code sent for a first link, typed: the identity is linked (and announced), and the sign-in goes on. */
export async function finishLinkProof(
  deps: AuthDeps,
  link: PendingLink,
  code: string,
  input: { userAgent: string | null; address: string | null; demoMode: boolean },
  mail: IdentityMail,
): Promise<Begun | { ok: false; error: "invalid" | "locked" | "expired" | "taken" | "other_identity" }> {
  if (!UUID.test(link.userId) || !UUID.test(link.agencyId) || !UUID.test(link.codeId)) return { ok: false, error: "expired" };
  const now = nowOf(deps);
  const keys = throttleKeys(`${link.issuer}|${link.subject}`, input.address);
  type Out = Begun | { ok: false; error: "invalid" | "locked" | "expired" | "taken" | "other_identity" };
  const { result, pending } = await withAuth(deps, async (tx): Promise<{ result: Out; pending: Pending[] }> => {
    if (await throttled(tx, keys, now)) return { result: { ok: false, error: "locked" }, pending: [] };
    const found = await personById(tx, link.userId, link.agencyId);
    if (!found || found.user.status !== "active") return { result: { ok: false, error: "expired" }, pending: [] };
    const checked = await checkEmailCode(tx, found, "link", code, now, input.demoMode, link.codeId);
    if (checked !== "ok") {
      await noteThrottle(tx, keys, now);
      return { result: { ok: false, error: checked }, pending: [] };
    }
    const row = await identityRow(tx, link);
    if (row && row.userId !== found.user.id) return { result: { ok: false, error: "taken" }, pending: [] };
    const notices: Pending[] = [];
    if (!row) {
      if (await hasProviderIdentity(tx, found.user.id, link.provider)) return { result: { ok: false, error: "other_identity" }, pending: [] };
      await tx.insert(s.userIdentities).values({ agencyId: found.user.agencyId, userId: found.user.id, provider: link.provider, issuer: link.issuer, subject: link.subject, email: link.email, createdAt: now, lastUsedAt: now });
      await log(tx, found.user, [{ action: "update", entityType: "user", entityId: found.user.id, after: connected(link.provider, link.email, "emailed code at sign-in") }], isDemoPerson(found, input.demoMode));
      notices.push(await queueLinkedNotice(tx, found, link.provider, link.email, mail, now));
    }
    if (keys[0]) await tx.delete(s.signInFailures).where(eq(s.signInFailures.keyHash, keys[0]));
    return { result: await begin(tx, found, link.provider, input.demoMode, input.userAgent, now), pending: notices };
  });
  await sendAll(deps, pending, mail.later);
  return result;
}

/** A new code for a waiting link (within the caps); the waiting link then names it. */
export async function resendLinkProof(deps: AuthDeps, link: PendingLink, mail: IdentityMail): Promise<PendingLink | null> {
  if (!UUID.test(link.userId) || !UUID.test(link.agencyId)) return null;
  const now = nowOf(deps);
  const out = await withAuth(deps, async (tx) => {
    const found = await personById(tx, link.userId, link.agencyId);
    if (!found || found.user.status !== "active") return null;
    const issued = await issueCode(tx, found, "link", now);
    if (!issued) return null;
    return { link: { ...link, codeId: issued.id }, pending: await queueCodeMail(tx, found, issued.code, mail.code, { purpose: "link", provider: link.provider }, now) };
  });
  if (!out) return null;
  await sendAll(deps, [out.pending], mail.later);
  return out.link;
}

// ---------- Your account: connect and disconnect (rule a) ----------

export interface ConnectedIdentity {
  id: string;
  provider: ProviderId;
  email: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export async function identitiesOf(deps: AuthDeps, userId: string): Promise<ConnectedIdentity[]> {
  const rows = await withAuth(deps, (tx) =>
    tx
      .select({ id: s.userIdentities.id, provider: s.userIdentities.provider, email: s.userIdentities.email, createdAt: s.userIdentities.createdAt, lastUsedAt: s.userIdentities.lastUsedAt })
      .from(s.userIdentities)
      .where(and(eq(s.userIdentities.userId, userId), isNull(s.userIdentities.removedAt))),
  );
  return rows.sort((a, b) => a.provider.localeCompare(b.provider));
}

/**
 * An identity connected by the signed-in person (whatever its email says: they proved both). Once per
 * provider; never one that belongs to someone else; announced by email. A full session confirms it's
 * them first, unless the flow that brought the identity began confirmed (`flowConfirmed`).
 */
export async function connectIdentity(
  deps: AuthDeps,
  session: SessionInfo,
  provider: ProviderId,
  given: VerifiedIdentity,
  opts: { flowConfirmed?: boolean; mail: IdentityMail },
): Promise<{ ok: true } | { ok: false; error: "confirm" | "taken" | "already" }> {
  if (!opts.flowConfirmed && (await mustConfirm(deps, session))) return { ok: false, error: "confirm" };
  const identity = tidy(given);
  const now = nowOf(deps);
  type Out = { ok: true } | { ok: false; error: "taken" | "already" };
  const { result, pending } = await withAuth(deps, async (tx): Promise<{ result: Out; pending: Pending[] }> => {
    const found = await personById(tx, session.userId, session.agencyId);
    if (!found) return { result: { ok: false, error: "taken" }, pending: [] };
    const row = await identityRow(tx, identity);
    if (row) return { result: row.userId === session.userId && row.provider === provider ? { ok: true } : { ok: false, error: "taken" }, pending: [] };
    if (await hasProviderIdentity(tx, session.userId, provider)) return { result: { ok: false, error: "already" }, pending: [] };
    const added = await tx
      .insert(s.userIdentities)
      .values({ agencyId: session.agencyId, userId: session.userId, provider, issuer: identity.issuer, subject: identity.subject, email: identity.email, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: s.userIdentities.id });
    if (added.length === 0) return { result: { ok: false, error: "taken" }, pending: [] };
    await log(tx, { id: session.userId, agencyId: session.agencyId, name: session.name }, [{ action: "update", entityType: "user", entityId: session.userId, after: connected(provider, identity.email, "your account") }], session.demo);
    return { result: { ok: true }, pending: [await queueLinkedNotice(tx, found, provider, identity.email, opts.mail, now)] };
  });
  await sendAll(deps, pending, opts.mail.later);
  return result;
}

/** Disconnected (kept as removed, for the record); it can be connected again. */
export async function disconnectIdentity(deps: AuthDeps, session: SessionInfo, identityId: string): Promise<{ ok: true } | { ok: false; error: "confirm" | "not_found" }> {
  if (!UUID.test(identityId)) return { ok: false, error: "not_found" };
  if (await mustConfirm(deps, session)) return { ok: false, error: "confirm" };
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, session.agencyId);
    const [row] = await tx
      .update(s.userIdentities)
      .set({ removedAt: now })
      .where(and(eq(s.userIdentities.id, identityId), eq(s.userIdentities.userId, session.userId), isNull(s.userIdentities.removedAt)))
      .returning();
    if (!row) return { ok: false as const, error: "not_found" as const };
    await log(tx, { id: session.userId, agencyId: session.agencyId, name: session.name }, [{ action: "update", entityType: "user", entityId: session.userId, after: { identity: "disconnected", provider: row.provider, email: row.email } }], session.demo);
    return { ok: true as const };
  });
}

// ---------- an invite accepted with an identity (rule b) ----------

/** The invite link came by email to that address, so the mailbox is already proven; announced by email. */
export async function acceptInviteWithIdentity(
  deps: AuthDeps,
  token: string,
  provider: ProviderId,
  given: VerifiedIdentity,
  userAgent: string | null,
  mail: IdentityMail,
): Promise<Begun | { ok: false; error: "expired" | "not_verified" | "email_mismatch" | "taken" }> {
  if (!/^sbau_[A-Za-z0-9_-]{43}$/.test(token)) return { ok: false, error: "expired" };
  const identity = tidy(given);
  const info = await linkFor(deps, token, "invite");
  if (!info) return { ok: false, error: "expired" };
  if (!identity.emailVerified || !identity.email) return { ok: false, error: "not_verified" };
  if (identity.email !== normalEmail(info.email)) return { ok: false, error: "email_mismatch" };
  const now = nowOf(deps);
  type Out = Begun | { ok: false; error: "expired" | "taken" };
  const { result, pending } = await withAuth(deps, async (tx): Promise<{ result: Out; pending: Pending[] }> => {
    const [row] = await tx
      .select()
      .from(s.authTokens)
      .where(and(eq(s.authTokens.tokenHash, digest(token)), eq(s.authTokens.purpose, "invite"), isNull(s.authTokens.usedAt), gt(s.authTokens.expiresAt, now)))
      .for("update");
    if (!row) return { result: { ok: false, error: "expired" }, pending: [] };
    if (await identityRow(tx, identity)) return { result: { ok: false, error: "taken" }, pending: [] };
    const found = await personById(tx, row.userId, row.agencyId);
    if (!found || found.user.status !== "invited") return { result: { ok: false, error: "expired" }, pending: [] };
    await tx.update(s.authTokens).set({ usedAt: now }).where(eq(s.authTokens.id, row.id));
    await tx.update(s.users).set({ status: "active" }).where(eq(s.users.id, found.user.id));
    await tx.insert(s.userIdentities).values({ agencyId: found.user.agencyId, userId: found.user.id, provider, issuer: identity.issuer, subject: identity.subject, email: identity.email, createdAt: now, lastUsedAt: now });
    await log(tx, found.user, [
      { action: "update", entityType: "user", entityId: found.user.id, after: { invite: "accepted", with: provider } },
      { action: "update", entityType: "user", entityId: found.user.id, after: connected(provider, identity.email, "invite") },
    ]);
    const active = { ...found, user: { ...found.user, status: "active" as const } };
    const notice = await queueLinkedNotice(tx, active, provider, identity.email, mail, now);
    return { result: await begin(tx, active, provider, false, userAgent, now), pending: [notice] };
  });
  await sendAll(deps, pending, mail.later);
  return result;
}

// ---------- emailed sign-in codes ----------

/**
 * A six-digit code for an active member (within the caps; a newer one replaces the older); the same
 * nothing for anyone else, and no record for an unknown address. With `later` (live mode) all the
 * work — the lookup included — runs after the response, so members and non-members answer alike
 * (review L1); without it, before returning (tests, the demo mailbox).
 */
export async function requestEmailCode(deps: AuthDeps, email: string, render: CodeMailRender, demoMode: boolean, opts: { address?: string | null; later?: (job: () => Promise<unknown>) => void } = {}): Promise<void> {
  const now = nowOf(deps);
  const job = async () => {
    const pending = await withAuth(deps, async (tx): Promise<Pending | null> => {
      if (!(await addressWithin(tx, "code-request", opts.address ?? null, CODE_REQUESTS_PER_ADDRESS_HOUR, HOUR, now))) return null;
      const found = await memberByEmail(tx, email, demoMode);
      if (!found || found.user.status !== "active") return null;
      const issued = await issueCode(tx, found, "sign_in", now);
      if (!issued) return null;
      const sent = await queueCodeMail(tx, found, issued.code, render, { purpose: "sign_in" }, now);
      await log(tx, found.user, [{ action: "update", entityType: "user", entityId: found.user.id, after: { signInCode: "sent" } }], isDemoPerson(found, demoMode));
      return sent;
    });
    if (pending) await deliver(deps, pending.agencyId, pending.mail);
  };
  if (opts.later) opts.later(job);
  else await job();
}

/**
 * The code typed, as a first factor. Any refusal reads the same ("invalid": wrong, used, expired,
 * spent, or no such member), so the page tells nothing about who has an account. Wrong codes count in
 * the password throttle (email and address) and as wrong authenticator codes for the person.
 */
export async function verifyEmailCode(deps: AuthDeps, email: string, code: string, userAgent: string | null, address: string | null, demoMode: boolean): Promise<Begun | { ok: false; error: "invalid" | "locked" }> {
  const now = nowOf(deps);
  const keys = throttleKeys(email, address);
  return withAuth(deps, async (tx): Promise<Begun | { ok: false; error: "invalid" | "locked" }> => {
    if (await throttled(tx, keys, now)) return { ok: false, error: "locked" };
    const found = await memberByEmail(tx, email, demoMode);
    if (!found || found.user.status !== "active") {
      await noteThrottle(tx, keys, now);
      return { ok: false, error: "invalid" };
    }
    const checked = await checkEmailCode(tx, found, "sign_in", code, now, demoMode);
    if (checked !== "ok") {
      await noteThrottle(tx, keys, now);
      return { ok: false, error: checked };
    }
    if (keys[0]) await tx.delete(s.signInFailures).where(eq(s.signInFailures.keyHash, keys[0]));
    return begin(tx, found, "email_code", demoMode, userAgent, now);
  });
}

/** Demo only: the latest code email the demo mailbox kept for this address (the pages show it). */
export async function demoCodeCopy(deps: AuthDeps, email: string): Promise<string | null> {
  const wanted = normalEmail(email);
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, DEMO_AGENCY.id);
    const [agency] = await tx.select({ isDemo: s.agencies.isDemo }).from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
    if (!agency?.isDemo) return null;
    const [row] = await tx
      .select({ textBody: s.demoMailbox.textBody })
      .from(s.demoMailbox)
      .innerJoin(s.emailMessages, eq(s.emailMessages.id, s.demoMailbox.emailMessageId))
      .where(and(eq(s.emailMessages.kind, "sign_in_code"), sql`lower(${s.demoMailbox.toEmail}) = ${wanted}`))
      .orderBy(desc(s.demoMailbox.createdAt))
      .limit(1);
    return row?.textBody ?? null;
  });
}

/** Demo only: the latest code email the demo mailbox kept for this person (the link page shows it). */
export async function demoCodeCopyFor(deps: AuthDeps, userId: string, agencyId: string): Promise<string | null> {
  if (!UUID.test(userId) || !UUID.test(agencyId)) return null;
  const found = await withAuth(deps, (tx) => personById(tx, userId, agencyId));
  return found ? demoCodeCopy(deps, found.user.email) : null;
}

// ---------- "confirm it's you" by an emailed code (review L3) ----------

/** A code to the signed-in person's email, for a person with neither a password nor an authenticator. */
export async function sendConfirmCode(deps: AuthDeps, session: SessionInfo, render: CodeMailRender): Promise<{ ok: true } | { ok: false; error: "too_many" }> {
  const now = nowOf(deps);
  const pending = await withAuth(deps, async (tx) => {
    const found = await personById(tx, session.userId, session.agencyId);
    if (!found || found.user.status !== "active") return null;
    const issued = await issueCode(tx, found, "confirm", now);
    return issued ? queueCodeMail(tx, found, issued.code, render, { purpose: "confirm" }, now) : null;
  });
  if (!pending) return { ok: false, error: "too_many" };
  await deliver(deps, pending.agencyId, pending.mail);
  return { ok: true };
}

/** The emailed code given: this session is confirmed for the next 15 minutes, as with a password. */
export async function confirmByEmailCode(deps: AuthDeps, session: SessionInfo, code: string): Promise<{ ok: true } | { ok: false; error: "invalid" | "locked" }> {
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    const found = await personById(tx, session.userId, session.agencyId);
    if (!found || found.user.status !== "active") return { ok: false as const, error: "invalid" as const };
    const checked = await checkEmailCode(tx, found, "confirm", code, now, false);
    if (checked !== "ok") return { ok: false as const, error: checked };
    await tx.update(s.sessions).set({ confirmedAt: now }).where(eq(s.sessions.id, session.sessionId));
    return { ok: true as const };
  });
}

// ---------- an agency's single sign-on ----------

/** The issuer as used: the demo agency's is the stand-in, usable only in demo mode. */
export function resolveIssuer(stored: string, demoMode: boolean): string | null {
  if (stored.startsWith(`${DEMO_IDP_ORIGIN}/`)) return demoMode ? stored : null;
  return demoMode ? null : stored;
}

export interface SsoSettings {
  enabled: boolean;
  issuer: string;
  clientId: string;
  secretLast4: string;
  updatedAt: Date;
  updatedByLabel: string;
}

export async function ssoSettingsOf(deps: AuthDeps, agencyId: string): Promise<SsoSettings | null> {
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, agencyId);
    const [row] = await tx.select().from(s.agencySso).where(eq(s.agencySso.agencyId, agencyId));
    return row ? { enabled: row.enabled, issuer: row.issuer, clientId: row.clientId, secretLast4: row.secretLast4, updatedAt: row.updatedAt, updatedByLabel: row.updatedByLabel } : null;
  });
}

export type SsoError = "not_allowed" | "invalid_issuer" | "issuer_private" | "invalid_client_id" | "secret_required" | "secret_too_short" | "invalid_secret" | "issuer_unreachable" | "demo_issuer_only" | "not_set_up";
const secretAad = (agencyId: string) => `sso:${agencyId}`;
const wellKnownOf = (issuer: string) => `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;

/** "private" for an IP address; "invalid" for anything that is not a plain https address. */
function issuerProblem(issuer: string): "invalid" | "private" | null {
  if (issuer.length === 0 || issuer.length > 300) return "invalid";
  try {
    const url = new URL(issuer);
    if (url.protocol !== "https:" || url.search !== "" || url.hash !== "" || url.username !== "" || url.password !== "" || (url.port !== "" && url.port !== "443")) return "invalid";
    // An address, not a name: never (review M2).
    if (/^\[.*\]$/.test(url.hostname) || /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname)) return "private";
    return null;
  } catch {
    return "invalid";
  }
}

/**
 * The Owner's provider details. The secret is sealed under the app key, bound to the agency, and
 * never returned; left empty, the saved one stays. The issuer must be a public https name whose
 * discovery document answers with endpoints on its own host (`check`; Stripe's configuration checks;
 * review M2). In demo mode only the demo's stand-in can be saved.
 */
export async function saveSsoSettings(
  deps: AuthDeps,
  by: ByOwner,
  input: { issuer: string; clientId: string; clientSecret: string | null },
  opts: { demoMode: boolean; check: (issuer: string) => Promise<"ok" | "private" | "unreachable"> },
): Promise<{ ok: true } | { ok: false; error: SsoError }> {
  if (!can(by, "members")) return { ok: false, error: "not_allowed" };
  const issuer = input.issuer.trim();
  const clientId = input.clientId.trim();
  const secret = input.clientSecret && input.clientSecret.trim() ? input.clientSecret.trim() : null;
  if (opts.demoMode) {
    if (issuer !== DEMO_SSO_ISSUER) return { ok: false, error: "demo_issuer_only" };
  } else {
    const problem = issuerProblem(issuer);
    if (problem) return { ok: false, error: problem === "private" ? "issuer_private" : "invalid_issuer" };
  }
  if (clientId.length === 0 || clientId.length > 255) return { ok: false, error: "invalid_client_id" };
  if (secret && secret.length > 1000) return { ok: false, error: "invalid_secret" };
  if (secret && secret.length < SSO_SECRET_MIN) return { ok: false, error: "secret_too_short" };
  const existing = await withAuth(deps, async (tx) => {
    await enterAgency(tx, by.agencyId);
    return (await tx.select().from(s.agencySso).where(eq(s.agencySso.agencyId, by.agencyId)))[0] ?? null;
  });
  if (!secret && !existing) return { ok: false, error: "secret_required" };
  const checked = await opts.check(issuer);
  if (checked !== "ok") return { ok: false, error: checked === "private" ? "issuer_private" : "issuer_unreachable" };
  const now = nowOf(deps);
  await withAuth(deps, async (tx) => {
    await enterAgency(tx, by.agencyId);
    const values = {
      issuer,
      clientId,
      clientSecret: secret ? seal(Buffer.from(secret, "utf8"), appKey(), secretAad(by.agencyId)) : existing!.clientSecret,
      secretLast4: secret ? secret.slice(-4) : existing!.secretLast4,
      updatedAt: now,
      updatedByLabel: by.label,
    };
    await tx
      .insert(s.agencySso)
      .values({ agencyId: by.agencyId, enabled: false, ...values })
      .onConflictDoUpdate({ target: s.agencySso.agencyId, set: values });
    await auditBy(tx, { agencyId: by.agencyId, userId: by.userId, label: by.label }, [
      { action: "update", entityType: "agency", entityId: by.agencyId, before: existing ? { sso: { issuer: existing.issuer, clientId: existing.clientId } } : null, after: { sso: { issuer, clientId, secret: secret ? (existing ? "replaced" : "set") : "kept" } } },
    ]);
  });
  // The provider is read afresh after any change (review L6).
  forgetDiscovery(wellKnownOf(issuer));
  if (existing) forgetDiscovery(wellKnownOf(existing.issuer));
  return { ok: true };
}

/** On or off (its details saved first). SSO adds a way in; it does not take the others away. */
export async function setSsoEnabled(deps: AuthDeps, by: ByOwner, enabled: boolean): Promise<{ ok: true } | { ok: false; error: SsoError }> {
  if (!can(by, "members")) return { ok: false, error: "not_allowed" };
  const now = nowOf(deps);
  const out = await withAuth(deps, async (tx) => {
    await enterAgency(tx, by.agencyId);
    const [row] = await tx.update(s.agencySso).set({ enabled, updatedAt: now, updatedByLabel: by.label }).where(eq(s.agencySso.agencyId, by.agencyId)).returning();
    if (!row) return null;
    await auditBy(tx, { agencyId: by.agencyId, userId: by.userId, label: by.label }, [{ action: "update", entityType: "agency", entityId: by.agencyId, after: { sso: { enabled } } }]);
    return row.issuer;
  });
  if (!out) return { ok: false, error: "not_set_up" };
  forgetDiscovery(wellKnownOf(out));
  return { ok: true };
}

/**
 * Where a typed email signs in with SSO: an active member of an agency with SSO on; "not_set_up" for
 * everyone else; "locked" past 20 lookups from an address in 15 minutes (review L1).
 */
export async function ssoForEmail(deps: AuthDeps, email: string, opts: { demoMode: boolean; address: string | null }): Promise<{ ok: true; agencyId: string; userId: string; issuer: string; clientId: string } | { ok: false; error: "not_set_up" | "locked" }> {
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    if (!(await addressWithin(tx, "sso-lookup", opts.address, SSO_LOOKUPS_PER_ADDRESS, 15 * MINUTE, now))) return { ok: false as const, error: "locked" as const };
    const found = await memberByEmail(tx, email, opts.demoMode);
    if (!found || found.user.status !== "active") return { ok: false as const, error: "not_set_up" as const };
    await enterAgency(tx, found.user.agencyId);
    const [row] = await tx.select().from(s.agencySso).where(eq(s.agencySso.agencyId, found.user.agencyId));
    const issuer = row?.enabled ? resolveIssuer(row.issuer, opts.demoMode) : null;
    return row && issuer ? { ok: true as const, agencyId: found.user.agencyId, userId: found.user.id, issuer, clientId: row.clientId } : { ok: false as const, error: "not_set_up" as const };
  });
}

/** The agency's provider for the code exchange (its secret unsealed), while SSO is on. */
export async function ssoConfigOf(deps: AuthDeps, agencyId: string, opts: { demoMode: boolean }): Promise<{ issuer: string; clientId: string; clientSecret: string } | null> {
  if (!UUID.test(agencyId)) return null;
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, agencyId);
    const [row] = await tx.select().from(s.agencySso).where(eq(s.agencySso.agencyId, agencyId));
    const issuer = row?.enabled ? resolveIssuer(row.issuer, opts.demoMode) : null;
    if (!row || !issuer) return null;
    return { issuer, clientId: row.clientId, clientSecret: unseal(row.clientSecret, appKey(), secretAad(agencyId)).toString("utf8") };
  });
}
