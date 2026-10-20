// Pattern: docs/patterns/site.md — Linear's homepage, part for part and at its measured sizes (linear.app,
// 2026-10-20; decision 0048): the hero (unchanged, owner); the logo row with its caption; the statement and
// its three figures; four product sections (title, description, a dim product scene with one panel in front,
// a Features row), with Raycast's lit sentences, Stripe's book card (a page of the law) and Stripe's systems
// diagram between them; the changelog; the centred pre-footer; the footer.
import type { Metadata } from "next";
import Image from "next/image";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { FrostButton } from "@/components/site/blocks";
import { SiteFooter } from "@/components/site/site-footer";
import { ScrollStage } from "@/components/site/scroll";
import type { Demo } from "@/components/site/app/data";
import { HeroPlayer } from "@/components/site/app/hero-player";
import { Changelog, Prefooter } from "@/components/site/linear/closing";
import { Logos } from "@/components/site/linear/logos";
import { ApprovalsScene, FileScene, IntakeScene, RulesScene } from "@/components/site/linear/scenes";
import { Keyline, ProductSection } from "@/components/site/linear/section";
import { Statement } from "@/components/site/linear/statement";
import { Connections, type ConnectionsText } from "@/components/site/linear/connections";
import { RuleBook } from "@/components/site/linear/rule-book";
import { WhatElse } from "@/components/site/linear/what-else";
import { getEngineSay } from "@/components/shiftbook/engine-say-server";
import { siteLinks } from "@/server/site/context";
import { ruleUpdates } from "@/server/site/rule-updates";
import { siteSampleFiles } from "@/server/site/sample-files";
import { SITE_WEEK, stateWeek } from "@/server/site/state-week";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site.meta" });
  return { title: t("homeTitle"), description: t("homeDescription"), openGraph: { title: t("homeTitle"), description: t("homeDescription"), siteName: "Tabulado", images: ["/site/hero-warehouse.jpg"] } };
}

const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

