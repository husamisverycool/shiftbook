// Pattern: docs/patterns/site.md — the product itself does the work on screen, on sample data, and the
// visitor sets it off (research: docs/research/website-visual-slice-aa.md). Mercury's photo hero with
// Cursor's and Granola's self-playing review window rising out of it (Check's flip-up, Linear's lit floor);
// Ramp's "Systems that never spoke" pinned scroll; Linear's two-circle method diagram beside Increase's
// checking card; Stripe's country tabs re-paying one week through the real rules engine; Stripe Connect's
// flow with the real export files; Stripe's bento with live pieces (Resend, Apple, Column, Rippling);
// Gusto's collage of the demo's own sheets; Mercury's figures, security trio and close; Stripe's rails.
import type { Metadata } from "next";
import Image from "next/image";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLink, FrostButton, Section, TwoTone } from "@/components/site/blocks";
import { BorderLight } from "@/components/site/border-light";
import { ApproveCard, MapCard, PhonesCard, SsnCard } from "@/components/site/home/bento";
import { Figs } from "@/components/site/home/figs";
import { LiveReview } from "@/components/site/home/live-review";
import { Monday } from "@/components/site/home/monday";
import { ReadTwice } from "@/components/site/home/read-twice";
import { StatePicker } from "@/components/site/home/state-picker";
import { WeekFlow } from "@/components/site/home/week-flow";
import { SiteFooter } from "@/components/site/site-footer";
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
  const links = await siteLinks(locale);
  const say = await getEngineSay();
  const format = await getFormatter();
  const secondary = links.demo ? { href: links.demo, label: t("hero.demo") } : { href: "#monday", label: t("hero.howItWorks") };
  const stateNames = Object.fromEntries(SITE_STATES.map((s) => [s, t(`state.${s}`)]));

  const weeks = SITE_STATES.map((s) => stateWeek(s));
  const linesOf = (w: (typeof weeks)[number]) => w.lines.map((l) => ({ label: t(`state.${l.type as "REG"}`), hours: hm(l.minutes), amount: usd(l.amountCents), explain: say({ say: l.say, explain: l.explain }) }));
  const dayLabels = [t("state.mon"), t("state.tue"), t("state.wed"), t("state.thu"), t("state.fri"), t("state.sat")];
  const illinois = weeks.find((w) => w.state === "IL")!;
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
  const today = new Date().toISOString().slice(0, 10);
  const updates = ruleUpdates(today);

  return (
    <>
      {/* 1. Hero: Mercury's photograph and email field; the product rising out of it, playing itself. */}
      <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-[var(--s-ink)] text-white">
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[min(100svh,860px)]">
          <Image src="/site/hero-warehouse.jpg" alt="" fill priority sizes="100vw" className="object-cover object-[50%_60%]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,15,22,0.8)_0%,rgba(14,15,22,0.5)_40%,rgba(20,21,28,0.75)_75%,var(--s-ink)_100%)]" />
        </div>
        <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center px-6 pt-36 text-center md:pt-44">
          {/* Linear's headline: each line arrives from a blur. */}
          <h1 id="hero-title" className="text-[clamp(2.5rem,3.4vw+1rem,4rem)] leading-[1.05] font-[450] tracking-[-0.03em] text-balance">
            <span className="block animate-site-blur-in">{t("hero.line1")}</span>
            <span className="block animate-site-blur-in [animation-delay:120ms]">{t("hero.line2")}</span>
          </h1>
          <p className="mt-6 max-w-[52ch] animate-page-in text-[clamp(1.0625rem,0.4vw+1rem,1.25rem)] leading-relaxed text-white/80 [animation-delay:300ms]">{t("hero.lead")}</p>
          {/* Mercury's frosted email field with the button inside it, and the demo beside it. */}
          <div className="mt-10 flex w-full max-w-[34rem] animate-page-in flex-col items-stretch gap-3 [animation-delay:400ms] sm:flex-row sm:items-center sm:justify-center">
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
          <LiveReview
            l={{
              title: t("window.title"),
              nav: t("window.nav"),
              inbox: t("window.inbox"),
              toCheck: t("window.toCheck"),
              thisWeek: t("window.thisWeek"),
              clients: t("window.clients"),
              files: t("window.files"),
              invoices: t("window.invoices"),
              heading: t("window.heading"),
              tabsLabel: t("window.tabsLabel"),
              hours: t("window.hours"),
              pay: t("window.pay"),
              file: t("window.file"),
              worker: t("window.worker"),
              source: t("window.source"),
              total: t("window.total"),
              photo: t("window.photo"),
              clock: t("window.clock"),
              text: t("window.text"),
              disagree: t("window.disagree"),
              keep: t("window.keep"),
              kept: t("window.kept"),
              payTitle: t("window.payTitle"),
              weekTotal: t("window.weekTotal"),
              fileReady: t("window.fileReady"),
              docked: t("window.docked"),
              sample: t("window.sample"),
              pause: t("window.pause"),
              play: t("window.play"),
              chips: [t("window.chip1"), t("window.chip2"), t("window.chip3"), t("window.chip4")],
            }}
            lines={linesOf(illinois)}
            total={usd(illinois.totalCents)}
            file={{ filename: files[0]!.filename, preview: files[0]!.preview }}
          />
        </div>
      </section>

      {/* 2. Linear's statement and its three figures, on the hero's dark band. */}
      <section aria-labelledby="figs-title" className="bg-[var(--s-ink)] px-6 pb-28 md:pb-36">
        <div className="mx-auto w-full max-w-[1200px]">
          <TwoTone id="figs-title" tone="dark" strong={t("figs.title")} muted={t("figs.titleMuted")} className="mb-14 max-w-[24em] text-[clamp(1.75rem,2vw+1rem,2.75rem)]" />
          <Figs items={([1, 2, 3] as const).map((n) => ({ label: t(`figs.f${n}Label`), title: t(`figs.f${n}Title`), body: t(`figs.f${n}`) }))} />
        </div>
      </section>

      <div className="relative">
        <Rails />
        {/* 3. Monday at an agency (Ramp's pinned tangle-to-order). */}
        <section id="monday" aria-labelledby="monday-title" className="scroll-mt-16">
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

        {/* 4. Read twice (Linear's method diagram, Increase's checking card). */}
        <Section labelledBy="twice-title" className="border-t border-[var(--s-line)]">
          <TwoTone id="twice-title" strong={t("twice.title")} muted={t("twice.titleMuted")} className="mb-14" />
          <ReadTwice
            l={{
              a: t("twice.a"),
              b: t("twice.b"),
              agree: t("twice.agree"),
              differ: t("twice.differ"),
              cardTitle: t("twice.cardTitle"),
              checking: t("twice.checking"),
              ok: t("twice.ok"),
              needs: t("twice.needs"),
              replay: t("twice.replay"),
              fields: [
                { label: t("twice.name"), a: "Bob Jones", b: "Bob Jones" },
                { label: t("twice.date"), a: "10/6/26", b: "10/6/26" },
                { label: t("twice.in"), a: "3:00", b: "3:00" },
                { label: t("twice.out"), a: "11:30", b: "11:30" },
                { label: t("twice.lunch"), a: "30", b: "30" },
                { label: t("twice.total"), a: "8", b: "6" },
              ],
            }}
          />
        </Section>

        {/* 5. Pick a state (Stripe's country tabs; the real rules engine). */}
        <Section labelledBy="state-title" className="border-t border-[var(--s-line)]">
          <TwoTone id="state-title" strong={t("state.title")} muted={t("state.titleMuted")} className="mb-10" />
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
          <p className="mt-6 text-[14px] text-[var(--s-muted)]">{t("state.other")}</p>
        </Section>
      </div>

      {/* 6. Where the week goes (Stripe Connect's flow and file panel), on the dark band. */}
      <section aria-labelledby="flow-title" className="bg-[var(--s-ink)] px-6 py-28 text-[var(--s-dtext)] md:py-36">
        <div className="mx-auto w-full max-w-[1200px]">
          <TwoTone id="flow-title" tone="dark" strong={t("flow.title")} muted={t("flow.titleMuted")} className="mb-16" />
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
        </div>
      </section>

      <div className="relative">
        <Rails />
        {/* 7. The bento of live pieces (Stripe's cards with the border light). */}
        <Section labelledBy="bento-title">
          <TwoTone id="bento-title" strong={t("bento.title")} muted={t("bento.titleMuted")} className="mb-12" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <BorderLight className="lg:col-span-2" inner="flex flex-col gap-6 p-6">
              <div>
                <h3 className="text-[17px] font-medium">{t("bento.approveTitle")}</h3>
                <p className="mt-1 max-w-[52ch] text-[14px] leading-relaxed text-[var(--s-muted)]">{t("bento.approveBody")}</p>
              </div>
              <ApproveCard l={{ approve: t("bento.approve"), reset: t("bento.reset"), events: [t("bento.ev1"), t("bento.ev2"), t("bento.ev3"), t("bento.ev4")], now: t("bento.now") }} />
            </BorderLight>
            <BorderLight inner="flex flex-col gap-5 p-6">
              <div>
                <h3 className="text-[17px] font-medium">{t("bento.updatesTitle")}</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-[var(--s-muted)]">{t("bento.updatesBody")}</p>
              </div>
              {/* Linear's changelog line with Ramp's live counter. */}
              <ol className="relative flex flex-col gap-4 pl-5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[4px] before:w-px before:bg-[var(--s-line)]">
                {updates.map((u, i) => (
                  <li key={`${u.state}-${u.scope}-${u.effectiveFrom}`} title={u.citation} className="relative">
                    <span aria-hidden className={cn("absolute top-1.5 -left-5 size-[9px] rounded-full ring-2 ring-white", u.daysUntil > 0 ? "bg-[var(--s-accent)]" : "bg-[var(--s-muted)]/40", i === 0 && "shadow-[0_0_0_4px_color-mix(in_oklch,var(--s-accent)_20%,transparent)]")} />
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
                      <span className="font-medium">{t("bento.minWage", { state: u.scope ?? stateNames[u.state]!, rate: `${usd(u.rateCents)}/h` })}</span>
                      <span className={cn("text-[12px] tabular-nums", u.daysUntil > 0 ? "font-medium text-[var(--s-accent)]" : "text-[var(--s-muted)]")}>{u.daysUntil > 0 ? t("bento.inDays", { days: u.daysUntil }) : t("bento.inForce")}</span>
                    </p>
                    <p className="text-[12px] text-[var(--s-muted)]">{format.dateTime(new Date(`${u.effectiveFrom}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}</p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--s-muted)]/80">{u.citation.split(" — ")[0]}</p>
                  </li>
                ))}
              </ol>
            </BorderLight>
            <BorderLight inner="flex flex-col gap-4 p-6">
              <div>
                <h3 className="text-[17px] font-medium">{t("bento.phonesTitle")}</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-[var(--s-muted)]">{t("bento.phonesBody")}</p>
              </div>
              <PhonesCard label={t("bento.langLabel")} initial={locale === "es" ? "es" : "en"} />
            </BorderLight>
            <BorderLight inner="flex flex-col gap-5 p-6">
              <div>
                <h3 className="text-[17px] font-medium">{t("bento.mapTitle")}</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-[var(--s-muted)]">{t("bento.mapBody")}</p>
              </div>
              <MapCard covered={SITE_STATES} label={t("bento.mapLabel")} names={stateNames} />
            </BorderLight>
            <BorderLight inner="flex flex-col gap-5 p-6">
              <div>
                <h3 className="text-[17px] font-medium">{t("bento.ssnTitle")}</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-[var(--s-muted)]">{t("bento.ssnBody")}</p>
              </div>
              <SsnCard l={{ reveal: t("bento.reveal"), why: t("bento.why"), w4: t("bento.w4"), i9: t("bento.i9"), revealed: t.raw("bento.revealed") as string, hide: t("bento.hide"), log: t("bento.log"), past: [t("bento.past1"), t("bento.past2")] }} />
            </BorderLight>
          </div>
        </Section>

      </div>

      {/* 8. Dark band: Mercury's row of figures, then its security trio with abstract renders. */}
      <section aria-labelledby="security-title" className="overflow-x-clip bg-[var(--s-ink)] px-6 pt-20 pb-28 text-[var(--s-dtext)] md:pb-36">
        <div className="mx-auto w-full max-w-[1200px]">
          <h2 className="sr-only">{t("stats.label")}</h2>
          <dl className="grid grid-cols-2 gap-y-10 md:grid-cols-4">
            {([1, 2, 3, 4] as const).map((n) => (
              <div key={n} className={cn("flex flex-col-reverse items-center gap-2 px-4 text-center", n > 1 && "md:border-l md:border-[var(--s-dline)]", n % 2 === 0 && "border-l border-[var(--s-dline)] md:border-l")}>
                <dt className="max-w-[18ch] text-[14px] leading-snug text-[var(--s-dmuted)]">{t(`stats.s${n}Label`)}</dt>
                <dd className="text-[clamp(2.75rem,3vw+1.5rem,4rem)] leading-none font-[450] tracking-[-0.04em] text-white tabular-nums">{t(`stats.s${n}`)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-24 border-t border-[var(--s-dline)] pt-10">
            <TwoTone id="security-title" tone="dark" strong={t("security.title")} muted={t("security.titleMuted")} className="text-[clamp(1.5rem,1vw+1.1rem,2rem)]" />
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Encrypted: rings around a frosted last-four pill. */}
            <div className="flex flex-col gap-4">
              <div className="site-grain site-grain-light relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-[var(--s-ink-3)]">
                <span aria-hidden className="absolute inset-0 bg-[repeating-radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.16)_0_1px,transparent_1.5px_16px)] [mask-image:radial-gradient(circle_at_50%_50%,#000_10%,transparent_65%)]" />
                <span className="relative rounded-full border border-white/25 bg-white/10 px-5 py-2.5 font-mono text-[15px] tracking-[0.08em] text-white shadow-[0_0_60px_rgba(255,255,255,0.18)] backdrop-blur-md">•••-••-4821</span>
              </div>
              <h3 className="text-[15px] font-medium text-[var(--s-dtext)]">{t("security.c1Title")}</h3>
              <p className="-mt-3 text-[15px] leading-relaxed text-[var(--s-dmuted)]">{t("security.c1")}</p>
            </div>
            {/* Blacked out: a glowing page with one line covered. */}
            <div className="flex flex-col gap-4">
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
            <div className="flex flex-col gap-4">
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

          {/* 9. Mercury's centred close with its two pills, and two cards with a round arrow. */}
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

      <SiteFooter links={links} locale={locale} page="" />
    </>
  );
}
