/**
 * Passkeys (decision 0032; W3C Web Authentication Level 3; GitHub's "Managing your passkeys" and
 * "Signing in with a passkey"): a signed-in person adds one with their password or a code given for
 * that very passkey, and is emailed about it; anyone signs in with one without typing an email (a
 * discoverable credential). The device checks it is the person (user verification), so a passkey
 * sign-in has passed both steps (SPEC §2: MFA for Owner and Coordinator); a response without that check
 * is refused.
 *
 * Two halves: a judge that decides from what it is given (no I/O, no clock of its own), and the steps
 * that read and write the database in sign-in mode (app.auth, as service.ts does: the passkey is found
 * before the agency is known). Challenges work once and for five minutes; only their SHA-256 is kept.
 * Nothing here logs a credential id, a public key or a challenge.
 */
import { isIPv4, isIPv6 } from "node:net";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, asc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import type { UserStatus } from "../db/schema";
import type { OutgoingMail } from "../mail/transport";
import { settingOn } from "../settings";
import { digest } from "./crypto";
import { confirmByEmailCode } from "./identities";
import { renderPasskeyAddedEmail } from "./passkey-emails";
import { confirmAccess, deliver, enterAgency, log, mustConfirm, noteThrottle, startSession, throttled, withAuth, type AuthDeps, type SessionInfo } from "./service";

const MINUTE = 60 * 1000;
/** A challenge works for five minutes (also the ceremony's timeout, W3C's recommended range). */
export const CHALLENGE_MS = 5 * MINUTE;
/** Open sign-in challenges (the options request needs no sign-in): this many per address, and in all. */
const OPEN_CHALLENGES_PER_ADDRESS = 20;
const OPEN_CHALLENGES_IN_ALL = 10_000;
/** Lapsed challenges deleted per request, at most (the clean-up stays cheap). */
const SWEEP_BATCH = 500;
/** Passkeys a person may have at once (removed ones aside). */
export const MAX_PASSKEYS = 20;
const RP_NAME = "Tabulado";

export type DeviceType = "singleDevice" | "multiDevice";

/** The site passkeys belong to: the app's base URL's hostname (the RP ID) and its origin. */
export interface RelyingParty {
  id: string;
  origin: string;
  name: string;
}
export function relyingParty(baseUrl: string): RelyingParty {
  const url = new URL(baseUrl);
  return { id: url.hostname, origin: url.origin, name: RP_NAME };
}

/** The user handle: the person's id as its 16 bytes (no name, no email), base64url. */
export const userHandleOf = (userId: string) => Buffer.from(userId.replaceAll("-", ""), "hex").toString("base64url");

/**
 * A visitor's address as the caps and the throttle count it: an IPv4 address as it is; an IPv6 address
 * as its /64 network (one household or server is given a whole /64, so single addresses cost nothing to
 * change); an IPv4-mapped IPv6 address as its IPv4.
 */
export function addressGroup(address: string): string {
  const a = address.trim().toLowerCase().replace(/%.*$/, "");
  if (isIPv4(a)) return a;
  if (!isIPv6(a)) return a;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a);
  if (mapped && isIPv4(mapped[1]!)) return mapped[1]!;
  const [head = "", tail] = a.split("::");
  const groups = (part: string) => (part === "" ? [] : part.split(":").flatMap((g) => (g.includes(".") ? ["0", "0"] : [g])));
  const left = groups(head);
  const right = tail === undefined ? [] : groups(tail);
  const all = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  return `${all
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":")}::/64`;
}

/** What a response's clientDataJSON says: its challenge, and whether it came from inside another site's frame. */
function clientDataOf(response: { response: { clientDataJSON: string } }): { challenge: string; crossOrigin: boolean } | null {
  try {
    const data = JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8")) as { challenge?: unknown; crossOrigin?: unknown };
    if (typeof data.challenge !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(data.challenge)) return null;
    return { challenge: data.challenge, crossOrigin: data.crossOrigin === true };
  } catch {
    return null;
  }
}

/** The challenge a response answers, read from its clientDataJSON; null when unreadable. */
export const challengeOf = (response: { response: { clientDataJSON: string } }): string | null => clientDataOf(response)?.challenge ?? null;

/** A challenge as kept (the row found by the response's challenge digest). */
export interface ChallengeRow {
  purpose: "register" | "sign_in";
  userId: string | null;
  expiresAt: Date;
  usedAt: Date | null;
}

