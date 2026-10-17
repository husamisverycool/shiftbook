/**
 * Agencies sign themselves up (decision 0036), with the sign-in service's own machinery (decision
 * 0025): a one-time link (only its digest kept; 24 hours; once; a newer request replaces the older),
 * the password rule, the throttle table, the first-Owner code scripts/create-agency.ts uses, and a
 * half session whose next step is the authenticator every Owner needs (SPEC §2).
 *
 * No enumeration: a request answers the same whatever the email. An email that already signs in to
 * Granite is sent a note instead of a link (only its inbox learns which), and its agency's log records
 * the attempt. Too many requests for one email (3 an hour) or from one address (10 an hour) wait.
 *
 * The app role cannot insert agencies (drizzle/0001): signup_create_agency (drizzle/0043, given the raw
 * token since drizzle/0044) spends an unused, unexpired link and makes its agency; everything else is
 * written under that agency's fence.
 * Nothing here logs or returns a password, a token or a digest. The demo never calls this (its pages
 * and actions refuse first): the demo makes no agencies.
 */
import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { auditBy } from "../audit";
import type { Db, Tx } from "../db/client";
import * as s from "../db/schema";
import type { MailTransport, OutgoingMail } from "../mail/transport";
import { digest } from "./crypto";
import { addressGroup } from "./passkeys";
import { hashPassword, PasswordBusyError, passwordProblem } from "./password";
import { addFirstOwner, enterAgency, LINK_TOKEN_SHAPE, linkToken, looksLikeEmail, normalEmail, startSession, type LinkMail, type PasswordError } from "./service";

export const SIGNUP_LINK_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;
const PER_EMAIL_PER_HOUR = 3;
const PER_ADDRESS_PER_HOUR = 10;
const BY = "Granite sign-up";

export interface SignupDeps {
  db: Db;
  /** Where sign-up emails go (Resend when live; tests capture them). There is no agency yet. */
  mail: MailTransport;
  now?: () => Date;
}

export interface SignupRender {
  /** The link that finishes creating the agency (only the language: nothing the requester typed). */
  link(link: string, who: { locale: string }): LinkMail;
  /** The note for an email that already signs in to Granite: the ways back in. */
  existing(links: { signIn: string; reset: string }, who: { locale: string }): LinkMail;
}

export interface SignupInput {
  email: string;
  name: string;
  agencyName: string;
  locale: string;
}

export type SignupRequestResult = { ok: true } | { ok: false; error: "invalid_email" | "invalid_name" | "invalid_agency_name" | "too_many" };

const nowOf = (deps: SignupDeps) => (deps.now ? deps.now() : new Date());

/** A transaction in sign-in mode (app.auth): sign-up requests, logins and the throttle are visible. */
function inSignInMode<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.auth', 'on', true)`);
    return fn(tx);
  });
}

/**
 * The throttle's keys (the sign-in throttle's table, keys of their own): this email; this address when
 * known — an IPv6 address by its /64, as the passkey throttle counts it (security review).
 */
const throttleKeys = (email: string, address: string | null): string[] => [digest(`signup-email|${email}`), ...(address ? [digest(`signup-address|${addressGroup(address)}`)] : [])];

/**
 * Over the hour, too many for this email or this address? Each key is locked first (sorted, so two
 * requests never wait on each other in a circle), so parallel requests count one by one (security
 * review: under READ COMMITTED a count then an insert let a fourth or an eleventh through).
 */
