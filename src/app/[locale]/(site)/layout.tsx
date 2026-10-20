// Pattern: docs/patterns/_layouts/site.md — Mercury's fixed header over each page's dark opening band,
// Mercury's dark footer with its footnotes (rendered by each page, which knows its own address).
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { siteHosts } from "@/lib/site-routing";
import { SiteHeader, type SiteMenuLabels } from "@/components/site/site-header";
import { siteLinks } from "@/server/site/context";

// Linear's typeface for the website (decision 0048).
const inter = Inter({ subsets: ["latin"], display: "swap", axes: ["opsz"] });

// Link previews (the share image) need the website's own address, not the server's.
const host = siteHosts(process.env.SHIFTBOOK_SITE_HOSTS)[0];
export const metadata: Metadata = host ? { metadataBase: new URL(`https://${host}`) } : {};

export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("site.nav");
  const links = await siteLinks(locale);
  return (
    // The website keeps its own palette in both light and dark system settings (Mercury's bands).
    <div className={`site ${inter.className} flex min-h-[calc(100svh-var(--banner-height,0px))] flex-col antialiased [color-scheme:light]`} style={{ fontFeatureSettings: '"cv01", "ss03"', fontVariationSettings: '"opsz" auto' }}>
      <SiteHeader
        labels={{
          skip: t("skip"),
          home: t("home"),
          main: t("main"),
          product: t("product"),
          how: t("how"),
          menus: { product: t.raw("menus.product") as SiteMenuLabels, how: t.raw("menus.how") as SiteMenuLabels },
          pricing: t("pricing"),
          security: t("security"),
          tools: t("tools"),
          logIn: t("logIn"),
          demo: t("demo"),
          start: t("start"),
          menu: t("menu"),
          otherLanguage: t("otherLanguage"),
          otherLanguageName: t("otherLanguageName"),
          otherLanguageCode: locale === "es" ? "en" : "es",
        }}
        links={{ home: links.home, product: `${links.home}#product`, pricing: links.pricing, security: links.security, tools: links.checker, logIn: links.signIn, demo: links.demo, start: links.signUp }}
      />
      <main id="content" className="flex-1">
        {children}
      </main>
    </div>
  );
}
