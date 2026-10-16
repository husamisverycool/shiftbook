/**
 * "Continue with Google / Microsoft" (decision 0033): a new OpenID Connect request — to sign in, or
 * to accept an invite with that account — sealed into a short-lived cookie bound to this browser,
 * then the browser goes to the provider (the demo's stand-in in demo mode).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authDeps } from "@/server/auth/deps";
import { safeNext } from "@/server/auth/next-path";
import { OidcError } from "@/server/auth/oidc";
import { flowClient, OIDC_COOKIE, oidcCookieOptions, providerOffered, startRequest } from "@/server/auth/oidc-flow";
import { linkFor } from "@/server/auth/service";
import { requestOrigin } from "@/server/request-info";
import { linkBaseUrl } from "@/server/services";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }): Promise<Response> {
  const { provider } = await context.params;
  if ((provider !== "google" && provider !== "microsoft") || !providerOffered(provider)) return new Response("Not found", { status: 404 });
  const query = request.nextUrl.searchParams;
  const locale = query.get("locale") === "es" ? "es" : "en";
  const next = query.get("next");
  const invite = query.get("invite");
  const base = linkBaseUrl(await requestOrigin());
  const back = (path: string) => NextResponse.redirect(new URL(path, base), { status: 303, headers: PRIVATE });
  const client = flowClient(provider, base);
  if (!client) return new Response("Not found", { status: 404 });
  if (invite !== null && (!/^sbau_[A-Za-z0-9_-]{43}$/.test(invite) || !(await linkFor(authDeps(), invite, "invite")))) return back(`/${locale}/sign-in?notice=link_expired`);
  try {
    const { url, cookie } = await startRequest({ client, purpose: invite ? "invite" : "sign_in", base, locale, next: next ? safeNext(next) : null, ...(invite ? { invite } : {}) });
    const response = NextResponse.redirect(url, { status: 303, headers: PRIVATE });
    response.cookies.set(OIDC_COOKIE, cookie, oidcCookieOptions(base));
    return response;
  } catch (error) {
    if (!(error instanceof OidcError)) throw error;
    // The provider's discovery document could not be read: say so where the person started.
    return back(invite ? `/${locale}/invite/${invite}?notice=provider_failed` : `/${locale}/sign-in?notice=provider_failed`);
  }
}
