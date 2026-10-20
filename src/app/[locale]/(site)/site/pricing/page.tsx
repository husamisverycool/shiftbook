// Pattern: docs/patterns/site/pricing.md — Ramp /pricing in the site's one system, for a single plan: a
// dark page with a centred heading; Stripe's floating pill bar of the page's parts; Ramp's plan card with
// its fit label on the top edge, the price, the free days, the email field inside the card, then "All of
// it" grouped checklists; Ramp's compare table with its sticky header and dotted, explained row labels,
// here comparing who does each job (Tabulado, your payroll provider, your bank); Check's "not included";
// Vercel's two-column questions; the home page's close.
import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Faq } from "@/components/site/faq";
import { ScrollStage } from "@/components/site/scroll";
import { SiteFooter } from "@/components/site/site-footer";
import { Close } from "@/components/site/v6/close";
import { PillBar } from "@/components/site/v6/pill-bar";
import { Eyebrow, Mono } from "@/components/site/v6/ui";
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

type WhoRow = { label: string; tip: string; who: [number, number, number] };

export default async function SitePricing({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("site.pricing");
  const v = await getTranslations("site.v6.pricingPage");
  const links = await siteLinks(locale);
  const price = await sitePrice();
  const amount =
    price?.unitAmountCents != null && price.currency && price.interval === "month"
      ? new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", { style: "currency", currency: price.currency.toUpperCase(), maximumFractionDigits: price.unitAmountCents % 100 === 0 ? 0 : 2 }).format(price.unitAmountCents / 100)
      : null;
  const trialDays = billingConfig().trialDays;
  const faq = ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const).map((n) => ({ q: t(`q${n}`), a: t(`a${n}`) }));
  const who = v.raw("groups") as { name: string; rows: WhoRow[] }[];
  const cols = [v("cols.tabulado"), v("cols.provider"), v("cols.bank")];

  return (
    <ScrollStage>
      <div data-tone="ink" className="bg-[var(--s-ink)] text-white">
        {/* 1. The centred opening. */}
        <section aria-labelledby="pricing-title" className="relative isolate px-6 pt-40 pb-16 text-center md:pt-52">
          <div aria-hidden className="absolute top-0 left-1/2 -z-10 h-[560px] w-[min(1100px,100vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(107,120,255,0.2),transparent)]" />
          <Eyebrow tone="dark">{t("eyebrow")}</Eyebrow>
          <h1 id="pricing-title" className="mx-auto mt-6 max-w-[16ch] text-[clamp(2.5rem,4vw+1rem,4.5rem)] leading-[1.02] font-[500] tracking-[-0.04em] text-balance">
            {t("headline")}
          </h1>
          <p className="mx-auto mt-6 max-w-[46ch] text-[clamp(1.0625rem,0.4vw+1rem,1.25rem)] leading-relaxed text-[var(--s-dmuted)]">{t("lead")}</p>
        </section>

        {/* 2. Stripe's pill bar, held only while its parts are on screen. */}
        <div className="relative">
        <PillBar
          label={v("tabsLabel")}
          items={[
            { id: "plan", label: v("tabs.plan") },
            { id: "included", label: v("tabs.included") },
            { id: "who", label: v("tabs.who") },
            { id: "faq", label: v("tabs.faq") },
          ]}
        />

        {/* 3. Ramp's plan card: the fit label on its top edge, the email field inside it. */}
        <section id="plan" aria-labelledby="plan-title" className="scroll-mt-36 px-6 pt-16">
          <div className="site-reveal relative mx-auto w-full max-w-[720px] pt-7">
            <span className="absolute top-0 left-6 inline-flex h-7 items-center rounded-t-lg bg-[var(--s-accent)] px-3 text-[12px] font-medium text-white">{v("fit")}</span>
            <div className="rounded-2xl rounded-tl-none bg-[linear-gradient(180deg,#17181f,#111218)] p-8 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-[var(--s-accent)]/60 md:p-10">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <h2 id="plan-title" className="text-[20px] font-medium">
                    {t("plan")}
                  </h2>
                  {amount ? (
                    <p className="mt-4 flex items-baseline gap-2">
                      <span className="text-[56px] leading-none font-[500] tracking-[-0.045em] tabular-nums">{amount}</span>
                      <span className="text-[15px] text-[var(--s-dmuted)]">{t("perMonth")}</span>
                    </p>
                  ) : (
                    <p className="mt-4 text-[15px] text-[var(--s-dmuted)]">{v("priceLater")}</p>
                  )}
                </div>
                <p className="max-w-[24ch] text-[15px] leading-snug text-white/80">{t("freeDays", { days: trialDays })}</p>
              </div>
              <form action={links.signUp} method="get" className="mt-8 flex flex-col gap-3 sm:flex-row">
                <label htmlFor="plan-email" className="sr-only">
                  {v("emailLabel")}
                </label>
                <input id="plan-email" name="email" type="email" autoComplete="email" placeholder={v("emailPlaceholder")} className="h-11 min-w-0 flex-1 rounded-full bg-white/[0.05] px-5 text-[15px] text-white ring-1 ring-white/12 outline-none placeholder:text-white/40 focus:ring-[var(--s-accent-soft)]" />
                <button type="submit" className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-[#e9e9eb] px-5 text-[15px] font-medium text-[#0b0c10] outline-none site-color-slow hover:bg-white focus-visible:ring-2 focus-visible:ring-white/60">
                  {t("start")}
                </button>
              </form>
              {links.demo && (
                <a href={links.demo} className="mt-4 inline-flex text-[14px] text-[var(--s-accent-soft)] underline-offset-4 outline-none hover:underline focus-visible:underline">
                  {t("demo")} →
                </a>
              )}
              <p className="mt-8 border-t border-white/[0.08] pt-5 text-[12px] leading-relaxed text-white/45">{t("footnote1")}</p>
            </div>
          </div>
        </section>

        {/* 4. Everything included: Ramp's grouped checklists. */}
        <section id="included" aria-labelledby="included-title" className="scroll-mt-36 px-6 pt-28">
          <div className="mx-auto w-full max-w-[1200px]">
            <h2 id="included-title" className="site-reveal text-[clamp(1.75rem,1.6vw+1rem,2.5rem)] leading-[1.08] font-[500] tracking-[-0.03em]">
              {v("includedTitle")} <span className="text-white/45">{v("includedMuted")}</span>
            </h2>
            <div className="site-reveal mt-12 grid grid-cols-1 border-t border-l border-white/[0.08] sm:grid-cols-2 lg:grid-cols-4">
              {GROUPS.map((g) => (
                <div key={g.key} className="flex flex-col gap-4 border-r border-b border-white/[0.08] p-6">
                  <Mono className="text-[var(--s-accent-soft)]">{t(g.key)}</Mono>
                  <ul className="flex flex-col gap-3">
                    {g.items.map((i) => (
                      <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-white/80">
                        <Check aria-hidden className="mt-1 size-3.5 shrink-0 text-[var(--s-accent-soft)]" strokeWidth={2.5} />
                        {t(i)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {/* Check's "not included", in the same sheet. */}
              <div className="flex flex-col gap-4 border-r border-b border-white/[0.08] bg-white/[0.02] p-6">
                <Mono className="text-white/50">{t("notIncludedLabel")}</Mono>
                <ul className="flex flex-col gap-3">
                  {(["not1", "not2", "not3"] as const).map((k) => (
                    <li key={k} className="flex gap-2.5 text-[14px] leading-relaxed text-white/60">
                      <Minus aria-hidden className="mt-1 size-3.5 shrink-0 text-white/40" strokeWidth={2.5} />
                      {t(k)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Ramp's compare table, as who does what. */}
        <section id="who" aria-labelledby="who-title" className="scroll-mt-36 px-6 pt-28">
          <div className="mx-auto w-full max-w-[1200px]">
            <h2 id="who-title" className="site-reveal max-w-[24em] text-[clamp(1.75rem,1.6vw+1rem,2.5rem)] leading-[1.08] font-[500] tracking-[-0.03em]">
              {v("whoTitle")} <span className="text-white/45">{v("whoMuted")}</span>
            </h2>
            <table className="site-reveal mt-12 w-full border-collapse text-left">
              <thead className="sticky top-[7.75rem] z-10 bg-[var(--s-ink)]/95 backdrop-blur">
                <tr className="border-b border-white/[0.1]">
                  <th className="w-[46%] py-4 text-[13px] font-normal text-[var(--s-dmuted)]">
                    <span className="sr-only">{v("tabs.who")}</span>
                  </th>
                  {cols.map((c, i) => (
                    <th key={c} scope="col" className={cn("px-2 py-4 text-center text-[13px] font-medium sm:text-[14px]", i === 0 ? "text-white" : "text-white/70")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              {who.map((g) => (
                <tbody key={g.name}>
                  <tr>
                    <th colSpan={4} scope="colgroup" className="pt-10 pb-3 text-left">
                      <Mono className="text-[var(--s-accent-soft)]">{g.name}</Mono>
                    </th>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.label} className="border-b border-white/[0.06]">
                      <th scope="row" className="py-4 pr-4 text-[14px] font-normal text-white/85 sm:text-[15px]">
                        {/* Ramp's dotted label: the explanation on hover or focus. */}
                        <span tabIndex={0} className="group/tip relative cursor-help underline decoration-white/30 decoration-dotted underline-offset-4 outline-none focus-visible:decoration-white">
                          {r.label}
                          <span role="tooltip" className="pointer-events-none absolute top-full left-0 z-20 mt-2 w-[min(320px,70vw)] rounded-lg bg-[#1d1e25] px-3 py-2 text-[13px] leading-snug text-white/80 no-underline opacity-0 shadow-xl ring-1 ring-white/10 site-crossfade group-hover/tip:opacity-100 group-focus/tip:opacity-100">
                            {r.tip}
                          </span>
                        </span>
                      </th>
                      {r.who.map((on, i) => (
                        <td key={i} className="px-2 py-4 text-center">
                          {on ? (
                            <span className={cn("inline-flex size-5 items-center justify-center rounded-full", i === 0 ? "bg-[var(--s-accent)] text-white" : "bg-white/12 text-white")}>
                              <Check aria-hidden className="size-3" strokeWidth={3} />
                              <span className="sr-only">{v("yes")}</span>
                            </span>
                          ) : (
                            <span className="text-white/25">
                              <span aria-hidden>—</span>
                              <span className="sr-only">{v("no")}</span>
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </section>

        {/* 6. Vercel's two-column questions. */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-36 px-6 py-28">
          <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-10 border-t border-white/[0.08] pt-14 md:grid-cols-12">
            <h2 id="faq-title" className="site-reveal max-w-[14ch] text-[clamp(1.75rem,1.6vw+1rem,2.5rem)] leading-[1.08] font-[500] tracking-[-0.03em] text-balance md:col-span-5">
              {v("faqTitle")}
            </h2>
            <div className="site-reveal md:col-span-7">
              <Faq items={faq} tone="dark" />
            </div>
          </div>
        </section>

        </div>

        {/* 7. The home page's close. */}
        <Close id="pricing-closing" title={t("closingTitle")} primary={{ href: links.signUp, label: t("start") }} secondary={links.demo ? { href: links.demo, label: t("demo") } : { href: links.home, label: t("plan") }} />
      </div>
      <SiteFooter links={links} locale={locale} page="/pricing" />
    </ScrollStage>
  );
}
