import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { isSiteHost, siteHosts, siteRoute } from "./lib/site-routing";
import { SESSION_COOKIE } from "./server/auth/cookie";

const intl = createMiddleware(routing);
/** The website's own hosts (slice aa), read once: SHIFTBOOK_SITE_HOSTS. */
const SITE_HOSTS = siteHosts(process.env.SHIFTBOOK_SITE_HOSTS);

/**
 * Pages anyone may open (decision K2): sign-in and its steps, sign-up (decision 0036), an invite, a
 * client's approval link, the client portal (slice v), the free tools (SPEC §27: the Illinois 720-hour
 * checker), the worker app (slice t), whose pages read the worker's own cookie, and the website (slice aa).
 */
const OPEN = /^\/(sign-in|sign-up|invite|approve|portal|tools|w|site)(\/|$)/;

/**
 * Someone with no session cookie is sent to sign-in, with the page they wanted kept for after.
 * This only checks that a cookie is there; every page and action reads the session itself
 * (src/server/session.ts) and sends a stale one to sign-in too.
 */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // The website's own host: its pages at short addresses, the free tools as they are, the rest at the app.
  if (SITE_HOSTS.length > 0 && isSiteHost(request.headers.get("host"), SITE_HOSTS)) {
    const route = siteRoute(pathname);
    if (route.kind === "rewrite") {
      const url = request.nextUrl.clone();
      url.pathname = route.to;
      return NextResponse.rewrite(url);
    }
    const app = process.env.SHIFTBOOK_APP_URL?.replace(/\/+$/, "");
    if (route.kind === "app" && app) return NextResponse.redirect(`${app}${pathname}${search}`);
  }
  // Home is each language's root (decision 0029); on the website's own host "/" is the website (above).
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/en";
    return NextResponse.redirect(url, 307);
  }
  const match = /^\/(en|es)(\/.*)?$/.exec(pathname);
  if (match && !OPEN.test(match[2] ?? "/") && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${match[1]}/sign-in`;
    url.search = "";
    const wanted = `${match[2] ?? ""}${search}`;
    if (wanted && wanted !== "/") url.searchParams.set("next", wanted);
    return NextResponse.redirect(url);
  }
  return intl(request);
}

export const config = {
  // Everything except API routes, Next.js internals and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
