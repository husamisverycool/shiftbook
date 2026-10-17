// Pattern: docs/patterns/tools/il-720-hours.md — Gusto's free calculator page: eyebrow, a promise for
// a title, one intro paragraph, the tool with its results under it, one line and one button into the
// product, the explanation with the primary source, Rippling's "nothing is saved", the disclaimer.
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HoursChecker } from "@/components/shiftbook/tools/hours-checker";
import { Page } from "@/components/shiftbook/page";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

const STATUTE = "https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=2417&ChapterID=68";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "hoursChecker" });
  return { title: t("metaTitle"), description: t("intro") };
}

export default async function IllinoisHoursPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("hoursChecker");
  const sections = ["rule", "counts", "long", "near", "after"] as const;
  return (
    <Page width="narrow" className="max-w-5xl gap-12">
      <header className="flex max-w-3xl flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">{t("eyebrow")}</p>
        <h1 className="text-[28px] leading-9 font-bold tracking-tight text-balance">{t("title")}</h1>
        <p className="text-base text-muted-foreground">{t("intro")}</p>
      </header>

      <HoursChecker />

      <section className="flex max-w-3xl flex-col items-start gap-3 border-t pt-8" aria-labelledby="demo-line">
        <p id="demo-line" className="text-sm">
          {t("demo.line")}
        </p>
        <Link href="/sign-in" className={buttonVariants({ variant: "outline" })} data-testid="checker-demo">
          {t("demo.button")}
        </Link>
      </section>

      <section className="flex max-w-3xl flex-col gap-6" aria-labelledby="how">
        <h2 id="how" className="text-xl font-semibold">
          {t("how.heading")}
        </h2>
        {sections.map((s) => (
          <div key={s} className="flex flex-col gap-1.5">
            <h3 className="text-base font-semibold">{t(`how.${s}Heading`)}</h3>
            <p className="text-sm leading-6 text-muted-foreground">{t(`how.${s}`)}</p>
            {s === "rule" && (
              <a href={STATUTE} target="_blank" rel="noopener noreferrer" className="w-fit rounded-sm text-sm font-medium underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
                {t("how.statute")}
              </a>
            )}
          </div>
        ))}
      </section>

      <section className="flex max-w-3xl flex-col gap-1.5" aria-labelledby="privacy">
        <h2 id="privacy" className="text-base font-semibold">
          {t("privacy.heading")}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">{t("privacy.body")}</p>
      </section>

      <p className="max-w-3xl text-xs text-muted-foreground italic">{t("disclaimer")}</p>
    </Page>
  );
}
