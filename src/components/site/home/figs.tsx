// Pattern: docs/patterns/site.md §2 — Linear's FIG 0.1–0.3: three columns split by hairlines, each with a
// small figure label, a monochrome isometric line drawing in fine strokes, and a title with a sentence;
// hovering a column lifts the drawing's layers apart, one after another. Pure SVG and CSS.
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
  const stroke = accent ? "var(--s-accent-soft)" : "#D0D6E0";
  return (
    <g fill="none" stroke={stroke} strokeWidth={accent ? 1 : 0.7} strokeOpacity={accent ? 0.95 : 0.55} strokeDasharray={dashed ? "2 3" : undefined} strokeLinejoin="round">
      <polygon points={pts(top)} fill={accent ? "rgba(140,150,255,0.14)" : "rgba(255,255,255,0.025)"} />
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
            return <line key={r} x1={x1} y1={y1} x2={x2} y2={y2} stroke={f === 4 ? "var(--s-accent-soft)" : "#D0D6E0"} strokeOpacity={f === 4 ? 0.8 : 0.3} strokeWidth=".7" />;
          })}
        </Layer>
      ))}
    </svg>
  );
}

const FIGS = [ReadTwiceFig, RulesFig, FilesFig];

export function Figs({ items }: { items: { label: string; title: string; body: string }[] }) {
  return (
    <ul className="grid grid-cols-1 border-y border-[var(--s-dline)] md:grid-cols-3">
      {items.map((item, i) => {
        const Fig = FIGS[i]!;
        return (
          <li key={item.label} className={cn("group/fig flex flex-col gap-6 px-2 py-8 md:px-8", i > 0 && "border-t border-[var(--s-dline)] md:border-t-0 md:border-l")}>
            <span className="font-mono text-[11px] text-[var(--s-dmuted)]">{item.label}</span>
            <div className="mx-auto flex h-56 w-full max-w-[300px] items-center justify-center [&>svg]:max-h-full">
              <Fig />
            </div>
            <div>
              <h3 className="text-[15px] font-medium text-[var(--s-dtext)]">{item.title}</h3>
              <p className="mt-1 max-w-[36ch] text-[15px] leading-relaxed text-[var(--s-dmuted)]">{item.body}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
