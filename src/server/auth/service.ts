/**
 * Sign-in (slice k, decisions K1–K3; GitHub's two-step sign-in): email and password, then the
 * six-digit code (or a recovery code) when the person has an authenticator or their role needs one
 * (Owner, Coordinator); setting one up; sessions; password resets and invites by one-time links.
 *
 * The login, session and token tables are read before the agency is known, so these functions run in
 * sign-in mode (app.auth, see drizzle/0034) and then fence themselves to the person's agency for
 * everything else. Nothing here logs or returns a password, a secret, a code or a token's digest.
 *
 * Wrong tries are limited three ways (decision 0025): a short throttle per email and address and per
 * address (10 and 50 wrong passwords in 15 minutes; it covers unknown emails too, so it tells nothing
 * about who has an account); per person, 100 wrong passwords in a day lock the password for an hour
 * (NIST SP 800-63B's limit); and wrong codes, counted apart (a right password never clears them): 10
 * in 15 minutes lock the code for 15 minutes, 100 in a row for a day, and a half session ends after 5.
 * Every count is read and written under the login row's lock, so parallel tries count one by one.
 */
import { parseAccent } from "@/lib/accent";
import { and, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { auditBy, type AuditInput } from "../audit";
import type { Db, Tx } from "../db/client";
import * as s from "../db/schema";
import type { MailTransport, OutgoingMail } from "../mail/transport";
import { can, fewerRights, ROLES, type Role } from "../permissions";
import { appKey, digest, randomToken, seal, unseal } from "./crypto";
import { hashPassword, PasswordBusyError, passwordProblem, verifyPassword } from "./password";
import { newRecoveryCodes, spendRecoveryCode, unusedCodes } from "./recovery";
import { base32Encode, newTotpSecret, otpauthUri, verifyTotp } from "./totp";

export type { Role };
export { SESSION_COOKIE } from "./cookie";
/** A session ends after 12 hours without a request, and after 7 days in any case. */
export const IDLE_MS = 12 * 60 * 60 * 1000;
export const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
/** A half session (the password given, the code or the authenticator setup still owed). */
const HALF_FOR_CODE_MS = 10 * 60 * 1000;
const HALF_FOR_SETUP_MS = 30 * 60 * 1000;
const HALF_CODE_TRIES = 5;
const MINUTE = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE;
const THROTTLE_WINDOW_MS = 15 * MINUTE;
const PER_EMAIL_AND_ADDRESS = 10;
const PER_ADDRESS = 50;
const PASSWORD_DAY_LIMIT = 100;
const PASSWORD_LOCK_MS = 60 * MINUTE;
const CODE_LIMIT = 10;
const CODE_WINDOW_MS = 15 * MINUTE;
const CODE_LOCK_MS = 15 * MINUTE;
const CODE_IN_ROW_LIMIT = 100;
/**
 * A change to how one signs in (an authenticator, recovery codes) or to the agency's people needs
 * the password or a code given within this long in the session (GitHub's sudo mode; GitHub allows
 * two hours, Tabulado a quarter of one).
 */
export const CONFIRM_MS = 15 * MINUTE;
export const INVITE_DAYS = 10;
const RESET_MS = 60 * MINUTE;
/** Links in emails carry this prefix, so every kept text can hide them. */
const LINK_TOKEN = /sbau_[A-Za-z0-9_-]{20,}/g;
export const HIDDEN_AUTH_LINK = "[sign-in link hidden]";
const ISSUER = "Tabulado";

/** The roles that need the second step (SPEC §2: MFA for Owner and Coordinator; the Recruiter handles workers' SSNs too). */
export const requiresSecondStep = (role: Role) => role === "owner" || role === "coordinator" || role === "recruiter";

export interface AuthDeps {
  db: Db;
  mailTransport: (agencyId: string) => MailTransport;
  now?: () => Date;
}
const nowOf = (d: AuthDeps) => (d.now ? d.now() : new Date());
const after = (at: Date, ms: number) => new Date(at.getTime() + ms);

/** A transaction in sign-in mode: the login, session and token tables are visible across agencies. */
export function withAuth<T>(deps: AuthDeps, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return deps.db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.auth', 'on', true)`);
    return fn(tx);
  });
}
/** From here on in this transaction, the agency's own tables are visible too. */
export const enterAgency = (tx: Tx, agencyId: string) => tx.execute(sql`select set_config('app.agency_id', ${agencyId}, true)`);

/** A one-time link's token (invites, resets, sign-ups): only its digest is kept. */
export const linkToken = () => `sbau_${randomToken()}`;
/** The shape every one-time link token has. */
export const LINK_TOKEN_SHAPE = /^sbau_[A-Za-z0-9_-]{43}$/;
export const hideAuthLinks = (text: string) => text.replace(LINK_TOKEN, HIDDEN_AUTH_LINK);
export const normalEmail = (email: string) => email.trim().toLowerCase();
type Login = typeof s.userLogins.$inferSelect;
type User = typeof s.users.$inferSelect;
/** The person's login, locked until the transaction ends: every count is read and written under it. */
export const lockedLogin = async (tx: Tx, userId: string): Promise<Login | undefined> => (await tx.select().from(s.userLogins).where(eq(s.userLogins.userId, userId)).for("update"))[0];

export interface SessionInfo {
  sessionId: string;
  agencyId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  locale: string;
  demo: boolean;
  secondStepAt: Date | null;
  /** When the password or a code was last given in this session. */
  confirmedAt: Date | null;
  hasAuthenticator: boolean;
  /** System, Light or Dark (decision 0046). */
  appearance?: "system" | "light" | "dark";
  /** Decision 0046: the person's accent colour. */
  accent?: "indigo" | "blue" | "teal" | "graphite";
}

/** The session a cookie names, still valid and its person active; it notes the person was seen. */
export async function readSession(deps: AuthDeps, token: string | undefined): Promise<SessionInfo | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    const [row] = await tx
      .select()
      .from(s.sessions)
      .where(and(eq(s.sessions.tokenHash, digest(token)), isNull(s.sessions.endedAt), gt(s.sessions.expiresAt, now), gt(s.sessions.lastSeenAt, new Date(now.getTime() - IDLE_MS))));
    if (!row) return null;
    await enterAgency(tx, row.agencyId);
    // A demo session ("Continue as") is good only for a demo agency.
    if (row.demo) {
      const [agency] = await tx.select({ isDemo: s.agencies.isDemo }).from(s.agencies).where(eq(s.agencies.id, row.agencyId));
      if (!agency?.isDemo) return null;
    }
    const [user] = await tx.select().from(s.users).where(eq(s.users.id, row.userId));
    if (!user || user.status !== "active") return null;
    const [login] = await tx.select({ totpEnabledAt: s.userLogins.totpEnabledAt }).from(s.userLogins).where(eq(s.userLogins.userId, user.id));
    // Seen: at most one write every five minutes.
    if (now.getTime() - row.lastSeenAt.getTime() > 5 * MINUTE) await tx.update(s.sessions).set({ lastSeenAt: now }).where(eq(s.sessions.id, row.id));
    return { sessionId: row.id, agencyId: row.agencyId, userId: user.id, name: user.name, email: user.email, role: user.role, locale: user.preferredLocale, demo: row.demo, secondStepAt: row.secondStepAt, confirmedAt: row.confirmedAt, hasAuthenticator: Boolean(login?.totpEnabledAt), appearance: user.appearance, accent: user.accent };
  });
}

/** What the person still has to do before the app opens. */
export function nextStep(info: Pick<SessionInfo, "role" | "secondStepAt" | "hasAuthenticator">): "done" | "code" | "setup" {
  if (info.secondStepAt) return "done";
  if (info.hasAuthenticator) return "code";
  return requiresSecondStep(info.role) ? "setup" : "done";
}

