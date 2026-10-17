// Charts as Stripe draws them (decision 0029; docs/patterns/home.md and margin.md), from its own
// screenshots: Home's overview cards (https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights)
// — a line over hairline gridlines on round steps, each gridline's value at its right end, the
// period before as a dashed line, the first and last dates under it; Home's "Today" — the line of
// the day so far over a hairline for each step of the day, no values, an end dot, the first and last
// times under it; and the app overview's bars (https://docs.stripe.com/stripe-apps/patterns/chart-layout)
// — wide bars from zero on gridlines, each bar's date under it. The same numbers are in a table for
// screen readers.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { gridTicks } from "../chart-axis";
import { Tip } from "../tip";

interface Point {
  label: string;
  value: number;
}

/** Hairline gridlines at `ticks` (top first), each value written at the line's right end. */
function Gridlines({ ticks, labels, height, children }: { ticks: number[]; labels: string[]; height: number; children: ReactNode }) {
  const top = ticks[0] ?? 0;
  const bottom = ticks.at(-1) ?? 0;
  const span = top - bottom || 1;
  return (
    <div className="relative" style={{ height }}>
      {ticks.map((v, i) => (
        <div key={v} className="absolute inset-x-0 flex items-center gap-2.5" style={{ top: `${((top - v) / span) * 100}%`, transform: "translateY(-50%)" }} aria-hidden>
          <div className={cn("h-px flex-1", v === 0 && bottom < 0 ? "bg-foreground/25" : "bg-border")} />
          <span className="w-11 text-xs text-muted-foreground tabular-nums">{labels[i]}</span>
        </div>
      ))}
      <div className="absolute inset-y-0 right-[3.375rem] left-0">{children}</div>
    </div>
  );
}

/**
 * The chart's numbers for screen readers. The box around the table is what is hidden: a table grows
 * to fit its rows whatever size it is given, so hidden on its own it would still push the page wider
 * and taller than the frame.
 */
