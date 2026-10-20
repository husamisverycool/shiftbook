// Pattern: docs/patterns/site.md — Mercury's home, section for section: a full-bleed photograph with a
// centred headline and a frosted email field, a dark accordion beside product panels, a photo carousel
// across the dark and light bands, a 2×2 grid of grainy cards, a dark row of figures, a dark security trio
// and a centred close; with Campfire's line reveal, flooding button and cycling list, Check's scroll-lit
// statement, Stripe's and Ramp's name strip, and Deel's warm bento with Warp's resolving rows.
import type { Metadata } from "next";
import Image from "next/image";
import NextLink from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLink, FloodButton, FrostButton, Money, Pill, Section, TwoTone } from "@/components/site/blocks";
import { InView } from "@/components/site/in-view";
import { People } from "@/components/site/home/people";
import { ScrollScene } from "@/components/site/home/scroll-scene";
import { ProductBand } from "@/components/site/home/product-band";
import { Statement } from "@/components/site/home/statement";
import { WordCycle } from "@/components/site/home/word-cycle";
import { SiteFooter } from "@/components/site/site-footer";
import { cn } from "@/lib/utils";
import { siteLinks } from "@/server/site/context";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site.meta" });
  return { title: t("homeTitle"), description: t("homeDescription"), openGraph: { title: t("homeTitle"), description: t("homeDescription"), siteName: "Tabulado", images: ["/site/hero-warehouse.jpg"] } };
}

const SYSTEMS = ["Gusto", "ADP Workforce Now", "ADP RUN", "QuickBooks Desktop", "QuickBooks Online", "Paychex Flex", "Paylocity", "CSV"];

