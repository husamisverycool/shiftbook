/**
 * The public website (slice aa) lives in the same app as the product, under /[locale]/site. On the
 * website's own host (SHIFTBOOK_SITE_HOSTS, e.g. "tabulado.com,www.tabulado.com") its pages have short
 * addresses (/, /pricing, /security, and /es/… in Spanish), the free tools keep theirs, and anything
 * else belongs to the product, at SHIFTBOOK_APP_URL. Pure: the proxy and the pages read the same rule.
 */

export const SITE_PAGES = ["", "/pricing", "/security"] as const;
export type SitePage = (typeof SITE_PAGES)[number];
type SiteLocale = "en" | "es";

/** The hosts the website answers on, from the setting (lower case, no port). */
export function siteHosts(setting: string | undefined): string[] {
  return (setting ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether a request's Host is one of the website's. */
export function isSiteHost(host: string | null | undefined, hosts: readonly string[]): boolean {
  if (!host) return false;
  return hosts.includes(host.toLowerCase().replace(/:\d+$/, ""));
}

export type SiteRoute = { kind: "rewrite"; to: string } | { kind: "pass" } | { kind: "app" };

/** What the website's host does with a path. */
export function siteRoute(pathname: string): SiteRoute {
  const m = /^\/(en|es)(?=\/|$)(.*)$/.exec(pathname);
  const locale: SiteLocale = m?.[1] === "es" ? "es" : "en";
  const rest = (m ? m[2]! : pathname).replace(/\/+$/, "");
  if ((SITE_PAGES as readonly string[]).includes(rest)) return { kind: "rewrite", to: `/${locale}/site${rest}` };
  if (rest === "/tools" || rest.startsWith("/tools/")) return { kind: "pass" };
  return { kind: "app" };
}

export interface SiteLinkContext {
  /** The page is being read on the website's own host. */
  onSiteHost: boolean;
  locale: SiteLocale;
  /** SHIFTBOOK_APP_URL: where sign-in and sign-up live when the website is on its own host. */
  appUrl: string | null;
}

/** A website page's address, as the reader's host serves it. */
export function sitePageHref(ctx: SiteLinkContext, page: SitePage, locale: SiteLocale = ctx.locale): string {
  if (ctx.onSiteHost) return locale === "en" ? page || "/" : `/es${page}`;
  return `/${locale}/site${page}`;
}

/** A product page's address (sign-in, sign-up, the free tools): on the app's host when the website has its own. */
export function appHref(ctx: SiteLinkContext, path: string): string {
  const local = `/${ctx.locale}${path}`;
  return ctx.onSiteHost && ctx.appUrl ? `${ctx.appUrl}${local}` : local;
}

/** The same page in the other language, from the address in the browser (either host). */
export function otherLanguagePath(pathname: string): string {
  const m = /^\/(en|es)(?=\/|$)(.*)$/.exec(pathname);
  if (!m) return pathname === "/" ? "/es" : `/es${pathname}`;
  const rest = m[2]!;
  if (m[1] === "en") return `/es${rest}`;
  // Spanish: the app's host keeps /site and needs /en; the website's own host has English at the root.
  return rest.startsWith("/site") ? `/en${rest}` : rest || "/";
}
