// Pattern: docs/patterns/site.md §6 — Linear /build's "two plates": a wide panel holding two isometric
// plates stacked one above the other and joined by dashed verticals, chevrons climbing on one side and
// falling on the other, and four mono captions set two by two on either side. Here the plates are the two
// readings of one set of hours, their fields compared cell by cell (each lights in turn, both plates
// together); one field differs on both and waits for a person. Abstract fields, no timesheet drawn.
import { Mono, SplitHead } from "@/components/site/v6/ui";

const COLS = 5;
const ROWS = 3;
const DIFF = { u: 3, v: 1 };

/** A point on a plate whose top corner is at (cx, cy − b): u runs down-right, v down-left. */
const at = (cx: number, cy: number, a: number, b: number, u: number, v: number) => [cx + (u - v) * a, cy - b + (u + v) * b] as const;

function Plate({ cx, cy, label, value, delay }: { cx: number; cy: number; label: string; value: string; delay: number }) {
  const a = 210;
  const b = 105;
  const t = 12;
  const p = (u: number, v: number) => at(cx, cy, a, b, u, v).join(",");
  const cells = [];
  for (let v = 0; v < ROWS; v++) {
    for (let u = 0; u < COLS; u++) {
      const pad = 0.12;
      const u0 = (u + pad) / COLS;
      const u1 = (u + 1 - pad) / COLS;
      const v0 = (v + pad) / ROWS;
      const v1 = (v + 1 - pad) / ROWS;
      const diff = u === DIFF.u && v === DIFF.v;
      cells.push(
        <polygon
          key={`${u}-${v}`}
          points={`${p(u0, v0)} ${p(u1, v0)} ${p(u1, v1)} ${p(u0, v1)}`}
          className={diff ? "fill-amber-400/25 stroke-amber-500" : "animate-site-cell fill-[var(--s-accent)]/0 stroke-[var(--s-text)]/25"}
          strokeWidth={diff ? 1.5 : 1}
          style={diff ? undefined : { animationDelay: `${(v * COLS + u) * 0.22 + delay}s` }}
        />,
      );
    }
  }
  const [tx, ty] = at(cx, cy, a, b, 0, 0);
  const [rx, ry] = at(cx, cy, a, b, 1, 0);
  const [bx, by] = at(cx, cy, a, b, 1, 1);
  const [lx, ly] = at(cx, cy, a, b, 0, 1);
  const [dx, dy] = at(cx, cy, a, b, (DIFF.u + 0.5) / COLS, (DIFF.v + 0.5) / ROWS);
  return (
    <g>
      {/* The plate's two visible edges, then its face. */}
      <polygon points={`${lx},${ly} ${bx},${by} ${bx},${by + t} ${lx},${ly + t}`} className="fill-[#e9e7e1] stroke-[var(--s-text)]/30" strokeWidth="1" />
      <polygon points={`${bx},${by} ${rx},${ry} ${rx},${ry + t} ${bx},${by + t}`} className="fill-[#dedbd3] stroke-[var(--s-text)]/30" strokeWidth="1" />
      <polygon points={`${tx},${ty} ${rx},${ry} ${bx},${by} ${lx},${ly}`} className="fill-white stroke-[var(--s-text)]/35" strokeWidth="1" />
      {cells}
      <text x={tx} y={ty - 14} textAnchor="middle" className="fill-[var(--s-muted)] font-mono text-[11px] tracking-[0.08em]">
        {label}
      </text>
      <text x={dx} y={dy + 5} textAnchor="middle" className="fill-amber-700 font-mono text-[14px] font-semibold">
        {value}
      </text>
    </g>
  );
}

function Chevrons({ x, up }: { x: number; up: boolean }) {
  return (
    <g className="stroke-[var(--s-text)]/40" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {[0, 1, 2, 3, 4].map((i) => {
        const y = 175 + i * 38;
        return <path key={i} d={up ? `M${x - 7} ${y + 4}l7 -7l7 7` : `M${x - 7} ${y - 4}l7 7l7 -7`} className="animate-site-chevron" style={{ animationDelay: `${(up ? 4 - i : i) * 0.2}s` }} />;
      })}
    </g>
  );
}

export function ReadTwice({ id, l }: { id: string; l: { eyebrow: string; title: string; muted: string; body: string; a: string; b: string; captions: [string, string][]; decide: string } }) {
  const A = { cx: 480, cy: 135 };
  const B = { cx: 480, cy: 375 };
  const [dax, day] = at(A.cx, A.cy, 210, 105, (DIFF.u + 0.5) / COLS, (DIFF.v + 0.5) / ROWS);
  const [dbx, dby] = at(B.cx, B.cy, 210, 105, (DIFF.u + 0.5) / COLS, (DIFF.v + 0.5) / ROWS);
  const caption = ([title, body]: [string, string], align: "left" | "right") => (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <Mono className="block text-[var(--s-text)]">{title}</Mono>
      <Mono className="mt-2 block leading-relaxed text-[var(--s-muted)] normal-case tracking-[0.02em]">{body}</Mono>
    </div>
  );
  return (
    <section aria-labelledby={id} data-tone="paper" className="px-6 py-28 md:py-40">
      <div className="mx-auto w-full max-w-[1240px]">
        <SplitHead id={id} eyebrow={l.eyebrow} title={l.title} muted={l.muted} body={l.body} />
        <div className="site-reveal site-dots mt-16 grid grid-cols-1 items-center gap-10 rounded-2xl bg-white/70 px-6 py-14 ring-1 ring-[var(--s-line)] [--reveal-delay:150ms] md:mt-20 lg:grid-cols-[200px_minmax(0,1fr)_200px] lg:px-12">
          <div className="hidden flex-col gap-16 lg:flex">
            {caption(l.captions[0]!, "right")}
            {caption(l.captions[1]!, "right")}
          </div>
          <svg viewBox="150 10 660 500" className="w-full" role="img" aria-label={`${l.a} · ${l.b} · ${l.decide}`}>
            {/* The dashed verticals joining the plates' corners. */}
            <g className="stroke-[var(--s-text)]/25" strokeDasharray="3 4" strokeWidth="1">
              <line x1={A.cx - 210} y1={A.cy} x2={B.cx - 210} y2={B.cy} />
              <line x1={A.cx + 210} y1={A.cy} x2={B.cx + 210} y2={B.cy} />
              <line x1={A.cx} y1={A.cy + 117} x2={B.cx} y2={B.cy - 105} />
            </g>
            <Chevrons x={190} up />
            <Chevrons x={770} up={false} />
            <Plate cx={B.cx} cy={B.cy} label={l.b} value="6" delay={0.05} />
            <Plate cx={A.cx} cy={A.cy} label={l.a} value="8" delay={0} />
            {/* The two readings of the one field that differs, joined, and who decides. */}
            <line x1={dax} y1={day + 12} x2={dbx} y2={dby - 12} className="stroke-amber-500" strokeWidth="1.5" strokeDasharray="2 3" />
            <g transform={`translate(${dax + 40} ${(day + dby) / 2})`}>
              <rect x="0" y="-15" width="190" height="30" rx="15" className="fill-[var(--s-text)]" />
              <text x="95" y="5" textAnchor="middle" className="fill-white font-mono text-[11px] tracking-[0.06em]">
                {l.decide}
              </text>
            </g>
          </svg>
          <div className="hidden flex-col gap-16 lg:flex">
            {caption(l.captions[2]!, "left")}
            {caption(l.captions[3]!, "left")}
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:hidden">
            {l.captions.map((c) => (
              <div key={c[0]}>{caption(c, "left")}</div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
