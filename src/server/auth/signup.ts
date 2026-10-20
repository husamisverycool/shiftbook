/**
 * Agencies sign themselves up (decision 0036), with the sign-in service's own machinery (decision
 * 0025): one email carrying a one-time link and a six-digit code (slice ab: Slack's and Linear's confirm
 * emails; only their digests kept; an hour; once; a newer request replaces the older; five wrong codes
 * end it; the code works on any device, so an email read on a phone can be typed into the computer),
 * the password rule, the throttle table, the first-Owner code scripts/create-agency.ts uses, and a
 * half session whose next step is the authenticator every Owner needs (SPEC §2).
 *
 * No enumeration: a request answers the same whatever the email. An email that already signs in to
 * Tabulado is sent a note instead of a link (only its inbox learns which), and its agency's log records
 * the attempt. Too many requests for one email (5 an hour) or from one address (10 an hour) wait; codes
 * typed from one address, 30 an hour. A send that fails is said (the screen offers to try again).
 *
 * The app role cannot insert agencies (drizzle/0001): signup_create_agency (drizzle/0043, given the raw
 * token since drizzle/0044) spends an unused, unexpired link and makes its agency; everything else is
 * written under that agency's fence.
 * Nothing here logs or returns a password, a token or a digest. The demo never calls this (its pages
 * and actions refuse first): the demo makes no agencies.
 */
import { randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { auditBy } from "../audit";
import type { Db, Tx } from "../db/client";
import * as s from "../db/schema";
import type { MailTransport, OutgoingMail } from "../mail/transport";
import { digest, sameText } from "./crypto";
import { addressGroup } from "./passkeys";
import { hashPassword, PasswordBusyError, passwordProblem } from "./password";
import { addFirstOwner, enterAgency, LINK_TOKEN_SHAPE, linkToken, looksLikeEmail, normalEmail, startSession, type LinkMail, type PasswordError } from "./service";

/** The link and the code work for an hour (Supabase's email links); the password step then has 30 minutes. */
export const SIGNUP_LINK_MINUTES = 60;
const PASSWORD_STEP_MINUTES = 30;
/** Wrong codes before the request ends (the fifth ends it). */
export const SIGNUP_CODE_TRIES = 5;
const HOUR_MS = 60 * 60 * 1000;
const PER_EMAIL_PER_HOUR = 5;
const PER_ADDRESS_PER_HOUR = 10;
const CODES_PER_ADDRESS_PER_HOUR = 30;
/** Wrong codes for one email in a day, whatever the request or address (security review M1). */
const WRONG_CODES_PER_EMAIL_PER_DAY = 10;
const DAY_MS = 24 * HOUR_MS;
const BY = "Tabulado sign-up";

export interface SignupDeps {
  db: Db;
  /** Where sign-up emails go (Resend when live; tests capture them). There is no agency yet. */
  mail: MailTransport;
  now?: () => Date;
}

export interface SignupRender {
  /** The link and the code that finish creating the agency (only the language: nothing the requester typed). */
  link(link: string, code: string, who: { locale: string }): LinkMail;
  /** The note for an email that already signs in to Tabulado: the ways back in. */
  existing(links: { signIn: string; reset: string }, who: { locale: string }): LinkMail;
}

export interface SignupInput {
  email: string;
  name: string;
  agencyName: string;
  locale: string;
}

export type SignupRequestResult = { ok: true } | { ok: false; error: "invalid_email" | "invalid_name" | "invalid_agency_name" | "too_many" | "send_failed" };

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

const outgoing = (id: string, to: { email: string; name: string | null }, mail: LinkMail): OutgoingMail => ({ id, fromName: "Tabulado", replyTo: null, to, subject: mail.subject, text: mail.text, html: mail.html });

/** Six digits, any of a million (crypto's own randomness). */
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
/** A code's digest, salted with its request, so two requests' codes never share a digest. */
const codeDigest = (requestId: string, code: string) => digest(`signup-code|${requestId}|${code}`);

/**
 * A sign-up asked for: checked for its shape, throttled, then a link and a code (or, for an email that
 * already signs in, a note) are emailed — before answering, so a send that fails can be said.
 */
export async function requestSignup(deps: SignupDeps, input: SignupInput, address: string | null, render: SignupRender, baseUrl: string): Promise<SignupRequestResult> {
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
      // Already signs in to Tabulado: a note to that inbox, a line in its agency's log, no agency.
      await enterAgency(tx, login.agencyId);
      await auditBy(tx, { agencyId: login.agencyId, userId: null, label: BY }, [{ action: "refuse", entityType: "user", entityId: login.userId, after: { signUp: "this email already signs in" } }]);
      const mail = render.existing({ signIn: `${baseUrl}/${locale}/sign-in`, reset: `${baseUrl}/${locale}/sign-in/reset` }, { locale });
      return { requestId: null, mail: outgoing(randomUUID(), { email, name: null }, mail) };
    }
    // A newer request replaces any unused one for the same email.
    await tx.update(s.signupRequests).set({ usedAt: now }).where(and(eq(s.signupRequests.email, email), isNull(s.signupRequests.usedAt)));
    const token = linkToken();
    const code = newCode();
    const id = randomUUID();
    const [row] = await tx
      .insert(s.signupRequests)
      .values({ id, email, name, agencyName, locale, tokenHash: digest(token), codeHash: codeDigest(id, code), addressHash: address ? digest(`signup-address|${addressGroup(address)}`) : null, createdAt: now, expiresAt: new Date(now.getTime() + SIGNUP_LINK_MINUTES * 60_000) })
      .returning({ id: s.signupRequests.id });
    const mail = render.link(`${baseUrl}/${locale}/sign-up/${token}`, code, { locale });
    // No display name either: nothing the requester typed goes into an email to an unproved address.
    return { requestId: row!.id, mail: outgoing(row!.id, { email, name: null }, mail) };
  });
  if (!pending) return { ok: false, error: "too_many" };
  return (await deliverSignupMail(deps, pending.requestId, pending.mail)) ? { ok: true } : { ok: false, error: "send_failed" };
}

