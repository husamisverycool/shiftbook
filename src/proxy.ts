import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { SESSION_COOKIE } from "./server/auth/cookie";

const intl = createMiddleware(routing);

/**
 * Pages anyone may open (decision K2): sign-in and its steps, sign-up (decision 0036), an invite, a
 * client's approval link, the free tools (SPEC §27: the Illinois 720-hour checker), and the worker app
 * (slice t), whose pages read the worker's own cookie.
 */
const OPEN = /^\/(sign-in|sign-up|invite|approve|tools|w)(\/|$)/;

/**
 * Someone with no session cookie is sent to sign-in, with the page they wanted kept for after.
 * This only checks that a cookie is there; every page and action reads the session itself
 * (src/server/session.ts) and sends a stale one to sign-in too.
 */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
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
