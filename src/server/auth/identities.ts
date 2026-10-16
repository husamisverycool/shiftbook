/**
 * The other ways in (decision 0033): an identity at Google, Microsoft or an agency's own provider,
 * linked to one person by the rules in linking.ts; emailed six-digit codes; an agency's single
 * sign-on settings. Like service.ts, these run in sign-in mode (the person is found before the agency
 * is known) and then fence themselves to the person's agency. After any of them the second step
 * follows exactly as after a password (nextStep), except for the demo people in demo mode, who skip
 * it as "Continue as" does (decision K3).
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
import { DEMO_SSO_ISSUER } from "./demo-idp-config";
import { codeMatches, EMAIL_CODE_RESEND_MS, EMAIL_CODE_TTL_MS, emailCodeKey, emailCodeState, hashEmailCode, hideEmailCode, newEmailCode } from "./email-code";
import { decideIdentitySignIn, type IdentityRefusal, type Person } from "./linking";
import type { ProviderId, VerifiedIdentity } from "./oidc";
import {
  countPasswordFailure,
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

type User = typeof s.users.$inferSelect;
type Agency = typeof s.agencies.$inferSelect;
interface Found {
  user: User;
  agency: Agency;
}
const personOf = (f: Found | null): Person | null => (f ? { userId: f.user.id, agencyId: f.user.agencyId, status: f.user.status } : null);

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

/** The email lower-cased; "verified" only with an email to verify. */
const tidy = (identity: VerifiedIdentity): VerifiedIdentity => {
  const email = identity.email ? normalEmail(identity.email) : null;
  return { ...identity, email, emailVerified: Boolean(email) && identity.emailVerified };
};

// ---------- signing in with an identity ----------

export type IdentitySignInResult = Begun | { ok: false; error: IdentityRefusal | "locked" };

/**
 * A verified identity from Google, Microsoft or (with `sso`) an agency's own provider. Refusals count
 * in the same throttle as wrong passwords (per email or identity and address, and per address).
 */
