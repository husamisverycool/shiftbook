// Pattern: docs/patterns/site/security.md — Mercury's security band as a page: a dark opening band with a
// centred heading over its abstract render (rings around a frosted pill), an honest status row of frosted
// tiles (Resend), Mercury's label-left groups of plain controls on the light page, Resend's responsible
// disclosure, Mercury's questions, and Mercury's centred close.
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Eyebrow, FrostButton, Section } from "@/components/site/blocks";
import { Faq } from "@/components/site/faq";
import { SiteFooter } from "@/components/site/site-footer";
import { cn } from "@/lib/utils";
import { siteLinks } from "@/server/site/context";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site.meta" });
  return { title: t("securityTitle"), description: t("securityDescription") };
}

const GROUPS = [
  { title: "ssnTitle", items: ["ssn1", "ssn2", "ssn3", "ssn4"] },
  { title: "aiTitle", items: ["ai1", "ai2", "ai3"] },
  { title: "wallTitle", items: ["wall1", "wall2"] },
  { title: "signTitle", items: ["sign1", "sign2", "sign3"] },
  { title: "logTitle", items: ["log1", "log2"] },
  { title: "moneyTitle", items: ["money1"] },
  { title: "demoTitle", items: ["demo1"] },
] as const;

export default async function SiteSecurity({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("site.security");
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
    <>
      {/* 1. Dark band: heading over Mercury's rings, then the honest status row (Resend). */}
      <section aria-labelledby="security-title" className="site-grain site-grain-light relative overflow-hidden bg-[var(--s-ink)] px-6 pt-40 pb-24 text-center text-white md:pt-48">
        <span aria-hidden className="absolute top-[58%] left-1/2 -z-10 size-[64rem] -translate-x-1/2 -translate-y-1/2 bg-[repeating-radial-gradient(circle,rgba(255,255,255,0.12)_0_1px,transparent_1.5px_22px)] [mask-image:radial-gradient(circle,#000_8%,transparent_60%)]" />
        <Eyebrow tone="dark">{t("eyebrow")}</Eyebrow>
        <h1 id="security-title" className="mx-auto max-w-[18ch] text-[clamp(2.5rem,4vw+1rem,4.5rem)] leading-[1.02] font-[450] tracking-[-0.035em] text-balance">
          {t("title")}
        </h1>
        <p className="mx-auto mt-6 max-w-[46ch] text-[clamp(1.0625rem,0.4vw+1rem,1.25rem)] leading-relaxed text-white/75">{t("lead")}</p>
        <h2 className="sr-only">{t("statusLabel")}</h2>
        <ul className="mx-auto mt-20 grid max-w-[1200px] grid-cols-1 gap-3 text-left sm:grid-cols-2 lg:grid-cols-4">
          {status.map((s) => (
            <li key={s.label} className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-white/6 p-5 backdrop-blur-md">
              <span className="text-[15px] leading-snug text-white">{s.label}</span>
              <span className={cn("inline-flex items-center gap-2 text-[13px]", s.on ? "text-emerald-300" : "text-[var(--s-dmuted)]")}>
                <span aria-hidden className={cn("size-1.5 rounded-full", s.on ? "bg-emerald-300" : "bg-white/30")} />
                {s.on ? t("statusOn") : t("statusNotYet")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 2. Groups of controls: the label at the left, the plain facts at the right (Mercury). */}
      <Section labelledBy="controls">
        <h2 id="controls" className="sr-only">
          {t("title")}
        </h2>
        <div className="flex flex-col">
          {GROUPS.map((g) => (
            <div key={g.title} className="grid gap-4 border-t border-[var(--s-line)] py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-10">
              <h3 className="text-[clamp(1.25rem,0.6vw+1rem,1.5rem)] leading-tight font-[450] tracking-[-0.02em]">{t(g.title)}</h3>
              <ul className="flex flex-col gap-4">
                {g.items.map((i) => (
                  <li key={i} className="max-w-[60ch] text-[17px] leading-relaxed text-[var(--s-text)]/80">
                    {t(i)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {/* 3. Responsible disclosure (Resend, Mercury), when there is an address to write to. */}
          {links.contact && (
            <div className="grid gap-4 border-t border-[var(--s-line)] py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-10">
              <h3 className="text-[clamp(1.25rem,0.6vw+1rem,1.5rem)] leading-tight font-[450] tracking-[-0.02em]">{t("reportTitle")}</h3>
              <p className="max-w-[60ch] text-[17px] leading-relaxed text-[var(--s-text)]/80">
                {t.rich("report", {
                  address: links.contact,
                  email: (chunks) => (
                    <a href={`mailto:${links.contact}`} className="font-medium text-[var(--s-accent)] underline underline-offset-4">
                      {chunks}
                    </a>
                  ),
                })}
              </p>
            </div>
          )}
        </div>
      </Section>

      {/* 4. Questions (Mercury). */}
      <Section labelledBy="security-faq" className="pt-0 md:pt-0">
        <div className="grid gap-8 border-t border-[var(--s-line)] pt-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <h2 id="security-faq" className="text-[clamp(1.5rem,1vw+1.1rem,2rem)] leading-[1.1] font-[450] tracking-[-0.03em]">
            {t("faqTitle")}
          </h2>
          <Faq items={faq} />
        </div>
      </Section>

      {/* 5. Mercury's centred close. */}
      <section aria-labelledby="security-closing" className="bg-[var(--s-ink)] px-6 pt-32 pb-8 text-center">
        <h2 id="security-closing" className="text-[clamp(2rem,2.8vw+1rem,3.5rem)] leading-[1.08] font-[450] tracking-[-0.035em] text-white">
          {t("closingTitle")}
        </h2>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <a href={links.signUp} className="inline-flex h-12 items-center rounded-full bg-[var(--s-accent)] px-6 text-[15px] font-medium text-white outline-none site-color-slow hover:bg-[var(--s-accent-2)] focus-visible:ring-2 focus-visible:ring-white/70">
            {nav("start")}
          </a>
          {links.demo && <FrostButton href={links.demo}>{nav("demo")}</FrostButton>}
        </div>
      </section>

      <SiteFooter links={links} locale={locale} page="/security" />
    </>
  );
}