/** Why a challenge cannot be used: none issued (or for another purpose or person), used, expired. */
export function challengeProblem(row: ChallengeRow | undefined, want: { purpose: ChallengeRow["purpose"]; userId: string | null }, now: Date): "unknown" | "used" | "expired" | null {
  if (!row || row.purpose !== want.purpose || row.userId !== want.userId) return "unknown";
  if (row.usedAt) return "used";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return null;
}

// ---------- the judge ----------

/** A discoverable, user-verified passkey for this person, not one they already have; no attestation. */
export function registrationOptionsFor(rp: RelyingParty, person: { id: string; email: string; name: string }, existing: { credentialId: string; transports: string[] }[]): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: person.email,
    userDisplayName: person.name,
    userID: new Uint8Array(Buffer.from(userHandleOf(person.id), "base64url")),
    timeout: CHALLENGE_MS,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports })),
    authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
  });
}

/** Any of the site's passkeys (no list: the device offers its own), user verification required. */
export function signInOptionsFor(rp: RelyingParty): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({ rpID: rp.id, userVerification: "required", timeout: CHALLENGE_MS });
}

export interface NewPasskey {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  deviceType: DeviceType;
  backedUp: boolean;
}

/** Transports as the browser reported them: known words only, each once, in order. */
const cleanTransports = (list: readonly string[] | undefined) => [...new Set((list ?? []).filter((t) => /^[a-z-]{1,24}$/.test(t)))].sort().slice(0, 8);

export type RegistrationRefusal = "challenge" | "invalid" | "cross_origin" | "no_user_verification";

/**
 * A new passkey, judged: the challenge issued to this person to add one, still open; this site's
 * origin and RP ID, not inside another site's frame; a valid attestation ("none"); and the device's own
 * check that it is the person.
 */
export async function judgeRegistration(input: { response: RegistrationResponseJSON; challengeRow: ChallengeRow | undefined; userId: string; rp: RelyingParty; now: Date }): Promise<{ ok: true; passkey: NewPasskey } | { ok: false; reason: RegistrationRefusal }> {
  const data = clientDataOf(input.response);
  if (!data || challengeProblem(input.challengeRow, { purpose: "register", userId: input.userId }, input.now)) return { ok: false, reason: "challenge" };
  if (data.crossOrigin) return { ok: false, reason: "cross_origin" };
  let verified;
  try {
    // User verification is checked below, so its refusal can be told apart.
    verified = await verifyRegistrationResponse({ response: input.response, expectedChallenge: data.challenge, expectedOrigin: input.rp.origin, expectedRPID: input.rp.id, requireUserPresence: true, requireUserVerification: false });
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!verified.verified) return { ok: false, reason: "invalid" };
  const info = verified.registrationInfo;
  if (!info.userVerified) return { ok: false, reason: "no_user_verification" };
  return {
    ok: true,
    passkey: {
      credentialId: info.credential.id,
      publicKey: new Uint8Array(info.credential.publicKey),
      counter: info.credential.counter,
      transports: cleanTransports(info.credential.transports ?? input.response.response.transports),
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
    },
  };
}

/** A passkey as kept. */
export interface StoredPasskey {
  id: string;
  userId: string;
  agencyId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  removedAt: Date | null;
}

export type SignInRefusal = "challenge" | "unknown_passkey" | "invalid" | "cross_origin" | "no_user_verification" | "user_handle" | "removed" | "member_inactive" | "counter";

/**
 * A passkey sign-in, judged: an open sign-in challenge; a passkey we know whose key signed this site's
 * response, not from inside another site's frame; the device's check that it is the person; the user
 * handle the passkey was made with (a discoverable passkey always returns it); then refused when the
 * passkey was removed, its person is not active, or the counter did not go up (a copied authenticator;
 * a counter that stays 0 is a passkey that does not count, as synced ones).
 */
