// Pattern: docs/patterns/site.md §8 — the rules, in three pieces from three references. Ramp's stippled
// map: the country in fine dots, the covered states lit, each with a mono pin chip on a leader line.
// Linear /method's contents: every rule by rule book, its law and dates in mono, dotted rules between
// groups. Linear's changelog: one line with a dot per dated change, the next one lit. All read from the
// dated rule tables on the server.
import { Mono, SplitHead } from "@/components/site/v6/ui";
import { cn } from "@/lib/utils";

export interface MapPin {
  state: string;
  name: string;
  detail: string;
  /** The pin, and where its chip sits, in the map's own units. */
  at: { x: number; y: number };
  chip: { x: number; y: number };
}

export interface RuleRow {
  name: string;
  law: string;
  when: string;
}

export interface Change {
  key: string;
  title: string;
  law: string;
  when: string;
  soon: boolean;
}

export function Rules({
  id,
  l,
  map,
  pins,
  books,
  changes,
}: {
  id: string;
  l: { eyebrow: string; title: string; muted: string; body: string; mapLabel: string; indexTitle: string; changesTitle: string; changesBody: string };
  map: { width: number; height: number; land: string; lit: string };
  pins: MapPin[];
  books: { name: string; rows: RuleRow[] }[];
  changes: Change[];
}) {
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <section aria-labelledby={id} data-tone="deep" className="px-6 py-28 text-white md:py-40">
      <div className="mx-auto w-full max-w-[1240px]">
        <SplitHead id={id} tone="dark" eyebrow={l.eyebrow} title={l.title} muted={l.muted} body={l.body} />

        {/* Ramp's dot map. */}
        <figure className="site-reveal relative mt-16 overflow-hidden rounded-[28px] bg-[radial-gradient(90%_80%_at_50%_45%,rgba(120,130,255,0.08),transparent_70%)] px-2 py-8 ring-1 ring-white/[0.07] [--reveal-delay:120ms] sm:px-8 md:mt-20 md:py-12">
          <figcaption className="sr-only">{l.mapLabel}</figcaption>
          <div className="relative mx-auto max-w-[1040px]" style={{ aspectRatio: `${map.width} / ${map.height}` }}>
            <svg viewBox={`0 0 ${map.width} ${map.height}`} className="absolute inset-0 size-full" aria-hidden>
              <path d={map.land} stroke="rgb(255 255 255 / 0.2)" strokeWidth="3.2" strokeLinecap="round" />
              <path d={map.lit} className="stroke-[var(--s-accent-soft)]" strokeWidth="4.6" strokeLinecap="round" />
              {pins.map((p) => (
                <g key={p.state}>
                  <line x1={p.at.x} y1={p.at.y} x2={p.chip.x} y2={p.chip.y} stroke="rgb(255 255 255 / 0.35)" strokeWidth="1" strokeDasharray="2 3" />
                  <circle cx={p.at.x} cy={p.at.y} r="14" className="animate-site-ring fill-none stroke-[var(--s-accent-soft)]" strokeWidth="1" style={{ transformOrigin: `${p.at.x}px ${p.at.y}px`, transformBox: "view-box" }} />
                  <circle cx={p.at.x} cy={p.at.y} r="5" className="fill-white" />
                </g>
              ))}
            </svg>
            {pins.map((p) => (
              <div key={p.state} className="absolute hidden -translate-y-1/2 flex-col gap-1 rounded-lg bg-[#15161d]/95 px-3 py-2 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.8)] ring-1 ring-white/10 backdrop-blur sm:flex" style={{ left: pct(p.chip.x, map.width), top: pct(p.chip.y, map.height) }}>
                <Mono className="text-[10.5px] text-white">{p.name}</Mono>
                <Mono className="text-[10px] text-white/50 normal-case tracking-[0.03em]">{p.detail}</Mono>
              </div>
            ))}
          </div>
          {/* Phones: the pins as a list. */}
          <ul className="mt-6 grid grid-cols-1 gap-2 px-2 sm:hidden">
            {pins.map((p) => (
              <li key={p.state} className="flex flex-col gap-0.5 rounded-lg bg-white/[0.04] px-3 py-2 ring-1 ring-white/10">
                <Mono className="text-[10.5px] text-white">{p.name}</Mono>
                <Mono className="text-[10px] text-white/50 normal-case tracking-[0.03em]">{p.detail}</Mono>
              </li>
            ))}
          </ul>
        </figure>

        {/* Linear /method's contents: every rule, by rule book. */}
        <h3 className="site-reveal mt-24 text-[13px] text-[var(--s-dmuted)]">{l.indexTitle}</h3>
        <div className="site-reveal mt-6 grid grid-cols-1 border-t border-white/[0.08] sm:grid-cols-2 lg:grid-cols-5">
          {books.map((b, i) => (
            <div key={b.name} className={cn("flex flex-col py-6 sm:px-5", i > 0 && "lg:border-l lg:border-white/[0.08]", i % 2 === 1 && "sm:border-l sm:border-white/[0.08] lg:border-l", i === 0 && "sm:pl-0")}>
              <Mono className="text-[var(--s-accent-soft)]">{b.name}</Mono>
              <ul className="mt-4 flex flex-col">
                {b.rows.map((r) => (
                  <li key={`${r.name}-${r.law}`} className="group/rule flex flex-col gap-1 border-b border-dotted border-white/[0.12] py-3 last:border-b-0">
                    <span className="text-[14px] leading-snug text-white/75 site-color-slow group-hover/rule:text-white">{r.name}</span>
                    <Mono className="text-[10px] leading-relaxed text-white/38 normal-case tracking-[0.02em]">
                      {r.law}
                      {r.when && <span className="text-white/55"> · {r.when}</span>}
                    </Mono>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Linear's changelog: the dated changes, the next one lit. */}
        <div className="mt-24 grid grid-cols-1 gap-10 md:grid-cols-[1fr_2fr]">
          <div className="site-reveal">
            <h3 className="text-[17px] font-medium text-white">{l.changesTitle}</h3>
            <p className="mt-2 max-w-[32ch] text-[14px] leading-relaxed text-[var(--s-dmuted)]">{l.changesBody}</p>
          </div>
          <ol className="site-reveal grid grid-cols-1 gap-8 border-t border-white/10 pt-8 [--reveal-delay:100ms] sm:grid-cols-2 lg:grid-cols-4">
            {changes.map((c, i) => (
              <li key={c.key} className="relative">
                <span aria-hidden className={cn("absolute -top-[37px] left-0 size-[9px] rounded-full", c.soon ? "bg-[var(--s-accent-soft)] shadow-[0_0_12px_var(--s-accent-soft)]" : "bg-white/25", i === 0 && "ring-4 ring-[var(--s-accent)]/30")} />
                <p className="text-[14px] font-medium text-white">{c.title}</p>
                <p className="mt-1 text-[13px] leading-snug text-[var(--s-dmuted)]">{c.law}</p>
                <Mono className={cn("mt-2 block", c.soon ? "text-[var(--s-accent-soft)]" : "text-white/40")}>{c.when}</Mono>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
