"use client";

// Pattern: docs/patterns/site.md §4 — Mercury's photo carousel: one wide rounded photograph at a time, a
// small tag at its top-left, white words at its bottom-left over a dark fade, a pause button, and thin
// progress segments under it (the open one fills over its six seconds). Ramp's floating product card
// over the photograph. No customer quotes: the words say what Tabulado does for that kind of week.
import Image from "next/image";
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/components/site/reduced-motion";
import { cn } from "@/lib/utils";

export interface PeopleSlide {
  src: string;
  tag: string;
  text: string;
  card: { title: string; value?: string; note: string };
  /** Where the photograph's subject sits, so a narrow crop keeps them. */
  focus: string;
}

const SECONDS = 6000;

export function People({ slides, label, pause, play, slideLabels }: { slides: PeopleSlide[]; label: string; pause: string; play: string; slideLabels: string[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const still = useReducedMotion();
  const playing = !paused && !still;
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % slides.length), SECONDS);
    return () => window.clearTimeout(id);
  }, [playing, index, slides.length]);

  return (
    <div role="group" aria-roledescription="carousel" aria-label={label} className="flex flex-col items-center gap-6">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-[var(--s-ink-3)] sm:aspect-[16/9]">
        {slides.map((s, i) => (
          <div key={s.src} aria-hidden={i !== index} className={cn("absolute inset-0 site-crossfade", i === index ? "opacity-100" : "opacity-0")}>
            <Image src={s.src} alt="" fill sizes="(min-width: 1240px) 1152px, 100vw" className="object-cover" style={{ objectPosition: s.focus }} />
            <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_top,rgba(12,13,18,0.85),rgba(12,13,18,0.15)_55%,transparent)]" />
            <span className="absolute top-5 left-5 rounded-md bg-[var(--s-ink)]/80 px-2.5 py-1 text-[13px] text-white backdrop-blur">{s.tag}</span>
            <p aria-live={i === index ? "polite" : undefined} className="absolute right-5 bottom-6 left-5 max-w-[26ch] text-[clamp(1.25rem,1.2vw+0.9rem,1.75rem)] leading-[1.2] font-[450] tracking-[-0.02em] text-balance text-white sm:right-auto sm:bottom-8 sm:left-8">
              {s.text}
            </p>
            {/* Ramp's floating card over the photograph. */}
            <div className="absolute top-16 right-5 w-56 rounded-xl border border-white/40 bg-white/85 p-3.5 text-[var(--s-text)] shadow-[0_20px_40px_-12px_rgba(0,0,0,0.45)] backdrop-blur-md animate-site-float sm:top-auto sm:right-8 sm:bottom-8 sm:w-64">
              <p className="text-[12px] text-[var(--s-muted)]">{s.card.title}</p>
              {s.card.value && <p className="mt-0.5 text-[17px] font-medium tracking-[-0.01em] tabular-nums">{s.card.value}</p>}
              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--s-green)]">
                <span aria-hidden className="size-1.5 rounded-full bg-current" />
                {s.card.note}
              </p>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setPaused(playing)} aria-label={playing ? pause : play} className="absolute top-5 right-5 hidden size-8 items-center justify-center rounded-full bg-white/80 text-[var(--s-text)] outline-none backdrop-blur site-color-slow hover:bg-white focus-visible:ring-2 focus-visible:ring-white sm:flex">
          {playing ? (
            <svg aria-hidden viewBox="0 0 12 12" className="size-3" fill="currentColor">
              <rect x="2.5" y="2" width="2.5" height="8" rx=".6" />
              <rect x="7" y="2" width="2.5" height="8" rx=".6" />
            </svg>
          ) : (
            <svg aria-hidden viewBox="0 0 12 12" className="size-3" fill="currentColor">
              <path d="M3.5 2.2v7.6L10 6z" />
            </svg>
          )}
        </button>
      </div>
      <div className="flex gap-1.5">
        {slides.map((s, i) => (
          <button key={s.src} type="button" onClick={() => setIndex(i)} aria-label={slideLabels[i]} aria-current={i === index ? "true" : undefined} className="group/seg flex h-6 w-16 items-center outline-none sm:w-28">
            <span className="relative h-0.5 w-full overflow-hidden rounded-full bg-[var(--s-text)]/15 group-focus-visible/seg:ring-2 group-focus-visible/seg:ring-[var(--s-accent-soft)]">
              {i === index && <span key={`${index}-${playing}`} className={cn("absolute inset-0 rounded-full bg-[var(--s-text)]", playing && "animate-site-fill")} />}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
