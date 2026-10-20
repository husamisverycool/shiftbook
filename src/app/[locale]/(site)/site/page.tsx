// Pattern: docs/patterns/site.md — fourth design, each part from a software company's home page: Mercury's
// photograph under Linear's left-set headline and app frame with its floating window; Stripe's row of
// names; Linear's statement and FIG drawings; Stripe's bento of live product pieces on fields of colour,
// two of them standing on paintings as Cursor's do; Ramp's pinned "Monday" on its dot grid; Stripe's
// indigo band with its burst of light; Linear's dark chapters with page-wide product scenes and feature
// rows (the real rules engine paying one week in four states; the dated rule changes; Stripe Connect's
// flow with the real export files); Mercury's security trio; Stripe's colour band at the close.
import type { Metadata } from "next";
import Image from "next/image";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLink, FrostButton, Section, TwoTone } from "@/components/site/blocks";
import { BorderLight } from "@/components/site/border-light";
import { ApproveCard, MapCard, PhonesCard } from "@/components/site/home/bento";
import { Chapter } from "@/components/site/home/chapter";
import { IndigoBand } from "@/components/site/home/indigo-band";
import { ArtPanel, FileMock, GradientPanel, InvoicesMock, PayLineMock, ReadTwiceMock } from "@/components/site/home/showcase";
import { Figs } from "@/components/site/home/figs";
import { Monday } from "@/components/site/home/monday";
import { StatePicker } from "@/components/site/home/state-picker";
import { WeekFlow } from "@/components/site/home/week-flow";
import { SiteFooter } from "@/components/site/site-footer";
import { ScrollStage, ToneGroup } from "@/components/site/scroll";
import type { Demo } from "@/components/site/app/data";
import { HeroPlayer } from "@/components/site/app/hero-player";
import { ProductTour } from "@/components/site/app/tour";
import { getEngineSay } from "@/components/shiftbook/engine-say-server";
import { cn } from "@/lib/utils";
import { siteLinks } from "@/server/site/context";
import { ruleUpdates } from "@/server/site/rule-updates";
import { siteSampleFiles } from "@/server/site/sample-files";
import { SITE_STATES, stateWeek, weekByDay } from "@/server/site/state-week";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site.meta" });
  return { title: t("homeTitle"), description: t("homeDescription"), openGraph: { title: t("homeTitle"), description: t("homeDescription"), siteName: "Tabulado", images: ["/site/hero-warehouse.jpg"] } };
}

const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

/** Stripe's page rails: two hairlines down the content column, so the light bands read as one sheet. */
function Rails() {
  return <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-full max-w-[1248px] -translate-x-1/2 border-x border-[var(--s-line)] md:block" />;
}