export async function judgeSignIn(input: {
  response: AuthenticationResponseJSON;
  challengeRow: ChallengeRow | undefined;
  passkey: StoredPasskey | undefined;
  member: { status: UserStatus } | undefined;
  rp: RelyingParty;
  now: Date;
}): Promise<{ ok: true; counter: number; deviceType: DeviceType; backedUp: boolean } | { ok: false; reason: SignInRefusal; counter?: number }> {
  const { response, passkey } = input;
  const data = clientDataOf(response);
  if (!data || challengeProblem(input.challengeRow, { purpose: "sign_in", userId: null }, input.now)) return { ok: false, reason: "challenge" };
  if (!passkey || passkey.credentialId !== response.id) return { ok: false, reason: "unknown_passkey" };
  if (data.crossOrigin) return { ok: false, reason: "cross_origin" };
  let verified;
  try {
    // The counter (passed as 0) and user verification are checked below, after the signature.
    verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: data.challenge,
      expectedOrigin: input.rp.origin,
      expectedRPID: input.rp.id,
      credential: { id: passkey.credentialId, publicKey: new Uint8Array(passkey.publicKey), counter: 0, transports: passkey.transports },
      requireUserVerification: false,
    });
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!verified.verified) return { ok: false, reason: "invalid" };
  const info = verified.authenticationInfo;
  if (!info.userVerified) return { ok: false, reason: "no_user_verification" };
  // Not signed, but a discoverable passkey returns the handle it was made with: none, or another, is refused.
  if (response.response.userHandle !== userHandleOf(passkey.userId)) return { ok: false, reason: "user_handle" };
  if (passkey.removedAt) return { ok: false, reason: "removed" };
  if (input.member?.status !== "active") return { ok: false, reason: "member_inactive" };
  if ((info.newCounter > 0 || passkey.counter > 0) && info.newCounter <= passkey.counter) return { ok: false, reason: "counter", counter: info.newCounter };
  return { ok: true, counter: info.newCounter, deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp };
}

const MESSAGES = { en, es } as const;
/** A passkey's first name, from its device type, in the page's language; numbered when taken. */
export function defaultPasskeyName(deviceType: DeviceType, locale: string, taken: readonly string[]): string {
  const lang = locale === "es" ? "es" : "en";
  const base = createTranslator({ locale: lang, messages: MESSAGES[lang], namespace: "passkeys.defaultName" })(deviceType);
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.includes(`${base} ${n}`)) return `${base} ${n}`;
}

// ---------- through the database ----------

const nowOf = (d: AuthDeps) => (d.now ? d.now() : new Date());
const after = (at: Date, ms: number) => new Date(at.getTime() + ms);

/** Lapsed challenges go a batch at a time as new ones are made (a lapsed one is refused whether kept or not). */
const sweepChallenges = (tx: Tx, now: Date) =>
  tx.execute(sql`delete from webauthn_challenges where id in (select id from webauthn_challenges where expires_at < ${now.toISOString()}::timestamptz limit ${SWEEP_BATCH} for update skip locked)`);

/** The challenge a response answers, locked and spent at once: refused or not, it never works again. */
async function spendChallenge(tx: Tx, response: { response: { clientDataJSON: string } }, now: Date): Promise<ChallengeRow | undefined> {
  const challenge = challengeOf(response);
  if (!challenge) return undefined;
  const [row] = await tx.select().from(s.webauthnChallenges).where(eq(s.webauthnChallenges.challengeHash, digest(challenge))).for("update");
  if (row && !row.usedAt) await tx.update(s.webauthnChallenges).set({ usedAt: now }).where(eq(s.webauthnChallenges.id, row.id));
  return row;
}