export default async function SiteHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("site.home");
  const v = await getTranslations("site.linear");
  const links = await siteLinks(locale);
  const say = await getEngineSay();
  const format = await getFormatter();
  const secondary = links.demo ? { href: links.demo, label: t("hero.demo") } : { href: "#intake-title", label: t("hero.howItWorks") };
  const date = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  // The hero's play and the scenes: the Illinois week and the real files.
  const illinois = stateWeek("IL");
  const lines = illinois.lines.map((l) => ({ label: t(`state.${l.type as "REG"}`), hours: hm(l.minutes), amount: usd(l.amountCents), explain: say({ say: l.say, explain: l.explain }) }));
  const files = siteSampleFiles().map((f) => ({
    system: f.system,
    filename: f.filename,
    preview: f.preview,
    workers: String(f.controlTotals.workers),
    gross: usd(f.controlTotals.grossCents),
    theirs: usd(f.controlTotals.payrollSystemGrossCents ?? f.controlTotals.grossCents),
    difference: usd(f.controlTotals.payrollSystemDifferenceCents ?? 0),
  }));
  const demo: Demo = { lines, total: usd(illinois.totalCents), files };
  const days = SITE_WEEK.filter((d) => d.minutes > 0).map((d) => ({ label: format.dateTime(new Date(`${d.date}T12:00:00Z`), { weekday: "short", timeZone: "UTC" }), minutes: d.minutes }));
  const features = (k: "intake" | "rules" | "approvals" | "files") => (v.raw(`${k}.features`) as [string, string][]).map(([name, text]) => ({ name, text }));

  const today = new Date().toISOString().slice(0, 10);
  const entries = ruleUpdates(today).map((u) => ({
    key: `${u.state}-${u.scope}-${u.effectiveFrom}`,
    title: v(u.daysUntil > 0 ? "changelog.rises" : "changelog.is", { place: u.scope ?? t(`state.${u.state}`), rate: usd(u.rateCents) }),
    body: u.citation.split(" — ")[0]!,
    date: date(u.effectiveFrom),
  }));

  return (
    <ScrollStage>
      <div className="bg-[var(--l-bg)] text-[var(--l-text)]" data-tone="ink">
      {/* 1–2. Hero (owner, 2026-10-20: unchanged): Mercury's photograph, Linear's left-set headline, the app playing a Monday. */}
      <section aria-labelledby="hero-title" data-tone="ink" className="relative isolate overflow-hidden text-white">
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[min(100svh,860px)]">
          <Image src="/site/hero-warehouse.jpg" alt="" fill priority sizes="100vw" className="object-cover object-[50%_60%]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,15,22,0.8)_0%,rgba(14,15,22,0.5)_40%,rgba(20,21,28,0.75)_75%,var(--s-ink)_100%)]" />
        </div>
        <div className="mx-auto flex w-full max-w-[1240px] flex-col items-start px-6 pt-36 text-left md:pt-48">
          {/* Linear's headline: each line arrives from a blur. */}
          <h1 id="hero-title" className="max-w-[16ch] text-[clamp(2.75rem,4.4vw+1rem,5.25rem)] leading-[1] font-[500] tracking-[-0.045em] text-balance">
            <span className="block animate-site-blur-in">{t("hero.line1")}</span>
            <span className="block animate-site-blur-in [animation-delay:120ms]">{t("hero.line2")}</span>
          </h1>
          <p className="mt-7 max-w-[46ch] animate-page-in text-[clamp(1.0625rem,0.4vw+1rem,1.25rem)] leading-relaxed text-white/80 [animation-delay:300ms]">{t("hero.lead")}</p>
          {/* Mercury's frosted email field with the button inside it, and the demo beside it. */}
          <div className="mt-10 flex w-full max-w-[34rem] animate-page-in flex-col items-stretch gap-3 [animation-delay:400ms] sm:flex-row sm:items-center">
            <form action={links.signUp} method="get" className="flex h-12 flex-1 items-center rounded-full border border-white/20 bg-white/12 p-1 pl-5 backdrop-blur-[20px] focus-within:border-white/50">
              <label htmlFor="hero-email" className="sr-only">
                {t("hero.emailLabel")}
              </label>
              <input id="hero-email" name="email" type="email" autoComplete="email" placeholder={t("hero.emailPlaceholder")} className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/60" />
              <button type="submit" className="inline-flex h-10 shrink-0 items-center rounded-full bg-[var(--s-accent)] px-5 text-[15px] font-medium text-white outline-none site-color-slow hover:bg-[var(--s-accent-2)] focus-visible:ring-2 focus-visible:ring-white/70">
                {t("hero.start")}
              </button>
            </form>
            <FrostButton href={secondary.href} className="justify-center">
              {secondary.label}
            </FrostButton>
          </div>
        </div>
        <div className="mt-16 animate-page-in px-4 pb-32 [animation-delay:550ms] sm:px-6 md:mt-20">
          <HeroPlayer demo={demo} />
        </div>
      </section>

        <Logos id="logos-title" caption={v("logos")} />

        <Statement id="statement-title" strong={v("statement.strong")} rest={v("statement.rest")} items={v.raw("benefits") as { title: string; body: string }[]} />

        <Keyline />
        <ProductSection id="intake-title" title={v("intake.title")} body={v("intake.body")} scene={<IntakeScene />} featuresLabel={v("featuresLabel")} features={features("intake")} />
        <Keyline />
        <WhatElse id="what-else-title" demo={demo} />
        <Keyline />
        <ProductSection id="rules-title" title={v("rules.title")} body={v("rules.body")} scene={<RulesScene demo={demo} days={days} />} featuresLabel={v("featuresLabel")} features={features("rules")} />
        <RuleBook id="rule-book-title" />
        <Keyline />
        <ProductSection id="approvals-title" title={v("approvals.title")} body={v("approvals.body")} scene={<ApprovalsScene />} featuresLabel={v("featuresLabel")} features={features("approvals")} />
        <Keyline />
        <Connections id="connections-title" text={v.raw("connections") as ConnectionsText} />
        <Keyline />
        <ProductSection
          id="files-title"
          title={v("files.title")}
          body={v("files.body")}
          scene={<FileScene demo={demo} l={{ workers: v("files.workers"), gross: v("files.gross"), theirs: v("files.theirs"), difference: v("files.difference") }} />}
          featuresLabel={v("featuresLabel")}
          features={features("files")}
        />
        <Keyline />

        <Changelog id="changelog-title" title={v("changelog.title")} entries={entries} />

        <Prefooter id="prefooter-title" title={v("prefooter")} primary={{ href: links.signUp, label: t("hero.start") }} secondary={secondary} />
      </div>
      <SiteFooter links={links} locale={locale} page="" />
    </ScrollStage>
  );
}