export default async function SiteHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("site.home");
  const links = await siteLinks(locale);
  const v = (key: string) => t(`band.v.${key}`);
  const secondary = links.demo ? { href: links.demo, label: t("hero.demo") } : { href: "#product", label: t("hero.howItWorks") };

  return (
    <>
      {/* 1. Hero (Mercury): full-bleed photograph, centred headline, frosted email field, frosted note. */}
      <section aria-labelledby="hero-title" className="relative isolate flex min-h-[min(100svh,920px)] flex-col overflow-hidden bg-[var(--s-ink)] text-white">
        <Image src="/site/hero-warehouse.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover object-[50%_60%]" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(14,15,22,0.78)_0%,rgba(14,15,22,0.5)_42%,rgba(14,15,22,0.35)_65%,rgba(14,15,22,0.85)_100%)]" />
        <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col items-center px-6 pt-36 pb-10 text-center md:pt-44">
          {/* Campfire's line reveal: each line rises out of its own clipped box. */}
          <h1 id="hero-title" className="text-[clamp(2.5rem,3.4vw+1rem,4rem)] leading-[1.05] font-[450] tracking-[-0.03em] text-balance">
            <span className="site-line">
              <span className="animate-site-rise">{t("hero.line1")}</span>
            </span>
            <span className="site-line">
              <span className="animate-site-rise [animation-delay:90ms]">{t("hero.line2")}</span>
            </span>
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
          {/* Mercury's frosted legal note at the photograph's foot. */}
          <p className="mt-auto max-w-[60rem] rounded-lg bg-[var(--s-ink)]/70 px-4 py-2 text-[12px] leading-relaxed text-white/85 backdrop-blur-md">
            {t("hero.never")}
            <a href="#note-1" className="ml-0.5 align-super text-[0.75em] underline-offset-2 hover:underline">
              1
            </a>
          </p>
        </div>
      </section>

      {/* 2. Dark split: heading and accordion beside the product panels (Mercury). */}
      <section id="product" aria-labelledby="product-title" className="scroll-mt-16 bg-[var(--s-ink)] px-6 pt-28 pb-24 text-[var(--s-dtext)] md:pt-36">
        <div className="mx-auto w-full max-w-[1200px]">
          <TwoTone id="product-title" tone="dark" strong={t("band.title")} muted={t("band.titleMuted")} className="mb-12 max-w-[20em] text-[clamp(1.5rem,1vw+1.1rem,2rem)]" />
          <ProductBand
            label={t("band.steps")}
            steps={([1, 2, 3, 4] as const).map((n) => ({ title: t(`band.s${n}Title`), body: t(`band.s${n}`) }))}
            v={{
              files: v("files"),
              kindPhoto: v("kindPhoto"),
              kindPdf: v("kindPdf"),
              kindClock: v("kindClock"),
              kindPortal: v("kindPortal"),
              readTwice: v("readTwice"),
              reading: v("reading"),
              review: v("review"),
              toCheck: v("toCheck"),
              disagree: v("disagree"),
              disagreeNote: v("disagreeNote"),
              keep: v("keep"),
              approvals: v("approvals"),
              approved: v("approved"),
              waiting: v("waiting"),
              disputed: v("disputed"),
              payroll: v("payroll"),
              totals: v("totals"),
              gross: v("gross"),
              hours: v("hours"),
              difference: v("difference"),
              download: v("download"),
              ready: v("ready"),
              invoices: v("invoices"),
              workers: t.raw("band.v.workers") as string,
            }}
            demo={links.demo ? { href: links.demo, label: t("band.demoLink") } : null}
            sample={t("band.sample")}
          />
        </div>
      </section>

      {/* 3. Centred heading, then the carousel across the dark and light bands (Mercury). */}
      <section aria-labelledby="people-title" className="bg-[linear-gradient(to_bottom,var(--s-ink)_0,var(--s-ink)_55%,var(--s-paper)_55%)] px-6 pt-16 pb-8">
        <div className="mx-auto w-full max-w-[1152px]">
          <h2 id="people-title" className="mx-auto mb-14 max-w-[20ch] text-center text-[clamp(1.875rem,2.4vw+1rem,3rem)] leading-[1.1] font-[450] tracking-[-0.03em] text-balance text-[var(--s-dtext)]">
            {t("people.title")} {t("people.titleLine2")}
          </h2>
          <People
            label={t("people.label")}
            pause={t("people.pause")}
            play={t("people.play")}
            slideLabels={[1, 2, 3].map((n) => t("people.slide", { number: n }))}
            slides={[
              { src: "/site/people-warehouse.jpg", focus: "45% 40%", tag: t("people.p1Tag"), text: t("people.p1"), card: { title: t("people.p1Card"), value: t("people.p1CardValue"), note: t("people.p1CardNote") } },
              { src: "/site/people-factory.jpg", focus: "58% 45%", tag: t("people.p2Tag"), text: t("people.p2"), card: { title: t("people.p2Card"), value: "$138.24", note: t("people.p2CardNote") } },
              { src: "/site/people-events.jpg", focus: "50% 30%", tag: t("people.p3Tag"), text: t("people.p3"), card: { title: t("people.p3Card"), value: t("people.p3CardValue"), note: t("people.p3CardNote") } },
            ]}
          />
        </div>
      </section>

      {/* 4. The payroll systems as a moving strip of names (Stripe's and Ramp's logo strips, as words). */}
      <Section labelledBy="systems-title" className="pt-24 pb-0 md:pt-28 md:pb-0">
        <div className="border-t border-[var(--s-line)] pt-10">
          <TwoTone id="systems-title" strong={t("systems.title")} muted={t("systems.titleMuted")} className="text-[clamp(1.5rem,1vw+1.1rem,2rem)]" />
        </div>
        <div className="site-edge-fade group/mq mt-12 overflow-hidden" role="list" aria-label={t("systems.label")}>
          <div className="flex w-max animate-site-marquee gap-16 group-hover/mq:[animation-play-state:paused]">
            {[0, 1].map((copy) => (
              <div key={copy} aria-hidden={copy === 1 || undefined} className="flex shrink-0 items-center gap-16">
                {SYSTEMS.map((s) => (
                  <span key={s} role={copy === 0 ? "listitem" : undefined} className="text-[clamp(1.375rem,1vw+1rem,1.875rem)] font-semibold tracking-[-0.03em] whitespace-nowrap text-[var(--s-text)]/45">
                    {s}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-6 text-[15px] text-[var(--s-muted)]">{t("systems.custom")}</p>
      </Section>

      {/* 5. The scroll-pinned story (Apple, Stripe, Ramp) in Mercury's grainy card. */}
      <section aria-labelledby="tiles-title" className="border-t border-[var(--s-line)]">
        <ScrollScene
          id="tiles-title"
          strong={t("tiles.title")}
          muted={t("tiles.titleMuted")}
          labels={{
            steps: ([1, 2, 3, 4] as const).map((n) => ({ title: t(`tiles.t${n}Title`), body: t(`tiles.t${n}`) })),
            kept: t("tiles.chipKept"),
            matched: t("tiles.chipMatched"),
            approved: t("tiles.chipApproved"),
            balanced: t("tiles.chipBalanced"),
            approveHours: t("tiles.approveHours"),
            importFile: t("tiles.importFile"),
            invoice: t("tiles.invoice"),
            reading: t("tiles.reading"),
            sheet: t("tiles.sheet"),
            rowsTitle: t("tiles.rowsTitle"),
            label: t("tiles.label"),
          }}
        />
      </section>

      {/* 6. The statement whose words light up as it is read (Check), with the sample line under it. */}
      <Section labelledBy="statement" className="pt-8 md:pt-12">
        <h2 id="statement" className="sr-only">
          {t("statementLabel")}
        </h2>
        <Statement text={t("statement")} className="max-w-[24em] text-[clamp(1.75rem,2.6vw+1rem,3.25rem)] leading-[1.12] font-[450] tracking-[-0.03em]" />
        {/* The line itself, as the pay screen shows it. */}
        <figure className="mt-14 max-w-[52rem] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-30px_rgba(22,23,29,0.3)] ring-1 ring-black/5">
          <div className="flex items-center justify-between gap-6 px-6 pt-5">
            <span className="text-[13px] text-[var(--s-muted)]">{t("statementWho")}</span>
            <figcaption className="text-[13px] text-[var(--s-muted)]">{t("statementLabel")}</figcaption>
          </div>
          <div className="flex items-baseline justify-between gap-6 px-6 pt-3 pb-5">
            <span className="text-[17px] text-[var(--s-text)]">{t("statementLine")}</span>
            <Money value="$138.24" className="text-[28px] font-[450] tracking-[-0.03em]" />
          </div>
          <p className="border-t border-[var(--s-line)] bg-[var(--s-paper)] px-6 py-3.5 text-[13px] leading-relaxed text-[var(--s-muted)]">{t("statementLaw")}</p>
        </figure>
      </Section>

      {/* 7. Campfire's cycling list beside a heading and its flooding button. */}
      <Section labelledBy="cycle-title" className="bg-[var(--s-paper-2)]">
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          <div className="flex flex-col items-start gap-8">
            <h2 id="cycle-title" className="text-[clamp(1.875rem,2.2vw+1rem,3rem)] leading-[1.08] font-[450] tracking-[-0.03em] text-balance">
              {t("cycle.title")} <span className="text-[var(--s-muted)]">{t("cycle.titleLine2")}</span>
            </h2>
            <FloodButton href={links.pricing}>{t("cycle.cta")}</FloodButton>
          </div>
          <WordCycle label={t("cycle.label")} words={([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((n) => t(`cycle.w${n}`))} />
        </div>
      </Section>

      {/* 8. The rules as Deel's warm bento with white pieces; Warp's rows resolve when seen. */}
      <Section labelledBy="rules-title">
        <TwoTone id="rules-title" strong={t("rules.title")} muted={t("rules.titleMuted")} />
        <InView className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3 lg:grid-rows-2">
          <div className="flex flex-col justify-between gap-8 rounded-2xl bg-[var(--s-card)] p-7 lg:col-span-2 lg:row-span-2">
            <div>
              <h3 className="text-[20px] font-medium tracking-[-0.02em]">{t("rules.mainTitle")}</h3>
              <p className="mt-1 max-w-[46ch] text-[15px] leading-relaxed text-[var(--s-muted)]">{t("rules.main")}</p>
            </div>
            <ul className="flex flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_-28px_rgba(22,23,29,0.35)]">
              {(["federal", "ca", "il", "ma", "nj"] as const).map((k, i) => (
                <li key={k} className="flex items-center gap-4 border-b border-[var(--s-line)] px-5 py-4 last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{t(`rules.${k}`)}</span>
                    <span className="block text-[12px] text-[var(--s-muted)]">{t(`rules.${k}Law`)}</span>
                  </span>
                  <span className="relative grid shrink-0 justify-items-end [&>*]:col-start-1 [&>*]:row-start-1">
                    <span className="animate-site-shimmer text-[12px] font-medium text-[var(--s-muted)] group-data-[inview]/iv:animate-site-resolve-out" style={{ animationDelay: `${600 + i * 450}ms` }}>
                      {t("rules.checking")}
                    </span>
                    <span className="opacity-0 group-data-[inview]/iv:animate-site-resolve-in" style={{ animationDelay: `${750 + i * 450}ms` }}>
                      <Pill tone="green">{t("rules.applied")}</Pill>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-6 rounded-2xl bg-[var(--s-card)] p-7">
            <div className="rounded-xl bg-white p-4 shadow-[0_16px_40px_-24px_rgba(22,23,29,0.35)]">
              <p className="text-[12px] text-[var(--s-muted)]">{t("rules.minPlace")}</p>
              <p className="mt-0.5 text-[24px] font-medium tracking-[-0.03em] tabular-nums">{t("rules.minValue")}</p>
              <p className="text-[12px] text-[var(--s-muted)]">{t("rules.minFrom")}</p>
            </div>
            <div>
              <h3 className="text-[15px] font-medium">{t("rules.minTitle")}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-[var(--s-muted)]">{t("rules.min")}</p>
            </div>
          </div>
          <div className="flex flex-col gap-6 rounded-2xl bg-[var(--s-card)] p-7">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-[0_16px_40px_-24px_rgba(22,23,29,0.35)]">
              <span className="text-[13px] font-medium">{t("rules.holdRow")}</span>
              <Pill tone="amber">{t("rules.holdPill")}</Pill>
            </div>
            <div>
              <h3 className="text-[15px] font-medium">{t("rules.holdTitle")}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-[var(--s-muted)]">{t("rules.hold")}</p>
            </div>
          </div>
        </InView>
      </Section>

      {/* 9. Dark band: Mercury's row of figures, then its security trio with abstract renders. */}
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

          {/* 10. Mercury's centred close with its two pills, and two cards with a round arrow. */}
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
          <NextLink href={links.pricing} className="sr-only">
            {t("cycle.cta")}
          </NextLink>
        </div>
      </section>

      <SiteFooter links={links} locale={locale} page="" />
    </>
  );
}