export async function signInWithIdentity(
  deps: AuthDeps,
  input: { provider: ProviderId; identity: VerifiedIdentity; sso: { agencyId: string; userId: string } | null; demoMode: boolean; userAgent: string | null; address: string | null },
): Promise<IdentitySignInResult> {
  const now = nowOf(deps);
  const identity = tidy(input.identity);
  const keys = throttleKeys(identity.email ?? `${identity.issuer}|${identity.subject}`, input.address);
  return withAuth(deps, async (tx): Promise<IdentitySignInResult> => {
    if (await throttled(tx, keys, now)) return { ok: false, error: "locked" };
    const [row] = await tx
      .select()
      .from(s.userIdentities)
      .where(and(eq(s.userIdentities.issuer, identity.issuer), eq(s.userIdentities.subject, identity.subject), isNull(s.userIdentities.removedAt)));
    const linked = row ? await personById(tx, row.userId, row.agencyId) : null;
    const byEmail = !row && identity.emailVerified && identity.email ? await memberByEmail(tx, identity.email, input.demoMode) : null;
    const decision = decideIdentitySignIn({ linked: personOf(linked), byEmail: personOf(byEmail), emailVerified: identity.emailVerified, sso: input.sso });
    if (!decision.ok) {
      await noteThrottle(tx, keys, now);
      const known = linked ?? byEmail;
      if (known && (!input.sso || known.user.agencyId === input.sso.agencyId)) {
        await enterAgency(tx, known.user.agencyId);
        await log(tx, known.user, [{ action: "sign_in_failed", entityType: "user", entityId: known.user.id, after: { step: input.provider, reason: decision.reason } }]);
      }
      return { ok: false, error: decision.reason };
    }
    const found = (linked ?? byEmail)!;
    await enterAgency(tx, found.user.agencyId);
    if (row) await tx.update(s.userIdentities).set({ lastUsedAt: now }).where(eq(s.userIdentities.id, row.id));
    else {
      // Rule c: linked now, unless the person already has one from this provider (one each, as Vercel keeps them).
      const [has] = await tx.select({ id: s.userIdentities.id }).from(s.userIdentities).where(and(eq(s.userIdentities.userId, found.user.id), eq(s.userIdentities.provider, input.provider), isNull(s.userIdentities.removedAt)));
      if (!has) {
        const added = await tx
          .insert(s.userIdentities)
          .values({ agencyId: found.user.agencyId, userId: found.user.id, provider: input.provider, issuer: identity.issuer, subject: identity.subject, email: identity.email, createdAt: now, lastUsedAt: now })
          .onConflictDoNothing()
          .returning({ id: s.userIdentities.id });
        if (added.length > 0) await log(tx, found.user, [{ action: "update", entityType: "user", entityId: found.user.id, after: connected(input.provider, identity.email, "verified email at sign-in") }], isDemoPerson(found, input.demoMode));
      }
    }
    if (keys[0]) await tx.delete(s.signInFailures).where(eq(s.signInFailures.keyHash, keys[0]));
    return begin(tx, found, input.provider, input.demoMode, input.userAgent, now);
  });
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
 * provider; never one that belongs to someone else. A full session confirms it's them first, unless
 * the flow that brought the identity began confirmed (`flowConfirmed`, checked when it began).
 */
export async function connectIdentity(deps: AuthDeps, session: SessionInfo, provider: ProviderId, given: VerifiedIdentity, opts: { flowConfirmed?: boolean } = {}): Promise<{ ok: true } | { ok: false; error: "confirm" | "taken" | "already" }> {
  if (!opts.flowConfirmed && (await mustConfirm(deps, session))) return { ok: false, error: "confirm" };
  const identity = tidy(given);
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, session.agencyId);
    const [row] = await tx.select().from(s.userIdentities).where(and(eq(s.userIdentities.issuer, identity.issuer), eq(s.userIdentities.subject, identity.subject), isNull(s.userIdentities.removedAt)));
    if (row) return row.userId === session.userId && row.provider === provider ? { ok: true as const } : { ok: false as const, error: "taken" as const };
    const [mine] = await tx.select({ id: s.userIdentities.id }).from(s.userIdentities).where(and(eq(s.userIdentities.userId, session.userId), eq(s.userIdentities.provider, provider), isNull(s.userIdentities.removedAt)));
    if (mine) return { ok: false as const, error: "already" as const };
    const added = await tx
      .insert(s.userIdentities)
      .values({ agencyId: session.agencyId, userId: session.userId, provider, issuer: identity.issuer, subject: identity.subject, email: identity.email, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: s.userIdentities.id });
    if (added.length === 0) return { ok: false as const, error: "taken" as const };
    await log(tx, { id: session.userId, agencyId: session.agencyId, name: session.name }, [{ action: "update", entityType: "user", entityId: session.userId, after: connected(provider, identity.email, "your account") }], session.demo);
    return { ok: true as const };
  });
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

