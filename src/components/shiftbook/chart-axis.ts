/**
 * Where a chart's gridlines fall (decision 0029; docs/patterns/home.md and margin.md): round steps of
 * the unit the axis shows (dollars for cents, hours for minutes) — 1, 2, 2.5 or 5 times a power of ten,
 * never less than one unit — as Stripe's charts step "$1.5K, $1.0K, $500, $0". Integers in, integers out.
 */
const STEPS = [1, 2, 2.5, 5];

function niceStep(span: number): number {
  if (span <= 1) return 1;
  let power = 10 ** Math.floor(Math.log10(span));
  for (;;) {
    for (const s of STEPS) if (s * power >= span) return s * power;
    power *= 10;
  }
}

/**
 * The gridlines from the top down: at most `intervals` steps covering `min` (0 unless a value is below
 * zero) to `max`, both in the raw unit (cents, minutes); `unit` is one shown unit (100 cents, 60 minutes).
 */
export function gridTicks({ max, min = 0, unit, intervals }: { max: number; min?: number; unit: number; intervals: number }): number[] {
  const hi = Math.max(max, 0) / unit;
  const lo = Math.min(min, 0) / unit;
  const step = niceStep((hi - lo) / intervals);
  const top = Math.max(Math.ceil(hi / step), lo < 0 ? 0 : 1) * step;
  const bottom = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let v = top; v >= bottom - step / 2; v -= step) ticks.push(Math.round(v * unit));
  return ticks;
}

/** Each value added to the ones before it (Stripe Home's Today line, rising through the day). */
export function runningTotals(values: number[]): number[] {
  let sum = 0;
  return values.map((v) => (sum += v));
}