/** A new session, confirmed now (the person just gave a password, a code or a link); a half one lasts minutes. */
export async function startSession(tx: Tx, user: { id: string; agencyId: string }, opts: { demo: boolean; next: "done" | "code" | "setup"; userAgent: string | null; now: Date; firstFactor?: string }): Promise<string> {
  const token = randomToken();
  const lasts = opts.next === "done" ? MAX_SESSION_MS : opts.next === "code" ? HALF_FOR_CODE_MS : HALF_FOR_SETUP_MS;
  await tx.insert(s.sessions).values({
    agencyId: user.agencyId,
    userId: user.id,
    tokenHash: digest(token),
    demo: opts.demo,
    secondStepAt: opts.next === "done" ? opts.now : null,
    confirmedAt: opts.now,
    createdAt: opts.now,
    lastSeenAt: opts.now,
    expiresAt: after(opts.now, lasts),
    userAgent: opts.userAgent?.slice(0, 400) ?? null,
    firstFactor: opts.firstFactor ?? null,
  });
  return token;
}

const who = (user: { id: string; agencyId: string; name: string }, demo = false) => ({ agencyId: user.agencyId, userId: user.id, label: demo && !user.name.endsWith("(demo)") ? `${user.name} (demo)` : user.name });
export const log = (tx: Tx, user: { id: string; agencyId: string; name: string }, events: AuditInput[], demo = false) => auditBy(tx, who(user, demo), events);

// ---------- wrong tries ----------

/**
 * The throttle's keys: this email from this address, and this address (digests; an unknown email
 * counts the same). When the address is unknown (no trusted proxy recorded it), none: an email-only
 * key would let anyone block that email for its owner too, and every visitor would share one address.
 * The person's own day lock still counts every wrong password, and a reset link clears it.
 */
export const throttleKeys = (email: string, address: string | null): readonly string[] => (address ? [digest(`password|${normalEmail(email)}|${address}`), digest(`address|${address}`)] : []);

export async function throttled(tx: Tx, keys: readonly string[], now: Date): Promise<boolean> {
  if (keys.length === 0) return false;
  const rows = await tx
    .select({ key: s.signInFailures.keyHash, n: sql<number>`count(*)::int` })
    .from(s.signInFailures)
    .where(and(inArray(s.signInFailures.keyHash, [...keys]), gt(s.signInFailures.at, new Date(now.getTime() - THROTTLE_WINDOW_MS))))
    .groupBy(s.signInFailures.keyHash);
  const n = (key: string) => rows.find((r) => r.key === key)?.n ?? 0;
  return n(keys[0]!) >= PER_EMAIL_AND_ADDRESS || (keys[1] !== undefined && n(keys[1]) >= PER_ADDRESS);
}
export const noteThrottle = async (tx: Tx, keys: readonly string[], now: Date) => {
  if (keys.length > 0) await tx.insert(s.signInFailures).values(keys.map((keyHash) => ({ keyHash, at: now })));
};

/** A wrong password for this person (their login row locked): 100 in a day lock the password for an hour. */
export async function countPasswordFailure(tx: Tx, login: Login, now: Date): Promise<boolean> {
  const fresh = !login.failedSince || now.getTime() - login.failedSince.getTime() > DAY_MS;
  const count = fresh ? 1 : login.failedCount + 1;
  const locked = count >= PASSWORD_DAY_LIMIT;
  await tx
    .update(s.userLogins)
    .set({ failedCount: locked ? 0 : count, failedSince: locked ? null : fresh ? now : login.failedSince, lockedUntil: locked ? after(now, PASSWORD_LOCK_MS) : login.lockedUntil })
    .where(eq(s.userLogins.userId, login.userId));
  return locked;
}

/** A wrong code (the login row locked): 10 in 15 minutes lock the code for 15 minutes; 100 in a row, for a day. */
export async function countCodeFailure(tx: Tx, login: Login, now: Date): Promise<boolean> {
  const fresh = !login.codeFailedSince || now.getTime() - login.codeFailedSince.getTime() > CODE_WINDOW_MS;
  const count = fresh ? 1 : login.codeFailedCount + 1;
  const inRow = login.codeFailuresInRow + 1;
  const lockFor = inRow >= CODE_IN_ROW_LIMIT ? DAY_MS : count >= CODE_LIMIT ? CODE_LOCK_MS : 0;
  await tx
    .update(s.userLogins)
    .set({
      codeFailedCount: lockFor ? 0 : count,
      codeFailedSince: lockFor ? null : fresh ? now : login.codeFailedSince,
      // The day lock starts the count over: at most about 100 guesses a day, and never a lock that only renews itself.
      codeFailuresInRow: inRow >= CODE_IN_ROW_LIMIT ? 0 : inRow,
      codeLockedUntil: lockFor ? after(now, lockFor) : login.codeLockedUntil,
    })
    .where(eq(s.userLogins.userId, login.userId));
  return lockFor > 0;
}

export const codeLocked = (login: Login, now: Date) => Boolean(login.codeLockedUntil && login.codeLockedUntil > now);

/**
 * The six-digit code (a step later than the last one used) or a recovery code (once), checked
 * under the login row's lock. A wrong one counts and is logged; a right one clears the code counts.
 */
async function checkCode(tx: Tx, login: Login, user: User, code: string, now: Date, demo = false): Promise<{ ok: true; recovery: s.StoredRecoveryCode[] | null } | { ok: false; error: "invalid" | "locked" }> {
  const looksLikeRecovery = /[A-Za-z2-7]{5}[\s-]?[A-Za-z2-7]{5}/.test(code.trim());
  // While six-digit codes are locked, a recovery code (50 bits: not guessable) still gets the person in.
  if (codeLocked(login, now) && !looksLikeRecovery) return { ok: false, error: "locked" };
  const secret = unseal(login.totpSecret!, appKey(), `totp:${login.userId}`);
  const step = codeLocked(login, now) ? null : verifyTotp(secret, code, Math.floor(now.getTime() / 1000), login.totpLastStep);
  const recovery = step === null && looksLikeRecovery ? spendRecoveryCode(login.recoveryCodes, code, now) : null;
  if (step === null && recovery === null && codeLocked(login, now)) return { ok: false, error: "locked" };
  if (step === null && recovery === null) {
    const locked = await countCodeFailure(tx, login, now);
    await log(tx, user, [{ action: "sign_in_failed", entityType: "user", entityId: user.id, after: { step: "code", locked } }], demo);
    return { ok: false, error: locked ? "locked" : "invalid" };
  }
  await tx
    .update(s.userLogins)
    .set({ codeFailedCount: 0, codeFailedSince: null, codeFailuresInRow: 0, codeLockedUntil: null, ...(step !== null ? { totpLastStep: step } : {}), ...(recovery ? { recoveryCodes: recovery } : {}) })
    .where(eq(s.userLogins.userId, login.userId));
  return { ok: true, recovery };
}

// ---------- signing in ----------

export type SignInResult = { ok: true; token: string; next: "done" | "code" | "setup"; locale: string } | { ok: false; error: "invalid" | "locked" | "busy" };

/**
 * Email and password. The hash is checked outside any transaction (it takes half a second); the
 * outcome is then counted under the login's lock. An unknown email costs as much time as a known one
 * and answers the same.
 */
