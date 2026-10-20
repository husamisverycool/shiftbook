// Pattern: docs/patterns/site.md — sixth design: one system (Linear's tokens, Attio's sheet) and every part
// from its best reference. Hero unchanged (owner). Then Attio's payroll-system tiles and scroll-lit
// statement; Attio's pinned tour; Linear /build's two plates; Apple's "Take a closer look" on one pay line;
// Ramp's dot map with Linear's rule contents and changelog; Apple's highlights; Stripe's integration hub and
// Stripe Tax's file; Mercury's figures across the seam and its security objects with Vercel's facts row;
// Linear's tech specs; Linear's close with Stripe's columns; Mercury's footer with numbered notes.
import type { Metadata } from "next";
import Image from "next/image";
import { Clock, Wallet } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { FrostButton } from "@/components/site/blocks";
import { SiteFooter } from "@/components/site/site-footer";
import { ScrollStage, ToneGroup } from "@/components/site/scroll";
import type { Demo } from "@/components/site/app/data";
import { HeroPlayer } from "@/components/site/app/hero-player";
import { ProductTour } from "@/components/site/app/tour";
import { Close } from "@/components/site/v6/close";
import { FileArtefact } from "@/components/site/v6/file-artefact";
import { Highlights } from "@/components/site/v6/highlights";
import { Hub } from "@/components/site/v6/hub";
import { LitStatement } from "@/components/site/v6/lit-statement";
import { HIGHLIGHTS, PARTS } from "@/components/site/v6/keys";
import { PayLine } from "@/components/site/v6/pay-line";
import { ReadTwice } from "@/components/site/v6/read-twice";
import { Rules } from "@/components/site/v6/rules";
import { Seam } from "@/components/site/v6/seam";
import { Security } from "@/components/site/v6/security";
import { Specs } from "@/components/site/v6/specs";
import { Systems } from "@/components/site/v6/systems";
import { Eyebrow } from "@/components/site/v6/ui";
import { getEngineSay } from "@/components/shiftbook/engine-say-server";
import { EXPORT_FORMATS, SYSTEM_NAME, SYSTEM_OF } from "@/exports/targets";
import { siteLinks } from "@/server/site/context";
import { payLineAnatomy } from "@/server/site/pay-line-anatomy";
import { ruleIndex, RULE_BOOKS } from "@/server/site/rule-index";
import { ruleUpdates } from "@/server/site/rule-updates";
import { siteSampleFiles } from "@/server/site/sample-files";
import { SITE_STATES, SITE_WEEK, stateWeek } from "@/server/site/state-week";
import { usDots } from "@/server/site/us-dots";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site.meta" });
  return { title: t("homeTitle"), description: t("homeDescription"), openGraph: { title: t("homeTitle"), description: t("homeDescription"), siteName: "Tabulado", images: ["/site/hero-warehouse.jpg"] } };
}

const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

/** Where each state's pin chip sits on the dot map (map units): in the empty sea and border space. */
const CHIP = { CA: { x: 18, y: 440 }, IL: { x: 520, y: 488 }, MA: { x: 760, y: 30 }, NJ: { x: 830, y: 300 } } as const;