function ScreenReaderTable({ caption, head, rows }: { caption: string; head?: string[]; rows: string[][] }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        {head && (
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map(([first, ...rest]) => (
            <tr key={first}>
              <th scope="row">{first}</th>
              {rest.map((cell, i) => (
                <td key={i}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** An SVG path through `values`, the i-th at i/steps of the width (steps: the whole axis, which a line may stop short of). */
const path = (values: number[], y: (v: number) => number, steps = Math.max(values.length - 1, 1)) => values.map((v, i) => `${i === 0 ? "M" : "L"}${(i / steps) * 100},${y(v)}`).join(" ");

/**
 * Stripe Home's overview chart: the line of this period, the period before dashed under it, gridlines
 * on round steps of `unit` (100 cents: dollars; 60 minutes: hours) written by `axis`.
 */
export function LineChart({
  points,
  previous,
  axis,
  format,
  caption,
  height = 176,
  unit = 1,
}: {
  points: Point[];
  previous?: number[];
  axis: (ticks: number[]) => string[];
  format: (n: number) => string;
  caption: string;
  height?: number;
  unit?: number;
}) {
  const ticks = gridTicks({ max: Math.max(0, ...points.map((p) => p.value), ...(previous ?? [])), unit, intervals: 3 });
  const top = ticks[0]!;
  const y = (v: number) => (top > 0 ? 100 - (Math.max(v, 0) / top) * 100 : 100);
  return (
    <figure className="flex flex-col gap-2.5">
      <Gridlines ticks={ticks} labels={axis(ticks)} height={height}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="size-full overflow-visible" aria-hidden>
          {previous && previous.length === points.length && <path d={path(previous, y)} fill="none" className="stroke-foreground/30" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          <path d={path(points.map((p) => p.value), y)} fill="none" className="stroke-foreground" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      </Gridlines>
      <div className="mr-[3.375rem] flex justify-between text-[13px] text-muted-foreground" aria-hidden>
        <span>{points[0]?.label}</span>
        <span>{points.at(-1)?.label}</span>
      </div>
      <ScreenReaderTable caption={caption} rows={points.map((p) => [p.label, format(p.value)])} />
    </figure>
  );
}

/**
 * Stripe Home's "Today" chart: the running total so far as a line over a hairline for each step (here
 * each day of the pay period), no gridline values, a dot where the line ends (the latest day with
 * hours), the first and last steps under it. `table`: the screen readers' rows, with their headings.
 */
export function TodayChart({ totals, first, last, through, note, caption, table, height = 112 }: { totals: number[]; first: string; last: string; through: number; note?: string; caption: string; table: { head: string[]; rows: string[][] }; height?: number }) {
  const top = Math.max(0, ...totals);
  const y = (v: number) => (top > 0 ? 100 - (v / top) * 92 : 100);
  const n = Math.max(totals.length - 1, 1);
  // Up to the last day with hours, as Stripe's line stops at the time now.
  const drawn = totals.slice(0, Math.max(through + 1, 1));
  return (
    <figure className="flex flex-col gap-2.5">
      {note && <figcaption className="self-end text-[13px] text-foreground/70">{note}</figcaption>}
      <div className="relative border-b border-border" style={{ height }} aria-hidden>
        {totals.map((_, i) => (
          <div key={i} className="absolute inset-y-0 w-px bg-border/70" style={{ left: `${(i / n) * 100}%` }} />
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          <path d={path(drawn, y, n)} fill="none" className="stroke-foreground" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {top > 0 && <div className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" style={{ left: `${((drawn.length - 1) / n) * 100}%`, top: `${y(drawn.at(-1) ?? 0)}%` }} />}
      </div>
      <div className="flex justify-between text-[13px] text-muted-foreground" aria-hidden>
        <span>{first}</span>
        <span>{last}</span>
      </div>
      <ScreenReaderTable caption={caption} head={table.head} rows={table.rows} />
    </figure>
  );
}

/**
 * Stripe's bar chart (app overview "Revenue from members"): a wide bar per step from zero, a loss
 * below the zero line, four steps of gridlines, each bar's label under it when there is room.
 */
export function ColumnChart({ points, axis, caption, head, rows, height = 208, unit = 1, title }: { points: (Point & { hint?: string })[]; axis: (ticks: number[]) => string[]; caption: string; head: string[]; rows: string[][]; height?: number; unit?: number; title?: string }) {
  const ticks = gridTicks({ max: Math.max(0, ...points.map((p) => p.value)), min: Math.min(0, ...points.map((p) => p.value)), unit, intervals: 4 });
  const top = ticks[0]!;
  const bottom = ticks.at(-1)!;
  const span = top - bottom || 1;
  const y = (v: number) => ((top - v) / span) * 100;
  // Every label when they fit (Stripe writes one under each bar); every other one, then first and last.
  const every = points.length <= 13 ? 1 : points.length <= 26 ? 2 : 0;
  return (
    <figure className="flex flex-col gap-2.5" data-testid="weekly-chart">
      {title && <figcaption className="text-base font-semibold">{title}</figcaption>}
      <Gridlines ticks={ticks} labels={axis(ticks)} height={height}>
        {/* The bar under the pointer stays, the others step back (Primer hover timing); its value in a tooltip. */}
        <div className="group/bars flex size-full" aria-hidden>
          {points.map((p) => {
            const from = y(Math.max(p.value, 0));
            const to = y(Math.min(p.value, 0));
            return (
              <Tip key={p.label} label={p.hint}>
                <div className="relative flex-1 transition-opacity group-hover/bars:opacity-50 hover:opacity-100!">
                  {p.value !== 0 && <div className={cn("absolute inset-x-[14%]", p.value > 0 ? "rounded-t-[2px] bg-foreground/80" : "rounded-b-[2px] bg-destructive/80")} style={{ top: `${from}%`, height: `${Math.max(to - from, 0.5)}%` }} />}
                </div>
              </Tip>
            );
          })}
        </div>
      </Gridlines>
      <div className="mr-[3.375rem] flex text-[13px] text-muted-foreground" aria-hidden>
        {every > 0 ? (
          points.map((p, i) => (
            <span key={p.label} className="flex-1 truncate text-center">
              {i % every === 0 ? p.label : ""}
            </span>
          ))
        ) : (
          <span className="flex w-full justify-between">
            <span>{points[0]?.label}</span>
            <span>{points.at(-1)?.label}</span>
          </span>
        )}
      </div>
      <ScreenReaderTable caption={caption} head={head} rows={rows} />
    </figure>
  );
}
