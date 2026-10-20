/**
 * What the website's pages need to know about where they are read (slice aa): whether the request came
 * to the website's own host, and the addresses of the product, the demo and the contact.
 */
import { headers } from "next/headers";
import { appHref, isSiteHost, sitePageHref, siteHosts, type SiteLinkContext, type SitePage } from "@/lib/site-routing";
import { env } from "../env";

export interface SiteLinks {
  ctx: SiteLinkContext;
  home: string;
  pricing: string;
  security: string;
  /** The same page in the other language. */
  other: (page: SitePage) => string;
  signIn: string;
  signUp: string;
  checker: string;
  /** SHIFTBOOK_DEMO_URL's sign-in page, or null when no demo address is set. */
  demo: string | null;
  /** TABULADO_CONTACT_EMAIL, or null. */
  contact: string | null;
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export async function siteLinks(locale: string): Promise<SiteLinks> {
  const loc = locale === "es" ? "es" : "en";
  const host = (await headers()).get("host");
  const ctx: SiteLinkContext = { onSiteHost: isSiteHost(host, siteHosts(process.env.SHIFTBOOK_SITE_HOSTS)), locale: loc, appUrl: env.appUrl };
  const demoBase = process.env.SHIFTBOOK_DEMO_URL?.replace(/\/+$/, "");
  const contact = process.env.TABULADO_CONTACT_EMAIL?.trim();
  return {
    ctx,
    home: sitePageHref(ctx, ""),
    pricing: sitePageHref(ctx, "/pricing"),
    security: sitePageHref(ctx, "/security"),
    other: (page) => sitePageHref(ctx, page, loc === "en" ? "es" : "en"),
    signIn: appHref(ctx, "/sign-in"),
    signUp: appHref(ctx, "/sign-up"),
    checker: ctx.onSiteHost ? `${loc === "en" ? "" : "/es"}/tools/il-720-hours` : `/${loc}/tools/il-720-hours`,
    demo: demoBase && /^https?:\/\//.test(demoBase) ? `${demoBase}/${loc}/sign-in` : null,
    contact: contact && EMAIL.test(contact) ? contact : null,
  };
}