export default async function SiteHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("site.home");
  const tApp = await getTranslations("site.app");
  const v = await getTranslations("site.v6");
  const links = await siteLinks(locale);
  const say = await getEngineSay();
  const format = await getFormatter();
  const secondary = links.demo ? { href: links.demo, label: t("hero.demo") } : { href: "#tour", label: t("hero.howItWorks") };
  const date = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  // The hero's play: the Illinois week and the real files (unchanged).
  const illinois = stateWeek("IL");
  const linesOf = (w: typeof illinois) => w.lines.map((l) => ({ label: t(`state.${l.type as "REG"}`), hours: hm(l.minutes), amount: usd(l.amountCents), explain: say({ say: l.say, explain: l.explain }) }));
  const files = siteSampleFiles().map((f) => ({
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

  // Every payroll system Tabulado writes a file for, by name, with the file it takes.
  const systems = EXPORT_FORMATS.map((f) => ({ name: SYSTEM_OF[f] === "spreadsheet" ? v("systems.spreadsheet") : SYSTEM_NAME[SYSTEM_OF[f]], file: v(`systems.kinds.${f}`) }));

  // One pay line, taken apart: California's daily overtime, as the engine wrote it.
  const a = payLineAnatomy();
  const caLine = stateWeek("CA").lines.find((l) => l.ruleId === a.ruleId)!;
  const caExplain = say({ say: caLine.say, explain: caLine.explain });
  const exact = `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Number(a.exactCents))}¢`;
  const weekday = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { weekday: "long", timeZone: "UTC" });
  const short = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { weekday: "short", timeZone: "UTC" });
  const values = { days: a.days.map((d) => `${weekday(d.date)} ${hm(d.minutes)}`).join(", "), multiplier: a.multiplier, base: usd(a.baseRateCents), rate: a.rate, minutes: String(a.minutes), exact, amount: usd(a.amountCents), citation: a.citation };

  // The rules: the dot map, its pins, every rule by book, and the dated changes.
  const today = new Date().toISOString().slice(0, 10);
  const index = ruleIndex(today);
  const map = usDots();
  const rule = (book: string, code: string, scope: string | null = null) => index.find((i) => i.book === book)!.rules.find((r) => r.code === code && r.scope === scope)!;
  const pinText = (s: (typeof SITE_STATES)[number]) => {
    const mw = rule(s, "minimum_wage");
    if (s === "IL") return v("rules.pin.IL", { now: usd(mw.rateCents!), chicago: usd(rule("IL", "minimum_wage", "City of Chicago").rateCents!) });
    if (s === "MA") return v("rules.pin.MA", { now: usd(mw.rateCents!) });
    return v(`rules.pin.${s}`, { now: usd(mw.rateCents!), next: usd(mw.next?.rateCents ?? mw.rateCents!), date: date(mw.next?.from ?? today) });
  };
  const books = index.map((b) => ({
    name: v(`rules.books.${b.book}`),
    rows: [
      ...b.rules.map((r) => ({
        name: r.code === "minimum_wage" ? `${r.scope ? v("rules.localWage", { place: r.scope }) : v("rules.names.minimum_wage")} · ${v("rules.rate", { rate: usd(r.rateCents!) })}` : v(`rules.names.${r.code}`),
        law: r.citation,
        when: [r.since ? v("rules.since", { date: date(r.since) }) : v("rules.inForce"), r.next ? (r.next.rateCents ? v("rules.next", { rate: usd(r.next.rateCents), date: date(r.next.from) }) : v("rules.newVersion", { date: date(r.next.from) })) : null].filter(Boolean).join(" · "),
      })),
      ...(b.heldPlaces ? [{ name: v("rules.held", { count: b.heldPlaces }), law: v("rules.heldLaw"), when: "" }] : []),
    ],
  }));
  const changes = ruleUpdates(today).map((u) => ({
    key: `${u.state}-${u.scope}-${u.effectiveFrom}`,
    title: v("rules.change", { place: u.scope ?? v(`rules.books.${u.state}`), rate: `${usd(u.rateCents)}/h` }),
    law: u.citation.split(" — ")[0]!,
    when: u.daysUntil > 0 ? v("rules.inDays", { date: date(u.effectiveFrom), days: u.daysUntil }) : v("rules.inForceOn", { date: date(u.effectiveFrom) }),
    soon: u.daysUntil > 0,
  }));

  return (
    <ScrollStage>
      <ToneGroup tones={{ ink: "#14151c" }}>
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
        {/* 3. Attio's tiles: every payroll system the file is written for. */}
        <Systems id="systems-title" eyebrow={v("systems.eyebrow")} title={v("systems.title")} muted={v("systems.muted")} caption={v("systems.caption")} tiles={systems} />
      </ToneGroup>

      <ToneGroup tones={{ paper: "#f6f5f2", tour: "#eceef6" }}>
        {/* 4. Attio's scroll-lit statement. */}
        <LitStatement id="statement-title" label={v("statement.label")} text={v("statement.text")} />

        {/* 5. Attio's pinned product tour (fifth design), with its eyebrow. */}
        <section id="tour" data-tone="tour" aria-labelledby="tour-title" className="relative scroll-mt-16 pt-28 md:pt-40">
          <div className="mx-auto flex w-full max-w-[1240px] flex-col items-start gap-5 px-6">
            <Eyebrow className="site-reveal">{v("tour.eyebrow")}</Eyebrow>
            <h2 id="tour-title" className="site-reveal max-w-[20em] text-[clamp(2rem,2.6vw+1rem,3.25rem)] leading-[1.04] font-[500] tracking-[-0.03em] text-balance">
              {tApp("tour.title")} <span className="text-[var(--s-muted)]">{tApp("tour.titleMuted")}</span>
            </h2>
          </div>
          <div className="mt-12 pb-24 lg:mt-0 lg:pb-0">
            <ProductTour demo={demo} />
          </div>
        </section>

        {/* 6. Linear /build's two plates: read twice. */}
        <ReadTwice
          id="twice-title"
          l={{
            eyebrow: v("twice.eyebrow"),
            title: v("twice.title"),
            muted: v("twice.muted"),
            body: v("twice.body"),
            a: v("twice.a"),
            b: v("twice.b"),
            decide: v("twice.decide"),
            captions: v.raw("twice.captions") as [string, string][],
          }}
        />
      </ToneGroup>

      <ToneGroup tones={{ night: "#08090c", deep: "#0b0e19", black: "#050507", flow: "#061217" }}>
        {/* 7. Apple's "Take a closer look": one pay line, taken apart. */}
        <PayLine
          id="payline-title"
          explain={caExplain}
          l={{
            eyebrow: v("payline.eyebrow"),
            title: v("payline.title"),
            muted: v("payline.muted"),
            who: v("payline.who"),
            engine: v("payline.engine"),
            parts: Object.fromEntries(PARTS.map((p) => [p, { name: v(`payline.parts.${p}.name`), caption: v(`payline.parts.${p}.caption`, values) }])) as never,
            tokens: { hours: hm(a.minutes), rate: a.rate, exact, amount: usd(a.amountCents), rule: v("payline.ruleTag"), law: a.citation, reading: v("payline.readingTag") },
            days: SITE_WEEK.filter((d) => d.minutes > 0).map((d) => ({ label: short(d.date), minutes: d.minutes, over: Math.min(Math.max(d.minutes - a.thresholdMinutes, 0), 240), double: Math.max(d.minutes - 720, 0) })),
          }}
        />

        {/* 8. Ramp's dot map, Linear's contents and changelog: the rules. */}
        <Rules
          id="rules-title"
          l={{ eyebrow: v("rules.eyebrow"), title: v("rules.title"), muted: v("rules.muted"), body: v("rules.body"), mapLabel: v("rules.mapLabel"), indexTitle: v("rules.indexTitle"), changesTitle: v("rules.changesTitle"), changesBody: v("rules.changesBody") }}
          map={{ width: map.width, height: map.height, land: map.land, lit: Object.values(map.lit).join("") }}
          pins={SITE_STATES.map((s) => ({ state: s, name: v(`rules.books.${s}`), detail: pinText(s), at: map.pins[s], chip: CHIP[s] }))}
          books={books}
          changes={changes}
        />

        {/* 9. Apple's highlights. */}
        <Highlights
          id="highlights-title"
          l={{
            title: v("highlights.title"),
            label: v("highlights.label"),
            pause: v("highlights.pause"),
            play: v("highlights.play"),
            show: v.raw("highlights.show") as string,
            cards: Object.fromEntries(HIGHLIGHTS.map((k) => [k, { a: v(`highlights.cards.${k}.a`), b: v(`highlights.cards.${k}.b`) }])) as never,
            explain: caExplain,
            approve: v("highlights.approve"),
            approved: v("highlights.approved"),
            clockIn: v("highlights.clockIn"),
            clockInEs: v("highlights.clockInEs"),
            gross: files[0]!.gross,
            theirs: files[0]!.theirs,
            difference: files[0]!.difference,
            totals: { ours: v("highlights.ours"), theirs: v("highlights.theirs"), difference: v("highlights.difference") },
          }}
        />

        {/* 10. Stripe's integration hub. */}
        <Hub
          id="hub-title"
          systems={systems.map((s) => s.name)}
          invoices={[
            { no: "INV-1044", client: "Northgate Logistics" },
            { no: "INV-1043", client: "Prairie Line Manufacturing" },
            { no: "INV-1042", client: "Harbor Foods Distribution" },
          ]}
          l={{
            eyebrow: v("hub.eyebrow"),
            title: v("hub.title"),
            muted: v("hub.muted"),
            body: v("hub.body"),
            inLabel: v("hub.inLabel"),
            inPill: v("hub.inPill"),
            rulesPill: v("hub.rulesPill"),
            outPill: v("hub.outPill"),
            invoicePill: v("hub.invoicePill"),
            sources: v.raw("hub.sources") as never,
            books: [...RULE_BOOKS],
            never: v("hub.never"),
          }}
        />
      </ToneGroup>

      <ToneGroup tones={{ paper: "#f6f5f2" }}>
        {/* 10. Stripe Tax's file: the real exporters' output. */}
        <FileArtefact
          id="file-title"
          files={files}
          l={{
            eyebrow: v("file.eyebrow"),
            title: v("file.title"),
            muted: v("file.muted"),
            body: v("file.body"),
            checks: v.raw("file.checks") as string[],
            dialog: v("file.dialog"),
            week: v("file.week"),
            format: v("file.format"),
            download: v("file.download"),
            summary: v("file.summary"),
            workers: v("file.workers"),
            gross: v("file.gross"),
            theirs: v.raw("file.theirs") as string,
            difference: v("file.difference"),
            preview: v("file.preview"),
          }}
        />
      </ToneGroup>

      {/* 11. Mercury's figures across the seam. */}
      <Seam
        id="seam-title"
        title={v("seam.title")}
        figures={[
          { value: "$0", label: v("seam.money"), note: 1 },
          { value: "2", label: v("seam.readings") },
          { value: String(RULE_BOOKS.length), label: v("seam.books"), note: 7 },
          { value: String(EXPORT_FORMATS.length), label: v("seam.formats") },
        ]}
      />

      <ToneGroup tones={{ ink: "#14151c" }}>
        {/* 12. Mercury's security objects and Vercel's facts row. */}
        <Security
          id="security-title"
          href={links.security}
          l={{
            title: v("security.title"),
            muted: v("security.muted"),
            cards: [1, 2, 3].map((n) => ({ title: t(`security.c${n}Title`), body: t(`security.c${n}`) })),
            log: v.raw("security.log") as string[],
            facts: v.raw("security.facts") as string[],
            link: t("security.link"),
          }}
        />

        {/* 13. Linear's tech specs. */}
        <Specs
          id="specs-title"
          title={v("specs.title")}
          muted={v("specs.muted")}
          rows={[
            { label: v("specs.states"), chips: SITE_STATES.map((s) => v(`rules.books.${s}`)), text: v("specs.statesText") },
            { label: v("specs.inputs"), chips: v.raw("specs.inputsChips") as string[] },
            { label: v("specs.readings"), text: v("specs.readingsText") },
            { label: v("specs.lines"), text: v("specs.linesText") },
            { label: v("specs.files"), chips: systems.map((s) => s.name) },
            { label: v("specs.invoices"), text: v("specs.invoicesText") },
            { label: v("specs.approvals"), text: v("specs.approvalsText") },
            { label: v("specs.app"), text: v("specs.appText") },
            { label: v("specs.safety"), text: v("specs.safetyText") },
            { label: v("specs.never"), text: v("specs.neverText") },
          ]}
        />

        {/* 14. Linear's close with Stripe's two columns. */}
        <Close
          id="close-title"
          title={v("close.title")}
          line2={v("close.line2")}
          primary={{ href: links.signUp, label: t("hero.start") }}
          secondary={secondary}
          columns={[
            { icon: <Wallet className="size-4" />, title: v("close.pricingTitle"), body: v("close.pricingBody"), link: v("close.pricingLink"), href: links.pricing },
            { icon: <Clock className="size-4" />, title: v("close.checkerTitle"), body: v("close.checkerBody"), link: v("close.checkerLink"), href: links.checker },
          ]}
        />
      </ToneGroup>

      <SiteFooter links={links} locale={locale} page="" />
    </ScrollStage>
  );
}