export async function signIn(deps: AuthDeps, email: string, password: string, userAgent: string | null, address: string | null = null): Promise<SignInResult> {
  const now = nowOf(deps);
  const keys = throttleKeys(email, address);
  const found = await withAuth(deps, async (tx) => {
    if (await throttled(tx, keys, now)) return "throttled" as const;
    const [login] = await tx.select({ userId: s.userLogins.userId, passwordHash: s.userLogins.passwordHash }).from(s.userLogins).where(eq(s.userLogins.email, normalEmail(email)));
    return login ?? null;
  });
  if (found === "throttled") return { ok: false, error: "locked" };
  let good: boolean;
  try {
    good = (await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH)) && Boolean(found?.passwordHash);
  } catch (error) {
    if (error instanceof PasswordBusyError) return { ok: false, error: "busy" };
    throw error;
  }
  return withAuth(deps, async (tx): Promise<SignInResult> => {
    const login = found ? await lockedLogin(tx, found.userId) : undefined;
    const refuse = async (error: "invalid" | "locked"): Promise<SignInResult> => {
      await noteThrottle(tx, keys, now);
      return { ok: false, error };
    };
    if (!login?.passwordHash) return refuse("invalid");
    if (login.lockedUntil && login.lockedUntil > now) return refuse("locked");
    await enterAgency(tx, login.agencyId);
    const [user] = await tx.select().from(s.users).where(eq(s.users.id, login.userId));
    // Judged against the password in force now (it may have changed while this one was hashed).
    if (!good || login.passwordHash !== found!.passwordHash || !user || user.status !== "active") {
      const locked = await countPasswordFailure(tx, login, now);
      if (user) await log(tx, user, [{ action: "sign_in_failed", entityType: "user", entityId: user.id, after: { step: "password", locked } }]);
      return refuse(locked ? "locked" : "invalid");
    }
    // The password's count starts over; the code's does not (a right password never clears it).
    await tx.update(s.userLogins).set({ failedCount: 0, failedSince: null }).where(eq(s.userLogins.userId, login.userId));
    if (keys[0]) await tx.delete(s.signInFailures).where(eq(s.signInFailures.keyHash, keys[0]));
    const next = nextStep({ role: user.role, secondStepAt: null, hasAuthenticator: Boolean(login.totpEnabledAt) });
    const token = await startSession(tx, user, { demo: false, next, userAgent, now });
    if (next === "done") await log(tx, user, [{ action: "sign_in", entityType: "user", entityId: user.id, after: { method: "password" } }]);
    return { ok: true, token, next, locale: user.preferredLocale };
  });
}
/** A hash of nothing in particular, verified when the email is unknown so both paths take as long. */
const DUMMY_HASH = "scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/**
 * The second step of a half session: a six-digit code, or a recovery code once. Five wrong codes
 * end the half session (the password again). A new session token replaces the half one.
 */
export async function verifySecondStep(deps: AuthDeps, token: string, code: string, userAgent: string | null): Promise<{ ok: true; token: string; recoveryLeft: number | null } | { ok: false; error: "invalid" | "locked" | "expired" }> {
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    const halfOf = () => and(eq(s.sessions.tokenHash, digest(token)), isNull(s.sessions.endedAt), isNull(s.sessions.secondStepAt), gt(s.sessions.expiresAt, now));
    const [seen] = await tx.select({ userId: s.sessions.userId }).from(s.sessions).where(halfOf());
    if (!seen) return { ok: false, error: "expired" };
    // The login's lock first, then the session's (the order every other path takes), then look again.
    const login = await lockedLogin(tx, seen.userId);
    const [session] = await tx.select().from(s.sessions).where(halfOf()).for("update");
    if (!session) return { ok: false, error: "expired" };
    if (!login?.totpSecret || !login.totpEnabledAt) return { ok: false, error: "expired" };
    await enterAgency(tx, session.agencyId);
    const [user] = await tx.select().from(s.users).where(eq(s.users.id, session.userId));
    if (!user || user.status !== "active") return { ok: false, error: "expired" };
    const checked = await checkCode(tx, login, user, code, now);
    if (!checked.ok) {
      const tries = session.codeFailures + 1;
      if (tries >= HALF_CODE_TRIES) {
        await tx.update(s.sessions).set({ endedAt: now, codeFailures: tries }).where(eq(s.sessions.id, session.id));
        return { ok: false, error: checked.error === "locked" ? "locked" : "expired" };
      }
      await tx.update(s.sessions).set({ codeFailures: tries }).where(eq(s.sessions.id, session.id));
      return checked;
    }
    const { recovery } = checked;
    // A fresh token once the second step is passed (the first one was only half a sign-in).
    await tx.update(s.sessions).set({ endedAt: now }).where(eq(s.sessions.id, session.id));
    const fresh = await startSession(tx, user, { demo: false, next: "done", userAgent, now, firstFactor: session.firstFactor ?? undefined });
    await log(tx, user, [{ action: "sign_in", entityType: "user", entityId: user.id, after: { method: `${session.firstFactor ?? "password"} and ${recovery ? "recovery code" : "authenticator code"}`, ...(recovery ? { recoveryCodesLeft: unusedCodes(recovery) } : {}) } }]);
    return { ok: true, token: fresh, recoveryLeft: recovery ? unusedCodes(recovery) : null };
  });
}

// ---------- confirming it is them (GitHub's sudo mode) ----------

/**
 * Whether this session must give the password or a code before a change to how one signs in or to
 * the agency's people: a full session whose last confirmation is older than CONFIRM_MS, for a person
 * who has a password or an authenticator to give. Never for the demo's shared "Continue as"
 * sessions (they used neither) or a half session (it was confirmed minutes ago).
 */
export async function mustConfirm(deps: AuthDeps, session: SessionInfo): Promise<boolean> {
  const now = nowOf(deps);
  if (session.demo || !session.secondStepAt) return false;
  if (session.confirmedAt && now.getTime() - session.confirmedAt.getTime() <= CONFIRM_MS) return false;
  // Everyone else is asked too: a person with neither a password nor an authenticator (who joined with
  // Google or Microsoft) confirms with a code sent to their email (decision 0033, review L3).
  return true;
}

/** What the person confirms with: a code when they have an authenticator, else their password. */
export const confirmMethod = (session: SessionInfo): "code" | "password" => (session.hasAuthenticator ? "code" : "password");

/** The same, knowing whether they have a password: with neither, a code sent to their email (decision 0033). */
export async function confirmMethodOf(deps: AuthDeps, session: SessionInfo): Promise<"code" | "password" | "email"> {
  if (session.hasAuthenticator) return "code";
  const [login] = await withAuth(deps, (tx) => tx.select({ passwordHash: s.userLogins.passwordHash }).from(s.userLogins).where(eq(s.userLogins.userId, session.userId)));
  return login?.passwordHash ? "password" : "email";
}

/** The password or a code, given again; the session is confirmed for CONFIRM_MS. Wrong ones count as at sign-in. */
export async function confirmAccess(deps: AuthDeps, session: SessionInfo, secret: string): Promise<{ ok: true } | { ok: false; error: "invalid" | "locked" | "busy" }> {
  const now = nowOf(deps);
  const [first] = await withAuth(deps, (tx) => tx.select().from(s.userLogins).where(eq(s.userLogins.userId, session.userId)));
  let passwordGood: boolean | null = null;
  if (!first?.totpEnabledAt && first?.passwordHash) {
    try {
      passwordGood = await verifyPassword(secret, first.passwordHash);
    } catch (error) {
      if (error instanceof PasswordBusyError) return { ok: false, error: "busy" };
      throw error;
    }
  }
  return withAuth(deps, async (tx) => {
    const login = await lockedLogin(tx, session.userId);
    await enterAgency(tx, session.agencyId);
    const [user] = await tx.select().from(s.users).where(eq(s.users.id, session.userId));
    if (!user) return { ok: false, error: "invalid" };
    if (login?.totpEnabledAt && login.totpSecret) {
      const checked = await checkCode(tx, login, user, secret, now, session.demo);
      if (!checked.ok) return checked;
    } else if (login?.passwordHash) {
      if (login.lockedUntil && login.lockedUntil > now) return { ok: false, error: "locked" };
      if (!passwordGood || login.passwordHash !== first?.passwordHash) {
        const locked = await countPasswordFailure(tx, login, now);
        await log(tx, user, [{ action: "sign_in_failed", entityType: "user", entityId: user.id, after: { step: "confirm", locked } }], session.demo);
        return { ok: false, error: locked ? "locked" : "invalid" };
      }
    } else {
      // Neither a password nor an authenticator: nothing here can confirm it; an emailed code does (decision 0033).
      return { ok: false, error: "invalid" };
    }
    await tx.update(s.sessions).set({ confirmedAt: now }).where(eq(s.sessions.id, session.sessionId));
    return { ok: true };
  });
}

// ---------- the authenticator and recovery codes ----------

/**
 * A new authenticator for the signed-in person: the secret as text and as the app's link (for the QR
 * code). A half session waiting for a code may not (it has not passed the step); a full one must have
 * confirmed recently.
 */
