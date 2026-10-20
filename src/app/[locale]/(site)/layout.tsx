// Pattern: docs/patterns/_layouts/site.md — Resend's and Attio's sticky header, Linear's and Mercury's
// contents and footer, Stripe's language choice, Mercury's footnotes.
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/site-header";
import { siteLinks } from "@/server/site/context";

export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("site.nav");
  const links = await siteLinks(locale);
  return (
    <div className="flex min-h-[calc(100svh-var(--banner-height,0px))] flex-col bg-background">
      <SiteHeader
        labels={{
          skip: t("skip"),
          home: t("home"),
          main: t("main"),
          product: t("product"),
          pricing: t("pricing"),
          security: t("security"),
          tools: t("tools"),
          logIn: t("logIn"),
          demo: t("demo"),
          start: t("start"),
          menu: t("menu"),
          closeMenu: t("closeMenu"),
          otherLanguage: t("otherLanguage"),
          otherLanguageName: t("otherLanguageName"),
          otherLanguageCode: locale === "es" ? "en" : "es",
        }}
        links={{ home: links.home, product: `${links.home}#week`, pricing: links.pricing, security: links.security, tools: links.checker, logIn: links.signIn, demo: links.demo, start: links.signUp }}
      />
      <main id="content" className="flex-1">
        {children}
      </main>
    </div>
  );
}