/** Sends, recording on the request when it went (or failed); never throws. */
async function deliverSignupMail(deps: SignupDeps, requestId: string | null, mail: OutgoingMail): Promise<boolean> {
  let ok = true;
  try {
    await deps.mail.send(mail);
  } catch (error) {
    ok = false;
    // The reason only (the email service's answer), never the address: the host's logs say what to fix.
    const reason = (error instanceof Error ? error.message : String(error)).replace(/[^\s@()]+@[^\s@()]+/g, "[an address]");
    console.error(`[tabulado] a sign-up email could not be sent: ${reason}`);
  }
  // The same round trip for a known email (no request to mark), so the answer takes as long (review L2).
  await inSignInMode(deps.db, (tx) =>
    tx
      .update(s.signupRequests)
      .set(ok ? { sentAt: nowOf(deps) } : { sendFailedAt: nowOf(deps) })
      .where(requestId ? eq(s.signupRequests.id, requestId) : sql`false`),
  );
  return ok;
}

export type SignupCodeResult = { ok: true; token: string; locale: string } | { ok: false; error: "wrong_code" | "too_many" };

/**
 * The code from the email, typed where the sign-up began (or anywhere): right, it ends this request and
 * starts a fresh one whose link opens the password step (30 minutes); wrong, it counts, and the fifth
 * wrong code ends the request. An email with nothing waiting, and the fifth wrong code, answer as any
 * wrong code (nothing learned about a sign-up under way). Ten wrong codes for one email in a day stop
 * further tries that day, across new codes and addresses (security review M1).
 */
export async function verifySignupCode(deps: SignupDeps, rawEmail: string, rawCode: string, address: string | null): Promise<SignupCodeResult> {
  const email = normalEmail(rawEmail);
  const code = rawCode.replace(/[\s-]/g, "");
  const now = nowOf(deps);
  return inSignInMode(deps.db, async (tx): Promise<SignupCodeResult> => {
    if (address) {
      const key = digest(`signup-code-address|${addressGroup(address)}`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`signup throttle:${key}`}, 0))`);
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(s.signInFailures)
        .where(and(eq(s.signInFailures.keyHash, key), gt(s.signInFailures.at, new Date(now.getTime() - HOUR_MS))));
      if ((count?.n ?? 0) >= CODES_PER_ADDRESS_PER_HOUR) return { ok: false, error: "too_many" };
      await tx.insert(s.signInFailures).values({ keyHash: key, at: now });
    }
    const emailKey = digest(`signup-code-email|${email}`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`signup throttle:${emailKey}`}, 0))`);
    const [wrongToday] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(s.signInFailures)
      .where(and(eq(s.signInFailures.keyHash, emailKey), gt(s.signInFailures.at, new Date(now.getTime() - DAY_MS))));
    if ((wrongToday?.n ?? 0) >= WRONG_CODES_PER_EMAIL_PER_DAY) return { ok: false, error: "too_many" };
    const wrong = async (): Promise<SignupCodeResult> => {
      await tx.insert(s.signInFailures).values({ keyHash: emailKey, at: now });
      return { ok: false, error: "wrong_code" };
    };
    if (!looksLikeEmail(email) || !/^\d{6}$/.test(code)) return wrong();
    const [row] = await tx
      .select()
      .from(s.signupRequests)
      .where(and(eq(s.signupRequests.email, email), isNull(s.signupRequests.usedAt), gt(s.signupRequests.expiresAt, now)))
      .orderBy(desc(s.signupRequests.createdAt))
      .limit(1)
      .for("update");
    if (!row?.codeHash) return wrong();
    if (!sameText(row.codeHash, codeDigest(row.id, code))) {
      const tries = row.codeTries + 1;
      await tx.update(s.signupRequests).set(tries >= SIGNUP_CODE_TRIES ? { codeTries: tries, usedAt: now } : { codeTries: tries }).where(eq(s.signupRequests.id, row.id));
      return wrong();
    }
    // Proved: this request ends; a fresh one (no code) carries the password step.
    await tx.update(s.signupRequests).set({ usedAt: now }).where(eq(s.signupRequests.id, row.id));
    const token = linkToken();
    await tx.insert(s.signupRequests).values({
      email: row.email,
      name: row.name,
      agencyName: row.agencyName,
      locale: row.locale,
      tokenHash: digest(token),
      addressHash: row.addressHash,
      createdAt: now,
      sentAt: now,
      expiresAt: new Date(now.getTime() + PASSWORD_STEP_MINUTES * 60_000),
    });
    return { ok: true, token, locale: row.locale };
  });
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
 * transaction. A link works once; an email that started signing in to Tabulado meanwhile is refused.
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
