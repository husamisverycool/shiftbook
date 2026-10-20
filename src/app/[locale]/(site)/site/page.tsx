// Pattern: docs/patterns/site.md — Linear's hero and chapters, Mercury's demo beside the main button,
// Stripe Billing's chapters in a window frame, Ramp's before-and-after, Resend's code-beside-result and
// nine-item grid, Column's checkable facts, Check's split, Plain's security band, Linear's closing CTA.
import type { Metadata } from "next";
import NextLink from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRightIcon, CheckIcon, MinusIcon } from "lucide-react";
import type { Say } from "@shiftbook/rules";
import { ExplainLine } from "@/components/site/explain-line";
import { ProductWindow, SampleLabel, SITE_BUTTON, Section, TwoTone } from "@/components/site/blocks";
import { SiteFooter } from "@/components/site/site-footer";
import { ApprovalVisual, ExceptionsVisual, FilesVisual, MarginVisual, ReviewVisual, UploadVisual } from "@/components/site/visuals";
import { WeekSteps } from "@/components/site/week-steps";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { siteLinks } from "@/server/site/context";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site.meta" });
  return { title: t("homeTitle"), description: t("homeDescription"), openGraph: { title: t("homeTitle"), description: t("homeDescription"), siteName: "Tabulado" } };
}

/** The demo agency's Illinois overtime line for Marcus Bell, week of October 5, 2026, exactly as stored. */
const SAMPLE_EXPLAIN =
  "Overtime: 5h 03m (303 min) × $27.375/h (1.5 × $18.25) = 13824.375¢ → rounded half-up once → $138.24. Rule weekly_overtime: 45h 03m worked in the workweek starting 2026-10-05 is 5h 03m over the 40h 00m threshold (Illinois Minimum Wage Law, 820 ILCS 105/4a(1) — over 40 hours in a workweek at not less than 1.5x the regular rate; Fair Labor Standards Act, 29 U.S.C. § 207(a)(1); 29 C.F.R. Part 778 — over 40 hours in a workweek at not less than 1.5x the regular rate).";

/** Its keys, as the engine stored them, so the page says it in the reader's language as the app does. */
const SAMPLE_SAY: Say = [
  { key: "arithmeticRounded", values: { note: { say: [{ key: "noteMultiplierOfRate", values: { rate: "$18.25", multiplier: "1.5" } }] }, rate: "$27.375/h", exact: "13824.375", label: { say: [{ key: "labelOvertime" }] }, amount: "$138.24", minutes: "303", duration: { duration: 303 } } },
  { key: "whyWeekly", values: { over: { duration: 303 }, rule: "weekly_overtime", week: { date: "2026-10-05" }, worked: { duration: 2703 }, citations: "Illinois Minimum Wage Law, 820 ILCS 105/4a(1) — over 40 hours in a workweek at not less than 1.5x the regular rate; Fair Labor Standards Act, 29 U.S.C. § 207(a)(1); 29 C.F.R. Part 778 — over 40 hours in a workweek at not less than 1.5x the regular rate", threshold: { duration: 2400 } } },
] as Say;

const PAYROLL_TARGETS = ["Gusto", "ADP Workforce Now", "ADP RUN", "QuickBooks Desktop", "QuickBooks Online", "Paychex Flex", "Paylocity"];

