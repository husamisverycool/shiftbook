"use server";

/**
 * Signing in and the person's own account (slice k, decisions K1–K3, K7). Each sets or ends the
 * session cookie; none acts on the agency's records. Every input is checked for its shape first.
 */
import { cookies, headers } from "next/headers";
import { ACCENT_COOKIE } from "@/lib/accent";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getLocale } from "next-intl/server";
import QRCode from "qrcode";
import { z } from "zod";
import { RESET_PROOF_COOKIE } from "@/server/auth/cookie";
import { authDeps } from "@/server/auth/deps";
import { renderResetEmail } from "@/server/auth/emails";
import { localePath, safeNext } from "@/server/auth/next-path";
import {
  beginAuthenticatorSetup,
  changePassword,
  confirmAccess,
  confirmAuthenticator,
  demoAgencyOf,
  demoMailCopies,
  demoSignIn,
  endSession,
  MAX_SESSION_MS,
  readSession,
  redeemLink,
  rotateSession,
  replaceRecoveryCodes,
  requestPasswordReset,
  SESSION_COOKIE,
  setAppearance,
  setAccent,
  setLanguage,
  signIn,
  verifyResetCode,
  verifySecondStep,
  type PasswordError,
} from "@/server/auth/service";
import { DEMO_PEOPLE } from "@/server/demo/people";
import { env } from "@/server/env";
import { requestOrigin, requestSender } from "@/server/request-info";
import { linkBaseUrl } from "@/server/services";
import { currentActor, currentSession, isDemo } from "@/server/session";

const email = z.string().trim().min(3).max(254);
const password = z.string().max(1024);
const code = z.string().trim().max(40);
const linkToken = z.string().regex(/^sbau_[A-Za-z0-9_-]{43}$/);

async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}

/** Cookies are httpOnly, SameSite=Lax, and Secure whenever the site is served over HTTPS. */
async function secureCookies(): Promise<boolean> {
  return Boolean(env.appUrl?.startsWith("https://")) || Boolean((await requestOrigin())?.startsWith("https://"));
}

/** The cookie that names the session. */
async function keepSession(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: await secureCookies(), sameSite: "lax", path: "/", maxAge: Math.floor(MAX_SESSION_MS / 1000) });
}

async function dropSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

const tokenNow = async () => (await cookies()).get(SESSION_COOKIE)?.value;

/** Where a fresh session goes next: the code, the authenticator setup, or the page they wanted. */
function onward(next: "done" | "code" | "setup", locale: string, wanted: unknown): never {
  const back = safeNext(wanted);
  const keep = back === "/" ? "" : `?next=${encodeURIComponent(back)}`;
  if (next === "code") redirect(`/${locale}/sign-in/code${keep}`);
  if (next === "setup") redirect(`/${locale}/sign-in/setup${keep}`);
  redirect(localePath(locale, back));
}

export async function signInAction(input: { email: string; password: string; next: string | null }): Promise<{ ok: false; error: "invalid" | "locked" | "busy" }> {
  if (!email.safeParse(input.email).success || !password.safeParse(input.password).success) return { ok: false, error: "invalid" };
  const r = await signIn(authDeps(), input.email, input.password, await userAgent(), (await requestSender()).ipAddress);
  if (!r.ok) return r;
  await keepSession(r.token);
  onward(r.next, r.locale, input.next);
}

/** Demo mode's "Continue as" (decision K3): only the listed demo people, only in demo mode. */
export async function demoSignInAction(userId: string, next: string | null): Promise<{ ok: false }> {
  const person = DEMO_PEOPLE.find((p) => p.id === userId);
  if (!isDemo() || !person) return { ok: false };
  const r = await demoSignIn(authDeps(), person.agencyId, person.id, await userAgent());
  if (!r.ok) return { ok: false };
  await keepSession(r.token);
  // The demo people are shared: the language the visitor chose on the sign-in page wins over the
  // demo person's saved one (decision 0031).
  onward("done", await getLocale(), next);
}

export async function verifyCodeAction(input: { code: string; next: string | null }): Promise<{ ok: false; error: "invalid" | "locked" }> {
  const token = await tokenNow();
  const locale = await getLocale();
  if (!token) redirect(`/${locale}/sign-in?notice=expired`);
  if (!code.safeParse(input.code).success) return { ok: false, error: "invalid" };
  const r = await verifySecondStep(authDeps(), token, input.code, await userAgent());
  if (!r.ok) {
    // The half session ended (timed out, or five wrong codes): the password again.
    if (r.error === "expired") redirect(`/${locale}/sign-in?notice=expired`);
    return { ok: false, error: r.error };
  }
  await keepSession(r.token);
  const session = await readSession(authDeps(), r.token);
  const back = safeNext(input.next);
  const mark = r.recoveryLeft === null ? "" : `${back.includes("?") ? "&" : "?"}recoveryLeft=${r.recoveryLeft}`;
  redirect(localePath(session?.locale ?? locale, `${back}${mark}`));
}

export async function signOutAction(): Promise<void> {
  const locale = await getLocale();
  await endSession(authDeps(), await tokenNow());
  await dropSession();
  redirect(`/${locale}/sign-in?notice=signed_out`);
}

