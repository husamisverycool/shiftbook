"use server";

/**
 * The other ways in (decision 0033): an emailed sign-in code, an agency's single sign-on, the emailed
 * code that finishes a first link, connecting Google or Microsoft to one's own account, and "confirm
 * it's you" by an emailed code. Each input is checked for its shape first; every answer about an
 * email is the same whether or not it has an account.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { renderSignInCodeEmail } from "@/server/auth/code-email";
import { authDeps } from "@/server/auth/deps";
import { confirmByEmailCode, demoCodeCopy, demoCodeCopyFor, disconnectIdentity, finishLinkProof, requestEmailCode, resendLinkProof, sendConfirmCode, ssoConfigOf, ssoForEmail, verifyEmailCode } from "@/server/auth/identities";
import { identityMail } from "@/server/auth/identity-mail";
import { safeNext } from "@/server/auth/next-path";
import { OidcError } from "@/server/auth/oidc";
import { LINK_COOKIE, LINK_MS, openLink, sealLink } from "@/server/auth/oidc-callback";
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
const address = async () => (await requestSender()).ipAddress;

async function keepSession(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: secureFor(await base()), sameSite: "lax", path: "/", maxAge: Math.floor(MAX_SESSION_MS / 1000) });
}

// ---------- an emailed sign-in code ----------

/** A code by email to an active member (the same answer for any address). In the demo, the mailbox's copy. */
export async function requestEmailCodeAction(to: string): Promise<{ ok: true; demoCopy: string | null }> {
  if (!email.safeParse(to).success) return { ok: true, demoCopy: null };
  const deps = authDeps();
  await requestEmailCode(deps, to, renderSignInCodeEmail, isDemo(), { address: await address(), ...(isDemo() ? {} : { later: (job: () => Promise<unknown>) => after(job) }) });
  return { ok: true, demoCopy: isDemo() ? await demoCodeCopy(deps, to) : null };
}

/** The code typed: signed in (then the second step as after a password), or one refusal for every wrong case. */
export async function verifyEmailCodeAction(input: { email: string; code: string; next: string | null }): Promise<{ ok: false; error: "invalid" | "locked" }> {
  if (!email.safeParse(input.email).success || !code.safeParse(input.code).success) return { ok: false, error: "invalid" };
  const r = await verifyEmailCode(authDeps(), input.email, input.code, await userAgent(), await address(), isDemo());
  if (!r.ok) return r;
  await keepSession(r.token);
  redirect(onwardPath(r.next, r.demo ? await getLocale() : r.locale, input.next));
}

// ---------- the emailed code before a first link (review H2a) ----------

async function waitingLink() {
  return openLink((await cookies()).get(LINK_COOKIE)?.value, new Date());
}

/** The code from the mailbox: the account is connected and the sign-in goes on; refusals in place. */
export async function verifyLinkCodeAction(value: string): Promise<{ ok: false; error: "invalid" | "locked" | "expired" | "taken" | "other_identity" }> {
  const waiting = await waitingLink();
  if (!waiting) return { ok: false, error: "expired" };
  if (!code.safeParse(value).success) return { ok: false, error: "invalid" };
  const r = await finishLinkProof(authDeps(), waiting.link, value, { userAgent: await userAgent(), address: await address(), demoMode: isDemo() }, identityMail(await base()));
  if (!r.ok) return r;
  const jar = await cookies();
  jar.delete(LINK_COOKIE);
  await keepSession(r.token);
  redirect(onwardPath(r.next, r.demo ? waiting.locale : r.locale, waiting.next));
}

/** A new code for the waiting link (one a minute, within the caps); in the demo, the mailbox's copy. */
export async function resendLinkCodeAction(): Promise<{ ok: boolean; demoCopy: string | null }> {
  const waiting = await waitingLink();
  if (!waiting) return { ok: false, demoCopy: null };
  const deps = authDeps();
  const fresh = await resendLinkProof(deps, waiting.link, identityMail(await base()));
  if (fresh) (await cookies()).set(LINK_COOKIE, sealLink({ ...waiting, link: fresh, expiresAt: Date.now() + LINK_MS }), { httpOnly: true, secure: secureFor(await base()), sameSite: "lax", path: "/", maxAge: Math.floor(LINK_MS / 1000) });
  return { ok: Boolean(fresh), demoCopy: isDemo() ? await demoCodeCopyFor(deps, waiting.link.userId, waiting.link.agencyId) : null };
}

// ---------- an agency's single sign-on ----------

/**
 * The work email: for an active member of an agency with SSO on, the agency's provider (the browser
 * goes there next); for every other email, the same "not set up"; past the cap, "too many".
 */
export async function ssoContinueAction(input: { email: string; next: string | null }): Promise<{ ok: true; url: string } | { ok: false; error: "not_set_up" | "failed" | "too_many" }> {
  if (!email.safeParse(input.email).success) return { ok: false, error: "not_set_up" };
  const deps = authDeps();
  const at = await base();
  const found = await ssoForEmail(deps, input.email, { demoMode: isDemo(), address: await address() });
  if (!found.ok) return { ok: false, error: found.error === "locked" ? "too_many" : "not_set_up" };
  const client = flowClient("sso", at, await ssoConfigOf(deps, found.agencyId, { demoMode: isDemo() }));
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

// ---------- "confirm it's you" by an emailed code (review L3) ----------

/** A code to the signed-in person's email; in the demo, the mailbox's copy. */
export async function sendConfirmCodeAction(): Promise<{ ok: true; demoCopy: string | null } | { ok: false; error: "too_many" }> {
  await currentActor();
  const session = (await currentSession())!;
  const r = await sendConfirmCode(authDeps(), session, renderSignInCodeEmail);
  if (!r.ok) return r;
  return { ok: true, demoCopy: isDemo() ? await demoCodeCopy(authDeps(), session.email) : null };
}

export async function confirmByEmailCodeAction(value: string): Promise<{ ok: true } | { ok: false; error: "invalid" | "locked" }> {
  await currentActor();
  if (!code.safeParse(value).success) return { ok: false, error: "invalid" };
  return confirmByEmailCode(authDeps(), (await currentSession())!, value);
}
