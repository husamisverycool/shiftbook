"use server";

/**
 * The other ways in (decision 0033): an emailed sign-in code, an agency's single sign-on, and
 * connecting Google or Microsoft to one's own account. Each input is checked for its shape first;
 * every answer about an email is the same whether or not it has an account.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { renderSignInCodeEmail } from "@/server/auth/code-email";
import { authDeps } from "@/server/auth/deps";
import { demoCodeCopy, disconnectIdentity, requestEmailCode, ssoConfigOf, ssoForEmail, verifyEmailCode } from "@/server/auth/identities";
import { safeNext } from "@/server/auth/next-path";
import { OidcError } from "@/server/auth/oidc";
import { flowClient, OIDC_COOKIE, oidcCookieOptions, onwardPath, providerOffered, secureFor, startRequest } from "@/server/auth/oidc-flow";
import { MAX_SESSION_MS, mustConfirm, SESSION_COOKIE } from "@/server/auth/service";
import { requestOrigin, requestSender } from "@/server/request-info";
import { linkBaseUrl } from "@/server/services";
import { currentActor, currentSession, isDemo } from "@/server/session";

const email = z.string().trim().min(3).max(254);
const code = z.string().trim().max(20);
const uuid = z.uuid();

const base = async () => linkBaseUrl(await requestOrigin());
const userAgent = async () => (await headers()).get("user-agent");

// ---------- an emailed sign-in code ----------

/** A code by email to an active member (the same answer for any address). In the demo, the mailbox's copy. */
export async function requestEmailCodeAction(address: string): Promise<{ ok: true; demoCopy: string | null }> {
  if (!email.safeParse(address).success) return { ok: true, demoCopy: null };
  const deps = authDeps();
  await requestEmailCode(deps, address, renderSignInCodeEmail, isDemo(), isDemo() ? undefined : (job) => after(job));
  return { ok: true, demoCopy: isDemo() ? await demoCodeCopy(deps, address) : null };
}

/** The code typed: signed in (then the second step as after a password), or one refusal for every wrong case. */
export async function verifyEmailCodeAction(input: { email: string; code: string; next: string | null }): Promise<{ ok: false; error: "invalid" | "locked" }> {
  if (!email.safeParse(input.email).success || !code.safeParse(input.code).success) return { ok: false, error: "invalid" };
  const r = await verifyEmailCode(authDeps(), input.email, input.code, await userAgent(), (await requestSender()).ipAddress, isDemo());
  if (!r.ok) return r;
  const at = await base();
  (await cookies()).set(SESSION_COOKIE, r.token, { httpOnly: true, secure: secureFor(at), sameSite: "lax", path: "/", maxAge: Math.floor(MAX_SESSION_MS / 1000) });
  redirect(onwardPath(r.next, r.demo ? await getLocale() : r.locale, input.next));
}

// ---------- an agency's single sign-on ----------

/**
 * The work email: for an active member of an agency with SSO on, the agency's provider (the browser
 * goes there next); for every other email, the same "not set up".
 */
export async function ssoContinueAction(input: { email: string; next: string | null }): Promise<{ ok: true; url: string } | { ok: false; error: "not_set_up" | "failed" }> {
  if (!email.safeParse(input.email).success) return { ok: false, error: "not_set_up" };
  const deps = authDeps();
  const at = await base();
  const found = await ssoForEmail(deps, input.email, { demoMode: isDemo(), baseUrl: at });
  if (!found) return { ok: false, error: "not_set_up" };
  const client = flowClient("sso", at, await ssoConfigOf(deps, found.agencyId, { demoMode: isDemo(), baseUrl: at }));
  if (!client) return { ok: false, error: "not_set_up" };
  try {
    const { url, cookie } = await startRequest({ client, purpose: "sso", base: at, locale: await getLocale(), next: input.next ? safeNext(input.next) : null, loginHint: input.email.trim().toLowerCase(), agencyId: found.agencyId, userId: found.userId });
    (await cookies()).set(OIDC_COOKIE, cookie, oidcCookieOptions(at));
    return { ok: true, url };
  } catch (error) {
    if (error instanceof OidcError) return { ok: false, error: "failed" };
    throw error;
  }
}

// ---------- Your account: connected accounts ----------

/** Connect Google or Microsoft: confirm it's them first; then the provider, then back to the account page. */
export async function connectIdentityAction(provider: string): Promise<{ ok: true; url: string } | { ok: false; error: "confirm" | "unavailable" | "failed" }> {
  await currentActor();
  const session = (await currentSession())!;
  if ((provider !== "google" && provider !== "microsoft") || !providerOffered(provider)) return { ok: false, error: "unavailable" };
  if (await mustConfirm(authDeps(), session)) return { ok: false, error: "confirm" };
  const at = await base();
  const client = flowClient(provider, at);
  if (!client) return { ok: false, error: "unavailable" };
  try {
    const { url, cookie } = await startRequest({ client, purpose: "connect", base: at, locale: await getLocale(), next: null, userId: session.userId, sessionId: session.sessionId });
    (await cookies()).set(OIDC_COOKIE, cookie, oidcCookieOptions(at));
    return { ok: true, url };
  } catch (error) {
    if (error instanceof OidcError) return { ok: false, error: "failed" };
    throw error;
  }
}

export async function disconnectIdentityAction(id: string): Promise<{ ok: true } | { ok: false; error: "confirm" | "not_found" }> {
  await currentActor();
  if (!uuid.safeParse(id).success) return { ok: false, error: "not_found" };
  return disconnectIdentity(authDeps(), (await currentSession())!, id);
}