/**
 * A reset link by email; the same answer, in the same time, whatever the address (the email goes out
 * after the response). In the demo, the copy the demo mailbox kept.
 */
export async function requestResetAction(address: string): Promise<{ ok: true; demoCopy: string | null }> {
  if (!email.safeParse(address).success) return { ok: true, demoCopy: null };
  const deps = authDeps();
  await requestPasswordReset(deps, address, renderResetEmail, linkBaseUrl(await requestOrigin()), isDemo() ? undefined : (job) => after(job));
  if (!isDemo()) return { ok: true, demoCopy: null };
  const agencyId = await demoAgencyOf(deps, address);
  const copy = agencyId ? (await demoMailCopies(deps, agencyId, "password_reset", [address])).get(address.trim().toLowerCase()) : undefined;
  return { ok: true, demoCopy: copy ?? null };
}

/** The code before a reset's new password; this browser gets the proof that it gave it (an hour, like the link). */
export async function verifyResetCodeAction(token: string, value: string): Promise<{ ok: true } | { ok: false; error: "invalid" | "locked" | "expired" }> {
  if (!linkToken.safeParse(token).success) return { ok: false, error: "expired" };
  if (!code.safeParse(value).success) return { ok: false, error: "invalid" };
  const r = await verifyResetCode(authDeps(), token, value);
  if (!r.ok) return r;
  (await cookies()).set(RESET_PROOF_COOKIE, r.proof, { httpOnly: true, secure: await secureCookies(), sameSite: "strict", path: "/", maxAge: 60 * 60 });
  return { ok: true };
}

/** The new password from a reset link or an invite; signed in afterwards. */
export async function redeemLinkAction(token: string, purpose: "invite" | "reset", newPassword: string): Promise<{ ok: false; error: "expired" | "code_needed" | PasswordError }> {
  if (!linkToken.safeParse(token).success || (purpose !== "invite" && purpose !== "reset")) return { ok: false, error: "expired" };
  if (!password.safeParse(newPassword).success) return { ok: false, error: "too_long" };
  const jar = await cookies();
  const r = await redeemLink(authDeps(), token, purpose, newPassword, await userAgent(), jar.get(RESET_PROOF_COOKIE)?.value ?? null);
  if (!r.ok) return r;
  jar.delete(RESET_PROOF_COOKIE);
  await keepSession(r.token);
  onward(r.next, r.locale, null);
}

// ---------- the signed-in person's own account ----------

/** A new authenticator being set up: its key as text and its QR code (an SVG image); or "confirm it's you" first. */
export async function beginSetupAction(): Promise<{ ok: true; setupKey: string; qr: string } | { ok: false; error: "confirm" | "expired" }> {
  await currentActor("setup");
  const r = await beginAuthenticatorSetup(authDeps(), (await currentSession())!);
  if (!r.ok) return r;
  const svg = await QRCode.toString(r.uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { ok: true, setupKey: r.setupKey, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
}

export async function confirmSetupAction(value: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: "invalid" | "expired" }> {
  await currentActor("setup");
  if (!code.safeParse(value).success) return { ok: false, error: "invalid" };
  return confirmAuthenticator(authDeps(), (await currentSession())!, value);
}

/** Leaving the recovery codes after the setup a role needs: the session goes on under a fresh token. */
export async function finishSetupAction(): Promise<void> {
  await currentActor();
  const fresh = await rotateSession(authDeps(), await tokenNow(), await userAgent());
  if (fresh) await keepSession(fresh);
}

export async function newRecoveryCodesAction(): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: "confirm" | "none" }> {
  await currentActor();
  return replaceRecoveryCodes(authDeps(), (await currentSession())!);
}

/** "Confirm it's you" (GitHub's sudo mode): the password, or a code when the person has an authenticator. */
export async function confirmAccessAction(secret: string): Promise<{ ok: true } | { ok: false; error: "invalid" | "locked" | "busy" }> {
  await currentActor();
  if (!password.safeParse(secret).success) return { ok: false, error: "invalid" };
  return confirmAccess(authDeps(), (await currentSession())!, secret);
}

export async function changePasswordAction(current: string, next: string): Promise<{ ok: true } | { ok: false; error: PasswordError }> {
  await currentActor();
  if (!password.safeParse(current).success || !password.safeParse(next).success) return { ok: false, error: "too_long" };
  return changePassword(authDeps(), (await currentSession())!, current, next);
}

export async function setAppearanceAction(appearance: string): Promise<{ ok: boolean }> {
  await currentActor();
  return { ok: await setAppearance(authDeps(), (await currentSession())!, appearance) };
}

/** Decision 0046: saved for the person, and kept in a cookie so every page opens in it. */
export async function setAccentAction(accent: string): Promise<{ ok: boolean }> {
  await currentActor();
  const ok = await setAccent(authDeps(), (await currentSession())!, accent);
  if (ok) (await cookies()).set(ACCENT_COOKIE, accent, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
  return { ok };
}

export async function setLanguageAction(locale: string): Promise<{ ok: boolean }> {
  await currentActor();
  return { ok: await setLanguage(authDeps(), (await currentSession())!, locale) };
}
