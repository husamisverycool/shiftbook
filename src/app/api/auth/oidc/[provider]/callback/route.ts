/**
 * The provider sends the browser back here (decision 0033). The request's cookie must hold the state
 * returned; the code is exchanged and the ID token verified (oidc-flow.ts); then, by the request's
 * purpose: sign in (the linking rules, then the second step as after a password), an agency's SSO,
 * connect to the signed-in person's account, or accept an invite. Refusals go back where the person
 * started, with a notice.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authDeps } from "@/server/auth/deps";
import { acceptInviteWithIdentity, connectIdentity, signInWithIdentity, ssoConfigOf } from "@/server/auth/identities";
import { PROVIDERS, type ProviderId } from "@/server/auth/oidc";
import { completeRequest, OIDC_COOKIE, oidcCookieOptions, onwardPath, secureFor } from "@/server/auth/oidc-flow";
import { MAX_SESSION_MS, SESSION_COOKIE } from "@/server/auth/service";
import { requestOrigin, requestSender } from "@/server/request-info";
import { linkBaseUrl } from "@/server/services";
import { currentSession, isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }): Promise<Response> {
  const { provider: raw } = await context.params;
  if (!(PROVIDERS as readonly string[]).includes(raw)) return new Response("Not found", { status: 404 });
  const provider = raw as ProviderId;
  const base = linkBaseUrl(await requestOrigin());
  const deps = authDeps();
  const done = await completeRequest(provider, request.nextUrl.searchParams, request.cookies.get(OIDC_COOKIE)?.value, base, async (r) => (r.agencyId ? ssoConfigOf(deps, r.agencyId, { demoMode: isDemo(), baseUrl: base }) : null));
  const asked = done.request;
  const locale = asked?.locale ?? "en";

  /** Every answer ends the request: its cookie is cleared. */
  const go = (path: string, session?: string) => {
    const response = NextResponse.redirect(new URL(path, base), { status: 303, headers: PRIVATE });
    response.cookies.set(OIDC_COOKIE, "", { ...oidcCookieOptions(base), maxAge: 0 });
    if (session) response.cookies.set(SESSION_COOKIE, session, { httpOnly: true, secure: secureFor(base), sameSite: "lax", path: "/", maxAge: Math.floor(MAX_SESSION_MS / 1000) });
    return response;
  };
  const toSignIn = (notice: string) => go(`/${locale}/sign-in?notice=${notice}${asked?.next ? `&next=${encodeURIComponent(asked.next)}` : ""}`);

  if (!done.ok) {
    if (asked?.purpose === "connect") return go(`/${locale}/settings/account?identity=failed&provider=${provider}`);
    if (asked?.purpose === "invite" && asked.invite) return go(`/${locale}/invite/${asked.invite}?notice=provider_failed`);
    return toSignIn("provider_failed");
  }
  const userAgent = request.headers.get("user-agent");

  if (asked!.purpose === "connect") {
    // Only to the person (and the very session) that asked, which confirmed it was them when it began.
    const session = await currentSession();
    if (!session || session.sessionId !== asked!.sessionId || session.userId !== asked!.userId) return go(`/${locale}/settings/account?identity=failed&provider=${provider}`);
    const r = await connectIdentity(deps, session, provider, done.identity, { flowConfirmed: true });
    return go(`/${locale}/settings/account?identity=${r.ok ? "connected" : r.error}&provider=${provider}`);
  }

  if (asked!.purpose === "invite" && asked!.invite) {
    const r = await acceptInviteWithIdentity(deps, asked!.invite, provider, done.identity, userAgent);
    if (!r.ok) return go(r.error === "expired" ? `/${locale}/invite/${asked!.invite}` : `/${locale}/invite/${asked!.invite}?notice=${r.error}`);
    return go(onwardPath(r.next, r.locale, null), r.token);
  }

  const sso = asked!.purpose === "sso" ? (asked!.agencyId && asked!.userId ? { agencyId: asked!.agencyId, userId: asked!.userId } : null) : null;
  if (asked!.purpose === "sso" && !sso) return toSignIn("provider_failed");
  const r = await signInWithIdentity(deps, { provider, identity: done.identity, sso, demoMode: isDemo(), userAgent, address: (await requestSender()).ipAddress });
  if (!r.ok) return toSignIn(r.error === "locked" ? "too_many" : r.error);
  // The demo people are shared: the language the visitor chose wins (as with Continue as).
  return go(onwardPath(r.next, r.demo ? locale : r.locale, asked!.next), r.token);
}
