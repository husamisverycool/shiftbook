// Pattern: docs/patterns/site/security.md — Linear /security in the site's one system: a dark page; a
// centred eyebrow, a large two-line heading with one phrase decoding into place, a grey line; Vercel's
// bordered status row (what is in place and what is not yet, plainly); then sections between hairlines,
// each a left block (an icon, the area's name in the accent, a white lead sentence) and a right grid of
// the plain measures, each with a small check; responsible disclosure; Vercel's two-column questions; the
// home page's close.
import type { Metadata } from "next";
import { Banknote, Building2, Bug, Check, EyeOff, FlaskConical, History, KeyRound, Lock, Minus, type LucideIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Faq } from "@/components/site/faq";
import { ScrollStage } from "@/components/site/scroll";
import { SiteFooter } from "@/components/site/site-footer";
import { Close } from "@/components/site/v6/close";
import { Decode } from "@/components/site/v6/decode";
import { Eyebrow } from "@/components/site/v6/ui";
import { cn } from "@/lib/utils";
import { siteLinks } from "@/server/site/context";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site.meta" });
  return { title: t("securityTitle"), description: t("securityDescription") };
}

const GROUPS: { title: "ssnTitle" | "aiTitle" | "wallTitle" | "signTitle" | "logTitle" | "moneyTitle" | "demoTitle"; icon: LucideIcon; items: string[] }[] = [
  { title: "ssnTitle", icon: Lock, items: ["ssn1", "ssn2", "ssn3", "ssn4"] },
  { title: "aiTitle", icon: EyeOff, items: ["ai1", "ai2", "ai3"] },
  { title: "wallTitle", icon: Building2, items: ["wall1", "wall2"] },
  { title: "signTitle", icon: KeyRound, items: ["sign1", "sign2", "sign3"] },
  { title: "logTitle", icon: History, items: ["log1", "log2"] },
  { title: "moneyTitle", icon: Banknote, items: ["money1"] },
  { title: "demoTitle", icon: FlaskConical, items: ["demo1"] },
];

function Block({ icon: I, name, lead, children }: { icon: LucideIcon; name: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="site-reveal grid grid-cols-1 gap-8 border-t border-white/[0.08] py-14 md:grid-cols-12 md:gap-10">
      <div className="flex flex-col gap-3 md:col-span-5">
        <I aria-hidden className="size-4 text-white/70" strokeWidth={1.8} />
        <h3 className="text-[13px] font-medium text-[var(--s-accent-soft)]">{name}</h3>
        <p className="max-w-[24ch] text-[clamp(1.25rem,0.8vw+1rem,1.625rem)] leading-snug font-[500] tracking-[-0.02em] text-white">{lead}</p>
      </div>
      <div className="md:col-span-7">{children}</div>
    </div>
  );
}