/** One person's passkey changes, one at a time (the cap is counted and kept under it). */
const personLock = (tx: Tx, userId: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`passkeys:${userId}`}, 0))`);
const livePasskeys = async (tx: Tx, userId: string) =>
  (
    await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(s.passkeys)
      .where(and(eq(s.passkeys.userId, userId), isNull(s.passkeys.removedAt)))
  )[0]?.n ?? 0;

export interface PasskeySummary {
  id: string;
  name: string;
  deviceType: DeviceType;
  backedUp: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}
const summaryOf = (row: typeof s.passkeys.$inferSelect): PasskeySummary => ({ id: row.id, name: row.name, deviceType: row.deviceType, backedUp: row.backedUp, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt });

/** The person's passkeys (not removed), oldest first (for the account page). */
export async function listPasskeys(deps: AuthDeps, person: { userId: string; agencyId: string }): Promise<PasskeySummary[]> {
  return withAuth(deps, async (tx) => {
    const rows = await tx
      .select()
      .from(s.passkeys)
      .where(and(eq(s.passkeys.userId, person.userId), eq(s.passkeys.agencyId, person.agencyId), isNull(s.passkeys.removedAt)))
      .orderBy(asc(s.passkeys.createdAt), asc(s.passkeys.id));
    return rows.map(summaryOf);
  });
}

export type RegistrationOptionsError = "confirm" | "expired" | "too_many" | "invalid" | "locked" | "busy";

/**
 * What the browser needs to make a passkey for the signed-in person (a full session). The password,
 * or a code when they have an authenticator, comes with this very request, every time: a recent
 * sign-in or a confirmation given for something else is not enough, so a stolen session cannot leave
 * a passkey behind (GitHub asks before "Add a passkey"). The challenge issued is the one use of that
 * confirmation (five minutes, once). Someone with neither a password nor an authenticator (who joined
 * with Google or Microsoft) gives a code emailed to them for it (decision 0033, review L3). Never asked
 * in the demo's shared sessions. A newer challenge replaces their open one.
 */
export async function passkeyRegistrationOptions(deps: AuthDeps, session: SessionInfo, rp: RelyingParty, secret: string | null): Promise<{ ok: true; options: PublicKeyCredentialCreationOptionsJSON } | { ok: false; error: RegistrationOptionsError }> {
  if (!session.secondStepAt) return { ok: false, error: "expired" };
  const [login] = await withAuth(deps, (tx) => tx.select({ passwordHash: s.userLogins.passwordHash, totpEnabledAt: s.userLogins.totpEnabledAt }).from(s.userLogins).where(eq(s.userLogins.userId, session.userId)));
  const existing = await withAuth(deps, (tx) => livePasskeys(tx, session.userId));
  if (existing >= MAX_PASSKEYS) return { ok: false, error: "too_many" };
  if (!session.demo) {
    if (secret === null) return { ok: false, error: "confirm" };
    const confirmed = login?.passwordHash || login?.totpEnabledAt ? await confirmAccess(deps, session, secret) : await confirmByEmailCode(deps, session, secret);
    if (!confirmed.ok) return confirmed;
  }
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    await sweepChallenges(tx, now);
    const mine = await tx
      .select({ credentialId: s.passkeys.credentialId, transports: s.passkeys.transports })
      .from(s.passkeys)
      .where(and(eq(s.passkeys.userId, session.userId), isNull(s.passkeys.removedAt)));
    const options = await registrationOptionsFor(rp, { id: session.userId, email: session.email, name: session.name }, mine);
    await tx
      .update(s.webauthnChallenges)
      .set({ usedAt: now })
      .where(and(eq(s.webauthnChallenges.userId, session.userId), eq(s.webauthnChallenges.purpose, "register"), isNull(s.webauthnChallenges.usedAt)));
    await tx.insert(s.webauthnChallenges).values({ agencyId: session.agencyId, userId: session.userId, purpose: "register", challengeHash: digest(options.challenge), createdAt: now, expiresAt: after(now, CHALLENGE_MS) });
    return { ok: true, options };
  });
}

/**
 * The browser's new passkey, judged against the challenge issued with the confirmation, and kept,
 * named from its device type in the language of the page the person is on (`locale`; a demo visitor
 * chooses theirs). Logged as passkey_added; the person is emailed (in their own language) after it is
 * kept, so a passkey they did not add does not go unnoticed.
 */
export async function addPasskey(
  deps: AuthDeps,
  session: SessionInfo,
  response: RegistrationResponseJSON,
  rp: RelyingParty,
  opts: { locale?: string } = {},
): Promise<{ ok: true; passkey: PasskeySummary } | { ok: false; error: "expired" | "invalid" | "exists" | "too_many" }> {
  if (!session.secondStepAt) return { ok: false, error: "expired" };
  const now = nowOf(deps);
  const result = await withAuth(deps, async (tx) => {
    const challengeRow = await spendChallenge(tx, response, now);
    const judged = await judgeRegistration({ response, challengeRow, userId: session.userId, rp, now });
    if (!judged.ok) return { ok: false as const, error: "invalid" as const };
    const [taken] = await tx.select({ id: s.passkeys.id }).from(s.passkeys).where(eq(s.passkeys.credentialId, judged.passkey.credentialId));
    if (taken) return { ok: false as const, error: "exists" as const };
    await personLock(tx, session.userId);
    if ((await livePasskeys(tx, session.userId)) >= MAX_PASSKEYS) return { ok: false as const, error: "too_many" as const };
    await enterAgency(tx, session.agencyId);
    const names = await tx
      .select({ name: s.passkeys.name })
      .from(s.passkeys)
      .where(and(eq(s.passkeys.userId, session.userId), isNull(s.passkeys.removedAt)));
    const { credentialId, publicKey, counter, transports, deviceType, backedUp } = judged.passkey;
    const name = defaultPasskeyName(deviceType, opts.locale ?? session.locale, names.map((n) => n.name));
    const [row] = await tx.insert(s.passkeys).values({ agencyId: session.agencyId, userId: session.userId, credentialId, publicKey, counter, transports, deviceType, backedUp, name, createdAt: now }).returning();
    await log(tx, { id: session.userId, agencyId: session.agencyId, name: session.name }, [{ action: "passkey_added", entityType: "user", entityId: session.userId, after: { passkey: row!.id, name, synced: backedUp } }], session.demo);
    const mail = await noticeMail(tx, session, name, rp, now);
    return { ok: true as const, passkey: summaryOf(row!), mail };
  });
  if (!result.ok) return result;
  if (result.mail) await deliver(deps, session.agencyId, result.mail);
  return { ok: true, passkey: result.passkey };
}

/** The "passkey added" email, recorded with the agency's others; sent after the passkey is kept. */
async function noticeMail(tx: Tx, session: SessionInfo, passkeyName: string, rp: RelyingParty, now: Date): Promise<OutgoingMail | null> {
  const [user] = await tx.select().from(s.users).where(eq(s.users.id, session.userId));
  const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, session.agencyId));
  if (!user || !agency) return null;
  const zone = await settingOn<unknown>(tx, "time_zone", now.toISOString().slice(0, 10));
  const mail = renderPasskeyAddedEmail({
    name: user.name,
    locale: user.preferredLocale,
    agencyName: agency.name,
    passkeyName,
    at: now,
    timeZone: typeof zone === "string" ? zone : "UTC",
    accountLink: `${rp.origin}/${user.preferredLocale === "es" ? "es" : "en"}/settings/account`,
  });
  const [row] = await tx.insert(s.emailMessages).values({ agencyId: agency.id, kind: "passkey_added", toEmail: user.email, toName: user.name, subject: mail.subject, textBody: mail.text, status: "sending", createdAt: now }).returning({ id: s.emailMessages.id });
  return { id: row!.id, fromName: agency.name, replyTo: agency.email, to: { email: user.email, name: user.name }, subject: mail.subject, text: mail.text, html: mail.html };
}

/**
 * A passkey of the person's, removed (kept, marked): it never signs in again, and the person's other
 * sessions end — one of them may be the passkey's (as a new password does; the demo's shared sessions
 * aside). Needs "confirm it's you" when due. Logged as passkey_removed.
 */
export async function removePasskey(deps: AuthDeps, session: SessionInfo, passkeyId: string): Promise<{ ok: true } | { ok: false; error: "confirm" | "expired" | "not_found" }> {
  if (!session.secondStepAt) return { ok: false, error: "expired" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(passkeyId)) return { ok: false, error: "not_found" };
  if (await mustConfirm(deps, session)) return { ok: false, error: "confirm" };
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, session.agencyId);
    await personLock(tx, session.userId);
    const [row] = await tx
      .update(s.passkeys)
      .set({ removedAt: now })
      .where(and(eq(s.passkeys.id, passkeyId), eq(s.passkeys.userId, session.userId), eq(s.passkeys.agencyId, session.agencyId), isNull(s.passkeys.removedAt)))
      .returning();
    if (!row) return { ok: false, error: "not_found" };
    await tx.update(s.sessions).set({ endedAt: now }).where(and(eq(s.sessions.userId, session.userId), ne(s.sessions.id, session.sessionId), isNull(s.sessions.endedAt), eq(s.sessions.demo, false)));
    await log(tx, { id: session.userId, agencyId: session.agencyId, name: session.name }, [{ action: "passkey_removed", entityType: "user", entityId: session.userId, before: { passkey: row.id, name: row.name } }], session.demo);
    return { ok: true };
  });
}

/** The cap on open sign-in challenges counts the visitor's address group. */
const optionsKey = (address: string) => digest(`passkey options|${addressGroup(address)}`);
/**
 * The throttle's keys: this passkey from this address group (10 refusals in 15 minutes), and passkey
 * refusals from this address group (50) — apart from the password's, so neither blocks the other. None
 * when the address is unknown.
 */
const throttleKeys = (credentialId: string, address: string | null): readonly string[] => (address ? [digest(`passkey|${credentialId}|${addressGroup(address)}`), digest(`passkey address|${addressGroup(address)}`)] : []);

/**
 * What the browser needs to sign in with any passkey of this site. Open ones are capped — 20 per
 * address group, 10,000 in all — counted and made under one lock, so parallel requests cannot pass the
 * caps together.
 */
export async function passkeySignInOptions(deps: AuthDeps, rp: RelyingParty, address: string | null): Promise<{ ok: true; options: PublicKeyCredentialRequestOptionsJSON } | { ok: false; error: "locked" }> {
  const now = nowOf(deps);
  const options = await signInOptionsFor(rp);
  const addressHash = address ? optionsKey(address) : null;
  return withAuth(deps, async (tx) => {
    await sweepChallenges(tx, now);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('passkey sign-in challenges', 0))`);
    const open = and(eq(s.webauthnChallenges.purpose, "sign_in"), isNull(s.webauthnChallenges.usedAt), gt(s.webauthnChallenges.expiresAt, now));
    const [all] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.webauthnChallenges).where(open);
    if ((all?.n ?? 0) >= OPEN_CHALLENGES_IN_ALL) return { ok: false, error: "locked" };
    if (addressHash) {
      const [here] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.webauthnChallenges).where(and(open, eq(s.webauthnChallenges.addressHash, addressHash)));
      if ((here?.n ?? 0) >= OPEN_CHALLENGES_PER_ADDRESS) return { ok: false, error: "locked" };
    }
    await tx.insert(s.webauthnChallenges).values({ purpose: "sign_in", challengeHash: digest(options.challenge), addressHash, createdAt: now, expiresAt: after(now, CHALLENGE_MS) });
    return { ok: true, options };
  });
}

