"use client";

// Pattern: docs/patterns/margin.md §4 — Brex Reports' weekly graph: one bar per week of the period,
// the week's numbers on hover, and the same numbers in a table for screen readers.
import { useLocale, useTranslations } from "next-intl";
import { longDate, money } from "../format";

export function WeeklyChart({ weeks }: { weeks: { week: string; billedCents: number; marginCents: number }[] }) {
  const t = useTranslations("margin");
  const locale = useLocale();
  const max = Math.max(1, ...weeks.map((w) => Math.abs(w.marginCents)));
  const hasNegative = weeks.some((w) => w.marginCents < 0);
  const H = 160;
  const zero = hasNegative ? H / 2 : H;
  const scale = (hasNegative ? H / 2 : H) / max;
  const bar = 100 / Math.max(weeks.length, 1);
  return (
    <figure className="flex flex-col gap-2 rounded-lg border p-4" data-testid="weekly-chart">
      <figcaption className="text-sm font-medium">{t("chartTitle")}</figcaption>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-40 w-full" aria-hidden="true">
        <line x1="0" x2="100" y1={zero} y2={zero} className="stroke-border" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        {weeks.map((w, i) => {
          const h = Math.abs(w.marginCents) * scale;
          return (
            <rect key={w.week} x={i * bar + bar * 0.15} width={bar * 0.7} y={w.marginCents >= 0 ? zero - h : zero} height={Math.max(h, w.marginCents === 0 ? 0 : 0.5)} className={w.marginCents >= 0 ? "fill-primary" : "fill-destructive"}>
              <title>{`${longDate(w.week, locale)}: ${t("chartBar", { billed: money(w.billedCents, locale), margin: money(w.marginCents, locale) })}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{weeks[0] ? longDate(weeks[0].week, locale) : ""}</span>
        <span>{weeks.length > 1 ? longDate(weeks.at(-1)!.week, locale) : ""}</span>
      </div>
      <table className="sr-only">
        <caption>{t("chartTitle")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("week")}</th>
            <th scope="col">{t("cols.billed")}</th>
            <th scope="col">{t("cols.margin")}</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week}>
              <td>{longDate(w.week, locale)}</td>
              <td>{money(w.billedCents, locale)}</td>
              <td>{money(w.marginCents, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
