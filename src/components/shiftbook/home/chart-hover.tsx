"use client";

// A line chart's hover (decision 0046; Primer's line chart anatomy): a vertical crosshair at the
// nearest step, a point on the line, and a tooltip with the step's label and value (and the period
// before's, when drawn). The values arrive already written, so the server keeps the formatting.
import { useState, type PointerEvent } from "react";

export interface HoverPoint {
  label: string;
  value: string;
  /** The period before at this step, written out ("$1,200 previous period"). */
  previous?: string;
  /** The point's height, 0 (top) to 100 (bottom), as the line draws it. */
  top: number;
}

export function ChartHover({ points }: { points: HoverPoint[] }) {
  const [at, setAt] = useState<number | null>(null);
  const steps = Math.max(points.length - 1, 1);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = box.width > 0 ? (e.clientX - box.left) / box.width : 0;
    setAt(Math.min(Math.max(Math.round(x * steps), 0), points.length - 1));
  };
  const p = at === null ? undefined : points[at];
  const left = at === null ? 0 : (at / steps) * 100;
  return (
    <div className="absolute inset-0" onPointerMove={move} onPointerLeave={() => setAt(null)} aria-hidden data-testid="chart-hover">
      {p && (
        <>
          <div className="pointer-events-none absolute inset-y-0 w-px bg-foreground/20" style={{ left: `${left}%` }} />
          <div className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-1 ring-2 ring-background" style={{ left: `${left}%`, top: `${p.top}%` }} />
          {/* Kept inside the chart: slid left by as much of its width as the point is across. */}
          <div className="pointer-events-none absolute -top-2 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-sm" style={{ left: `${left}%`, transform: `translate(-${left}%, -100%)` }}>
            <div className="text-muted-foreground">{p.label}</div>
            <div className="flex items-center gap-1.5 font-semibold tabular-nums">
              <span className="size-2 rounded-full bg-chart-1" />
              {p.value}
            </div>
            {p.previous !== undefined && (
              <div className="flex items-center gap-1.5 text-muted-foreground tabular-nums">
                <span className="w-2 border-t border-dashed border-muted-foreground" />
                {p.previous}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