export default async function SiteSecurity({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("site.security");
  const v = await getTranslations("site.v6.securityPage");
  const nav = await getTranslations("site.nav");
  const links = await siteLinks(locale);
  const status = [
    { label: t("statusEncryption"), on: true },
    { label: t("statusTwoFactor"), on: true },
    { label: t("statusPentest"), on: false },
    { label: t("statusSoc2"), on: false },
  ];
  const faq = ([1, 2, 3, 4] as const).map((n) => ({ q: t(`q${n}`), a: t(`a${n}`) }));

  return (
    <ScrollStage>
      <div data-tone="ink" className="bg-[var(--s-ink)] text-white">
        {/* 1. Linear's centred opening, one phrase decoding. */}
        <section aria-labelledby="security-title" className="relative isolate overflow-hidden px-6 pt-40 pb-20 text-center md:pt-52">
          <div aria-hidden className="absolute top-0 left-1/2 -z-10 h-[520px] w-[min(1000px,100vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(107,120,255,0.18),transparent)]" />
          <Eyebrow tone="dark">{t("eyebrow")}</Eyebrow>
          <h1 id="security-title" className="mx-auto mt-6 max-w-[18ch] text-[clamp(2.5rem,4vw+1rem,4.25rem)] leading-[1.02] font-[500] tracking-[-0.04em] text-balance">
            {v.rich("title", { d: (chunks) => <Decode text={String(chunks)} /> })}
          </h1>
          <p className="mx-auto mt-6 max-w-[46ch] text-[clamp(1.0625rem,0.4vw+1rem,1.25rem)] leading-relaxed text-[var(--s-dmuted)]">{t("lead")}</p>
        </section>

        {/* 2. Vercel's bordered status row: what is in place, and what is not yet. */}
        <section aria-labelledby="status-title" className="px-6 pb-24">
          <div className="mx-auto w-full max-w-[1200px]">
            <h2 id="status-title" className="site-reveal mb-5 text-[13px] text-[var(--s-dmuted)]">
              {v("statusTitle")}
            </h2>
            <ul className="site-reveal grid grid-cols-1 border-t border-l border-white/[0.08] sm:grid-cols-2 lg:grid-cols-4">
              {status.map((s) => (
                <li key={s.label} className="flex min-h-36 flex-col justify-between gap-6 border-r border-b border-white/[0.08] p-6">
                  <span className="text-[15px] leading-snug text-white">{s.label}</span>
                  <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", s.on ? "bg-emerald-400/12 text-emerald-300" : "bg-white/[0.06] text-white/55")}>
                    {s.on ? <Check aria-hidden className="size-3" strokeWidth={3} /> : <Minus aria-hidden className="size-3" strokeWidth={3} />}
                    {s.on ? t("statusOn") : t("statusNotYet")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 3. Linear's sections: the area at the left, the measures at the right. */}
        <section aria-labelledby="controls" className="px-6 pb-16">
          <h2 id="controls" className="sr-only">
            {t("title")}
          </h2>
          <div className="mx-auto w-full max-w-[1200px]">
            {GROUPS.map((g) => (
              <Block key={g.title} icon={g.icon} name={t(g.title)} lead={v(`lead.${g.title}`)}>
                <ul className={cn("grid grid-cols-1 gap-x-10 gap-y-6", g.items.length > 1 && "sm:grid-cols-2")}>
                  {g.items.map((i) => (
                    <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-white/75">
                      <Check aria-hidden className="mt-1 size-3.5 shrink-0 text-[var(--s-accent-soft)]" strokeWidth={2.5} />
                      {t(i)}
                    </li>
                  ))}
                </ul>
              </Block>
            ))}
            {links.contact && (
              <Block icon={Bug} name={t("reportTitle")} lead={v("lead.reportTitle")}>
                <p className="max-w-[56ch] text-[15px] leading-relaxed text-white/75">
                  {t.rich("report", {
                    address: links.contact,
                    email: (chunks) => (
                      <a href={`mailto:${links.contact}`} className="font-medium text-[var(--s-accent-soft)] underline underline-offset-4">
                        {chunks}
                      </a>
                    ),
                  })}
                </p>
              </Block>
            )}
          </div>
        </section>

        {/* 4. Vercel's two-column questions. */}
        <section aria-labelledby="security-faq" className="px-6 py-24">
          <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-10 border-t border-white/[0.08] pt-14 md:grid-cols-12">
            <h2 id="security-faq" className="site-reveal text-[clamp(1.75rem,1.6vw+1rem,2.5rem)] leading-[1.08] font-[500] tracking-[-0.03em] md:col-span-5">
              {v("faqTitle")}
            </h2>
            <div className="site-reveal md:col-span-7">
              <Faq items={faq} tone="dark" />
            </div>
          </div>
        </section>

        {/* 5. The home page's close. */}
        <Close id="security-closing" title={t("closingTitle")} primary={{ href: links.signUp, label: nav("start") }} secondary={links.demo ? { href: links.demo, label: nav("demo") } : { href: links.home, label: nav("product") }} />
      </div>
      <SiteFooter links={links} locale={locale} page="/security" />
    </ScrollStage>
  );
}
