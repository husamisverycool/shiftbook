// Pattern: docs/patterns/_layouts/site.md — Linear's footer columns, Stripe's footer language choice,
// Mercury's footnotes at the very bottom.
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { TabuladoLogo } from "@/components/shiftbook/brand-mark";
import type { SiteLinks } from "@/server/site/context";

const LINK = "rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

export async function SiteFooter({ links, locale, page }: { links: SiteLinks; locale: string; page: "" | "/pricing" | "/security" }) {
  const t = await getTranslations("site.footer");
  const nav = await getTranslations("site.nav");
  const columns = [
    {
      title: t("product"),
      items: [
        { href: links.home, label: t("overview"), local: true },
        { href: links.pricing, label: nav("pricing"), local: true },
        { href: links.security, label: nav("security"), local: true },
      ],
    },
    {
      title: t("freeTools"),
      items: [{ href: links.checker, label: t("checker"), local: false }, ...(links.demo ? [{ href: links.demo, label: t("demo"), local: false }] : [])],
    },
    {
      title: t("account"),
      items: [
        { href: links.signIn, label: nav("logIn"), local: false },
        { href: links.signUp, label: nav("start"), local: false },
        ...(links.contact ? [{ href: `mailto:${links.contact}`, label: t("contact"), local: false }] : []),
      ],
    },
  ];
  const english = locale === "en" ? links.home : links.other(page);
  const spanish = locale === "es" ? links.home : links.other(page);
  return (
    <footer className="border-t">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-3">
          <TabuladoLogo className="h-6" title="Tabulado" />
          <p className="max-w-[34ch] text-sm text-muted-foreground">{t("about")}</p>
        </div>
        {columns.map((c) => (
          <div key={c.title} className="flex flex-col gap-3">
            <h2 className="text-sm text-muted-foreground">{c.title}</h2>
            <ul className="flex flex-col gap-2.5">
              {c.items.map((i) => (
                <li key={i.label}>
                  {i.local ? (
                    <NextLink href={i.href} className={`${LINK} text-foreground/85`}>
                      {i.label}
                    </NextLink>
                  ) : (
                    <a href={i.href} className={`${LINK} text-foreground/85`}>
                      {i.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 border-t px-6 py-8">
        {/* Stripe's footer language choice: each language in its own name, to the same page. */}
        <nav aria-label={t("language")} className="flex items-center gap-1 text-sm">
          <NextLink href={english} hrefLang="en" lang="en" aria-current={locale === "en" ? "true" : undefined} className={`${LINK} rounded-md px-2 py-1 aria-[current=true]:bg-muted aria-[current=true]:text-foreground`}>
            {t("english")}
          </NextLink>
          <NextLink href={spanish} hrefLang="es" lang="es" aria-current={locale === "es" ? "true" : undefined} className={`${LINK} rounded-md px-2 py-1 aria-[current=true]:bg-muted aria-[current=true]:text-foreground`}>
            {t("spanish")}
          </NextLink>
        </nav>
        {/* Mercury's footnotes. */}
        <ol className="flex max-w-3xl list-decimal flex-col gap-2 pl-4 text-xs leading-relaxed text-muted-foreground">
          <li>{t("note1")}</li>
          <li>{t("note2")}</li>
          <li>{t("note3")}</li>
        </ol>
        <p className="text-xs text-muted-foreground">{t("copyright", { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
