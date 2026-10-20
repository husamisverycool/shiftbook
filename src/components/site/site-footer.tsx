// Pattern: docs/patterns/_layouts/site.md — Linear's footer: the logo, link columns and the language
// choice (Stripe's footer picker), then a hairline and Mercury's "Disclaimers and footnotes" — the label at
// the left, the numbered notes at the right, each the target of a footnote mark on the page — and the
// photographer's credit.
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { TabuladoLogo } from "@/components/shiftbook/brand-mark";
import type { SiteLinks } from "@/server/site/context";

const LINK = "rounded-sm l-text-mini text-[var(--l-text-3)] outline-none site-color-slow hover:text-[var(--l-text)] focus-visible:ring-2 focus-visible:ring-white/50";

export async function SiteFooter({ links, locale, page }: { links: SiteLinks; locale: string; page: "" | "/pricing" | "/security" }) {
  const t = await getTranslations("site.footer");
  const nav = await getTranslations("site.nav");
  const more = await getTranslations("site.v6.notes");
  const marks = await getTranslations("site.linear");
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
    <footer data-tone="ink" className="border-t border-white/[0.08] bg-[var(--l-bg)] text-[var(--l-text)]">
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-2 gap-x-8 gap-y-12 px-6 pt-14 pb-16 md:grid-cols-[1.6fr_repeat(3,1fr)] md:px-20">
        <div className="col-span-2 flex flex-col gap-4 md:col-span-1">
          <TabuladoLogo className="h-5 text-[var(--l-text)]" title="Tabulado" />
          <p className="max-w-[34ch] l-text-mini text-[var(--l-text-3)]">{t("about")}</p>
        </div>
        {columns.map((c) => (
          <div key={c.title} className="flex flex-col gap-4">
            <h2 className="l-text-mini font-[510] text-[var(--l-text)]">{c.title}</h2>
            <ul className="flex flex-col gap-2.5">
              {c.items.map((i) => (
                <li key={i.label}>
                  {i.local ? (
                    <NextLink href={i.href} className={LINK}>
                      {i.label}
                    </NextLink>
                  ) : (
                    <a href={i.href} className={LINK}>
                      {i.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto w-full max-w-[1440px] px-6 pb-20 md:px-20">
        <div className="grid gap-8 border-t border-white/[0.08] pt-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-6">
            <h2 className="l-text-mini font-[510] text-[var(--l-text)]">{t("notesTitle")}</h2>
            {/* Stripe's footer language choice: each language in its own name, to the same page. */}
            <nav aria-label={t("language")} className="flex items-center gap-1 l-text-mini">
              <NextLink href={english} hrefLang="en" lang="en" aria-current={locale === "en" ? "true" : undefined} className="rounded-full px-3 py-1.5 text-[var(--l-text-3)] outline-none site-color-slow hover:text-[var(--l-text)] focus-visible:ring-2 focus-visible:ring-white/50 aria-[current=true]:bg-white/[0.08] aria-[current=true]:text-[var(--l-text)]">
                {t("english")}
              </NextLink>
              <NextLink href={spanish} hrefLang="es" lang="es" aria-current={locale === "es" ? "true" : undefined} className="rounded-full px-3 py-1.5 text-[var(--l-text-3)] outline-none site-color-slow hover:text-[var(--l-text)] focus-visible:ring-2 focus-visible:ring-white/50 aria-[current=true]:bg-white/[0.08] aria-[current=true]:text-[var(--l-text)]">
                {t("spanish")}
              </NextLink>
            </nav>
          </div>
          <div className="flex flex-col gap-5 l-text-micro text-[var(--l-text-4)]">
            <ol className="flex list-decimal flex-col gap-3 pl-4">
              <li id="note-1">{t("note1")}</li>
              <li id="note-2">{t("note2")}</li>
              <li id="note-3">{t("note3")}</li>
            </ol>
            <p>{marks("trademarks")}</p>
            <p>
              {more.rich("photos", {
                sulyok: (chunks) => (
                  <a href="https://sulyokimaging.ro" rel="noopener" className="underline decoration-white/30 underline-offset-2 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/50">
                    {chunks}
                  </a>
                ),
              })}
            </p>
            <p>{t("copyright", { year: new Date().getFullYear() })}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
