// Pattern: docs/patterns/site/pricing.md — Mercury's and Ramp's pricing: a dark opening band with a centred
// heading, the plan card rising out of it onto the light page (price, free days, the two pills), Linear's
// grouped "what's included" list, Check's "not included", Mercury's questions with the heading at the left,
// and Mercury's centred close.
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FrostButton, Eyebrow, Section } from "@/components/site/blocks";
import { Faq } from "@/components/site/faq";
import { SiteFooter } from "@/components/site/site-footer";
import { billingConfig } from "@/server/billing/config";
import { siteLinks } from "@/server/site/context";
import { sitePrice } from "@/server/site/price";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site.meta" });
  return { title: t("pricingTitle"), description: t("pricingDescription") };
}

const GROUPS = [
  { key: "g1", items: ["g1a", "g1b", "g1c", "g1d"] },
  { key: "g2", items: ["g2a", "g2b", "g2c"] },
  { key: "g3", items: ["g3a", "g3b", "g3c", "g3d"] },
  { key: "g4", items: ["g4a", "g4b", "g4c", "g4d"] },
  { key: "g5", items: ["g5a", "g5b", "g5c"] },
  { key: "g6", items: ["g6a", "g6b", "g6c"] },
  { key: "g7", items: ["g7a", "g7b", "g7c"] },
] as const;

const PILL = "inline-flex h-12 items-center justify-center rounded-full px-6 text-[15px] font-medium outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)] focus-visible:ring-offset-2";

function Check() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="mt-1 size-3.5 shrink-0 text-[var(--s-accent)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

export default async function SitePricing({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("site.pricing");
  const links = await siteLinks(locale);
  const price = await sitePrice();
  const amount =
    price?.unitAmountCents != null && price.currency && price.interval === "month"
      ? new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", { style: "currency", currency: price.currency.toUpperCase(), maximumFractionDigits: price.unitAmountCents % 100 === 0 ? 0 : 2 }).format(price.unitAmountCents / 100)
      : null;
  const trialDays = billingConfig().trialDays;
  const faq = ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const).map((n) => ({ q: t(`q${n}`), a: t(`a${n}`) }));

  return (
    <>
      {/* 1. Dark opening band with a centred heading (Mercury, Ramp). */}
      <section aria-labelledby="pricing-title" className="site-grain site-grain-light relative bg-[var(--s-ink)] px-6 pt-40 pb-56 text-center text-white md:pt-48">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_100%,rgba(99,102,241,0.28),transparent)]" />
        <Eyebrow tone="dark">{t("eyebrow")}</Eyebrow>
        <h1 id="pricing-title" className="mx-auto max-w-[16ch] text-[clamp(2.5rem,4vw+1rem,4.5rem)] leading-[1.02] font-[450] tracking-[-0.035em] text-balance">
          {t("headline")}
        </h1>
        <p className="mx-auto mt-6 max-w-[46ch] text-[clamp(1.0625rem,0.4vw+1rem,1.25rem)] leading-relaxed text-white/75">{t("lead")}</p>
      </section>

      {/* 2. The plan card rising out of the band (Ramp), with Linear's grouped list beside the price. */}
      <div className="relative z-10 -mt-40 px-6">
        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 overflow-hidden rounded-3xl bg-white shadow-[0_40px_100px_-40px_rgba(20,21,28,0.45)] ring-1 ring-black/5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
          <div className="flex flex-col gap-6 border-b border-[var(--s-line)] bg-[var(--s-paper-2)] p-8 md:p-10 lg:border-r lg:border-b-0">
            <h2 className="text-[15px] font-medium text-[var(--s-muted)]">{t("plan")}</h2>
            {amount && (
              <p className="flex items-baseline gap-2">
                <span className="text-[56px] leading-none font-[450] tracking-[-0.04em] tabular-nums">{amount}</span>
                <span className="text-[15px] text-[var(--s-muted)]">{t("perMonth")}</span>
              </p>
            )}
            <p className="text-[15px] text-[var(--s-muted)]">{t("freeDays", { days: trialDays })}</p>
            <div className="mt-2 flex flex-col gap-3">
              <a href={links.signUp} className={`${PILL} bg-[var(--s-accent)] text-white hover:bg-[var(--s-accent-2)]`}>
                {t("start")}
              </a>
              {links.demo && (
                <a href={links.demo} className={`${PILL} border border-[var(--s-line)] bg-white text-[var(--s-text)] hover:bg-[var(--s-paper)]`}>
                  {t("demo")}
                </a>
              )}
            </div>
            <p className="mt-auto text-[12px] leading-relaxed text-[var(--s-muted)]">{t("footnote1")}</p>
          </div>
          <div className="p-8 md:p-10">
            <h3 className="text-[15px] font-medium text-[var(--s-muted)]">{t("includedLabel")}</h3>
            <div className="mt-8 grid gap-x-10 gap-y-9 sm:grid-cols-2">
              {GROUPS.map((g) => (
                <div key={g.key} className="flex flex-col gap-3">
                  <h4 className="text-[15px] font-medium">{t(g.key)}</h4>
                  <ul className="flex flex-col gap-2.5">
                    {g.items.map((i) => (
                      <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-[var(--s-text)]/85">
                        <Check />
                        {t(i)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Not included (Check), in Mercury's label-left layout. */}
      <Section labelledBy="not-included" className="pb-0 md:pb-0">
        <div className="grid gap-8 border-t border-[var(--s-line)] pt-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <h2 id="not-included" className="text-[clamp(1.5rem,1vw+1.1rem,2rem)] leading-[1.1] font-[450] tracking-[-0.03em]">
              {t("notIncludedLabel")}
            </h2>
            <p className="mt-3 max-w-[32ch] text-[15px] leading-relaxed text-[var(--s-muted)]">{t("notIncludedLead")}</p>
          </div>
          <ul className="flex flex-col border-t border-[var(--s-line)] md:border-t-0">
            {(["not1", "not2", "not3"] as const).map((k) => (
              <li key={k} className="border-b border-[var(--s-line)] py-5 text-[17px] leading-relaxed text-[var(--s-text)] first:pt-0 md:first:pt-0">
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* 4. Questions (Mercury, Ramp): the heading at the left, the list at the right. */}
      <Section labelledBy="faq">
        <div className="grid gap-8 border-t border-[var(--s-line)] pt-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <h2 id="faq" className="max-w-[14ch] text-[clamp(1.5rem,1vw+1.1rem,2rem)] leading-[1.1] font-[450] tracking-[-0.03em] text-balance">
            {t("faqTitle")}
          </h2>
          <Faq items={faq} />
        </div>
      </Section>

      {/* 5. Mercury's centred close on the dark band. */}
      <section aria-labelledby="pricing-closing" className="bg-[var(--s-ink)] px-6 pt-32 pb-8 text-center">
        <h2 id="pricing-closing" className="mx-auto max-w-[18ch] text-[clamp(2rem,2.8vw+1rem,3.5rem)] leading-[1.08] font-[450] tracking-[-0.035em] text-balance text-white">
          {t("closingTitle")}
        </h2>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <a href={links.signUp} className={`${PILL} bg-[var(--s-accent)] text-white hover:bg-[var(--s-accent-2)]`}>
            {t("start")}
          </a>
          {links.demo && <FrostButton href={links.demo}>{t("demo")}</FrostButton>}
        </div>
      </section>

      <SiteFooter links={links} locale={locale} page="/pricing" />
    </>
  );
}
