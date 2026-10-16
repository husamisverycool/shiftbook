// Charts as Stripe Home draws them (decision 0029; docs/patterns/home.md): a line over hairline
// gridlines, the gridlines' values on the right, the first and last dates under it; bars start at
// zero (Apple HIG charts). The same numbers are in a table for screen readers.
import type { ReactNode } from "react";

interface Point {
  label: string;
  value: number;
}

/** Up to three hairline gridlines (zero, half, top) with their values on the right. */
function Grid({ top, format, height, children }: { top: number; format: (n: number) => string; height: number; children: ReactNode }) {
  const lines = top > 0 ? [top, top / 2, 0] : [0];
  return (
    <div className="relative" style={{ height }}>
      {lines.map((v) => (
        <div key={v} className="absolute inset-x-0 flex items-center gap-2" style={{ top: `${(1 - (top > 0 ? v / top : 0)) * 100}%`, transform: "translateY(-50%)" }} aria-hidden>
          <div className="h-px flex-1 bg-border" />
          <span className="w-14 text-right text-xs text-muted-foreground tabular-nums">{format(v)}</span>
        </div>
      ))}
      <div className="absolute inset-y-0 right-16 left-0">{children}</div>
    </div>
  );
}

/**
 * The chart's numbers for screen readers. The box around the table is what is hidden: a table grows
 * to fit its rows whatever size it is given, so hidden on its own it would still push the page wider
 * and taller than the frame.
 */
function ScreenReaderTable({ caption, points, format }: { caption: string; points: Point[]; format: (n: number) => string }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `unit`: the size of one displayed unit (60 for minutes shown as hours), so the gridlines fall on round numbers of it. */
export function LineChart({ points, format, caption, height = 140, unit = 1 }: { points: Point[]; format: (n: number) => string; caption: string; height?: number; unit?: number }) {
  const top = niceTop(Math.max(0, ...points.map((p) => p.value)) / unit) * unit;
  const n = Math.max(points.length - 1, 1);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i / n) * 100},${top > 0 ? 100 - (Math.max(p.value, 0) / top) * 100 : 100}`).join(" ");
  return (
    <figure className="flex flex-col gap-2">
      <Grid top={top} format={format} height={height}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="size-full overflow-visible" aria-hidden>
          <path d={path} fill="none" className="stroke-foreground" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      </Grid>
      <div className="mr-16 flex justify-between text-xs text-muted-foreground" aria-hidden>
        <span>{points[0]?.label}</span>
        <span>{points.at(-1)?.label}</span>
      </div>
      <ScreenReaderTable caption={caption} points={points} format={format} />
    </figure>
  );
}

export function BarChart({ points, format, caption, height = 140, unit = 1 }: { points: Point[]; format: (n: number) => string; caption: string; height?: number; unit?: number }) {
  const top = niceTop(Math.max(0, ...points.map((p) => p.value)) / unit) * unit;
  return (
    <figure className="flex flex-col gap-2">
      <Grid top={top} format={format} height={height}>
        <div className="flex size-full items-end gap-[6%] px-[2%]" aria-hidden>
          {points.map((p) => (
            <div key={p.label} className="flex-1 rounded-t-[3px] bg-foreground/80" style={{ height: `${top > 0 ? (Math.max(p.value, 0) / top) * 100 : 0}%` }} title={`${p.label}: ${format(p.value)}`} />
          ))}
        </div>
      </Grid>
      <div className="mr-16 flex justify-between gap-[6%] px-[2%] text-xs text-muted-foreground" aria-hidden>
        {points.map((p) => (
          <span key={p.label} className="flex-1 text-center">
            {p.label}
          </span>
        ))}
      </div>
      <ScreenReaderTable caption={caption} points={points} format={format} />
    </figure>
  );
}

/** A round top for the gridlines: 1, 2 or 5 times a power of ten at or above the largest value. */
export function niceTop(max: number): number {
  if (max <= 0) return 0;
  const power = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) if (step * power >= max) return step * power;
  return 10 * power;
}
