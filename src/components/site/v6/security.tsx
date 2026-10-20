"use client";

// Pattern: docs/patterns/site.md §12 — Mercury's "Standard protection stops short": a two-tone line over a
// hairline, then three tall slate cards each holding one softly lit, clay-white object that acts out its
// claim, with the title and a sentence under the card; then Vercel /security's bordered row of plain facts.
// The objects move only while on screen and hold still under reduced motion. Test numbers are 9xx only.
import { Check, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/components/site/reduced-motion";
import { useInView } from "@/components/site/use-in-view";
import { Mono, Sup } from "@/components/site/v6/ui";
import { cn } from "@/lib/utils";

const CLAY = "bg-[linear-gradient(180deg,#f6f5f1,#d8d6cf)] text-[#1b1c22] shadow-[0_14px_34px_-10px_rgba(0,0,0,0.7),inset_0_1px_0_white,inset_0_-2px_4px_rgba(0,0,0,0.08)]";

/** A beat that ticks every `ms` while the part is on screen (0 when still). */
function useBeat(ms: number, on: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setN((x) => x + 1), ms);
    return () => window.clearInterval(id);
  }, [ms, on]);
  return n;
}

function Vault({ beat }: { beat: number }) {
  const sealed = beat % 2 === 0;
  return (
    <div className="flex items-center gap-2.5">
      {[
        ["912", "•••"],
        ["48", "••"],
        ["0142", "••••"],
      ].map(([open, shut], i) => (
        <span key={i} className={cn("flex h-14 items-center rounded-2xl px-4 font-mono text-[20px] tracking-[0.08em] site-crossfade", CLAY)} style={{ transitionDelay: `${i * 90}ms` }}>
          {sealed ? shut : open}
        </span>
      ))}
      <span className={cn("flex size-14 items-center justify-center rounded-2xl site-crossfade", sealed ? "bg-[var(--s-accent)] text-white shadow-[0_0_40px_rgba(107,120,255,0.55)]" : CLAY)}>
        <Lock aria-hidden className="size-5" />
      </span>
    </div>
  );
}

function Blackout({ beat }: { beat: number }) {
  return (
    <div className={cn("flex h-[78%] w-[62%] flex-col gap-3.5 rounded-t-2xl p-6", CLAY)}>
      <span className="h-2 w-[55%] rounded-full bg-black/15" />
      <span className="h-2 w-[85%] rounded-full bg-black/10" />
      <span className="relative h-4 w-[72%] overflow-hidden rounded-sm bg-black/10">
        <span key={beat} className="absolute inset-y-0 left-0 animate-site-redact bg-[#14151c]" />
      </span>
      <span className="h-2 w-[70%] rounded-full bg-black/10" />
      <span className="relative h-4 w-[46%] overflow-hidden rounded-sm bg-black/10">
        <span key={beat} className="absolute inset-y-0 left-0 animate-site-redact bg-[#14151c] [animation-delay:250ms]" />
      </span>
      <span className="h-2 w-[80%] rounded-full bg-black/10" />
    </div>
  );
}

function Log({ beat, rows }: { beat: number; rows: string[] }) {
  const shown = [0, 1, 2].map((i) => rows[(beat + rows.length - i) % rows.length]!);
  return (
    <ul className="flex w-[78%] flex-col gap-3">
      {shown.map((r, i) => (
        <li key={`${beat}-${i}`} className={cn("flex h-11 items-center gap-3 rounded-full px-1.5", CLAY, i === 0 && "animate-site-row-drop", i === 1 && "opacity-60", i === 2 && "opacity-30")}>
          <span className={cn("size-8 shrink-0 rounded-full", i === 0 ? "bg-[var(--s-accent)] shadow-[0_0_18px_rgba(107,120,255,0.7)]" : "bg-[linear-gradient(180deg,#ffffff,#cfcdc6)]")} />
          <Mono className="truncate text-[10px] text-[#1b1c22]/70 normal-case tracking-[0.02em]">{r}</Mono>
        </li>
      ))}
    </ul>
  );
}

export function Security({ id, l, href }: { id: string; l: { title: string; muted: string; cards: { title: string; body: string }[]; log: string[]; facts: string[]; link: string }; href: string }) {
  const still = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const beat = useBeat(2600, inView && !still);
  return (
    <section aria-labelledby={id} data-tone="ink" className="px-6 pt-24 pb-28 text-[var(--s-dtext)] md:pb-36">
      <div ref={ref} className="mx-auto w-full max-w-[1200px]">
        <h2 id={id} className="site-reveal max-w-[24em] border-t border-white/[0.08] pt-8 text-[clamp(1.5rem,1.2vw+1.1rem,2.125rem)] leading-[1.15] font-[500] tracking-[-0.025em] text-white">
          {l.title} <span className="text-white/45">{l.muted}</span>
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {[<Vault key="v" beat={beat} />, <Blackout key="b" beat={beat} />, <Log key="l" beat={beat} rows={l.log} />].map((object, i) => (
            <div key={i} className="site-reveal flex flex-col gap-4" style={{ ["--reveal-delay" as string]: `${i * 100}ms` }}>
              <div className={cn("relative flex aspect-[4/3] justify-center overflow-hidden rounded-2xl bg-[linear-gradient(180deg,#23242d,#1a1b22)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.05]", i === 1 ? "items-end" : "items-center")}>
                <span aria-hidden className="absolute inset-x-[15%] top-[-30%] h-[70%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(255,255,255,0.12),transparent)]" />
                {object}
              </div>
              <h3 className="text-[15px] font-medium text-white">
                {l.cards[i]!.title}
                <Sup n={i === 0 ? 4 : i === 1 ? 5 : 6} />
              </h3>
              <p className="-mt-2 text-[15px] leading-relaxed text-[var(--s-dmuted)]">{l.cards[i]!.body}</p>
            </div>
          ))}
        </div>
        {/* Vercel's bordered row of plain facts. */}
        <ul className="site-reveal mt-16 grid grid-cols-1 border-t border-l border-white/[0.08] sm:grid-cols-2 lg:grid-cols-4">
          {l.facts.map((f) => (
            <li key={f} className="flex items-start gap-3 border-r border-b border-white/[0.08] px-5 py-5 text-[14px] leading-snug text-white/80">
              <span aria-hidden className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                <Check className="size-2.5" strokeWidth={3} />
              </span>
              {f}
            </li>
          ))}
        </ul>
        <a href={href} className="group/pill mt-10 inline-flex items-center gap-1.5 rounded-sm text-[15px] text-white outline-none focus-visible:ring-2 focus-visible:ring-white/50">
          {l.link}
          <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 motion-state group-hover/pill:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </a>
      </div>
    </section>
  );
}