export async function beginAuthenticatorSetup(deps: AuthDeps, session: SessionInfo): Promise<{ ok: true; setupKey: string; uri: string } | { ok: false; error: "confirm" | "expired" }> {
  if (!session.secondStepAt && session.hasAuthenticator) return { ok: false, error: "expired" };
  if (await mustConfirm(deps, session)) return { ok: false, error: "confirm" };
  const secret = newTotpSecret();
  const pending = seal(secret, appKey(), `totp:${session.userId}`);
  // A person with no login yet (a demo person) gets one with no password.
  await withAuth(deps, (tx) =>
    tx
      .insert(s.userLogins)
      .values({ userId: session.userId, agencyId: session.agencyId, email: normalEmail(session.email), totpPending: pending })
      .onConflictDoUpdate({ target: s.userLogins.userId, set: { totpPending: pending } }),
  );
  return { ok: true, setupKey: base32Encode(secret).replace(/(.{4})/g, "$1 ").trim(), uri: otpauthUri(ISSUER, session.email, secret) };
}

/**
 * A code from the new authenticator turns it on; ten recovery codes, shown once. A half session (the
 * setup a role needs) has now passed its step; it gets a fresh token when the person leaves the codes
 * (rotateSession), so the page that shows them is not reloaded under it.
 */
export async function confirmAuthenticator(deps: AuthDeps, session: SessionInfo, code: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: "invalid" | "expired" }> {
  const now = nowOf(deps);
  if (!session.secondStepAt && session.hasAuthenticator) return { ok: false, error: "expired" };
  return withAuth(deps, async (tx) => {
    const login = await lockedLogin(tx, session.userId);
    if (!login?.totpPending) return { ok: false, error: "expired" };
    const secret = unseal(login.totpPending, appKey(), `totp:${session.userId}`);
    const step = verifyTotp(secret, code, Math.floor(now.getTime() / 1000), null);
    if (step === null) return { ok: false, error: "invalid" };
    const { codes, stored } = newRecoveryCodes();
    await tx
      .update(s.userLogins)
      .set({ totpSecret: login.totpPending, totpPending: null, totpEnabledAt: now, totpLastStep: step, recoveryCodes: stored, codeFailedCount: 0, codeFailedSince: null, codeFailuresInRow: 0, codeLockedUntil: null })
      .where(eq(s.userLogins.userId, session.userId));
    await enterAgency(tx, session.agencyId);
    await log(tx, { id: session.userId, agencyId: session.agencyId, name: session.name }, [{ action: "update", entityType: "user", entityId: session.userId, before: { authenticator: Boolean(login.totpEnabledAt) }, after: { authenticator: true } }], session.demo);
    // Other browsers were signed in with the old authenticator, or none: they sign in again (not
    // the demo's shared "Continue as" sessions, which never used either).
    await tx.update(s.sessions).set({ endedAt: now }).where(and(eq(s.sessions.userId, session.userId), ne(s.sessions.id, session.sessionId), isNull(s.sessions.endedAt), eq(s.sessions.demo, false)));
    if (!session.secondStepAt) {
      // The step a role needs is passed; the session runs as long as any (MAX_SESSION_MS) from now.
      await tx.update(s.sessions).set({ secondStepAt: now, expiresAt: after(now, MAX_SESSION_MS) }).where(eq(s.sessions.id, session.sessionId));
      await log(tx, { id: session.userId, agencyId: session.agencyId, name: session.name }, [{ action: "sign_in", entityType: "user", entityId: session.userId, after: { method: "password and a new authenticator" } }], session.demo);
    }
    await tx.update(s.sessions).set({ confirmedAt: now }).where(eq(s.sessions.id, session.sessionId));
    return { ok: true, recoveryCodes: codes };
  });
}

/** This session under a fresh token (after the step a role needs, so no token from before it lives on). */
export async function rotateSession(deps: AuthDeps, token: string | undefined, userAgent: string | null): Promise<string | null> {
  if (!token) return null;
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    const [row] = await tx
      .update(s.sessions)
      .set({ endedAt: now })
      .where(and(eq(s.sessions.tokenHash, digest(token)), isNull(s.sessions.endedAt), gt(s.sessions.expiresAt, now), sql`${s.sessions.secondStepAt} is not null`))
      .returning();
    if (!row) return null;
    const fresh = randomToken();
    await tx.insert(s.sessions).values({ agencyId: row.agencyId, userId: row.userId, tokenHash: digest(fresh), demo: row.demo, secondStepAt: row.secondStepAt, confirmedAt: row.confirmedAt, createdAt: now, lastSeenAt: now, expiresAt: row.expiresAt, userAgent: userAgent?.slice(0, 400) ?? null });
    return fresh;
  });
}

/** A new set of recovery codes (confirmed recently); the old ones stop working. */
export async function replaceRecoveryCodes(deps: AuthDeps, session: SessionInfo): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: "confirm" | "none" }> {
  if (await mustConfirm(deps, session)) return { ok: false, error: "confirm" };
  return withAuth(deps, async (tx) => {
    const login = await lockedLogin(tx, session.userId);
    if (!login?.totpEnabledAt) return { ok: false, error: "none" };
    const { codes, stored } = newRecoveryCodes();
    await tx.update(s.userLogins).set({ recoveryCodes: stored }).where(eq(s.userLogins.userId, session.userId));
    await enterAgency(tx, session.agencyId);
    await log(tx, { id: session.userId, agencyId: session.agencyId, name: session.name }, [{ action: "update", entityType: "user", entityId: session.userId, after: { recoveryCodes: "replaced" } }], session.demo);
    return { ok: true, recoveryCodes: codes };
  });
}

/** How many recovery codes are left (for the account page). */
export async function recoveryCodesLeft(deps: AuthDeps, userId: string): Promise<number | null> {
  return withAuth(deps, async (tx) => {
    const [login] = await tx.select().from(s.userLogins).where(eq(s.userLogins.userId, userId));
    return login?.totpEnabledAt ? unusedCodes(login.recoveryCodes) : null;
  });
}

export type PasswordError = "wrong_password" | "too_short" | "too_long" | "is_email" | "one_character" | "locked" | "busy" | "confirm";

/** A new password, given the current one (a wrong one counts as at sign-in); the person's other sessions end. */
export async function changePassword(deps: AuthDeps, session: SessionInfo, current: string, next: string): Promise<{ ok: true } | { ok: false; error: PasswordError }> {
  const problem = passwordProblem(next, session.email);
  if (problem) return { ok: false, error: problem };
  const now = nowOf(deps);
  const [first] = await withAuth(deps, (tx) => tx.select({ passwordHash: s.userLogins.passwordHash }).from(s.userLogins).where(eq(s.userLogins.userId, session.userId)));
  // A first password is a new way in: without a current one to give, confirm it's them first (decision 0033, review L3).
  if (!first?.passwordHash && (await mustConfirm(deps, session))) return { ok: false, error: "confirm" };
  let hash: string;
  let currentGood = true;
  try {
    if (first?.passwordHash) currentGood = await verifyPassword(current, first.passwordHash);
    hash = await hashPassword(next);
  } catch (error) {
    if (error instanceof PasswordBusyError) return { ok: false, error: "busy" };
    throw error;
  }
  return withAuth(deps, async (tx) => {
    const login = await lockedLogin(tx, session.userId);
    await enterAgency(tx, session.agencyId);
    const me = { id: session.userId, agencyId: session.agencyId, name: session.name };
    if (login?.passwordHash) {
      if (login.lockedUntil && login.lockedUntil > now) return { ok: false, error: "locked" };
      // Judged against the password in force now.
      if (!currentGood || login.passwordHash !== first?.passwordHash) {
        const locked = await countPasswordFailure(tx, login, now);
        await log(tx, me, [{ action: "sign_in_failed", entityType: "user", entityId: session.userId, after: { step: "change password", locked } }], session.demo);
        return { ok: false, error: locked ? "locked" : "wrong_password" };
      }
    }
    // A demo person has no password yet: they set one without a current one.
    if (!login) await tx.insert(s.userLogins).values({ userId: session.userId, agencyId: session.agencyId, email: normalEmail(session.email), passwordHash: hash, passwordChangedAt: now });
    else await tx.update(s.userLogins).set({ passwordHash: hash, passwordChangedAt: now, failedCount: 0, failedSince: null }).where(eq(s.userLogins.userId, session.userId));
    await tx.update(s.sessions).set({ endedAt: now }).where(and(eq(s.sessions.userId, session.userId), ne(s.sessions.id, session.sessionId), isNull(s.sessions.endedAt), eq(s.sessions.demo, false)));
    await tx.update(s.sessions).set({ confirmedAt: now }).where(eq(s.sessions.id, session.sessionId));
    await log(tx, me, [{ action: "update", entityType: "user", entityId: session.userId, after: { password: "changed" } }], session.demo);
    return { ok: true };
  });
}