export async function acceptInviteWithIdentity(deps: AuthDeps, token: string, provider: ProviderId, given: VerifiedIdentity, userAgent: string | null): Promise<Begun | { ok: false; error: "expired" | "not_verified" | "email_mismatch" | "taken" }> {
  if (!/^sbau_[A-Za-z0-9_-]{43}$/.test(token)) return { ok: false, error: "expired" };
  const identity = tidy(given);
  const info = await linkFor(deps, token, "invite");
  if (!info) return { ok: false, error: "expired" };
  if (!identity.emailVerified || !identity.email) return { ok: false, error: "not_verified" };
  if (identity.email !== normalEmail(info.email)) return { ok: false, error: "email_mismatch" };
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    const [row] = await tx
      .select()
      .from(s.authTokens)
      .where(and(eq(s.authTokens.tokenHash, digest(token)), eq(s.authTokens.purpose, "invite"), isNull(s.authTokens.usedAt), gt(s.authTokens.expiresAt, now)))
      .for("update");
    if (!row) return { ok: false as const, error: "expired" as const };
    const [taken] = await tx.select({ id: s.userIdentities.id }).from(s.userIdentities).where(and(eq(s.userIdentities.issuer, identity.issuer), eq(s.userIdentities.subject, identity.subject), isNull(s.userIdentities.removedAt)));
    if (taken) return { ok: false as const, error: "taken" as const };
    const found = await personById(tx, row.userId, row.agencyId);
    if (!found || found.user.status !== "invited") return { ok: false as const, error: "expired" as const };
    await tx.update(s.authTokens).set({ usedAt: now }).where(eq(s.authTokens.id, row.id));
    await tx.update(s.users).set({ status: "active" }).where(eq(s.users.id, found.user.id));
    await tx.insert(s.userIdentities).values({ agencyId: found.user.agencyId, userId: found.user.id, provider, issuer: identity.issuer, subject: identity.subject, email: identity.email, createdAt: now, lastUsedAt: now });
    await log(tx, found.user, [
      { action: "update", entityType: "user", entityId: found.user.id, after: { invite: "accepted", with: provider } },
      { action: "update", entityType: "user", entityId: found.user.id, after: connected(provider, identity.email, "invite") },
    ]);
    return begin(tx, { ...found, user: { ...found.user, status: "active" } }, provider, false, userAgent, now);
  });
}

// ---------- emailed sign-in codes ----------

export type CodeMailRender = (code: string, user: { name: string; locale: string; agencyName: string }) => LinkMail;

/**
 * A six-digit code for an active member (at most one a minute; a newer one replaces the older); the
 * same nothing for anyone else. `later` sends it after the response (an existing account answers as
 * fast as an unknown one); without it, before returning (tests, the demo mailbox).
 */
export async function requestEmailCode(deps: AuthDeps, email: string, render: CodeMailRender, demoMode: boolean, later?: (job: () => Promise<unknown>) => void): Promise<void> {
  const now = nowOf(deps);
  const pending = await withAuth(deps, async (tx): Promise<{ agencyId: string; mail: OutgoingMail } | null> => {
    const found = await memberByEmail(tx, email, demoMode);
    if (!found || found.user.status !== "active") return null;
    const { user, agency } = found;
    const [recent] = await tx.select({ id: s.emailSignInCodes.id }).from(s.emailSignInCodes).where(and(eq(s.emailSignInCodes.userId, user.id), gt(s.emailSignInCodes.createdAt, new Date(now.getTime() - EMAIL_CODE_RESEND_MS))));
    if (recent) return null;
    await tx.update(s.emailSignInCodes).set({ usedAt: now }).where(and(eq(s.emailSignInCodes.userId, user.id), isNull(s.emailSignInCodes.usedAt)));
    const id = randomUUID();
    const code = newEmailCode();
    await tx.insert(s.emailSignInCodes).values({ id, agencyId: user.agencyId, userId: user.id, codeHash: hashEmailCode(emailCodeKey(appKey()), id, code), createdAt: now, expiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_MS) });
    const mail = render(code, { name: user.name, locale: user.preferredLocale, agencyName: agency.name });
    const [message] = await tx
      .insert(s.emailMessages)
      .values({ agencyId: agency.id, kind: "sign_in_code", toEmail: user.email, toName: user.name, subject: hideEmailCode(mail.subject, code), textBody: hideEmailCode(mail.text, code), status: "sending", createdAt: now })
      .returning({ id: s.emailMessages.id });
    await log(tx, user, [{ action: "update", entityType: "user", entityId: user.id, after: { signInCode: "sent" } }], isDemoPerson(found, demoMode));
    return { agencyId: agency.id, mail: { id: message!.id, fromName: agency.name, replyTo: agency.email, to: { email: user.email, name: user.name }, subject: mail.subject, text: mail.text, html: mail.html } };
  });
  if (!pending) return;
  if (later) later(() => deliver(deps, pending.agencyId, pending.mail));
  else await deliver(deps, pending.agencyId, pending.mail);
}

