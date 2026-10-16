"use client";

// Pattern: docs/patterns/margin.md §4 — Brex Reports' weekly graph: one bar per week of the period,
// the week's numbers on hover, and the same numbers in a table for screen readers.
import { useLocale, useTranslations } from "next-intl";
import { longDate, money } from "../format";
import { niceTop } from "../home/charts";

export function WeeklyChart({ weeks }: { weeks: { week: string; billedCents: number; marginCents: number }[] }) {
  const t = useTranslations("margin");
  const locale = useLocale();
  // Drawn as Home draws its charts (decision 0029): hairline gridlines with their values on the
  // right, bars from zero, a loss below the zero line.
  const top = niceTop(Math.max(0, ...weeks.map((w) => w.marginCents)));
  const bottom = niceTop(Math.max(0, ...weeks.map((w) => -w.marginCents)));
  const range = top + bottom || 1;
  const y = (v: number) => ((top - v) / range) * 100;
  const lines = bottom > 0 ? [top, 0, -bottom] : top > 0 ? [top, top / 2, 0] : [0];
  // Axis values are round (1, 2 or 5 times a power of ten), so whole thousands or millions say them;
  // written out here so the server and the browser print the same text.
  const compact = (cents: number) => {
    const dollars = Math.abs(cents) / 100;
    const text = dollars >= 1_000_000 ? `${dollars / 1_000_000}M` : dollars >= 1_000 ? `${dollars / 1_000}K` : `${dollars}`;
    return `${cents < 0 ? "−" : ""}$${text}`;
  };
  return (
    <figure className="flex flex-col gap-3" data-testid="weekly-chart">
      <figcaption className="text-base font-semibold">{t("chartTitle")}</figcaption>
      <div className="relative h-44">
        {lines.map((v) => (
          <div key={v} className="absolute inset-x-0 flex items-center gap-2" style={{ top: `${y(v)}%`, transform: "translateY(-50%)" }} aria-hidden>
            <div className={v === 0 ? "h-px flex-1 bg-foreground/25" : "h-px flex-1 bg-border"} />
            <span className="w-14 text-right text-xs text-muted-foreground tabular-nums">{compact(v)}</span>
          </div>
        ))}
        <div className="absolute inset-y-0 right-16 left-0 flex gap-[2%] px-[1%]" aria-hidden>
          {weeks.map((w) => {
            const from = y(Math.max(w.marginCents, 0));
            const to = y(Math.min(w.marginCents, 0));
            return (
              <div key={w.week} className="relative flex-1" title={`${longDate(w.week, locale)}: ${t("chartBar", { billed: money(w.billedCents, locale), margin: money(w.marginCents, locale) })}`}>
                {w.marginCents !== 0 && (
                  <div className={w.marginCents > 0 ? "absolute inset-x-[18%] rounded-t-[3px] bg-foreground/80" : "absolute inset-x-[18%] rounded-b-[3px] bg-destructive/80"} style={{ top: `${from}%`, height: `${Math.max(to - from, 0.5)}%` }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mr-16 flex justify-between text-xs text-muted-foreground" aria-hidden>
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