export default async function SiteHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("site.home");
  const f = await getTranslations("site.frame");
  const links = await siteLinks(locale);
  const secondary = links.demo ? { href: links.demo, label: t("demo") } : { href: "#week", label: t("howItWorks") };
  const buttons = (
    <div className="flex flex-wrap items-center gap-3">
      <a href={links.signUp} className={cn(buttonVariants(), SITE_BUTTON)}>
        {t("start")}
      </a>
      <a href={secondary.href} className={cn(buttonVariants({ variant: "outline" }), SITE_BUTTON)}>
        {secondary.label}
      </a>
    </div>
  );

  return (
    <>
      {/* 1. Hero (Linear, Mercury). */}
      <section aria-labelledby="hero-title" className="mx-auto w-full max-w-7xl px-6 pt-16 pb-12 md:pt-24 md:pb-16">
        <h1 id="hero-title" className="max-w-[18ch] text-[clamp(2.75rem,5vw+1rem,4.5rem)] leading-none font-semibold tracking-[-0.03em] text-balance">
          <span className="block animate-site-line-in">{t("titleLine1")}</span>
          <span className="block animate-site-line-in [animation-delay:60ms]">{t("titleLine2")}</span>
        </h1>
        <p className="mt-6 max-w-[60ch] text-lg leading-relaxed text-muted-foreground md:text-xl">{t("lead")}</p>
        <div className="mt-8">{buttons}</div>
        <p className="mt-4 text-sm text-muted-foreground">{t("never")}</p>
      </section>

      {/* 2. The product (Linear's real elements in Stripe's and Resend's window frame). */}
      <div className="mx-auto w-full max-w-7xl px-6">
        <ProductWindow address={f("address")} label={f("title")}>
          <ReviewVisual />
        </ProductWindow>
      </div>

      {/* 3. Checkable facts (Column), in place of a logo row. */}
      <Section labelledBy="facts" className="pb-0 md:pb-0">
        <h2 id="facts" className="sr-only">
          {t("facts.label")}
        </h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-8 border-t pt-10 sm:grid-cols-2 lg:grid-cols-4">
          {([1, 2, 3, 4] as const).map((n) => (
            <div key={n} className="flex flex-col gap-1.5">
              <dt className="text-base font-semibold">{t(`facts.f${n}Title`)}</dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">{t(`facts.f${n}`)}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* 4. Before and after (Ramp). */}
      <Section labelledBy="before">
        <TwoTone id="before" strong={t("before.title")} muted={t("before.titleMuted")} />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-muted/40 p-6">
            <h3 className="text-sm font-semibold text-muted-foreground">{t("before.todayTitle")}</h3>
            <ul className="mt-4 flex flex-col gap-3">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <li key={n} className="flex gap-3 text-base leading-relaxed text-muted-foreground">
                  <MinusIcon aria-hidden className="mt-1.5 size-4 shrink-0" />
                  {t(`before.today${n}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border bg-background p-6">
            <h3 className="text-sm font-semibold">{t("before.withTitle")}</h3>
            <ul className="mt-4 flex flex-col gap-3">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <li key={n} className="flex gap-3 text-base leading-relaxed">
                  <CheckIcon aria-hidden className="mt-1.5 size-4 shrink-0 text-accent-text" />
                  {t(`before.with${n}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* 5. One week, start to finish (Stripe Billing, Gusto). */}
      <Section id="week" labelledBy="week-title" className="pt-0 md:pt-0">
        <TwoTone id="week-title" strong={t("week.title")} muted={t("week.titleMuted")} />
        <div className="mt-10">
          <WeekSteps
            label={t("week.steps")}
            steps={[
              { title: t("week.s1Title"), body: t("week.s1"), picture: <ProductWindow address={f("address")} label={f("uploadTitle")}><UploadVisual /></ProductWindow> },
              { title: t("week.s2Title"), body: t("week.s2"), picture: <ProductWindow address={f("address")} label={f("exceptionsTitle")}><ExceptionsVisual /></ProductWindow> },
              { title: t("week.s3Title"), body: t("week.s3"), picture: <ProductWindow address="app.tabulado.com/approvals" label={f("approvalTitle")}><ApprovalVisual /></ProductWindow> },
              { title: t("week.s4Title"), body: t("week.s4"), picture: <ProductWindow address={f("address")} label={t("provider.totals")}><FilesVisual /></ProductWindow> },
            ]}
          />
        </div>
      </Section>

      {/* 6. Every pay line says why (Resend's code beside its result). */}
      <Section labelledBy="explain" className="pt-0 md:pt-0">
        <TwoTone id="explain" strong={t("explain.title")} muted={t("explain.titleMuted")} />
        <div className="mt-10 grid grid-cols-1 overflow-hidden rounded-xl border lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)]">
          <div className="border-b bg-muted/40 p-6 lg:border-r lg:border-b-0">
            <h3 className="text-sm font-semibold text-muted-foreground">{t("explain.inputs")}</h3>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm tabular-nums">
              <dt className="text-muted-foreground">{t("explain.worker")}</dt>
              <dd className="font-medium">Marcus Bell</dd>
              <dt className="text-muted-foreground">{t("explain.state")}</dt>
              <dd className="font-medium">Illinois</dd>
              <dt className="text-muted-foreground">{t("explain.week")}</dt>
              <dd className="font-medium">45:03</dd>
              <dt className="text-muted-foreground">{t("explain.rate")}</dt>
              <dd className="font-medium">$18.25/h</dd>
            </dl>
          </div>
          <div className="flex flex-col gap-4 p-6">
            <h3 className="text-sm font-semibold text-muted-foreground">{t("explain.line")}</h3>
            <ExplainLine explain={SAMPLE_EXPLAIN} say={SAMPLE_SAY} />
            <SampleLabel>{t("explain.sample")}</SampleLabel>
          </div>
        </div>
      </Section>

      {/* 7. The rules (Linear's feature rows). */}
      <Section labelledBy="rules" className="pt-0 md:pt-0">
        <TwoTone id="rules" strong={t("rules.title")} muted={t("rules.titleMuted")} />
        <dl aria-label={t("rules.listLabel")} className="mt-10 divide-y border-y">
          {([1, 2, 3, 4, 5, 6] as const).map((n) => (
            <div key={n} className="grid gap-1 py-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-8">
              <dt className="text-base">{t(`rules.r${n}`)}</dt>
              <dd className="text-sm text-muted-foreground md:text-right">{t(`rules.r${n}Law`)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 max-w-[68ch] text-sm text-muted-foreground">{t("rules.unknown")}</p>
      </Section>

      {/* 8. Your payroll provider stays (Linear's chapter). */}
      <Section labelledBy="provider" className="pt-0 md:pt-0">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <TwoTone id="provider" strong={t("provider.title")} muted={t("provider.titleMuted")} />
            <p className="max-w-[60ch] text-lg leading-relaxed text-muted-foreground">{t("provider.body")}</p>
            <ul aria-label={t("provider.listLabel")} className="flex flex-wrap gap-2">
              {PAYROLL_TARGETS.map((p) => (
                <li key={p} className="rounded-md border px-2.5 py-1 text-sm">
                  {p}
                </li>
              ))}
              <li className="rounded-md border border-dashed px-2.5 py-1 text-sm text-muted-foreground">{t("provider.custom")}</li>
            </ul>
          </div>
          <ProductWindow address={f("address")} label={t("provider.totals")}>
            <FilesVisual withInvoices={false} />
          </ProductWindow>
        </div>
      </Section>

      {/* 9. Getting paid and margin (Linear's chapters, two pictures side by side). */}
      <Section labelledBy="paid" className="pt-0 md:pt-0">
        <TwoTone id="paid" strong={t("paid.title")} muted={t("paid.titleMuted")} />
        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <ProductWindow address="app.tabulado.com/approvals" label={t("paid.approvalsTitle")}>
              <ApprovalVisual />
            </ProductWindow>
            <h3 className="text-base font-semibold">{t("paid.approvalsTitle")}</h3>
            <p className="max-w-[60ch] text-base leading-relaxed text-muted-foreground">{t("paid.approvals")}</p>
          </div>
          <div className="flex flex-col gap-4">
            <ProductWindow address="app.tabulado.com/margin" label={t("paid.marginTitle")}>
              <MarginVisual />
            </ProductWindow>
            <h3 className="text-base font-semibold">{t("paid.marginTitle")}</h3>
            <p className="max-w-[60ch] text-base leading-relaxed text-muted-foreground">{t("paid.margin")}</p>
          </div>
        </div>
      </Section>

      {/* 10. Everything else (Resend's nine-item grid). */}
      <Section labelledBy="grid" className="pt-0 md:pt-0">
        <TwoTone id="grid" strong={t("grid.title")} />
        <ul aria-label={t("grid.label")} className="mt-10 grid gap-x-10 gap-y-8 border-t pt-10 sm:grid-cols-2 lg:grid-cols-3">
          {([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((n) => (
            <li key={n} className="flex flex-col gap-1.5">
              <h3 className="text-base font-semibold">{t(`grid.g${n}Title`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{t(`grid.g${n}`)}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* 11. What Tabulado does and what it does not (Check). */}
      <Section labelledBy="split" className="pt-0 md:pt-0">
        <TwoTone id="split" strong={t("split.title")} muted={t("split.titleMuted")} />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {(["tab", "provider", "you"] as const).map((col) => (
            <div key={col} className={cn("rounded-xl border p-6", col === "tab" ? "bg-background" : "bg-muted/40")}>
              <h3 className="text-sm font-semibold">{t(`split.${col}Title`)}</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {([1, 2, 3] as const).map((n) => (
                  <li key={n} className="flex gap-3 text-base leading-relaxed">
                    <CheckIcon aria-hidden className={cn("mt-1.5 size-4 shrink-0", col === "tab" ? "text-accent-text" : "text-muted-foreground")} />
                    {t(`split.${col}${n}`)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* 12. Security band (Plain, Warp). */}
      <Section labelledBy="security-band" className="pt-0 md:pt-0">
        <div className="rounded-2xl border bg-muted/40 p-8 md:p-12">
          <h2 id="security-band" className="max-w-[22em] text-2xl font-semibold tracking-[-0.02em] text-balance md:text-3xl">
            {t("securityBand.title")}
          </h2>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {([1, 2, 3] as const).map((n) => (
              <li key={n} className="border-l pl-4 text-base leading-relaxed text-muted-foreground">
                {t(`securityBand.s${n}`)}
              </li>
            ))}
          </ul>
          <NextLink href={links.security} className="mt-8 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-accent-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">
            {t("securityBand.link")}
            <ArrowRightIcon aria-hidden className="size-4" />
          </NextLink>
        </div>
      </Section>

      {/* 13. The free Illinois tool (Gusto's free calculators). */}
      <Section labelledBy="tool" className="pt-0 md:pt-0">
        <div className="flex flex-col gap-4 border-y py-10 md:flex-row md:items-center md:justify-between">
          <div className="flex max-w-[60ch] flex-col gap-2">
            <h2 id="tool" className="text-xl font-semibold tracking-tight">
              {t("tool.title")}
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">{t("tool.body")}</p>
          </div>
          <a href={links.checker} className={cn(buttonVariants({ variant: "outline" }), SITE_BUTTON, "self-start md:self-auto")}>
            {t("tool.link")}
            <ArrowRightIcon aria-hidden data-icon="inline-end" />
          </a>
        </div>
      </Section>

      {/* 14. Closing call to action (Linear, Resend). */}
      <Section labelledBy="closing" className="pt-0 text-center md:pt-0">
        <div className="flex flex-col items-center gap-6 py-8">
          <h2 id="closing" className="max-w-[16ch] text-[clamp(2.25rem,2.5vw+1.625rem,3.5rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-balance">
            {t("closing.title")}
          </h2>
          <p className="max-w-[56ch] text-lg leading-relaxed text-muted-foreground">{links.demo ? t("closing.body") : t("closing.bodyNoDemo")}</p>
          {buttons}
        </div>
      </Section>

      <SiteFooter links={links} locale={locale} page="" />
    </>
  );
}
