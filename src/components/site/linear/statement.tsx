// Pattern: docs/patterns/site.md — Linear's statement and its three figures (linear.app, 2026-10-20): the
// statement in 48px weight 510, grey with its first sentence in white; under it three columns split by
// hairlines, each a monochrome isometric line drawing in fine strokes, a 15px title (#d0d6e0, 510) and a
// 15px grey sentence no wider than 250px. Hovering a column lifts the drawing's layers apart.
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Isometric projection: x to the right-down, y to the left-down, z up. */
const iso = (x: number, y: number, z: number): [number, number] => [(x - y) * 0.866, (x + y) * 0.5 - z];
const pts = (list: [number, number, number][]) =>
  list
    .map((p) => iso(...p))
    .map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`)
    .join(" ");

/** A flat slab: its top face and the two visible sides. */
function Slab({ x = 0, y = 0, z, w, d, h = 4, accent, dashed }: { x?: number; y?: number; z: number; w: number; d: number; h?: number; accent?: boolean; dashed?: boolean }) {
  const top: [number, number, number][] = [
    [x, y, z + h],
    [x + w, y, z + h],
    [x + w, y + d, z + h],
    [x, y + d, z + h],
  ];
  const right: [number, number, number][] = [
    [x + w, y, z + h],
    [x + w, y + d, z + h],
    [x + w, y + d, z],
    [x + w, y, z],
  ];
  const front: [number, number, number][] = [
    [x, y + d, z + h],
    [x + w, y + d, z + h],
    [x + w, y + d, z],
    [x, y + d, z],
  ];
  const stroke = "#D0D6E0";
  return (
    <g fill="none" stroke={stroke} strokeWidth={0.7} strokeOpacity={accent ? 0.85 : 0.5} strokeDasharray={dashed ? "2 3" : undefined} strokeLinejoin="round">
      <polygon points={pts(top)} fill={accent ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)"} />
      {h > 0 && <polygon points={pts(right)} fill="rgba(255,255,255,0.015)" />}
      {h > 0 && <polygon points={pts(front)} fill="rgba(255,255,255,0.03)" />}
    </g>
  );
}

/** A layer that rises by `lift` when its column is hovered, after `delay`. */
function Layer({ lift, delay, children }: { lift: number; delay: number; children: React.ReactNode }) {
  return (
    <g className="site-morph group-hover/fig:[transform:translateY(var(--lift))]" style={{ "--lift": `${-lift}px`, transitionDelay: `${delay}ms` } as CSSProperties}>
      {children}
    </g>
  );
}

/** FIG 0.1 — the sheet's grid, and two readings floating over it; the one cell they disagree on is lit. */
function ReadTwiceFig() {
  const cells: (readonly [number, number])[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cells.push([c, r] as const);
  const grid = (z: number, all: boolean) =>
    cells.filter(([c, r]) => all || (c === 3 && r === 0)).map(([c, r]) => <Slab key={`${z}-${c}-${r}`} x={8 + c * 26} y={8 + r * 26} z={z} w={20} d={20} h={0} accent={c === 3 && r === 0} />);
  return (
    <svg viewBox="-125 -128 250 245" className="w-full overflow-visible" aria-hidden>
      <Slab z={0} w={112} d={112} h={6} />
      {grid(6, true)}
      <Layer lift={10} delay={0}>
        <Slab z={46} w={112} d={112} h={0} dashed />
        {grid(46, false)}
      </Layer>
      <Layer lift={22} delay={60}>
        <Slab z={92} w={112} d={112} h={0} dashed />
        {grid(92, false)}
      </Layer>
      {/* The two readings' corners, joined to the sheet. */}
      {[
        [0, 0],
        [112, 0],
        [112, 112],
        [0, 112],
      ].map(([x, y]) => {
        const [x1, y1] = iso(x!, y!, 6);
        const [, y2] = iso(x!, y!, 92);
        return <line key={`${x}-${y}`} x1={x1} y1={y1} x2={x1} y2={y2} stroke="#D0D6E0" strokeOpacity=".3" strokeWidth=".6" strokeDasharray="1.5 3" />;
      })}
    </svg>
  );
}

/** FIG 0.2 — the rule books stacked, each with its jurisdiction's tab; the top one lit. */
function RulesFig() {
  const books = [0, 1, 2, 3, 4];
  return (
    <svg viewBox="-125 -100 250 205" className="w-full overflow-visible" aria-hidden>
      {books.map((b) => (
        <Layer key={b} lift={b * 7} delay={b * 45}>
          <Slab z={b * 16} w={110} d={84} h={7} accent={b === 4} />
          <Slab x={110} y={[52, 10, 66, 24, 38][b]!} z={b * 16} w={14} d={12} h={7} accent={b === 4} />
        </Layer>
      ))}
    </svg>
  );
}

/** FIG 0.3 — one file per payroll system, fanned. */
function FilesFig() {
  const files = [0, 1, 2, 3, 4];
  return (
    <svg viewBox="-110 -95 250 205" className="w-full overflow-visible" aria-hidden>
      {files.map((f) => (
        <Layer key={f} lift={f * 6} delay={f * 45}>
          <Slab x={f * 18} y={-f * 6} z={f * 12} w={62} d={92} h={2} accent={f === 4} />
          {/* The file's rows. */}
          {[0, 1, 2, 3].map((r) => {
            const [x1, y1] = iso(f * 18 + 10, -f * 6 + 18 + r * 16, f * 12 + 2);
            const [x2, y2] = iso(f * 18 + 52, -f * 6 + 18 + r * 16, f * 12 + 2);
            return <line key={r} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#D0D6E0" strokeOpacity={f === 4 ? 0.6 : 0.3} strokeWidth=".7" />;
          })}
        </Layer>
      ))}
    </svg>
  );
}

const FIGS = [ReadTwiceFig, RulesFig, FilesFig];

export function Statement({ id, strong, rest, items }: { id: string; strong: string; rest: string; items: { title: string; body: string }[] }) {
  return (
    <section aria-labelledby={id} className="pt-24 pb-32 md:pt-28 md:pb-40">
      <div className="mx-auto w-full max-w-[1440px] px-6 md:px-20">
        <h2 id={id} className="site-reveal max-w-[1250px] l-title-6 text-[var(--l-text-3)]">
          <strong className="font-[510] text-[var(--l-text)]">{strong}</strong> {rest}
        </h2>
        <ul className="mt-20 grid grid-cols-1 md:mt-32 md:grid-cols-3">
          {items.map((item, i) => {
            const Fig = FIGS[i]!;
            return (
              <li key={item.title} className={cn("site-reveal group/fig flex flex-col gap-10 py-8 md:px-8 md:py-0", i > 0 && "border-t border-[var(--l-line)] md:border-t-0 md:border-l", i === 0 && "md:pl-0")} style={{ ["--reveal-delay" as string]: `${i * 80}ms` }}>
                <div className="flex h-64 w-full max-w-[300px] items-center justify-center [&>svg]:max-h-full">
                  <Fig />
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="l-text-regular font-[510] text-[var(--l-text-2)]">{item.title}</h3>
                  <p className="max-w-[250px] l-text-regular text-[var(--l-text-3)]">{item.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
