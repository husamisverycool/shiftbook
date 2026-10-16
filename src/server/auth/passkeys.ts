/**
 * Passkeys (decision 0032; W3C Web Authentication Level 3; GitHub's "Managing your passkeys" and
 * "Signing in with a passkey"): a signed-in person adds one after confirming it's them; anyone signs in
 * with one without typing an email (a discoverable credential). The device checks it is the person
 * (user verification), so a passkey sign-in has passed both steps (SPEC §2: MFA for Owner and
 * Coordinator); a response without that check is refused.
 *
 * Two halves: a judge that decides from what it is given (no I/O, no clock of its own), and the steps
 * that read and write the database in sign-in mode (app.auth, as service.ts does: the passkey is found
 * before the agency is known). Challenges work once and for five minutes; only their SHA-256 is kept.
 * Nothing here logs a credential id, a public key or a challenge.
 */
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
import { and, asc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import type { UserStatus } from "../db/schema";
import { digest } from "./crypto";
import { enterAgency, log, mustConfirm, noteThrottle, startSession, throttled, withAuth, type AuthDeps, type SessionInfo } from "./service";

const MINUTE = 60 * 1000;
/** A challenge works for five minutes (also the ceremony's timeout, W3C's recommended range). */
export const CHALLENGE_MS = 5 * MINUTE;
/** At most this many open sign-in challenges per address (the options request needs no sign-in). */
const OPEN_CHALLENGES_PER_ADDRESS = 20;
const RP_NAME = "Shiftbook";

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

/** The challenge a response answers, read from its clientDataJSON; null when unreadable. */
export function challengeOf(response: { response: { clientDataJSON: string } }): string | null {
  try {
    const data = JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8")) as { challenge?: unknown };
    return typeof data.challenge === "string" && /^[A-Za-z0-9_-]{1,512}$/.test(data.challenge) ? data.challenge : null;
  } catch {
    return null;
  }
}

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

export type RegistrationRefusal = "challenge" | "invalid" | "no_user_verification";

/**
 * A new passkey, judged: the challenge issued to this person to add one, still open; this site's
 * origin and RP ID; a valid attestation ("none"); and the device's own check that it is the person.
 */
export async function judgeRegistration(input: { response: RegistrationResponseJSON; challengeRow: ChallengeRow | undefined; userId: string; rp: RelyingParty; now: Date }): Promise<{ ok: true; passkey: NewPasskey } | { ok: false; reason: RegistrationRefusal }> {
  const challenge = challengeOf(input.response);
  if (!challenge || challengeProblem(input.challengeRow, { purpose: "register", userId: input.userId }, input.now)) return { ok: false, reason: "challenge" };
  let verified;
  try {
    // User verification is checked below, so its refusal can be told apart.
    verified = await verifyRegistrationResponse({ response: input.response, expectedChallenge: challenge, expectedOrigin: input.rp.origin, expectedRPID: input.rp.id, requireUserPresence: true, requireUserVerification: false });
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

export type SignInRefusal = "challenge" | "unknown_passkey" | "invalid" | "no_user_verification" | "removed" | "member_inactive" | "counter";

/**
 * A passkey sign-in, judged: an open sign-in challenge; a passkey we know whose key signed this site's
 * response; the device's check that it is the person; then refused when the passkey was removed, its
 * person is not active, the user handle names someone else, or the counter did not go up (a copied
 * authenticator; a counter that stays 0 is a passkey that does not count, as synced ones).
 */
export async function judgeSignIn(input: {
  response: AuthenticationResponseJSON;
  challengeRow: ChallengeRow | undefined;
  passkey: StoredPasskey | undefined;
  member: { status: UserStatus } | undefined;
  rp: RelyingParty;
  now: Date;
}): Promise<{ ok: true; counter: number; deviceType: DeviceType; backedUp: boolean } | { ok: false; reason: SignInRefusal }> {
  const { response, passkey } = input;
  const challenge = challengeOf(response);
  if (!challenge || challengeProblem(input.challengeRow, { purpose: "sign_in", userId: null }, input.now)) return { ok: false, reason: "challenge" };
  if (!passkey || passkey.credentialId !== response.id) return { ok: false, reason: "unknown_passkey" };
  let verified;
  try {
    // The counter (passed as 0) and user verification are checked below, after the signature.
    verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
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
  // The user handle is not signed, but a discoverable passkey returns the one it was made with.
  if (response.response.userHandle && response.response.userHandle !== userHandleOf(passkey.userId)) return { ok: false, reason: "invalid" };
  if (passkey.removedAt) return { ok: false, reason: "removed" };
  if (input.member?.status !== "active") return { ok: false, reason: "member_inactive" };
  if ((info.newCounter > 0 || passkey.counter > 0) && info.newCounter <= passkey.counter) return { ok: false, reason: "counter" };
  return { ok: true, counter: info.newCounter, deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp };
}

const MESSAGES = { en, es } as const;
/** A passkey's first name, from its device type, in the person's language; numbered when taken. */
export function defaultPasskeyName(deviceType: DeviceType, locale: string, taken: readonly string[]): string {
  const lang = locale === "es" ? "es" : "en";
  const base = createTranslator({ locale: lang, messages: MESSAGES[lang], namespace: "passkeys.defaultName" })(deviceType);
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.includes(`${base} ${n}`)) return `${base} ${n}`;
}

// ---------- through the database ----------

const nowOf = (d: AuthDeps) => (d.now ? d.now() : new Date());
const after = (at: Date, ms: number) => new Date(at.getTime() + ms);

/** Lapsed challenges go as new ones are made (a lapsed one is refused whether it is kept or not). */
const sweepChallenges = (tx: Tx, now: Date) => tx.delete(s.webauthnChallenges).where(lt(s.webauthnChallenges.expiresAt, now));

/** The challenge a response answers, locked and spent at once: refused or not, it never works again. */
async function spendChallenge(tx: Tx, response: { response: { clientDataJSON: string } }, now: Date): Promise<ChallengeRow | undefined> {
  const challenge = challengeOf(response);
  if (!challenge) return undefined;
  const [row] = await tx.select().from(s.webauthnChallenges).where(eq(s.webauthnChallenges.challengeHash, digest(challenge))).for("update");
  if (row && !row.usedAt) await tx.update(s.webauthnChallenges).set({ usedAt: now }).where(eq(s.webauthnChallenges.id, row.id));
  return row;
}

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

/**
 * What the browser needs to make a passkey for the signed-in person: a full session that confirmed
 * it's them recently (GitHub asks before "Add a passkey"). A newer challenge replaces their open one.
 */
export async function passkeyRegistrationOptions(deps: AuthDeps, session: SessionInfo, rp: RelyingParty): Promise<{ ok: true; options: PublicKeyCredentialCreationOptionsJSON } | { ok: false; error: "confirm" | "expired" }> {
  if (!session.secondStepAt) return { ok: false, error: "expired" };
  if (await mustConfirm(deps, session)) return { ok: false, error: "confirm" };
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    await sweepChallenges(tx, now);
    const existing = await tx
      .select({ credentialId: s.passkeys.credentialId, transports: s.passkeys.transports })
      .from(s.passkeys)
      .where(and(eq(s.passkeys.userId, session.userId), isNull(s.passkeys.removedAt)));
    const options = await registrationOptionsFor(rp, { id: session.userId, email: session.email, name: session.name }, existing);
    await tx
      .update(s.webauthnChallenges)
      .set({ usedAt: now })
      .where(and(eq(s.webauthnChallenges.userId, session.userId), eq(s.webauthnChallenges.purpose, "register"), isNull(s.webauthnChallenges.usedAt)));
    await tx.insert(s.webauthnChallenges).values({ agencyId: session.agencyId, userId: session.userId, purpose: "register", challengeHash: digest(options.challenge), createdAt: now, expiresAt: after(now, CHALLENGE_MS) });
    return { ok: true, options };
  });
}

/**
 * The browser's new passkey, judged and kept, named from its device type in the language of the page
 * the person is on (the demo people's visitors choose theirs); logged as passkey_added.
 */
export async function addPasskey(deps: AuthDeps, session: SessionInfo, response: RegistrationResponseJSON, rp: RelyingParty, locale: string = session.locale): Promise<{ ok: true; passkey: PasskeySummary } | { ok: false; error: "confirm" | "expired" | "invalid" | "exists" }> {
  if (!session.secondStepAt) return { ok: false, error: "expired" };
  if (await mustConfirm(deps, session)) return { ok: false, error: "confirm" };
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    const challengeRow = await spendChallenge(tx, response, now);
    const judged = await judgeRegistration({ response, challengeRow, userId: session.userId, rp, now });
    if (!judged.ok) return { ok: false, error: "invalid" };
    const [taken] = await tx.select({ id: s.passkeys.id }).from(s.passkeys).where(eq(s.passkeys.credentialId, judged.passkey.credentialId));
    if (taken) return { ok: false, error: "exists" };
    await enterAgency(tx, session.agencyId);
    const names = await tx
      .select({ name: s.passkeys.name })
      .from(s.passkeys)
      .where(and(eq(s.passkeys.userId, session.userId), isNull(s.passkeys.removedAt)));
    const { credentialId, publicKey, counter, transports, deviceType, backedUp } = judged.passkey;
    const name = defaultPasskeyName(deviceType, locale, names.map((n) => n.name));
    const [row] = await tx.insert(s.passkeys).values({ agencyId: session.agencyId, userId: session.userId, credentialId, publicKey, counter, transports, deviceType, backedUp, name, createdAt: now }).returning();
    await log(tx, { id: session.userId, agencyId: session.agencyId, name: session.name }, [{ action: "passkey_added", entityType: "user", entityId: session.userId, after: { passkey: row!.id, name, synced: backedUp } }], session.demo);
    return { ok: true, passkey: summaryOf(row!) };
  });
}