/** Ends this session (sign-out). The person's other sessions go on (each signs out on its own). */
export async function endSession(deps: AuthDeps, token: string | undefined): Promise<void> {
  if (!token) return;
  const now = nowOf(deps);
  await withAuth(deps, async (tx) => {
    const [row] = await tx.update(s.sessions).set({ endedAt: now }).where(and(eq(s.sessions.tokenHash, digest(token)), isNull(s.sessions.endedAt))).returning();
    if (!row) return;
    await enterAgency(tx, row.agencyId);
    const [user] = await tx.select().from(s.users).where(eq(s.users.id, row.userId));
    if (user) await log(tx, user, [{ action: "sign_out", entityType: "user", entityId: user.id }], row.demo);
  });
}

/** Demo mode's "Continue as": a real session for a demo person, its second step counted (the demo has no phones). */
export async function demoSignIn(deps: AuthDeps, agencyId: string, userId: string, userAgent: string | null): Promise<{ ok: true; token: string; locale: string } | { ok: false }> {
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, agencyId);
    const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, agencyId));
    const [user] = await tx.select().from(s.users).where(and(eq(s.users.id, userId), eq(s.users.status, "active")));
    if (!agency?.isDemo || !user) return { ok: false };
    const token = await startSession(tx, user, { demo: true, next: "done", userAgent, now });
    await log(tx, user, [{ action: "sign_in", entityType: "user", entityId: user.id, after: { method: "demo" } }], true);
    return { ok: true, token, locale: user.preferredLocale };
  });
}

// ---------- one-time links: password resets and invites ----------

async function newLink(tx: Tx, user: { id: string; agencyId: string }, purpose: "invite" | "reset", expiresAt: Date, byLabel: string, now: Date): Promise<string> {
  // A newer link replaces any unused one of the same kind.
  await tx.update(s.authTokens).set({ usedAt: now }).where(and(eq(s.authTokens.userId, user.id), eq(s.authTokens.purpose, purpose), isNull(s.authTokens.usedAt)));
  const token = linkToken();
  await tx.insert(s.authTokens).values({ agencyId: user.agencyId, userId: user.id, purpose, tokenHash: digest(token), createdByLabel: byLabel, createdAt: now, expiresAt });
  return token;
}

export interface LinkMail {
  subject: string;
  text: string;
  html: string;
}

async function sendLinkMail(tx: Tx, agency: { id: string; name: string; email: string | null }, to: { email: string; name: string }, kind: "invite" | "password_reset", mail: LinkMail, now: Date): Promise<OutgoingMail> {
  const [row] = await tx.insert(s.emailMessages).values({ agencyId: agency.id, kind, toEmail: to.email, toName: to.name, subject: mail.subject, textBody: hideAuthLinks(mail.text), status: "sending", createdAt: now }).returning({ id: s.emailMessages.id });
  return { id: row!.id, fromName: agency.name, replyTo: agency.email, to, subject: mail.subject, text: mail.text, html: mail.html };
}

/** Sends after commit, recording the outcome (as approval emails do, decision 0012). */
export async function deliver(deps: AuthDeps, agencyId: string, mail: OutgoingMail): Promise<boolean> {
  const db = deps.db;
  const mark = (status: "sent" | "failed", extra: Record<string, unknown>) =>
    db.transaction(async (tx) => {
      await enterAgency(tx, agencyId);
      await tx.update(s.emailMessages).set({ status, ...extra }).where(eq(s.emailMessages.id, mail.id));
    });
  try {
    const { providerId } = await deps.mailTransport(agencyId).send(mail);
    await mark("sent", { providerId, sentAt: nowOf(deps) });
    return true;
  } catch (error) {
    await mark("failed", { error: hideAuthLinks(error instanceof Error ? error.message : String(error)) });
    return false;
  }
}

/**
 * A reset link for an active person with a password (at most one a minute); the same answer whatever
 * the email. `later` sends the email after the response (so an existing account does not answer more
 * slowly); without it, it is sent before returning (tests, the demo mailbox).
 */
export async function requestPasswordReset(
  deps: AuthDeps,
  email: string,
  render: (link: string, user: { name: string; locale: string; agencyName: string }) => LinkMail,
  baseUrl: string,
  later?: (job: () => Promise<unknown>) => void,
): Promise<void> {
  const now = nowOf(deps);
  const pending = await withAuth(deps, async (tx) => {
    const [login] = await tx.select().from(s.userLogins).where(eq(s.userLogins.email, normalEmail(email)));
    if (!login?.passwordHash) return null;
    await enterAgency(tx, login.agencyId);
    const [user] = await tx.select().from(s.users).where(eq(s.users.id, login.userId));
    const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, login.agencyId));
    if (!user || user.status !== "active" || !agency) return null;
    // At most one reset email a minute per person (a held-down button, or someone flooding their inbox).
    const [recent] = await tx.select({ id: s.authTokens.id }).from(s.authTokens).where(and(eq(s.authTokens.userId, user.id), eq(s.authTokens.purpose, "reset"), gt(s.authTokens.createdAt, new Date(now.getTime() - MINUTE))));
    if (recent) return null;
    const token = await newLink(tx, user, "reset", after(now, RESET_MS), user.name, now);
    const mail = await sendLinkMail(tx, agency, { email: user.email, name: user.name }, "password_reset", render(`${baseUrl}/${user.preferredLocale}/sign-in/reset/${token}`, { name: user.name, locale: user.preferredLocale, agencyName: agency.name }), now);
    await log(tx, user, [{ action: "update", entityType: "user", entityId: user.id, after: { passwordReset: "requested" } }]);
    return { agencyId: agency.id, mail };
  });
  if (!pending) return;
  if (later) later(() => deliver(deps, pending.agencyId, pending.mail));
  else await deliver(deps, pending.agencyId, pending.mail);
}

export interface LinkInfo {
  name: string;
  email: string;
  role: Role;
  agencyName: string;
  locale: string;
  /** Who sent the invite. */
  byLabel: string;
  /** A reset for a person with an authenticator whose code this browser has not given yet. */
  needsCode: boolean;
}

/** Whether this browser gave the reset's code: the proof cookie it was given then matches. */
const codeGivenHere = (row: typeof s.authTokens.$inferSelect, proof: string | null | undefined) => Boolean(row.codeVerifiedAt && row.codeProofHash && proof && digest(proof) === row.codeProofHash);

/** What a one-time link is for, if it still works: the person's name, email and role (for the page). */
export async function linkFor(deps: AuthDeps, token: string, purpose: "invite" | "reset", proof?: string | null): Promise<LinkInfo | null> {
  if (!/^sbau_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    const [row] = await tx.select().from(s.authTokens).where(and(eq(s.authTokens.tokenHash, digest(token)), eq(s.authTokens.purpose, purpose), isNull(s.authTokens.usedAt), gt(s.authTokens.expiresAt, now)));
    if (!row) return null;
    await enterAgency(tx, row.agencyId);
    const [user] = await tx.select().from(s.users).where(eq(s.users.id, row.userId));
    const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, row.agencyId));
    if (!user || !agency || user.status !== (purpose === "invite" ? "invited" : "active")) return null;
    const [login] = await tx.select({ totpEnabledAt: s.userLogins.totpEnabledAt }).from(s.userLogins).where(eq(s.userLogins.userId, user.id));
    const needsCode = purpose === "reset" && Boolean(login?.totpEnabledAt) && !codeGivenHere(row, proof);
    return { name: user.name, email: user.email, role: user.role, agencyName: agency.name, locale: user.preferredLocale, byLabel: row.createdByLabel, needsCode };
  });
}

