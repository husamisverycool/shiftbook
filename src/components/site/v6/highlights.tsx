"use client";

// Pattern: docs/patterns/site.md §9 — Apple's "Get the highlights": the heading at the left, large rounded
// cards in a sideways track with the next one peeking, each one statement in two lines (the second grey)
// over a single visual; under the track a dark pill of dots, the current one stretched into a bar that
// fills over the card's time, and a round play/pause button beside it. Plays only while on screen; swipe,
// arrow keys and the dots move it; reduced motion holds it still. The visuals are type, not screenshots.
import { Check, Link2, Lock, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/site/reduced-motion";
import { useInView } from "@/components/site/use-in-view";
import { HIGHLIGHTS, type Highlight } from "@/components/site/v6/keys";
import { Mono } from "@/components/site/v6/ui";
import { cn } from "@/lib/utils";

const DWELL = 6000;

export interface HighlightLabels {
  title: string;
  label: string;
  pause: string;
  play: string;
  show: string;
  cards: Record<Highlight, { a: string; b: string }>;
  explain: string;
  approve: string;
  approved: string;
  clockIn: string;
  clockInEs: string;
  gross: string;
  theirs: string;
  difference: string;
  totals: { ours: string; theirs: string; difference: string };
}

function Visual({ k, l, on }: { k: Highlight; l: HighlightLabels; on: boolean }) {
  if (k === "twice")
    return (
      <div className="relative flex h-full items-center justify-center">
        {[0, 1].map((i) => (
          <span key={i} className={cn("absolute text-[clamp(4rem,9vw,8.5rem)] font-[500] tracking-[-0.05em] text-transparent tabular-nums site-morph [-webkit-text-stroke:1px_rgba(255,255,255,0.55)]", on ? "translate-x-0 opacity-100" : i === 0 ? "-translate-x-10 opacity-60" : "translate-x-10 opacity-60")}>
            8:00
          </span>
        ))}
        <span className={cn("absolute text-[clamp(4rem,9vw,8.5rem)] font-[500] tracking-[-0.05em] text-white tabular-nums site-crossfade", on ? "opacity-100" : "opacity-0")}>8:00</span>
      </div>
    );
  if (k === "explains")
    return (
      <div className="flex h-full items-center px-2">
        <p className="font-mono text-[clamp(0.85rem,1.2vw,1.1rem)] leading-[1.9] text-white/40">
          {l.explain.split(/(\$[\d,.]+|§ [\w().]+|\d+\.\d+¢)/).map((part, i) =>
            /^\$|§|¢$/.test(part) ? (
              <span key={i} className="rounded bg-[var(--s-accent)]/25 px-1 text-white">
                {part}
              </span>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </p>
      </div>
    );
  if (k === "link")
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-4 py-2.5 font-mono text-[13px] text-white/70 ring-1 ring-white/10">
          <Link2 aria-hidden className="size-4 text-[var(--s-accent-soft)]" />
          tabulado.com/approve/7Kq2…
        </span>
        <span className={cn("inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-medium site-crossfade", on ? "bg-emerald-400/15 text-emerald-300" : "bg-white text-[#0b0c10]")}>
          {on && <Check aria-hidden className="size-4" />}
          {on ? l.approved : l.approve}
        </span>
      </div>
    );
  if (k === "language")
    return (
      <div className="flex h-full flex-col items-start justify-center gap-2 px-2">
        <span className="text-[clamp(2.25rem,5vw,4.5rem)] leading-none font-[500] tracking-[-0.04em] text-white">{l.clockIn}</span>
        <span className="text-[clamp(2.25rem,5vw,4.5rem)] leading-none font-[500] tracking-[-0.04em] text-white/35">{l.clockInEs}</span>
      </div>
    );
  if (k === "sealed")
    return (
      <div className="flex h-full items-center justify-center gap-4">
        <span className="font-mono text-[clamp(2rem,5vw,4.25rem)] tracking-[0.08em] text-white">9••-••-••••</span>
        <span className="flex size-14 items-center justify-center rounded-2xl bg-white/[0.07] ring-1 ring-white/15">
          <Lock aria-hidden className="size-6 text-[var(--s-accent-soft)]" />
        </span>
      </div>
    );
  return (
    <div className="flex h-full flex-col justify-center gap-3 px-2">
      {[
        { k: l.totals.ours, v: l.gross, c: "text-white" },
        { k: l.totals.theirs, v: l.theirs, c: "text-white/60" },
        { k: l.totals.difference, v: l.difference, c: "text-[var(--s-accent-soft)]" },
      ].map((r) => (
        <div key={r.k} className="flex items-baseline justify-between gap-4 border-b border-white/[0.08] pb-3 last:border-b-0">
          <Mono className="text-white/40">{r.k}</Mono>
          <span className={cn("text-[clamp(1.5rem,3vw,2.5rem)] font-[500] tracking-[-0.03em] tabular-nums", r.c)}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}

export function Highlights({ id, l }: { id: string; l: HighlightLabels }) {
  const still = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const playing = !still && !paused && inView;

  const show = useCallback((i: number) => {
    const el = track.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior: "smooth" });
  }, []);

  // The track tells which card is in the middle (swipes and scrolls included).
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setIndex([...el.children].indexOf(e.target));
      },
      { root: el, threshold: 0.6 },
    );
    [...el.children].forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => show((index + 1) % HIGHLIGHTS.length), DWELL);
    return () => window.clearTimeout(id);
  }, [playing, index, show]);

  return (
    <section aria-labelledby={id} aria-roledescription="carousel" data-tone="black" className="py-28 text-white md:py-40">
      <div ref={ref} className="mx-auto flex w-full max-w-[1240px] items-end justify-between gap-6 px-6">
        <h2 id={id} className="site-reveal text-[clamp(2rem,2.6vw+1rem,3.25rem)] leading-[1.04] font-[500] tracking-[-0.03em]">
          {l.title}
        </h2>
      </div>
      <div
        ref={track}
        tabIndex={0}
        aria-label={l.label}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") show(Math.min(index + 1, HIGHLIGHTS.length - 1));
          if (e.key === "ArrowLeft") show(Math.max(index - 1, 0));
        }}
        className="mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-[max(1.5rem,calc((100vw-1240px)/2+1.5rem))] pb-4 outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-white/30 [&::-webkit-scrollbar]:hidden"
      >
        {HIGHLIGHTS.map((k, i) => (
          <article key={k} aria-roledescription="slide" aria-label={`${i + 1} / ${HIGHLIGHTS.length}`} className={cn("relative flex h-[520px] w-[min(88vw,1040px)] shrink-0 snap-center flex-col overflow-hidden rounded-[28px] bg-[#141519] p-8 ring-1 ring-white/[0.06] site-crossfade md:h-[600px] md:p-12", i === index ? "opacity-100" : "opacity-55")}>
            <p className="max-w-[18ch] text-[clamp(1.5rem,1.6vw+1rem,2.25rem)] leading-[1.12] font-[500] tracking-[-0.025em]">
              {l.cards[k].a}
              <br />
              <span className="text-white/45">{l.cards[k].b}</span>
            </p>
            <div className="mt-8 min-h-0 flex-1">
              <Visual k={k} l={l} on={i === index} />
            </div>
          </article>
        ))}
      </div>
      {/* Apple's dots in a pill, the current one a bar filling over its time; play/pause beside it. */}
      <div className="mt-8 flex items-center justify-center gap-3">
        <div className="flex h-12 items-center gap-2.5 rounded-full bg-[#1d1d22] px-5">
          {HIGHLIGHTS.map((k, i) => (
            <button key={k} type="button" onClick={() => show(i)} aria-label={l.show.replace("{n}", String(i + 1))} aria-current={i === index ? "true" : undefined} className={cn("relative h-2 overflow-hidden rounded-full bg-white/35 outline-none site-morph focus-visible:ring-2 focus-visible:ring-white/60", i === index ? "w-12" : "w-2 hover:bg-white/60")}>
              {i === index && <span key={`${index}-${playing}`} className={cn("absolute inset-y-0 left-0 rounded-full bg-white", playing ? "animate-site-fill-dwell" : "w-full")} />}
            </button>
          ))}
        </div>
        {!still && (
          <button type="button" onClick={() => setPaused((p) => !p)} aria-label={playing ? l.pause : l.play} className="flex size-12 items-center justify-center rounded-full bg-[#1d1d22] text-white outline-none site-color-slow hover:bg-[#28282e] focus-visible:ring-2 focus-visible:ring-white/60">
            {playing ? <Pause aria-hidden className="size-4" fill="currentColor" /> : <Play aria-hidden className="size-4" fill="currentColor" />}
          </button>
        )}
      </div>
    </section>
  );
}