/**
 * The code typed, as a first factor. Any refusal reads the same ("invalid": wrong, used, expired,
 * spent, or no such member), so the page tells nothing about who has an account. Wrong codes count
 * in the password throttle and toward the person's day lock (decision 0025).
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
    const login = await lockedLogin(tx, found.user.id);
    if (login?.lockedUntil && login.lockedUntil > now) {
      await noteThrottle(tx, keys, now);
      return { ok: false, error: "locked" };
    }
    await enterAgency(tx, found.user.agencyId);
    const [row] = await tx.select().from(s.emailSignInCodes).where(and(eq(s.emailSignInCodes.userId, found.user.id), isNull(s.emailSignInCodes.usedAt))).orderBy(desc(s.emailSignInCodes.createdAt)).limit(1).for("update");
    const open = row && emailCodeState(row, now) === "open";
    if (!row || !open || !codeMatches(emailCodeKey(appKey()), row.id, row.codeHash, code)) {
      if (row && open) await tx.update(s.emailSignInCodes).set({ failures: row.failures + 1 }).where(eq(s.emailSignInCodes.id, row.id));
      await noteThrottle(tx, keys, now);
      const locked = login ? await countPasswordFailure(tx, login, now) : false;
      await log(tx, found.user, [{ action: "sign_in_failed", entityType: "user", entityId: found.user.id, after: { step: "email code", locked } }], isDemoPerson(found, demoMode));
      return { ok: false, error: locked ? "locked" : "invalid" };
    }
    await tx.update(s.emailSignInCodes).set({ usedAt: now }).where(eq(s.emailSignInCodes.id, row.id));
    if (keys[0]) await tx.delete(s.signInFailures).where(eq(s.signInFailures.keyHash, keys[0]));
    if (login) await tx.update(s.userLogins).set({ failedCount: 0, failedSince: null }).where(eq(s.userLogins.userId, login.userId));
    return begin(tx, found, "email_code", demoMode, userAgent, now);
  });
}

/** Demo only: the latest sign-in code email the demo mailbox kept for this address (the page shows it). */
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

// ---------- an agency's single sign-on ----------

/** The issuer as used: the demo agency's is kept relative to the app's address, usable only in demo mode. */
export function resolveIssuer(stored: string, baseUrl: string, demoMode: boolean): string | null {
  if (stored.startsWith("/")) return demoMode ? `${baseUrl}${stored}` : null;
  return stored;
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

export type SsoError = "not_allowed" | "invalid_issuer" | "invalid_client_id" | "secret_required" | "invalid_secret" | "issuer_unreachable" | "demo_issuer_only" | "not_set_up";
const secretAad = (agencyId: string) => `sso:${agencyId}`;

function issuerProblem(issuer: string): boolean {
  if (issuer.length === 0 || issuer.length > 300) return true;
  try {
    const url = new URL(issuer);
    return url.protocol !== "https:" || url.search !== "" || url.hash !== "" || url.username !== "" || url.password !== "";
  } catch {
    return true;
  }
}

/**
 * The Owner's provider details. The secret is sealed under the app key, bound to the agency, and
 * never returned; left empty, the saved one stays. The issuer's discovery document must answer
 * (`check`; Stripe's configuration checks). In demo mode only the demo's stand-in can be saved.
 */
export async function saveSsoSettings(
  deps: AuthDeps,
  by: ByOwner,
  input: { issuer: string; clientId: string; clientSecret: string | null },
  opts: { demoMode: boolean; baseUrl: string; check: (issuer: string) => Promise<boolean> },
): Promise<{ ok: true } | { ok: false; error: SsoError }> {
  if (!can(by, "members")) return { ok: false, error: "not_allowed" };
  const issuer = input.issuer.trim();
  const clientId = input.clientId.trim();
  const secret = input.clientSecret && input.clientSecret.trim() ? input.clientSecret.trim() : null;
  let stored: string;
  if (opts.demoMode) {
    if (issuer !== DEMO_SSO_ISSUER && issuer !== `${opts.baseUrl}${DEMO_SSO_ISSUER}`) return { ok: false, error: "demo_issuer_only" };
    stored = DEMO_SSO_ISSUER;
  } else {
    if (issuerProblem(issuer)) return { ok: false, error: "invalid_issuer" };
    stored = issuer;
  }
  if (clientId.length === 0 || clientId.length > 255) return { ok: false, error: "invalid_client_id" };
  if (secret && secret.length > 1000) return { ok: false, error: "invalid_secret" };
  const existing = await withAuth(deps, async (tx) => {
    await enterAgency(tx, by.agencyId);
    return (await tx.select().from(s.agencySso).where(eq(s.agencySso.agencyId, by.agencyId)))[0] ?? null;
  });
  if (!secret && !existing) return { ok: false, error: "secret_required" };
  if (!(await opts.check(resolveIssuer(stored, opts.baseUrl, opts.demoMode)!))) return { ok: false, error: "issuer_unreachable" };
  const now = nowOf(deps);
  await withAuth(deps, async (tx) => {
    await enterAgency(tx, by.agencyId);
    const values = {
      issuer: stored,
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
      { action: "update", entityType: "agency", entityId: by.agencyId, before: existing ? { sso: { issuer: existing.issuer, clientId: existing.clientId } } : null, after: { sso: { issuer: stored, clientId, secret: secret ? (existing ? "replaced" : "set") : "kept" } } },
    ]);
  });
  return { ok: true };
}