/**
 * A reset link of a person with an authenticator: their code (or a recovery code) comes before the
 * new password (GitHub). The browser that gave it gets a proof (kept in a cookie) that only it may
 * then set the password; a password lock does not stop it (the code has its own).
 */
export async function verifyResetCode(deps: AuthDeps, token: string, code: string): Promise<{ ok: true; proof: string } | { ok: false; error: "invalid" | "locked" | "expired" }> {
  if (!/^sbau_[A-Za-z0-9_-]{43}$/.test(token)) return { ok: false, error: "expired" };
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    const [row] = await tx.select().from(s.authTokens).where(and(eq(s.authTokens.tokenHash, digest(token)), eq(s.authTokens.purpose, "reset"), isNull(s.authTokens.usedAt), gt(s.authTokens.expiresAt, now))).for("update");
    if (!row) return { ok: false, error: "expired" };
    const login = await lockedLogin(tx, row.userId);
    if (!login?.totpSecret || !login.totpEnabledAt) return { ok: false, error: "expired" };
    await enterAgency(tx, row.agencyId);
    const [user] = await tx.select().from(s.users).where(eq(s.users.id, row.userId));
    if (!user || user.status !== "active") return { ok: false, error: "expired" };
    const checked = await checkCode(tx, login, user, code, now);
    if (!checked.ok) return checked;
    const proof = randomToken();
    await tx.update(s.authTokens).set({ codeVerifiedAt: now, codeProofHash: digest(proof) }).where(eq(s.authTokens.id, row.id));
    return { ok: true, proof };
  });
}

/**
 * A reset link or an invite, used: the new password is set, the person is active, every other
 * session ends, and a session starts (its second step still to do when the role needs one).
 */
export async function redeemLink(
  deps: AuthDeps,
  token: string,
  purpose: "invite" | "reset",
  password: string,
  userAgent: string | null,
  proof: string | null = null,
): Promise<{ ok: true; token: string; next: "done" | "code" | "setup"; locale: string } | { ok: false; error: "expired" | "code_needed" | PasswordError }> {
  const now = nowOf(deps);
  if (!/^sbau_[A-Za-z0-9_-]{43}$/.test(token)) return { ok: false, error: "expired" };
  const found = await linkFor(deps, token, purpose, proof);
  if (!found) return { ok: false, error: "expired" };
  if (found.needsCode) return { ok: false, error: "code_needed" };
  const problem = passwordProblem(password, found.email);
  if (problem) return { ok: false, error: problem };
  let hash: string;
  try {
    hash = await hashPassword(password);
  } catch (error) {
    if (error instanceof PasswordBusyError) return { ok: false, error: "busy" };
    throw error;
  }
  return withAuth(deps, async (tx) => {
    const [row] = await tx.select().from(s.authTokens).where(and(eq(s.authTokens.tokenHash, digest(token)), eq(s.authTokens.purpose, purpose), isNull(s.authTokens.usedAt), gt(s.authTokens.expiresAt, now))).for("update");
    if (!row) return { ok: false, error: "expired" };
    const [login] = await tx.select({ totpEnabledAt: s.userLogins.totpEnabledAt }).from(s.userLogins).where(eq(s.userLogins.userId, row.userId));
    // The code is given before the password changes, by this browser (checked again under the row's lock).
    const codeGiven = codeGivenHere(row, proof);
    if (purpose === "reset" && login?.totpEnabledAt && !codeGiven) return { ok: false, error: "code_needed" };
    await tx.update(s.authTokens).set({ usedAt: now }).where(eq(s.authTokens.id, row.id));
    await enterAgency(tx, row.agencyId);
    const [user] = await tx.select().from(s.users).where(eq(s.users.id, row.userId));
    if (!user) return { ok: false, error: "expired" };
    await tx.update(s.userLogins).set({ passwordHash: hash, passwordChangedAt: now, failedCount: 0, failedSince: null, lockedUntil: null }).where(eq(s.userLogins.userId, user.id));
    if (purpose === "invite") await tx.update(s.users).set({ status: "active" }).where(eq(s.users.id, user.id));
    // Every session that used the old password ends (the demo's shared "Continue as" ones never did).
    await tx.update(s.sessions).set({ endedAt: now }).where(and(eq(s.sessions.userId, user.id), isNull(s.sessions.endedAt), eq(s.sessions.demo, false)));
    // A reset whose code was given has passed the second step.
    const next = nextStep({ role: user.role, secondStepAt: codeGiven ? now : null, hasAuthenticator: Boolean(login?.totpEnabledAt) });
    const session = await startSession(tx, user, { demo: false, next, userAgent, now });
    await log(tx, user, [{ action: "update", entityType: "user", entityId: user.id, after: purpose === "invite" ? { invite: "accepted" } : { password: "reset" } }]);
    if (next === "done") await log(tx, user, [{ action: "sign_in", entityType: "user", entityId: user.id, after: { method: purpose === "invite" ? "invite" : "password reset" } }]);
    return { ok: true, token: session, next, locale: user.preferredLocale };
  });
}

/** The person's own sign-in details for their account page. */
export async function accountOf(deps: AuthDeps, userId: string): Promise<{ hasPassword: boolean; passwordChangedAt: Date | null; authenticatorSince: Date | null; recoveryCodesLeft: number | null }> {
  return withAuth(deps, async (tx) => {
    const [login] = await tx.select().from(s.userLogins).where(eq(s.userLogins.userId, userId));
    return {
      hasPassword: Boolean(login?.passwordHash),
      passwordChangedAt: login?.passwordChangedAt ?? null,
      authenticatorSince: login?.totpEnabledAt ?? null,
      recoveryCodesLeft: login?.totpEnabledAt ? unusedCodes(login.recoveryCodes) : null,
    };
  });
}

/**
 * Demo only (decision K3): the latest invite or reset email sent to these addresses, as the demo
 * mailbox kept it (its link included), so the flow can be tried without email. Nothing for an agency
 * that is not a demo.
 */
export async function demoMailCopies(deps: AuthDeps, agencyId: string, kind: "invite" | "password_reset", emails: string[]): Promise<Map<string, string>> {
  const wanted = emails.map(normalEmail);
  if (wanted.length === 0) return new Map();
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, agencyId);
    const [agency] = await tx.select({ isDemo: s.agencies.isDemo }).from(s.agencies).where(eq(s.agencies.id, agencyId));
    if (!agency?.isDemo) return new Map();
    const rows = await tx
      .select({ toEmail: s.demoMailbox.toEmail, textBody: s.demoMailbox.textBody, createdAt: s.demoMailbox.createdAt })
      .from(s.demoMailbox)
      .innerJoin(s.emailMessages, eq(s.emailMessages.id, s.demoMailbox.emailMessageId))
      .where(and(eq(s.emailMessages.kind, kind), inArray(sql`lower(${s.demoMailbox.toEmail})`, wanted)))
      .orderBy(desc(s.demoMailbox.createdAt));
    const out = new Map<string, string>();
    for (const r of rows) if (!out.has(normalEmail(r.toEmail))) out.set(normalEmail(r.toEmail), r.textBody);
    return out;
  });
}

/** Demo only: the agency an email signs in to (for the reset page's demo copy), when it is a demo agency. */
export async function demoAgencyOf(deps: AuthDeps, email: string): Promise<string | null> {
  return withAuth(deps, async (tx) => {
    const [login] = await tx.select({ agencyId: s.userLogins.agencyId }).from(s.userLogins).where(eq(s.userLogins.email, normalEmail(email)));
    if (!login) return null;
    await enterAgency(tx, login.agencyId);
    const [agency] = await tx.select({ isDemo: s.agencies.isDemo }).from(s.agencies).where(eq(s.agencies.id, login.agencyId));
    return agency?.isDemo ? login.agencyId : null;
  });
}

// ---------- members (the Owner) ----------

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: s.UserStatus;
  hasAuthenticator: boolean;
  lastSeenAt: Date | null;
  inviteExpiresAt: Date | null;
}