/** A passkey of the person's, removed (kept, marked): it never signs in again. Logged as passkey_removed. */
export async function removePasskey(deps: AuthDeps, session: SessionInfo, passkeyId: string): Promise<{ ok: true } | { ok: false; error: "confirm" | "expired" | "not_found" }> {
  if (!session.secondStepAt) return { ok: false, error: "expired" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(passkeyId)) return { ok: false, error: "not_found" };
  if (await mustConfirm(deps, session)) return { ok: false, error: "confirm" };
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, session.agencyId);
    const [row] = await tx
      .update(s.passkeys)
      .set({ removedAt: now })
      .where(and(eq(s.passkeys.id, passkeyId), eq(s.passkeys.userId, session.userId), eq(s.passkeys.agencyId, session.agencyId), isNull(s.passkeys.removedAt)))
      .returning();
    if (!row) return { ok: false, error: "not_found" };
    await log(tx, { id: session.userId, agencyId: session.agencyId, name: session.name }, [{ action: "passkey_removed", entityType: "user", entityId: session.userId, before: { passkey: row.id, name: row.name } }], session.demo);
    return { ok: true };
  });
}

/** The visitor's address as the cap on open sign-in challenges counts it. */
const optionsKey = (address: string) => digest(`passkey options|${address}`);
/**
 * The throttle's keys (decision 0025's, with the passkey for the email): this passkey from this
 * address, and this address (shared with wrong passwords). None when the address is unknown.
 */
