// Pattern: docs/patterns/site.md §10 — Stripe's "Connect to existing systems": on a dark field of fine dots,
// the product's tile in the middle, dotted lines running out to solid label pills and on to what it
// connects with — a tray of tiles at each side, rows of dashed ghost boxes above and below — and a light
// travelling each line. Here: the ways hours arrive (left), the dated rule books (top), the payroll
// systems the file is written for (right), one invoice per client (bottom). Phones: the four as a list.
import { Building2, Camera, Clock, FileSpreadsheet, Mail, MessageSquare, type LucideIcon } from "lucide-react";
import { TabuladoMark } from "@/components/shiftbook/brand-mark";
import { Mono, SplitHead } from "@/components/site/v6/ui";

const W = 1200;
const H = 560;
const C = { x: 600, y: 280 };
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

export interface HubLabels {
  eyebrow: string;
  title: string;
  muted: string;
  body: string;
  inLabel: string;
  inPill: string;
  rulesPill: string;
  outPill: string;
  invoicePill: string;
  sources: [string, string, string, string, string, string];
  books: string[];
  never: string;
}

const ICONS: LucideIcon[] = [Mail, MessageSquare, Camera, Clock, FileSpreadsheet, Building2];

function Line({ d, out, delay }: { d: string; out: boolean; delay: number }) {
  return (
    <g>
      <path d={d} fill="none" stroke="rgb(255 255 255 / 0.28)" strokeWidth="1.2" strokeDasharray="1 5" strokeLinecap="round" />
      <path d={d} fill="none" className="animate-site-pulse stroke-[var(--s-accent-soft)]" strokeWidth="2" strokeLinecap="round" pathLength={100} strokeDasharray="8 92" style={{ animationDelay: `${delay}s`, animationDirection: out ? "normal" : "reverse" }} />
    </g>
  );
}

function Label({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <span className="absolute -translate-x-1/2 -translate-y-1/2 rounded-md bg-[var(--s-accent)] px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap text-white shadow-[0_6px_20px_-6px_rgba(91,108,255,0.7)]" style={{ left: pct(x, W), top: pct(y, H) }}>
      {children}
    </span>
  );
}

export function Hub({ id, l, systems, invoices }: { id: string; l: HubLabels; systems: string[]; invoices: { no: string; client: string }[] }) {
  return (
    <section aria-labelledby={id} data-tone="flow" className="px-6 py-28 text-white md:py-40">
      <div className="mx-auto w-full max-w-[1240px]">
        <SplitHead id={id} tone="dark" eyebrow={l.eyebrow} title={l.title} muted={l.muted} body={l.body} />

        <div className="site-reveal relative mt-16 hidden overflow-hidden rounded-[28px] ring-1 ring-white/[0.07] [--reveal-delay:120ms] lg:block">
          <div aria-hidden className="absolute inset-0 [background-image:radial-gradient(rgb(255_255_255/0.09)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:radial-gradient(80%_80%_at_50%_50%,#000_40%,transparent)]" />
          <div className="relative" style={{ aspectRatio: `${W} / ${H}` }}>
            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" aria-hidden>
              <Line d={`M330 ${C.y} H${C.x - 60}`} out={false} delay={0} />
              <Line d={`M${C.x} ${C.y - 60} V96`} out={false} delay={0.6} />
              <Line d={`M${C.x + 60} ${C.y} H862`} out delay={1.2} />
              <Line d={`M${C.x} ${C.y + 60} V454`} out delay={1.8} />
            </svg>
            {/* The product in the middle. */}
            <div className="absolute flex size-[9%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[22%] bg-[linear-gradient(145deg,#6b78ff,#3b3fb3)] shadow-[0_0_80px_rgba(107,120,255,0.45),inset_0_1px_0_rgba(255,255,255,0.35)]" style={{ left: pct(C.x, W), top: pct(C.y, H) }}>
              <TabuladoMark className="size-[46%] text-white" />
            </div>
            {/* Left: the ways hours arrive. */}
            <div className="absolute flex -translate-y-1/2 flex-col gap-3 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.08]" style={{ left: pct(70, W), top: pct(C.y, H), width: pct(260, W) }}>
              <Mono className="text-[10px] text-white/40">{l.inLabel}</Mono>
              <ul className="grid grid-cols-3 gap-2">
                {ICONS.map((I, i) => (
                  <li key={i} className="flex flex-col items-center gap-1.5 rounded-xl bg-white/[0.04] px-1 py-2.5 ring-1 ring-white/[0.06]">
                    <I aria-hidden className="size-4 text-white/80" strokeWidth={1.8} />
                    <span className="text-[10.5px] text-white/55">{l.sources[i]}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* Top: the rule books, as ghost boxes. */}
            <ul className="absolute flex -translate-x-1/2 gap-2.5" style={{ left: pct(C.x, W), top: pct(40, H) }}>
              {l.books.map((b) => (
                <li key={b} className="flex h-11 w-[84px] items-center justify-center rounded-lg border border-dashed border-white/25">
                  <Mono className="text-white/70">{b}</Mono>
                </li>
              ))}
            </ul>
            {/* Right: the payroll systems the file is written for. */}
            <ul className="absolute grid -translate-y-1/2 grid-cols-2 gap-2 rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/[0.08]" style={{ left: pct(862, W), top: pct(C.y, H), width: pct(290, W) }}>
              {systems.map((s) => (
                <li key={s} className="truncate rounded-lg bg-white/[0.05] px-2.5 py-2 text-[11.5px] font-medium text-white/85 ring-1 ring-white/[0.06]">
                  {s}
                </li>
              ))}
            </ul>
            {/* Bottom: one invoice per client. */}
            <ul className="absolute flex -translate-x-1/2 gap-2.5" style={{ left: pct(C.x, W), top: pct(458, H) }}>
              {invoices.map((v) => (
                <li key={v.no} className="flex w-[150px] flex-col gap-0.5 rounded-lg border border-dashed border-white/25 px-3 py-2">
                  <Mono className="text-[10px] text-white/45">{v.no}</Mono>
                  <span className="truncate text-[12px] text-white/80">{v.client}</span>
                </li>
              ))}
            </ul>
            <Label x={430} y={C.y}>{l.inPill}</Label>
            <Label x={C.x} y={160}>{l.rulesPill}</Label>
            <Label x={765} y={C.y}>{l.outPill}</Label>
            <Label x={C.x} y={398}>{l.invoicePill}</Label>
          </div>
        </div>

        {/* Phones and tablets: the four, in order. */}
        <dl className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
          {[
            { k: l.inPill, v: l.sources.join(" · ") },
            { k: l.rulesPill, v: l.books.join(" · ") },
            { k: l.outPill, v: systems.join(" · ") },
            { k: l.invoicePill, v: invoices.map((i) => i.client).join(" · ") },
          ].map((r) => (
            <div key={r.k} className="rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/[0.08]">
              <dt className="inline-flex rounded-md bg-[var(--s-accent)] px-2 py-0.5 text-[12px] font-semibold">{r.k}</dt>
              <dd className="mt-3 text-[14px] leading-relaxed text-white/65">{r.v}</dd>
            </div>
          ))}
        </dl>
        <p className="site-reveal mt-8 text-center text-[14px] text-[var(--s-dmuted)]">{l.never}</p>
      </div>
    </section>
  );
}