export type PasskeySignInResult = { ok: true; token: string; locale: string } | { ok: false; error: "invalid" | "locked" };

/**
 * Sign in with a passkey: the challenge is spent first; the passkey is found by its credential id
 * (across agencies) and locked; judged; its counter and last use kept; a full session started (a
 * user-verified passkey is both steps), marked as the demo's when the agency is a demo. A response
 * whose signature and checks pass is never held back by the throttle. A refusal of a passkey we know
 * is counted and, until the throttle says "wait", logged for its person (a counter that went back also
 * as a possible copy); a passkey nobody added is refused without counting, so junk cannot fill the
 * throttle. Every refusal answers the same.
 */
export async function passkeySignIn(deps: AuthDeps, response: AuthenticationResponseJSON, rp: RelyingParty, userAgent: string | null, address: string | null = null): Promise<PasskeySignInResult> {
  const now = nowOf(deps);
  const keys = throttleKeys(response.id, address);
  return withAuth(deps, async (tx): Promise<PasskeySignInResult> => {
    const challengeRow = await spendChallenge(tx, response, now);
    const [row] = await tx.select().from(s.passkeys).where(eq(s.passkeys.credentialId, response.id)).for("update");
    if (!row) return { ok: false, error: "invalid" };
    await enterAgency(tx, row.agencyId);
    const [user] = await tx.select().from(s.users).where(and(eq(s.users.id, row.userId), eq(s.users.agencyId, row.agencyId)));
    const [agency] = await tx.select({ isDemo: s.agencies.isDemo }).from(s.agencies).where(eq(s.agencies.id, row.agencyId));
    const demo = Boolean(agency?.isDemo);
    const judged = await judgeSignIn({ response, challengeRow, passkey: row, member: user, rp, now });
    if (!judged.ok) {
      const waiting = await throttled(tx, keys, now);
      await noteThrottle(tx, keys, now);
      if (user && judged.reason === "counter") await log(tx, user, [{ action: "passkey_clone_suspected", entityType: "user", entityId: user.id, after: { passkey: row.id, counterKept: row.counter, counterGiven: judged.counter ?? 0 } }], demo);
      if (user && !waiting) await log(tx, user, [{ action: "sign_in_failed", entityType: "user", entityId: user.id, after: { step: "passkey", reason: judged.reason, passkey: row.id } }], demo);
      return { ok: false, error: waiting ? "locked" : "invalid" };
    }
    await tx.update(s.passkeys).set({ counter: judged.counter, backedUp: judged.backedUp, lastUsedAt: now }).where(eq(s.passkeys.id, row.id));
    if (keys[0]) await tx.delete(s.signInFailures).where(inArray(s.signInFailures.keyHash, [keys[0]]));
    const token = await startSession(tx, user!, { demo, next: "done", userAgent, now });
    await log(tx, user!, [{ action: "sign_in", entityType: "user", entityId: user!.id, after: { method: "passkey", passkey: row.id } }], demo);
    return { ok: true, token, locale: user!.preferredLocale };
  });
}
