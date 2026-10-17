/**
 * The provider sends the browser back here (decision 0033). Everything is decided in
 * src/server/auth/oidc-callback.ts (tested through the database); this sets the cookies it returns:
 * the request's own cookie is always cleared; a session when someone is signed in; a sealed waiting
 * link when a first link needs the code sent to the mailbox.
 */
import { NextResponse, type NextRequest } from "next/server";
import { identityMail } from "@/server/auth/identity-mail";
import { authDeps } from "@/server/auth/deps";
import { handleOidcCallback, LINK_COOKIE, LINK_MS } from "@/server/auth/oidc-callback";
import { OIDC_COOKIE, oidcCookieOptions, secureFor } from "@/server/auth/oidc-flow";
import { MAX_SESSION_MS, SESSION_COOKIE } from "@/server/auth/service";
import { requestOrigin, requestSender } from "@/server/request-info";
import { linkBaseUrl } from "@/server/services";
import { currentSession, isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }): Promise<Response> {
  const { provider } = await context.params;
  const base = linkBaseUrl(await requestOrigin());
  const answer = await handleOidcCallback({
    provider,
    params: request.nextUrl.searchParams,
    cookie: request.cookies.get(OIDC_COOKIE)?.value,
    base,
    session: await currentSession(),
    userAgent: request.headers.get("user-agent"),
    address: (await requestSender()).ipAddress,
    demoMode: isDemo(),
    deps: authDeps(),
    mail: identityMail(base),
  });
  if (!answer) return new Response("Not found", { status: 404 });
  const response = NextResponse.redirect(new URL(answer.location, base), { status: 303, headers: PRIVATE });
  response.cookies.set(OIDC_COOKIE, "", { ...oidcCookieOptions(base), maxAge: 0 });
  const secure = secureFor(base);
  if (answer.session) response.cookies.set(SESSION_COOKIE, answer.session, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Math.floor(MAX_SESSION_MS / 1000) });
  if (answer.link) response.cookies.set(LINK_COOKIE, answer.link, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Math.floor(LINK_MS / 1000) });
  return response;
}