/** On or off (its details saved first). */
export async function setSsoEnabled(deps: AuthDeps, by: ByOwner, enabled: boolean): Promise<{ ok: true } | { ok: false; error: SsoError }> {
  if (!can(by, "members")) return { ok: false, error: "not_allowed" };
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, by.agencyId);
    const [row] = await tx.update(s.agencySso).set({ enabled, updatedAt: now, updatedByLabel: by.label }).where(eq(s.agencySso.agencyId, by.agencyId)).returning();
    if (!row) return { ok: false as const, error: "not_set_up" as const };
    await auditBy(tx, { agencyId: by.agencyId, userId: by.userId, label: by.label }, [{ action: "update", entityType: "agency", entityId: by.agencyId, after: { sso: { enabled } } }]);
    return { ok: true as const };
  });
}

/** Where a typed email signs in with SSO: an active member of an agency with SSO on; null for everyone else. */
export async function ssoForEmail(deps: AuthDeps, email: string, opts: { demoMode: boolean; baseUrl: string }): Promise<{ agencyId: string; userId: string; issuer: string; clientId: string } | null> {
  return withAuth(deps, async (tx) => {
    const found = await memberByEmail(tx, email, opts.demoMode);
    if (!found || found.user.status !== "active") return null;
    await enterAgency(tx, found.user.agencyId);
    const [row] = await tx.select().from(s.agencySso).where(eq(s.agencySso.agencyId, found.user.agencyId));
    const issuer = row?.enabled ? resolveIssuer(row.issuer, opts.baseUrl, opts.demoMode) : null;
    return row && issuer ? { agencyId: found.user.agencyId, userId: found.user.id, issuer, clientId: row.clientId } : null;
  });
}

/** The agency's provider for the code exchange (its secret unsealed), while SSO is on. */
export async function ssoConfigOf(deps: AuthDeps, agencyId: string, opts: { demoMode: boolean; baseUrl: string }): Promise<{ issuer: string; clientId: string; clientSecret: string } | null> {
  if (!UUID.test(agencyId)) return null;
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, agencyId);
    const [row] = await tx.select().from(s.agencySso).where(eq(s.agencySso.agencyId, agencyId));
    const issuer = row?.enabled ? resolveIssuer(row.issuer, opts.baseUrl, opts.demoMode) : null;
    if (!row || !issuer) return null;
    return { issuer, clientId: row.clientId, clientSecret: unseal(row.clientSecret, appKey(), secretAad(agencyId)).toString("utf8") };
  });
}
