"use client";

// Pattern: docs/patterns/site.md — Stripe's "Book of the week" (stripe.com, 2026-10-20): one wide card,
// about 1230 x 590; the left two-fifths a panel holding the book's cover; the right a lighter panel with the
// title, the author in grey, a paragraph, and a small line of links. Here the "book" is a page of the law
// itself — the words Tabulado's rule follows, copied from the official text — and arrows step through the
// five rule books. Laws are shown in English, the language they are written in.
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Verbatim from the official sources named, read 2026-10-20. */
const LAWS = [
  {
    key: "federal",
    citation: "29 U.S.C. § 207(a)(1)",
    heading: "§ 207. Maximum hours",
    source: "https://www.law.cornell.edu/uscode/text/29/207",
    text: "Except as otherwise provided in this section, no employer shall employ any of his employees who in any workweek is engaged in commerce or in the production of goods for commerce, or is employed in an enterprise engaged in commerce or in the production of goods for commerce, for a workweek longer than forty hours unless such employee receives compensation for his employment in excess of the hours above specified at a rate not less than one and one-half times the regular rate at which he is employed.",
  },
  {
    key: "california",
    citation: "Cal. Lab. Code § 510(a)",
    heading: "Labor Code § 510",
    source: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=LAB&sectionNum=510",
    text: "(a) Eight hours of labor constitutes a day’s work. Any work in excess of eight hours in one workday and any work in excess of 40 hours in any one workweek and the first eight hours worked on the seventh day of work in any one workweek shall be compensated at the rate of no less than one and one-half times the regular rate of pay for an employee. Any work in excess of 12 hours in one day shall be compensated at the rate of no less than twice the regular rate of pay for an employee. …",
  },
  {
    key: "illinois",
    citation: "820 ILCS 175/42(a)",
    heading: "Sec. 42. Equal pay for equal work.",
    source: "https://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=082001750K42",
    text: "(a) A day and temporary labor service agency shall pay a day or temporary laborer who is assigned to work and performs work at the same third party client for more than 720 hours within a 12-month period, beginning on or after April 1, 2024, in accordance with one of the following methods: …",
  },
  {
    key: "massachusetts",
    citation: "M.G.L. c. 151, § 1A",
    heading: "Section 1A: Overtime pay; excluded employments",
    source: "https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXXI/Chapter151/Section1A",
    text: "Except as otherwise provided in this section, no employer in the commonwealth shall employ any of his employees in an occupation, as defined in section two, for a work week longer than forty hours, unless such employee receives compensation for his employment in excess of forty hours at a rate not less than one and one half times the regular rate at which he is employed.",
  },
  {
    key: "newJersey",
    citation: "N.J.S.A. 34:8D-6(g)",
    heading: "C.34:8D-6 Wage payment, temporary help service firm",
    source: "https://pub.njleg.gov/bills/2022/PL23/10_.HTM",
    text: "g. A temporary laborer who is contracted by a temporary help service firm to work at a third party client's worksite in a designated classification placement but who is not utilized by the third party client, shall be paid by the temporary help service firm for a minimum of four hours of pay at the agreed upon rate of pay. …",
  },
] as const;

export function RuleBook({ id }: { id: string }) {
  const t = useTranslations("site.linear.ruleBook");
  const [i, setI] = useState(0);
  const law = LAWS[i]!;
  const go = (d: number) => setI((n) => (n + d + LAWS.length) % LAWS.length);
  const arrow = "inline-flex size-8 items-center justify-center rounded-full text-[var(--l-text-3)] ring-1 ring-white/[0.08] outline-none site-color-slow hover:bg-white/[0.06] hover:text-[var(--l-text)] focus-visible:ring-2 focus-visible:ring-white/40";

  return (
    <section aria-labelledby={id} className="py-24 md:py-32">
      <div className="mx-auto w-full max-w-[1440px] px-6 md:px-20">
        <div className="site-reveal grid min-h-[590px] grid-cols-1 overflow-hidden rounded-xl border border-white/[0.08] md:grid-cols-[2fr_3fr]">
          {/* The cover: a page of the law. */}
          <div className="flex items-center justify-center bg-[var(--l-level-2)] px-8 py-14">
            <figure key={law.key} lang="en" className="animate-page-in flex aspect-[3/4] w-[min(300px,100%)] flex-col rounded-[3px] bg-[#e8e8e3] px-7 py-8 text-[#1b1c1d] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8),0_2px_6px_rgba(0,0,0,0.4)]">
              <figcaption className="text-[11px] font-[590]">{law.heading}</figcaption>
              <div className="mt-3 h-px bg-[#1b1c1d]/15" />
              <blockquote className="mt-4 overflow-hidden text-[11.5px] leading-[1.55] [mask-image:linear-gradient(to_bottom,#000_80%,transparent)]">{law.text}</blockquote>
              <p className="mt-auto pt-4 text-[10px] text-[#1b1c1d]/55">{law.citation}</p>
            </figure>
          </div>
          {/* The notes. */}
          <div className="flex flex-col bg-[var(--l-panel)] p-8 md:p-12">
            <div className="flex items-center justify-between">
              <h2 id={id} className="l-text-regular text-[var(--l-text-3)]">
                {t("label")}
              </h2>
              <div className="flex gap-2">
                <button type="button" onClick={() => go(-1)} aria-label={t("previous")} className={arrow}>
                  <ArrowLeft className="size-4" />
                </button>
                <button type="button" onClick={() => go(1)} aria-label={t("next")} className={arrow}>
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </div>
            <div key={law.key} aria-live="polite" className="animate-page-in mt-10 flex flex-1 flex-col">
              <p className="l-title-4 text-[var(--l-text)]">{t(`laws.${law.key}.title`)}</p>
              <p className="mt-2 l-title-2 text-[var(--l-text-3)]">{law.citation}</p>
              <p className="mt-8 max-w-[52ch] l-text-large text-[var(--l-text-2)]">{t(`laws.${law.key}.body`)}</p>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-10">
                <span className="mr-1 l-text-small text-[var(--l-text-4)]">{t("read")}</span>
                <a href={law.source} rel="noopener" target="_blank" className="inline-flex h-8 items-center gap-1 rounded-full bg-white/[0.06] px-3 l-text-small text-[var(--l-text-2)] outline-none site-color-slow hover:bg-white/[0.1] hover:text-[var(--l-text)] focus-visible:ring-2 focus-visible:ring-white/40">
                  {t("official")}
                  <ArrowUpRight aria-hidden className="size-3.5" />
                </a>
                <a href="#rules-title" className="inline-flex h-8 items-center rounded-full bg-white/[0.06] px-3 l-text-small text-[var(--l-text-2)] outline-none site-color-slow hover:bg-white/[0.1] hover:text-[var(--l-text)] focus-visible:ring-2 focus-visible:ring-white/40">
                  {t("payLines")}
                </a>
              </div>
            </div>
            <ol className="mt-10 flex gap-1.5" aria-label={t("books")}>
              {LAWS.map((l, n) => (
                <li key={l.key}>
                  <button type="button" onClick={() => setI(n)} aria-label={t(`laws.${l.key}.book`)} aria-current={n === i ? "true" : undefined} className={cn("block h-1 w-8 rounded-full outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-white/40", n === i ? "bg-[var(--l-text)]" : "bg-white/[0.12] hover:bg-white/25")} />
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
