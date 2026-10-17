"use client";

// Pattern: docs/patterns/margin.md §4 — Brex Reports' weekly graph (one bar per week of the period, the
// week's numbers on hover and in a table for screen readers), drawn as Stripe's app overview draws its
// bar chart (https://docs.stripe.com/stripe-apps/patterns/chart-layout): wide bars from zero on four
// steps of gridlines, each bar's week under it, a loss below the zero line.
import { useLocale, useTranslations } from "next-intl";
import { axisMoney, longDate, money } from "../format";
import { ColumnChart } from "../home/charts";

export function WeeklyChart({ weeks }: { weeks: { week: string; billedCents: number; marginCents: number }[] }) {
  const t = useTranslations("margin");
  const locale = useLocale();
  const short = (iso: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  return (
    <ColumnChart
      title={t("chartTitle")}
      caption={t("chartTitle")}
      unit={100}
      axis={axisMoney}
      points={weeks.map((w) => ({ label: short(w.week), value: w.marginCents, hint: `${longDate(w.week, locale)}: ${t("chartBar", { billed: money(w.billedCents, locale), margin: money(w.marginCents, locale) })}` }))}
      head={[t("week"), t("cols.billed"), t("cols.margin")]}
      rows={weeks.map((w) => [longDate(w.week, locale), money(w.billedCents, locale), money(w.marginCents, locale)])}
    />
  );
}
