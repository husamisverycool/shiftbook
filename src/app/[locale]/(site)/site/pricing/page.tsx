// Pattern: docs/patterns/site/pricing.md — Resend's title, Linear's and Attio's plan card, Check's "not
// included", Gusto's, Warp's and Mercury's FAQ, Mercury's footnotes.
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckIcon, MinusIcon } from "lucide-react";
import { Section, SITE_BUTTON } from "@/components/site/blocks";
import { Faq } from "@/components/site/faq";
import { SiteFooter } from "@/components/site/site-footer";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
      {/* 1. Title and one line (Resend). */}
      <section aria-labelledby="pricing-title" className="mx-auto w-full max-w-7xl px-6 pt-16 pb-10 md:pt-24">
        <h1 id="pricing-title" className="text-[clamp(2.5rem,4vw+1rem,4rem)] leading-none font-semibold tracking-[-0.03em]">
          {t("title")}
        </h1>
        <p className="mt-5 max-w-[56ch] text-lg leading-relaxed text-muted-foreground md:text-xl">{t("lead")}</p>
      </section>

      {/* 2. One plan card (Linear, Attio). */}
      <Section labelledBy="plan" className="pt-0 md:pt-0">
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.6fr)]">
          <div className="flex flex-col gap-6 border-b bg-muted/40 p-8 lg:border-r lg:border-b-0">
            <h2 id="plan" className="text-lg font-semibold">
              {t("plan")}
            </h2>
            {amount && (
              <p className="flex items-baseline gap-2">
                <span className="text-5xl font-semibold tracking-[-0.03em] tabular-nums">{amount}</span>
                <span className="text-muted-foreground">{t("perMonth")}</span>
              </p>
            )}
            <p className="text-sm text-muted-foreground">{t("freeDays", { days: trialDays })}</p>
            <div className="flex flex-col gap-3">
              <a href={links.signUp} className={cn(buttonVariants(), SITE_BUTTON, "w-full")}>
                {t("start")}
              </a>
              {links.demo && (
                <a href={links.demo} className={cn(buttonVariants({ variant: "outline" }), SITE_BUTTON, "w-full")}>
                  {t("demo")}
                </a>
              )}
            </div>
          </div>
          <div className="p-8">
            <h3 className="text-sm font-semibold text-muted-foreground">{t("includedLabel")}</h3>
            <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {GROUPS.map((g) => (
                <div key={g.key} className="flex flex-col gap-3">
                  <h4 className="text-sm font-semibold">{t(g.key)}</h4>
                  <ul className="flex flex-col gap-2">
                    {g.items.map((i) => (
                      <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                        <CheckIcon aria-hidden className="mt-1 size-3.5 shrink-0 text-accent-text" />
                        {t(i)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Not included (Check). */}
        <div className="mt-6 rounded-2xl border p-8">
          <h3 className="text-sm font-semibold text-muted-foreground">{t("notIncludedLabel")}</h3>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {(["not1", "not2", "not3"] as const).map((k) => (
              <li key={k} className="flex gap-2.5 text-sm leading-relaxed">
                <MinusIcon aria-hidden className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* 4. Questions (Gusto, Warp, Mercury). */}
      <Section labelledBy="faq" className="pt-0 md:pt-0">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.6fr)]">
          <h2 id="faq" className="max-w-[14ch] text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-balance">
            {t("faqTitle")}
          </h2>
          <Faq items={faq} />
        </div>
      </Section>

      {/* Closing call to action (Linear). */}
      <Section labelledBy="pricing-closing" className="pt-0 text-center md:pt-0">
        <div className="flex flex-col items-center gap-6 py-6">
          <h2 id="pricing-closing" className="max-w-[16ch] text-[clamp(2rem,2vw+1.5rem,3rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-balance">
            {t("closingTitle")}
          </h2>
          <a href={links.signUp} className={cn(buttonVariants(), SITE_BUTTON)}>
            {t("start")}
          </a>
          {/* 5. Footnotes (Mercury). */}
          <p className="max-w-[68ch] text-xs text-muted-foreground">{t("footnote1")}</p>
        </div>
      </Section>

      <SiteFooter links={links} locale={locale} page="/pricing" />
    </>
  );
}
