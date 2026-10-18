// A figure's small trend line (decision 0046; Stripe's KPI pattern — label, figure, then a small line
// with no axes or values). Decorative: the figure beside it and the page's table carry the numbers.
import { cn } from "@/lib/utils";

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const top = Math.max(...values);
  const bottom = Math.min(0, ...values);
  const span = top - bottom || 1;
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${(i / (values.length - 1)) * 100},${4 + ((top - v) / span) * 92}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cn("h-6 w-24 overflow-visible", className)} aria-hidden data-slot="sparkline">
      <path d={d} fill="none" className="stroke-chart-1" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