export default async function SiteHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("site.home");
  const tApp = await getTranslations("site.app");
  const links = await siteLinks(locale);
  const say = await getEngineSay();
  const format = await getFormatter();
  const secondary = links.demo ? { href: links.demo, label: t("hero.demo") } : { href: "#monday", label: t("hero.howItWorks") };
  const stateNames = Object.fromEntries(SITE_STATES.map((s) => [s, t(`state.${s}`)]));

  const weeks = SITE_STATES.map((s) => stateWeek(s));
  const linesOf = (w: (typeof weeks)[number]) => w.lines.map((l) => ({ label: t(`state.${l.type as "REG"}`), hours: hm(l.minutes), amount: usd(l.amountCents), explain: say({ say: l.say, explain: l.explain }) }));
  const dayLabels = [t("state.mon"), t("state.tue"), t("state.wed"), t("state.thu"), t("state.fri"), t("state.sat")];
  const illinois = weeks.find((w) => w.state === "IL")!;
  const ilOvertime = linesOf(illinois).find((l, i) => illinois.lines[i]!.type === "OT")!;
  const files = siteSampleFiles().map((f) => ({
    format: f.format,
    system: f.system,
    filename: f.filename,
    preview: f.preview,
    workers: String(f.controlTotals.workers),
    gross: usd(f.controlTotals.grossCents),
    theirs: usd(f.controlTotals.payrollSystemGrossCents ?? f.controlTotals.grossCents),
    difference: usd(f.controlTotals.payrollSystemDifferenceCents ?? 0),
    // The exporters' notes for the payroll clerk are written in English.
    note: locale === "en" ? (f.notes.at(-1) ?? null) : null,
  }));
  const demo: Demo = { lines: linesOf(illinois), total: usd(illinois.totalCents), files: files.map(({ system, filename, preview, workers, gross, theirs, difference }) => ({ system, filename, preview, workers, gross, theirs, difference })) };
  const today = new Date().toISOString().slice(0, 10);
  const updates = ruleUpdates(today);

  return (
    <ScrollStage>
      <ToneGroup tones={{ ink: "#14151c", deep: "#0d1020" }}>
      {/* 1. Hero: Mercury's photograph, Linear's left-set headline and app frame with its floating window. */}
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

      {/* 2. Stripe's logo row, as the payroll systems' names, on the hero's band. */}
      <section aria-labelledby="systems-strip" className="px-6 pb-24">
        <div className="mx-auto w-full max-w-[1240px]">
          <h2 id="systems-strip" className="mb-6 text-center text-[13px] text-[var(--s-dmuted)]">
            {t("v4.systemsStrip")}
          </h2>
          <ul className="grid grid-cols-2 border-t border-l border-white/[0.08] sm:grid-cols-3 lg:grid-cols-6">
            {[
              { n: "Gusto", c: "text-[22px] font-semibold tracking-[-0.04em] lowercase" },
              { n: "ADP Workforce Now", c: "text-[15px] font-bold tracking-[-0.01em]" },
              { n: "RUN", c: "text-[20px] font-black tracking-[0.12em]" },
              { n: "QuickBooks", c: "text-[19px] font-semibold tracking-[-0.03em]" },
              { n: "Paychex Flex", c: "text-[18px] font-medium tracking-[-0.02em] italic" },
              { n: "Paylocity", c: "text-[19px] font-semibold tracking-[-0.035em]" },
            ].map((x) => (
              <li key={x.n} className={cn("flex h-24 items-center justify-center border-r border-b border-white/[0.08] px-4 text-white/55 site-color-slow hover:text-white", x.c)}>
                {x.n}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 3. Linear's statement and its three figures, on the hero's dark band. */}
      <section aria-labelledby="figs-title" data-tone="deep" className="px-6 pb-28 md:pb-36">
        <div className="mx-auto w-full max-w-[1200px]">
          <TwoTone id="figs-title" tone="dark" strong={t("figs.title")} muted={t("figs.titleMuted")} className="site-reveal mb-14 max-w-[24em] text-[clamp(1.75rem,2vw+1rem,2.75rem)]" />
          <Figs items={([1, 2, 3] as const).map((n) => ({ label: t(`figs.f${n}Label`), title: t(`figs.f${n}Title`), body: t(`figs.f${n}`) }))} />
        </div>
      </section>

      </ToneGroup>

      <ToneGroup tones={{ paper: "#f6f5f2", tour: "#eceef6", bento: "#f6f5f2" }}>
        <Rails />
        {/* 4. Monday at an agency (Ramp's pinned tangle-to-order). */}
        <section id="monday" data-tone="paper" aria-labelledby="monday-title" className="scroll-mt-16">
          <h2 id="monday-title" className="sr-only">
            {t("monday.title")}
          </h2>
          <Monday
            heading={<TwoTone as="h3" strong={t("monday.title")} muted={t("monday.titleMuted")} className="text-[clamp(1.5rem,1vw+1.1rem,2rem)]" />}
            l={{
              label: t("monday.label"),
              call: t("monday.call"),
              callText: t("monday.callText"),
              note: t("monday.note"),
              sheet: t("monday.sheet"),
              text: t("monday.text"),
              textFrom: t("monday.textFrom"),
              clock: t("monday.clock"),
              email: t("monday.email"),
              emailFrom: t("monday.emailFrom"),
              poster: t("monday.poster"),
              due: t("monday.due"),
              weekTitle: t("monday.weekTitle"),
              ready: t("monday.ready"),
              fromPhoto: t("monday.fromPhoto"),
              fromText: t("monday.fromText"),
              disputed: t("monday.disputed"),
              fromClock: t("monday.fromClock"),
              fileReady: t("monday.fileReady"),
              worker: t("monday.worker"),
              total: t("monday.total"),
              source: t("monday.source"),
              before: t("monday.before"),
              after: t("monday.after"),
              days: [t("state.mon"), t("state.tue"), t("state.wed"), t("state.thu"), t("state.fri"), t("state.sat"), t("monday.sun")],
            }}
          />
        </section>

        {/* 5. Attio's pinned product tour: the week's six screens. */}
        <section id="tour" data-tone="tour" aria-labelledby="tour-title" className="relative scroll-mt-16 pt-24 md:pt-32">
          <div className="mx-auto w-full max-w-[1240px] px-6">
            <TwoTone id="tour-title" strong={tApp("tour.title")} muted={tApp("tour.titleMuted")} className="site-reveal max-w-[20em]" />
          </div>
          <div className="mt-12 pb-24 lg:mt-0 lg:pb-0">
            <ProductTour demo={demo} />
          </div>
        </section>

        {/* 6. Stripe's bento: each card a live piece of the product on a field of colour or, as on Cursor's
            page, standing on a painting. */}
        <Section labelledBy="bento-title" className="relative" inner="relative">
          <span data-tone="bento" aria-hidden className="absolute inset-x-0 top-1/3 h-px" />
          <TwoTone id="bento-title" strong={t("v4.bentoTitle")} muted={t("v4.bentoTitleMuted")} className="site-reveal mb-12 max-w-[22em]" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <BorderLight className="site-reveal [--reveal-delay:0ms] lg:col-span-2" inner="flex h-full flex-col p-2">
              <p className="px-4 pt-4 pb-5 text-[17px] leading-snug font-medium tracking-[-0.01em]">
                {t("v4.b1")} <span className="font-normal text-[var(--s-muted)]">{t("v4.b1m")}</span>
              </p>
              <ArtPanel art="poppies" focus="50% 40%" className="flex min-h-[380px] flex-1 items-center justify-center p-6 sm:p-10">
                <ReadTwiceMock l={{ title: t("v4.readTitle"), a: t("twice.a"), b: t("twice.b"), needs: t("twice.needs"), ok: t("twice.ok"), keep: tApp("week.keepShort"), fields: [{ label: t("twice.name"), a: "Bob Jones", b: "Bob Jones" }, { label: t("twice.in"), a: "3:00", b: "3:00" }, { label: t("twice.out"), a: "11:30", b: "11:30" }, { label: t("twice.lunch"), a: "30", b: "30" }, { label: t("twice.total"), a: "8", b: "6" }] }} />
              </ArtPanel>
            </BorderLight>
            <BorderLight className="site-reveal [--reveal-delay:90ms]" inner="flex h-full flex-col p-2">
              <p className="px-4 pt-4 pb-5 text-[17px] leading-snug font-medium tracking-[-0.01em]">
                {t("v4.b2")} <span className="font-normal text-[var(--s-muted)]">{t("v4.b2m")}</span>
              </p>
              <GradientPanel tone="dawn" className="flex min-h-[380px] flex-1 items-center justify-center p-6">
                <PayLineMock l={{ title: t("v4.payTitle"), label: ilOvertime.label, hours: ilOvertime.hours, amount: ilOvertime.amount, explain: ilOvertime.explain, law: "Illinois Minimum Wage Law, 820 ILCS 105/4a(1) · Fair Labor Standards Act, 29 U.S.C. § 207(a)(1)" }} />
              </GradientPanel>
            </BorderLight>
            <BorderLight className="site-reveal [--reveal-delay:180ms]" inner="flex h-full flex-col p-2">
              <p className="px-4 pt-4 pb-5 text-[17px] leading-snug font-medium tracking-[-0.01em]">
                {t("v4.b3")} <span className="font-normal text-[var(--s-muted)]">{t("v4.b3m")}</span>
              </p>
              <GradientPanel tone="ink" className="flex min-h-[340px] flex-1 items-center justify-center p-6">
                <FileMock filename={files[0]!.filename} lines={files[0]!.preview} />
              </GradientPanel>
            </BorderLight>
            <BorderLight className="site-reveal [--reveal-delay:0ms]" inner="flex h-full flex-col p-2">
              <p className="px-4 pt-4 pb-5 text-[17px] leading-snug font-medium tracking-[-0.01em]">
                {t("v4.b4")} <span className="font-normal text-[var(--s-muted)]">{t("v4.b4m")}</span>
              </p>
              <ArtPanel art="poplars" focus="50% 30%" className="flex min-h-[340px] flex-1 items-center justify-center p-6">
                <InvoicesMock l={{ invoice: t("v4.invoice"), due: t("v4.due"), backup: t("v4.backup") }} />
              </ArtPanel>
            </BorderLight>
            <BorderLight className="site-reveal [--reveal-delay:90ms]" inner="flex h-full flex-col p-2">
              <p className="px-4 pt-4 pb-5 text-[17px] leading-snug font-medium tracking-[-0.01em]">
                {t("v4.b5")} <span className="font-normal text-[var(--s-muted)]">{t("v4.b5m")}</span>
              </p>
              <GradientPanel tone="dusk" className="flex min-h-[340px] flex-1 items-center p-5 [&_.approve-row]:flex-col">
                <div className="approve-row w-full rounded-xl bg-white/90 p-4 shadow-[0_24px_50px_-20px_rgba(20,21,28,0.45)] backdrop-blur">
                  <ApproveCard l={{ approve: t("bento.approve"), reset: t("bento.reset"), events: [t("bento.ev1"), t("bento.ev2"), t("bento.ev3"), t("bento.ev4")], now: t("bento.now") }} />
                </div>
              </GradientPanel>
            </BorderLight>
            <BorderLight className="site-reveal [--reveal-delay:180ms] lg:col-span-2" inner="flex h-full flex-col p-2">
              <p className="px-4 pt-4 pb-5 text-[17px] leading-snug font-medium tracking-[-0.01em]">
                {t("v4.b6")} <span className="font-normal text-[var(--s-muted)]">{t("v4.b6m")}</span>
              </p>
              <ArtPanel art="field" focus="50% 70%" className="flex min-h-[400px] flex-1 flex-col p-6">
                <PhonesCard label={t("bento.langLabel")} initial={locale === "es" ? "es" : "en"} />
              </ArtPanel>
            </BorderLight>
            <BorderLight className="site-reveal [--reveal-delay:0ms]" inner="flex h-full flex-col p-2">
              <p className="px-4 pt-4 pb-5 text-[17px] leading-snug font-medium tracking-[-0.01em]">
                {t("v4.b7")} <span className="font-normal text-[var(--s-muted)]">{t("v4.b7m")}</span>
              </p>
              <div className="flex min-h-[400px] flex-1 items-center rounded-xl bg-[var(--s-paper)] p-6">
                <MapCard covered={SITE_STATES} label={t("bento.mapLabel")} names={stateNames} />
              </div>
            </BorderLight>
          </div>
        </Section>

      </ToneGroup>

      <ToneGroup tones={{ indigo: "#1b1f5e", night: "#08090c", flow: "#061217", ink: "#14151c" }}>
      {/* 7. Stripe's indigo band: four product facts and the burst of light. */}
      <IndigoBand title={t("v4.indigoTitle")} titleLine2={t("v4.indigoTitle2")} label={t("stats.label")} stats={([1, 2, 3, 4] as const).map((n) => ({ value: t(`stats.s${n}`), label: t(`stats.s${n}Label`) }))} />

      {/* 8. Linear's chapter: the same week paid in four states, then the dated rule changes. */}
      <Chapter tone="night" id="state-title" title={t("state.title")} body={t("state.titleMuted")} link={{ href: links.pricing, label: t("v4.stateLink") }} featuresLabel={t("v4.featuresLabel")} features={(t.raw("v4.stateF") as [string, string][]).map(([name, text]) => ({ name, text }))}>
        <GradientPanel tone="ink" className="p-3 sm:p-6 md:p-10">
            <StatePicker
              views={weeks.map((w) => ({
                state: w.state,
                name: t(`state.${w.state}`),
                total: usd(w.totalCents),
                lines: linesOf(w),
                days: weekByDay(w).map((d, i) => ({ label: dayLabels[i]!, regular: d.regular, overtime: d.overtime, double: d.double, sentHome: d.sentHome })),
                daily: w.state === "CA",
              }))}
              l={{
                tabsLabel: t("state.tabsLabel"),
                chartLabel: t("state.chartLabel"),
                regular: t("state.regular"),
                overtime: t("state.overtime"),
                double: t("state.double"),
                sentHome: t("state.sentHome"),
                daily8: t("state.daily8"),
                daily12: t("state.daily12"),
                weekly: t("state.weekly"),
                sentNote: t("state.sentNote"),
                total: t("state.total"),
                who: t("state.who"),
                why: t("state.why"),
              }}
            />
          <p className="mt-6 text-[13px] text-white/60">{t("state.other")}</p>
        </GradientPanel>
        <div className="mt-16 grid grid-cols-1 gap-10 md:grid-cols-[1fr_2fr]">
          <div>
            <h3 className="text-[17px] font-medium text-white">{t("bento.updatesTitle")}</h3>
            <p className="mt-2 max-w-[32ch] text-[14px] leading-relaxed text-[var(--s-dmuted)]">{t("v4.updatesBody2")}</p>
          </div>
          {/* Linear's changelog: a line with a dot per change, the next one lit. */}
          <ol className="grid grid-cols-1 gap-8 border-t border-white/10 pt-8 sm:grid-cols-2 lg:grid-cols-4">
            {updates.map((u, i) => (
              <li key={`${u.state}-${u.scope}-${u.effectiveFrom}`} title={u.citation} className="relative">
                <span aria-hidden className={cn("absolute -top-[37px] left-0 size-[9px] rounded-full", u.daysUntil > 0 ? "bg-[var(--s-accent-soft)] shadow-[0_0_12px_var(--s-accent-soft)]" : "bg-white/25", i === 0 && "ring-4 ring-[var(--s-accent)]/30")} />
                <p className="text-[14px] font-medium text-white">{t("bento.minWage", { state: u.scope ?? stateNames[u.state]!, rate: `${usd(u.rateCents)}/h` })}</p>
                <p className="mt-1 text-[13px] leading-snug text-[var(--s-dmuted)]">{u.citation.split(" — ")[0]}</p>
                <p className={cn("mt-2 font-mono text-[11px] uppercase", u.daysUntil > 0 ? "text-[var(--s-accent-soft)]" : "text-white/40")}>
                  {format.dateTime(new Date(`${u.effectiveFrom}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })} · {u.daysUntil > 0 ? t("bento.inDays", { days: u.daysUntil }) : t("bento.inForce")}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </Chapter>

      {/* 9. Linear's chapter: where the week goes (Stripe Connect's flow and the real files). */}
      <Chapter tone="flow" id="flow-title" title={t("flow.title")} body={t("flow.titleMuted")} featuresLabel={t("v4.featuresLabel")} features={(t.raw("v4.flowF") as [string, string][]).map(([name, text]) => ({ name, text }))}>
        <WeekFlow
            files={files}
            l={{
              sheets: t("flow.sheets"),
              tabulado: t("flow.tabulado"),
              tabuladoNote: t("flow.tabuladoNote"),
              file: t("flow.file"),
              provider: t("flow.provider"),
              invoices: t("flow.invoices"),
              approve: t("flow.approve"),
              bank: t("flow.bank"),
              never: t("flow.never"),
              tabsLabel: t("flow.tabsLabel"),
              fileNote: t("flow.fileNote"),
              workers: t("flow.workers"),
              gross: t("flow.gross"),
              theirs: t.raw("flow.theirs") as string,
              difference: t("flow.difference"),
            }}
          />
      </Chapter>

      {/* 10. Dark band: Mercury's security trio with abstract renders. */}
      <section aria-labelledby="security-title" data-tone="ink" className="overflow-x-clip px-6 pt-16 pb-28 text-[var(--s-dtext)] md:pb-36">
        <div className="mx-auto w-full max-w-[1200px]">
          <div className="pt-10">
            <TwoTone id="security-title" tone="dark" strong={t("security.title")} muted={t("security.titleMuted")} className="text-[clamp(1.5rem,1vw+1.1rem,2rem)]" />
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Encrypted: rings around a frosted last-four pill. */}
            <div className="site-reveal flex flex-col gap-4">
              <div className="site-grain site-grain-light relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-[var(--s-ink-3)]">
                <span aria-hidden className="absolute inset-0 bg-[repeating-radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.16)_0_1px,transparent_1.5px_16px)] [mask-image:radial-gradient(circle_at_50%_50%,#000_10%,transparent_65%)]" />
                <span className="relative rounded-full border border-white/25 bg-white/10 px-5 py-2.5 font-mono text-[15px] tracking-[0.08em] text-white shadow-[0_0_60px_rgba(255,255,255,0.18)] backdrop-blur-md">•••-••-4821</span>
              </div>
              <h3 className="text-[15px] font-medium text-[var(--s-dtext)]">{t("security.c1Title")}</h3>
              <p className="-mt-3 text-[15px] leading-relaxed text-[var(--s-dmuted)]">{t("security.c1")}</p>
            </div>
            {/* Blacked out: a glowing page with one line covered. */}
            <div className="site-reveal flex flex-col gap-4 [--reveal-delay:100ms]">
              <div className="site-grain site-grain-light relative flex aspect-[4/3] items-end justify-center overflow-hidden rounded-2xl bg-[var(--s-ink-3)]">
                <div className="flex h-[78%] w-[58%] flex-col gap-3 rounded-t-xl bg-[#f3f2ef] p-5 shadow-[0_0_80px_rgba(255,255,255,0.22)]">
                  <span className="h-2 w-[60%] rounded-full bg-black/15" />
                  <span className="h-2 w-[85%] rounded-full bg-black/10" />
                  <span className="h-4 w-[75%] rounded-sm bg-[var(--s-ink)]" />
                  <span className="h-2 w-[70%] rounded-full bg-black/10" />
                  <span className="h-4 w-[45%] rounded-sm bg-[var(--s-ink)]" />
                  <span className="h-2 w-[80%] rounded-full bg-black/10" />
                </div>
              </div>
              <h3 className="text-[15px] font-medium text-[var(--s-dtext)]">{t("security.c2Title")}</h3>
              <p className="-mt-3 text-[15px] leading-relaxed text-[var(--s-dmuted)]">{t("security.c2")}</p>
            </div>
            {/* Logged: Mercury's glossy pills, as entries in a log. */}
            <div className="site-reveal flex flex-col gap-4 [--reveal-delay:200ms]">
              <div className="site-grain site-grain-light relative flex aspect-[4/3] flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl bg-[var(--s-ink-3)]">
                {["w-[70%]", "w-[58%] opacity-60", "w-[46%] opacity-30"].map((cls) => (
                  <span key={cls} className={cn("flex h-11 items-center gap-3 rounded-full bg-[linear-gradient(180deg,#f4f3ef,#d9d7d0)] px-1.5 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6),inset_0_1px_0_white]", cls)}>
                    <span className="size-8 shrink-0 rounded-full bg-[linear-gradient(180deg,#ffffff,#cfcdc6)] shadow-[0_2px_6px_rgba(0,0,0,0.25)]" />
                    <span className="h-1.5 w-1/2 rounded-full bg-black/15" />
                  </span>
                ))}
              </div>
              <h3 className="text-[15px] font-medium text-[var(--s-dtext)]">{t("security.c3Title")}</h3>
              <p className="-mt-3 text-[15px] leading-relaxed text-[var(--s-dmuted)]">{t("security.c3")}</p>
            </div>
          </div>
          <ArrowLink href={links.security} tone="dark" className="mt-12">
            {t("security.link")}
          </ArrowLink>

          {/* 11. Mercury's centred close with its two pills, and two cards with a round arrow. */}
          <div className="relative isolate mt-36 flex flex-col items-center py-28 text-center">
            {/* Stripe's skewed band of drifting colour, in Tabulado's blue, amber and mint. */}
            <div aria-hidden className="absolute inset-x-[-50vw] inset-y-0 -z-10 -skew-y-6 overflow-hidden">
              <div className="absolute inset-0 bg-[var(--s-ink-2)]" />
              <span className="absolute top-[-30%] left-[20%] size-[60vw] max-w-[900px] rounded-full bg-[var(--s-accent)] opacity-70 blur-[110px] animate-site-drift-a" />
              <span className="absolute top-[10%] left-[48%] size-[42vw] max-w-[640px] rounded-full bg-[#f2a65a] opacity-45 blur-[110px] animate-site-drift-b" />
              <span className="absolute top-[30%] left-[30%] size-[36vw] max-w-[520px] rounded-full bg-[#7fd1b9] opacity-35 blur-[110px] animate-site-drift-c" />
              <div className="site-grain site-grain-light absolute inset-0" />
            </div>
            <h2 className="text-[clamp(2rem,2.8vw+1rem,3.5rem)] leading-[1.08] font-[450] tracking-[-0.035em] text-balance text-white">
              {t("closing.title")}
              <br />
              {t("closing.titleLine2")}
            </h2>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <a href={links.signUp} className="inline-flex h-12 items-center rounded-full bg-[var(--s-accent)] px-6 text-[15px] font-medium text-white outline-none site-color-slow hover:bg-[var(--s-accent-2)] focus-visible:ring-2 focus-visible:ring-white/70">
                {t("hero.start")}
              </a>
              <FrostButton href={secondary.href}>{secondary.label}</FrostButton>
            </div>
          </div>
          <div className="mx-auto mt-20 grid max-w-[52rem] grid-cols-1 gap-6 sm:grid-cols-2">
            {[
              { tag: t("closing.agencyTag"), text: t("closing.agency"), link: t("closing.agencyLink"), href: links.signUp, local: false },
              { tag: t("closing.toolTag"), text: t("closing.tool"), link: t("closing.toolLink"), href: links.checker, local: false },
            ].map((c) => (
              <a key={c.tag} href={c.href} className="group/card flex min-h-56 flex-col rounded-2xl bg-[var(--s-ink-2)] p-6 outline-none site-color-slow hover:bg-[var(--s-ink-3)] focus-visible:ring-2 focus-visible:ring-white/50">
                <span className="text-[13px] text-[var(--s-dmuted)]">{c.tag}</span>
                <span className="mt-3 text-[22px] leading-snug font-[450] tracking-[-0.02em] text-white">{c.text}</span>
                <span className="mt-auto flex items-center gap-3 pt-8 text-[14px] text-[var(--s-dtext)]">
                  <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-white/10 motion-state group-hover/card:bg-white group-hover/card:text-[var(--s-text)]">
                    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </span>
                  {c.link}
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      </ToneGroup>

      <SiteFooter links={links} locale={locale} page="" />
    </ScrollStage>
  );
}