async function tooMany(tx: Tx, keys: string[], now: Date): Promise<boolean> {
  for (const key of [...keys].sort()) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`signup throttle:${key}`}, 0))`);
  const rows = await tx
    .select({ key: s.signInFailures.keyHash, n: sql<number>`count(*)::int` })
    .from(s.signInFailures)
    .where(and(inArray(s.signInFailures.keyHash, keys), gt(s.signInFailures.at, new Date(now.getTime() - HOUR_MS))))
    .groupBy(s.signInFailures.keyHash);
  const n = (key: string | undefined) => (key ? (rows.find((r) => r.key === key)?.n ?? 0) : 0);
  return n(keys[0]) >= PER_EMAIL_PER_HOUR || n(keys[1]) >= PER_ADDRESS_PER_HOUR;
}

const outgoing = (id: string, to: { email: string; name: string | null }, mail: LinkMail): OutgoingMail => ({ id, fromName: "Granite", replyTo: null, to, subject: mail.subject, text: mail.text, html: mail.html });

/**
 * A sign-up asked for: checked for its shape, throttled, then a link (or, for an email that already
 * signs in, a note) is emailed. `later` sends after the response, so every answer takes as long.
 */
export async function requestSignup(deps: SignupDeps, input: SignupInput, address: string | null, render: SignupRender, baseUrl: string, later?: (job: () => Promise<unknown>) => void): Promise<SignupRequestResult> {
  const email = normalEmail(input.email);
  const name = input.name.trim();
  const agencyName = input.agencyName.trim();
  const locale = input.locale === "es" ? "es" : "en";
  if (!looksLikeEmail(email)) return { ok: false, error: "invalid_email" };
  if (name.length === 0 || name.length > 120) return { ok: false, error: "invalid_name" };
  if (agencyName.length === 0 || agencyName.length > 200) return { ok: false, error: "invalid_agency_name" };
  const now = nowOf(deps);
  const keys = throttleKeys(email, address);
  const pending = await inSignInMode(deps.db, async (tx) => {
    if (await tooMany(tx, keys, now)) return null;
    await tx.insert(s.signInFailures).values(keys.map((keyHash) => ({ keyHash, at: now })));
    const [login] = await tx.select({ userId: s.userLogins.userId, agencyId: s.userLogins.agencyId }).from(s.userLogins).where(eq(s.userLogins.email, email));
    if (login) {
      // Already signs in to Granite: a note to that inbox, a line in its agency's log, no agency.
      await enterAgency(tx, login.agencyId);
      await auditBy(tx, { agencyId: login.agencyId, userId: null, label: BY }, [{ action: "refuse", entityType: "user", entityId: login.userId, after: { signUp: "this email already signs in" } }]);
      const mail = render.existing({ signIn: `${baseUrl}/${locale}/sign-in`, reset: `${baseUrl}/${locale}/sign-in/reset` }, { locale });
      return { requestId: null, mail: outgoing(randomUUID(), { email, name: null }, mail) };
    }
    // A newer request replaces any unused one for the same email.
    await tx.update(s.signupRequests).set({ usedAt: now }).where(and(eq(s.signupRequests.email, email), isNull(s.signupRequests.usedAt)));
    const token = linkToken();
    const [row] = await tx
      .insert(s.signupRequests)
      .values({ email, name, agencyName, locale, tokenHash: digest(token), addressHash: address ? digest(`signup-address|${addressGroup(address)}`) : null, createdAt: now, expiresAt: new Date(now.getTime() + SIGNUP_LINK_HOURS * HOUR_MS) })
      .returning({ id: s.signupRequests.id });
    const mail = render.link(`${baseUrl}/${locale}/sign-up/${token}`, { locale });
    // No display name either: nothing the requester typed goes into an email to an unproved address.
    return { requestId: row!.id, mail: outgoing(row!.id, { email, name: null }, mail) };
  });
  if (!pending) return { ok: false, error: "too_many" };
  const send = () => deliverSignupMail(deps, pending.requestId, pending.mail);
  if (later) later(send);
  else await send();
  return { ok: true };
}

/** Sends, recording on the request when it went (or failed); never throws (the answer is already given). */
async function deliverSignupMail(deps: SignupDeps, requestId: string | null, mail: OutgoingMail): Promise<void> {
  let ok = true;
  try {
    await deps.mail.send(mail);
  } catch {
    ok = false;
  }
  if (!requestId) return;
  await inSignInMode(deps.db, (tx) =>
    tx
      .update(s.signupRequests)
      .set(ok ? { sentAt: nowOf(deps) } : { sendFailedAt: nowOf(deps) })
      .where(eq(s.signupRequests.id, requestId)),
  );
}

export interface SignupInfo {
  email: string;
  name: string;
  agencyName: string;
  locale: string;
}

/** What a sign-up link is for, if it still works (for the "Set your password" page). */
export async function signupFor(deps: SignupDeps, token: string): Promise<SignupInfo | null> {
  if (!LINK_TOKEN_SHAPE.test(token)) return null;
  const now = nowOf(deps);
  return inSignInMode(deps.db, async (tx) => {
    const [row] = await tx
      .select({ email: s.signupRequests.email, name: s.signupRequests.name, agencyName: s.signupRequests.agencyName, locale: s.signupRequests.locale })
      .from(s.signupRequests)
      .where(and(eq(s.signupRequests.tokenHash, digest(token)), isNull(s.signupRequests.usedAt), gt(s.signupRequests.expiresAt, now)));
    return row ?? null;
  });
}

/** Thrown inside the transaction to undo the agency it made. */
class Undo extends Error {
  constructor(readonly error: "email_taken" | "expired") {
    super(error);
  }
}

export type CompleteSignupResult = { ok: true; token: string; next: "setup"; locale: string } | { ok: false; error: "expired" | "email_taken" | PasswordError };

/**
 * The link used with a password: the agency, its Owner (active, with that password), its billing row
 * (the free days from now) and a half session whose next step is the authenticator setup — in one
 * transaction. A link works once; an email that started signing in to Granite meanwhile is refused.
 */
export async function completeSignup(deps: SignupDeps, token: string, password: string, userAgent: string | null, opts: { trialDays: number }): Promise<CompleteSignupResult> {
  const found = await signupFor(deps, token);
  if (!found) return { ok: false, error: "expired" };
  const problem = passwordProblem(password, found.email);
  if (problem) return { ok: false, error: problem };
  let hash: string;
  try {
    hash = await hashPassword(password);
  } catch (error) {
    if (error instanceof PasswordBusyError) return { ok: false, error: "busy" };
    throw error;
  }
  const now = nowOf(deps);
  try {
    return await inSignInMode(deps.db, async (tx): Promise<CompleteSignupResult> => {
      const [row] = await tx
        .select()
        .from(s.signupRequests)
        .where(and(eq(s.signupRequests.tokenHash, digest(token)), isNull(s.signupRequests.usedAt), gt(s.signupRequests.expiresAt, now)))
        .for("update");
      if (!row) return { ok: false, error: "expired" };
      const [taken] = await tx.select({ userId: s.userLogins.userId }).from(s.userLogins).where(eq(s.userLogins.email, row.email));
      if (taken) {
        await tx.update(s.signupRequests).set({ usedAt: now }).where(eq(s.signupRequests.id, row.id));
        return { ok: false, error: "email_taken" };
      }
      // The function hashes the raw token itself (drizzle/0044): only the token from the email makes an agency.
      const made = await tx.execute<{ id: string | null }>(sql`select signup_create_agency(${token}) as id`);
      const agencyId = made[0]?.id;
      if (!agencyId) return { ok: false, error: "expired" };
      await enterAgency(tx, agencyId);
      await auditBy(tx, { agencyId, userId: null, label: BY }, [{ action: "create", entityType: "agency", entityId: agencyId, after: { name: row.agencyName, via: "sign-up" } }]);
      const trialEndsAt = opts.trialDays > 0 ? new Date(now.getTime() + opts.trialDays * 24 * HOUR_MS) : null;
      const owner = await addFirstOwner(tx, agencyId, { name: row.name, email: row.email, locale: row.locale, status: "active", passwordHash: hash, trialEndsAt, byLabel: BY }, now);
      if (!owner.ok) throw new Undo(owner.error === "email_taken" ? "email_taken" : "expired");
      const session = await startSession(tx, owner.user, { demo: false, next: "setup", userAgent, now, firstFactor: "password" });
      return { ok: true, token: session, next: "setup", locale: owner.user.preferredLocale };
    });
  } catch (error) {
    if (error instanceof Undo) return { ok: false, error: error.error };
    // Two sign-ups racing for one email: the second meets the unique index.
    const code = (error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
    if (code === "23505") return { ok: false, error: "email_taken" };
    throw error;
  }
}