/** Everyone in the agency, with their sign-in state. */
export async function listMembers(deps: AuthDeps, agencyId: string): Promise<Member[]> {
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, agencyId);
    const [users, logins, seen, invites] = await Promise.all([
      tx.select().from(s.users).where(eq(s.users.agencyId, agencyId)),
      tx.select({ userId: s.userLogins.userId, totpEnabledAt: s.userLogins.totpEnabledAt }).from(s.userLogins).where(eq(s.userLogins.agencyId, agencyId)),
      tx.select({ userId: s.sessions.userId, at: sql<Date>`max(${s.sessions.lastSeenAt})` }).from(s.sessions).where(eq(s.sessions.agencyId, agencyId)).groupBy(s.sessions.userId),
      tx.select().from(s.authTokens).where(and(eq(s.authTokens.agencyId, agencyId), eq(s.authTokens.purpose, "invite"), isNull(s.authTokens.usedAt))),
    ]);
    return users
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        hasAuthenticator: Boolean(logins.find((l) => l.userId === u.id)?.totpEnabledAt),
        lastSeenAt: (() => {
          const at = seen.find((x) => x.userId === u.id)?.at;
          return at ? new Date(at) : null;
        })(),
        inviteExpiresAt: invites.filter((i) => i.userId === u.id).sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0]?.expiresAt ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
  });
}

export interface ByOwner {
  agencyId: string;
  userId: string;
  label: string;
  role: Role;
}
export type MemberError = "not_allowed" | "invalid_email" | "email_taken" | "invalid_name" | "invalid_role" | "not_found" | "last_owner" | "self" | "paused";

/** An invite by email with a role (Stripe's Add member; Linear's Invite): valid for 10 days. */
export async function inviteMember(
  deps: AuthDeps,
  by: ByOwner,
  input: { name: string; email: string; role: Role; locale: string },
  render: (link: string, invite: { name: string; agencyName: string; byName: string; role: Role; locale: string; expiresAt: Date }) => LinkMail,
  baseUrl: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: MemberError }> {
  if (!can(by, "members")) return { ok: false, error: "not_allowed" };
  const email = normalEmail(input.email);
  const name = input.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, error: "invalid_email" };
  if (name.length === 0 || name.length > 120) return { ok: false, error: "invalid_name" };
  if (!(ROLES as readonly string[]).includes(input.role)) return { ok: false, error: "invalid_role" };
  const now = nowOf(deps);
  const result = await withAuth(deps, async (tx) => {
    // An email belongs to one person in one agency (sign-in finds the agency from it).
    const [taken] = await tx.select({ userId: s.userLogins.userId }).from(s.userLogins).where(eq(s.userLogins.email, email));
    await enterAgency(tx, by.agencyId);
    const [inAgency] = await tx.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.agencyId, by.agencyId), sql`lower(${s.users.email}) = ${email}`));
    if (taken || inAgency) return { ok: false as const, error: "email_taken" as const };
    const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, by.agencyId));
    const [user] = await tx.insert(s.users).values({ agencyId: by.agencyId, name, email, role: input.role, preferredLocale: input.locale === "es" ? "es" : "en", status: "invited" }).returning();
    await tx.insert(s.userLogins).values({ userId: user!.id, agencyId: by.agencyId, email });
    const expiresAt = new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
    const token = await newLink(tx, user!, "invite", expiresAt, by.label, now);
    const mail = await sendLinkMail(tx, agency!, { email, name }, "invite", render(`${baseUrl}/${user!.preferredLocale}/invite/${token}`, { name, agencyName: agency!.name, byName: by.label, role: input.role, locale: user!.preferredLocale, expiresAt }), now);
    await auditBy(tx, { agencyId: by.agencyId, userId: by.userId, label: by.label }, [{ action: "create", entityType: "user", entityId: user!.id, after: { name, email, role: input.role, status: "invited" } }]);
    return { ok: true as const, userId: user!.id, mail };
  });
  if (!result.ok) return result;
  await deliver(deps, by.agencyId, result.mail);
  return { ok: true, userId: result.userId };
}

/** An email's shape (the database checks it again). */
export const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

/**
 * A new agency's first Owner, its login and its billing row, in a transaction in sign-in mode that
 * has entered the agency (decision 0036: the one way both scripts/create-agency.ts and sign-up make
 * an agency's Owner). Invited (the script hands over an invite link) or active with a password (a
 * sign-up has just proved the mailbox and chosen it). Refused when the email already signs in to
 * Tabulado, or the agency already has an Owner.
 */
export async function addFirstOwner(
  tx: Tx,
  agencyId: string,
  input: { name: string; email: string; locale: string; status: "invited" | "active"; passwordHash?: string; trialEndsAt: Date | null; byLabel: string },
  now: Date,
): Promise<{ ok: true; user: User } | { ok: false; error: "email_taken" | "has_owner" }> {
  const email = normalEmail(input.email);
  const name = input.name.trim();
  const [taken] = await tx.select({ userId: s.userLogins.userId }).from(s.userLogins).where(eq(s.userLogins.email, email));
  if (taken) return { ok: false, error: "email_taken" };
  const [owner] = await tx.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.agencyId, agencyId), eq(s.users.role, "owner")));
  if (owner) return { ok: false, error: "has_owner" };
  const [user] = await tx.insert(s.users).values({ agencyId, name, email, role: "owner", preferredLocale: input.locale === "es" ? "es" : "en", status: input.status }).returning();
  await tx.insert(s.userLogins).values({ userId: user!.id, agencyId, email, ...(input.passwordHash ? { passwordHash: input.passwordHash, passwordChangedAt: now } : {}) });
  await tx.insert(s.agencySubscriptions).values({ agencyId, trialEndsAt: input.trialEndsAt, updatedAt: now }).onConflictDoNothing();
  const by = { agencyId, userId: null, label: input.byLabel };
  await auditBy(tx, by, [
    { action: "create", entityType: "user", entityId: user!.id, after: { name, email, role: "owner", status: input.status } },
    { action: "create", entityType: "subscription", entityId: agencyId, after: { freeDaysUntil: input.trialEndsAt?.toISOString() ?? null } },
  ]);
  return { ok: true, user: user! };
}

/**
 * A new agency's first Owner (scripts/create-agency.ts): invited like anyone, but the link is handed
 * to whoever runs the script instead of emailed. Refused once the agency has an Owner. The agency's
 * free days (decision 0036) start now, as a signed-up agency's do.
 */
export async function firstOwnerInvite(
  deps: AuthDeps,
  agencyId: string,
  input: { name: string; email: string; locale: string },
  baseUrl: string,
  opts: { trialEndsAt?: Date | null } = {},
): Promise<{ ok: true; link: string } | { ok: false; error: "invalid_email" | "invalid_name" | "email_taken" | "has_owner" }> {
  const email = normalEmail(input.email);
  const name = input.name.trim();
  if (!looksLikeEmail(email)) return { ok: false, error: "invalid_email" };
  if (name.length === 0 || name.length > 120) return { ok: false, error: "invalid_name" };
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, agencyId);
    const made = await addFirstOwner(tx, agencyId, { name, email, locale: input.locale, status: "invited", trialEndsAt: opts.trialEndsAt ?? null, byLabel: "Tabulado setup" }, now);
    if (!made.ok) return made;
    const token = await newLink(tx, made.user, "invite", new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000), "Tabulado setup", now);
    return { ok: true, link: `${baseUrl}/${made.user.preferredLocale}/invite/${token}` };
  });
}