const throttleKeys = (credentialId: string, address: string | null): readonly string[] => (address ? [digest(`passkey|${credentialId}|${address}`), digest(`address|${address}`)] : []);

/** What the browser needs to sign in with any passkey of this site; at most 20 open per address. */
export async function passkeySignInOptions(deps: AuthDeps, rp: RelyingParty, address: string | null): Promise<{ ok: true; options: PublicKeyCredentialRequestOptionsJSON } | { ok: false; error: "locked" }> {
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    await sweepChallenges(tx, now);
    const addressHash = address ? optionsKey(address) : null;
    if (addressHash) {
      const [open] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(s.webauthnChallenges)
        .where(and(eq(s.webauthnChallenges.addressHash, addressHash), isNull(s.webauthnChallenges.usedAt), gt(s.webauthnChallenges.expiresAt, now)));
      if ((open?.n ?? 0) >= OPEN_CHALLENGES_PER_ADDRESS) return { ok: false, error: "locked" };
    }
    const options = await signInOptionsFor(rp);
    await tx.insert(s.webauthnChallenges).values({ purpose: "sign_in", challengeHash: digest(options.challenge), addressHash, createdAt: now, expiresAt: after(now, CHALLENGE_MS) });
    return { ok: true, options };
  });
}

export type PasskeySignInResult = { ok: true; token: string; locale: string } | { ok: false; error: "invalid" | "locked" };

/**
 * Sign in with a passkey: the challenge is spent first; the passkey is found by its credential id
 * (across agencies) and locked; judged; its counter and last use kept; a full session started (a
 * user-verified passkey is both steps). A refusal counts in the throttle and, when the passkey is
 * known, is logged for its person; every refusal answers the same.
 */
export async function passkeySignIn(deps: AuthDeps, response: AuthenticationResponseJSON, rp: RelyingParty, userAgent: string | null, address: string | null = null): Promise<PasskeySignInResult> {
  const now = nowOf(deps);
  const keys = throttleKeys(response.id, address);
  return withAuth(deps, async (tx): Promise<PasskeySignInResult> => {
    if (await throttled(tx, keys, now)) return { ok: false, error: "locked" };
    const challengeRow = await spendChallenge(tx, response, now);
    const [row] = await tx.select().from(s.passkeys).where(eq(s.passkeys.credentialId, response.id)).for("update");
    let user: typeof s.users.$inferSelect | undefined;
    if (row) {
      await enterAgency(tx, row.agencyId);
      [user] = await tx.select().from(s.users).where(and(eq(s.users.id, row.userId), eq(s.users.agencyId, row.agencyId)));
    }
    const judged = await judgeSignIn({ response, challengeRow, passkey: row, member: user, rp, now });
    if (!judged.ok) {
      await noteThrottle(tx, keys, now);
      if (row && user) await log(tx, user, [{ action: "sign_in_failed", entityType: "user", entityId: user.id, after: { step: "passkey", reason: judged.reason, passkey: row.id } }]);
      return { ok: false, error: "invalid" };
    }
    await tx.update(s.passkeys).set({ counter: judged.counter, backedUp: judged.backedUp, lastUsedAt: now }).where(eq(s.passkeys.id, row!.id));
    if (keys[0]) await tx.delete(s.signInFailures).where(eq(s.signInFailures.keyHash, keys[0]));
    const token = await startSession(tx, user!, { demo: false, next: "done", userAgent, now });
    await log(tx, user!, [{ action: "sign_in", entityType: "user", entityId: user!.id, after: { method: "passkey", passkey: row!.id } }]);
    return { ok: true, token, locale: user!.preferredLocale };
  });
}
