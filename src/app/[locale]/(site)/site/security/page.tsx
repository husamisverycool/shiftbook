// Pattern: docs/patterns/site/security.md — Linear's and Mercury's security hero, Resend's honest status
// row, Mercury's groups of plain controls, Resend's responsible disclosure, Mercury's and Resend's FAQ.
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Section, SITE_BUTTON } from "@/components/site/blocks";
import { Faq } from "@/components/site/faq";
import { SiteFooter } from "@/components/site/site-footer";
import { Status } from "@/components/shiftbook/status";
import { buttonVariants } from "@/components/ui/button";
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
      {/* 1. Hero (Linear, Mercury). */}
      <section aria-labelledby="security-title" className="mx-auto w-full max-w-7xl px-6 pt-16 pb-10 md:pt-24">
        <h1 id="security-title" className="max-w-[18ch] text-[clamp(2.5rem,4vw+1rem,4rem)] leading-none font-semibold tracking-[-0.03em] text-balance">
          {t("title")}
        </h1>
        <p className="mt-5 max-w-[56ch] text-lg leading-relaxed text-muted-foreground md:text-xl">{t("lead")}</p>
      </section>

      {/* 2. Honest status row (Resend). */}
      <Section labelledBy="status" className="pt-0 md:pt-0">
        <h2 id="status" className="sr-only">
          {t("statusLabel")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {status.map((s) => (
            <li key={s.label} className="flex flex-col gap-3 rounded-xl border p-5">
              <span className="text-sm font-medium">{s.label}</span>
              <Status tone={s.on ? "success" : "neutral"}>{s.on ? t("statusOn") : t("statusNotYet")}</Status>
            </li>
          ))}
        </ul>
      </Section>

      {/* 3. Groups of controls (Mercury's order). */}
      <Section labelledBy="controls" className="pt-0 md:pt-0">
        <h2 id="controls" className="sr-only">
          {t("title")}
        </h2>
        <div className="divide-y border-y">
          {GROUPS.map((g) => (
            <div key={g.title} className="grid gap-4 py-8 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1.6fr)] md:gap-10">
              <h3 className="text-lg font-semibold tracking-tight">{t(g.title)}</h3>
              <ul className="flex flex-col gap-3">
                {g.items.map((i) => (
                  <li key={i} className="max-w-[68ch] text-base leading-relaxed text-muted-foreground">
                    {t(i)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {/* 4. Responsible disclosure (Resend, Mercury), when there is an address to write to. */}
          {links.contact && (
            <div className="grid gap-4 py-8 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1.6fr)] md:gap-10">
              <h3 className="text-lg font-semibold tracking-tight">{t("reportTitle")}</h3>
              <p className="max-w-[68ch] text-base leading-relaxed text-muted-foreground">
                {t.rich("report", {
                  address: links.contact,
                  email: (chunks) => (
                    <a href={`mailto:${links.contact}`} className="font-medium text-accent-text underline-offset-4 hover:underline">
                      {chunks}
                    </a>
                  ),
                })}
              </p>
            </div>
          )}
        </div>
      </Section>

      {/* 5. Questions (Mercury, Resend). */}
      <Section labelledBy="security-faq" className="pt-0 md:pt-0">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.6fr)]">
          <h2 id="security-faq" className="text-3xl font-semibold leading-[1.1] tracking-[-0.02em]">
            {t("faqTitle")}
          </h2>
          <Faq items={faq} />
        </div>
      </Section>

      {/* 6. Closing call to action (Linear). */}
      <Section labelledBy="security-closing" className="pt-0 text-center md:pt-0">
        <div className="flex flex-col items-center gap-6 py-6">
          <h2 id="security-closing" className="text-[clamp(2rem,2vw+1.5rem,3rem)] leading-[1.05] font-semibold tracking-[-0.03em]">
            {t("closingTitle")}
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            <a href={links.signUp} className={cn(buttonVariants(), SITE_BUTTON)}>
              {nav("start")}
            </a>
            {links.demo && (
              <a href={links.demo} className={cn(buttonVariants({ variant: "outline" }), SITE_BUTTON)}>
                {nav("demo")}
              </a>
            )}
          </div>
        </div>
      </Section>

      <SiteFooter links={links} locale={locale} page="/security" />
    </>
  );
}