/** The invite again, with a fresh link (the old one stops working). */
export async function resendInvite(deps: AuthDeps, by: ByOwner, userId: string, render: Parameters<typeof inviteMember>[3], baseUrl: string): Promise<{ ok: true } | { ok: false; error: MemberError }> {
  if (!can(by, "members")) return { ok: false, error: "not_allowed" };
  const now = nowOf(deps);
  const result = await withAuth(deps, async (tx) => {
    await enterAgency(tx, by.agencyId);
    const [user] = await tx.select().from(s.users).where(and(eq(s.users.id, userId), eq(s.users.agencyId, by.agencyId), eq(s.users.status, "invited")));
    const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, by.agencyId));
    if (!user || !agency) return { ok: false as const, error: "not_found" as const };
    const expiresAt = new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
    const token = await newLink(tx, user, "invite", expiresAt, by.label, now);
    const mail = await sendLinkMail(tx, agency, { email: user.email, name: user.name }, "invite", render(`${baseUrl}/${user.preferredLocale}/invite/${token}`, { name: user.name, agencyName: agency.name, byName: by.label, role: user.role, locale: user.preferredLocale, expiresAt }), now);
    await auditBy(tx, { agencyId: by.agencyId, userId: by.userId, label: by.label }, [{ action: "update", entityType: "user", entityId: user.id, after: { invite: "sent again" } }]);
    return { ok: true as const, mail };
  });
  if (!result.ok) return result;
  await deliver(deps, by.agencyId, result.mail);
  return { ok: true };
}

/** An invite not yet accepted, withdrawn: the person never signed in, so they are removed (the log keeps it). */
export async function cancelInvite(deps: AuthDeps, by: ByOwner, userId: string): Promise<{ ok: true } | { ok: false; error: MemberError }> {
  if (!can(by, "members")) return { ok: false, error: "not_allowed" };
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, by.agencyId);
    const [user] = await tx.select().from(s.users).where(and(eq(s.users.id, userId), eq(s.users.agencyId, by.agencyId), eq(s.users.status, "invited")));
    if (!user) return { ok: false, error: "not_found" };
    await tx.delete(s.users).where(eq(s.users.id, user.id));
    await auditBy(tx, { agencyId: by.agencyId, userId: by.userId, label: by.label }, [{ action: "delete", entityType: "user", entityId: user.id, before: { name: user.name, email: user.email, role: user.role, status: "invited" } }]);
    return { ok: true };
  });
}

/** Changes to an agency's Owners one at a time (two Owners demoting each other at once would leave none). */
const membersLock = (tx: Tx, agencyId: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`members:${agencyId}`}, 0))`);

async function activeOwners(tx: Tx, agencyId: string): Promise<string[]> {
  return (await tx.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.agencyId, agencyId), eq(s.users.role, "owner"), eq(s.users.status, "active")))).map((u) => u.id);
}

/**
 * A new role (the Owner); the agency always keeps an active Owner. A role that needs the code asks for it
 * at the next request. `onlyFewerRights` (while the agency's changes are paused, decision 0036): only a
 * role with fewer rights than the person has now, judged under the members lock; anything else is "paused".
 */
export async function changeRole(deps: AuthDeps, by: ByOwner, userId: string, role: Role, opts: { onlyFewerRights?: boolean } = {}): Promise<{ ok: true } | { ok: false; error: MemberError }> {
  if (!can(by, "members")) return { ok: false, error: "not_allowed" };
  if (!(ROLES as readonly string[]).includes(role)) return { ok: false, error: "invalid_role" };
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, by.agencyId);
    await membersLock(tx, by.agencyId);
    const [user] = await tx.select().from(s.users).where(and(eq(s.users.id, userId), eq(s.users.agencyId, by.agencyId)));
    if (!user) return { ok: false, error: "not_found" };
    if (user.role === role) return { ok: true };
    if (opts.onlyFewerRights && !fewerRights(user.role, role)) return { ok: false, error: "paused" };
    const owners = await activeOwners(tx, by.agencyId);
    if (user.role === "owner" && owners.length === 1 && owners[0] === user.id) return { ok: false, error: "last_owner" };
    await tx.update(s.users).set({ role }).where(eq(s.users.id, user.id));
    // A role that now needs the code: the person signs in again and sets it up in a fresh, short session.
    if (requiresSecondStep(role)) {
      const [login] = await tx.select({ totpEnabledAt: s.userLogins.totpEnabledAt }).from(s.userLogins).where(eq(s.userLogins.userId, user.id));
      if (!login?.totpEnabledAt) await tx.update(s.sessions).set({ endedAt: nowOf(deps) }).where(and(eq(s.sessions.userId, user.id), isNull(s.sessions.endedAt), eq(s.sessions.demo, false)));
    }
    await auditBy(tx, { agencyId: by.agencyId, userId: by.userId, label: by.label }, [{ action: "update", entityType: "user", entityId: user.id, before: { role: user.role }, after: { role } }]);
    return { ok: true };
  });
}

/** Suspended at once (Linear's Suspend): every session ends; never oneself or the last Owner. */
export async function setSuspended(deps: AuthDeps, by: ByOwner, userId: string, suspended: boolean): Promise<{ ok: true } | { ok: false; error: MemberError }> {
  if (!can(by, "members")) return { ok: false, error: "not_allowed" };
  if (userId === by.userId) return { ok: false, error: "self" };
  const now = nowOf(deps);
  return withAuth(deps, async (tx) => {
    await enterAgency(tx, by.agencyId);
    await membersLock(tx, by.agencyId);
    const [user] = await tx.select().from(s.users).where(and(eq(s.users.id, userId), eq(s.users.agencyId, by.agencyId)));
    if (!user || user.status === "invited") return { ok: false, error: "not_found" };
    const status = suspended ? "suspended" : "active";
    if (user.status === status) return { ok: true };
    const owners = await activeOwners(tx, by.agencyId);
    if (suspended && user.role === "owner" && owners.length === 1) return { ok: false, error: "last_owner" };
    await tx.update(s.users).set({ status }).where(eq(s.users.id, user.id));
    if (suspended) await tx.update(s.sessions).set({ endedAt: now }).where(and(eq(s.sessions.userId, user.id), isNull(s.sessions.endedAt)));
    await auditBy(tx, { agencyId: by.agencyId, userId: by.userId, label: by.label }, [{ action: "update", entityType: "user", entityId: user.id, before: { status: user.status }, after: { status } }]);
    return { ok: true };
  });
}

/** The person's own language (Slack's Language & region). */
export async function setLanguage(deps: AuthDeps, session: SessionInfo, locale: string): Promise<boolean> {
  if (locale !== "en" && locale !== "es") return false;
  await withAuth(deps, async (tx) => {
    await enterAgency(tx, session.agencyId);
    await tx.update(s.users).set({ preferredLocale: locale }).where(eq(s.users.id, session.userId));
    await log(tx, { id: session.userId, agencyId: session.agencyId, name: session.name }, [{ action: "update", entityType: "user", entityId: session.userId, before: { language: session.locale }, after: { language: locale } }], session.demo);
  });
  return true;
}

/** The person's own appearance (decision 0046: System, Light or Dark, as Geist, GitHub and Linear offer). */
export async function setAppearance(deps: AuthDeps, session: SessionInfo, appearance: string): Promise<boolean> {
  if (appearance !== "system" && appearance !== "light" && appearance !== "dark") return false;
  await withAuth(deps, async (tx) => {
    await enterAgency(tx, session.agencyId);
    await tx.update(s.users).set({ appearance }).where(eq(s.users.id, session.userId));
  });
  return true;
}

/** The person's own accent colour (decision 0046: each person picks theirs, as Linear and GitHub allow). */
export async function setAccent(deps: AuthDeps, session: SessionInfo, accent: string): Promise<boolean> {
  const chosen = parseAccent(accent);
  if (!chosen) return false;
  await withAuth(deps, async (tx) => {
    await enterAgency(tx, session.agencyId);
    await tx.update(s.users).set({ accent: chosen }).where(eq(s.users.id, session.userId));
  });
  return true;
}

/** Old sessions and used or lapsed links, removed (kept a month for the record). */
export async function sweep(deps: AuthDeps): Promise<void> {
  const cutoff = new Date(nowOf(deps).getTime() - 30 * 24 * 60 * 60 * 1000);
  await withAuth(deps, async (tx) => {
    await tx.delete(s.sessions).where(or(lt(s.sessions.expiresAt, cutoff), and(sql`${s.sessions.endedAt} is not null`, lt(s.sessions.endedAt, cutoff))));
    await tx.delete(s.authTokens).where(lt(s.authTokens.expiresAt, cutoff));
    await tx.delete(s.signInFailures).where(lt(s.signInFailures.at, new Date(nowOf(deps).getTime() - DAY_MS)));
  });
}
