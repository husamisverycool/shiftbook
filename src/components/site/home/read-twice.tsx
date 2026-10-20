"use client";

// Pattern: docs/patterns/site.md §3 — Linear's method diagram: two dashed circles, the part they share
// hatched, a bright arc travelling round its edge (both readings agree: accepted; outside it they differ:
// a person decides). Beside it Increase's checking card: each field shows both readings, checks in turn,
// ticks where they agree and stops at the one that needs a person. It runs when it comes into view and
// can be run again; reduced motion shows the finished card.
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/components/site/reduced-motion";
import { useInView } from "@/components/site/use-in-view";
import { cn } from "@/lib/utils";

export interface ReadTwiceLabels {
  a: string;
  b: string;
  agree: string;
  differ: string;
  cardTitle: string;
  checking: string;
  ok: string;
  needs: string;
  replay: string;
  fields: { label: string; a: string; b: string }[];
}

const STEP = 650;

export function ReadTwice({ l }: { l: ReadTwiceLabels }) {
  const still = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  const [run, setRun] = useState(0);
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (still || !inView) return;
    if (done > l.fields.length) return;
    const id = window.setTimeout(() => setDone((d) => d + 1), done === 0 ? 300 : STEP);
    return () => window.clearTimeout(id);
  }, [still, inView, done, run, l.fields.length]);
  const checked = still ? l.fields.length : Math.max(0, done - 1);

  return (
    <div ref={ref} className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
      <figure aria-label={`${l.agree}. ${l.differ}.`} className="mx-auto w-full max-w-[520px]">
        <svg viewBox="0 0 520 340" className="w-full overflow-visible" aria-hidden>
          <defs>
            <pattern id="rt-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="7" stroke="var(--s-accent)" strokeWidth="1.4" opacity=".45" />
            </pattern>
            <clipPath id="rt-a">
              <circle cx="195" cy="170" r="140" />
            </clipPath>
            <linearGradient id="rt-arc" x1="0" x2="1">
              <stop offset="0" stopColor="var(--s-accent)" stopOpacity="0" />
              <stop offset="1" stopColor="var(--s-accent)" />
            </linearGradient>
          </defs>
          <circle cx="325" cy="170" r="140" fill="url(#rt-hatch)" clipPath="url(#rt-a)" />
          <circle cx="195" cy="170" r="140" fill="none" stroke="var(--s-text)" strokeOpacity=".35" strokeDasharray="3 5" />
          <circle cx="325" cy="170" r="140" fill="none" stroke="var(--s-text)" strokeOpacity=".35" strokeDasharray="3 5" />
          {/* The shared part's edge, traced. */}
          <path
            d="M260 46 A140 140 0 0 0 260 294 A140 140 0 0 0 260 46 Z"
            fill="none"
            stroke="url(#rt-arc)"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="22 78"
            className={still ? "" : "animate-site-trace"}
          />
          <text x="110" y="175" textAnchor="middle" className="fill-[var(--s-muted)] text-[13px]">
            {l.a}
          </text>
          <text x="410" y="175" textAnchor="middle" className="fill-[var(--s-muted)] text-[13px]">
            {l.b}
          </text>
        </svg>
        <div className="mt-6 flex flex-col gap-2 text-[14px] sm:flex-row sm:justify-center sm:gap-8">
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-3 rounded-sm bg-[repeating-linear-gradient(45deg,var(--s-accent)_0_1.5px,transparent_1.5px_5px)] ring-1 ring-[var(--s-accent)]/50" />
            {l.agree}
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-3 rounded-full border border-dashed border-[var(--s-text)]/50" />
            {l.differ}
          </span>
        </div>
      </figure>

      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_30px_60px_-30px_rgba(22,23,29,0.3)] ring-1 ring-black/5">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--s-line)] px-5 py-3.5">
          <span className="text-[14px] font-medium">{l.cardTitle}</span>
          {!still && (
            <button
              type="button"
              onClick={() => {
                setDone(0);
                setRun((r) => r + 1);
              }}
              className="rounded-full px-3 py-1 text-[12px] font-medium text-[var(--s-muted)] outline-none site-color-slow hover:bg-[var(--s-paper-2)] hover:text-[var(--s-text)] focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)]"
            >
              {l.replay}
            </button>
          )}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_4rem_4rem_1.25rem] sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_8.5rem] gap-x-3 border-b border-[var(--s-line)] px-5 py-2 text-[11px] text-[var(--s-muted)]">
          <span />
          <span>{l.a}</span>
          <span>{l.b}</span>
          <span />
        </div>
        <ul aria-live="polite">
          {l.fields.map((f, i) => {
            const state = i < checked ? (f.a === f.b ? "ok" : "needs") : i === checked && !still ? "checking" : "waiting";
            return (
              <li key={f.label} className={cn("grid grid-cols-[minmax(0,1fr)_4rem_4rem_1.25rem] sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_8.5rem] items-center gap-x-3 border-b border-[var(--s-line)] px-5 py-3 text-[13px] last:border-b-0 site-color-slow", state === "needs" && "bg-amber-50/70")}>
                <span className="text-[var(--s-muted)]">{f.label}</span>
                <span className="font-medium tabular-nums">{f.a}</span>
                <span className={cn("font-medium tabular-nums", f.a !== f.b && state === "needs" && "text-amber-800")}>{f.b}</span>
                <span className="flex justify-end">
                  {state === "checking" && (
                    <span className="flex items-center gap-1.5 text-[12px] text-[var(--s-muted)]">
                      <span aria-hidden className="size-3 rounded-full border-[1.5px] border-[var(--s-line)] border-t-[var(--s-accent)] animate-site-spin" />
                      <span className="hidden sm:inline">{l.checking}</span>
                    </span>
                  )}
                  {state === "ok" && (
                    <span className="flex items-center gap-1 text-[12px] font-medium text-emerald-700 animate-page-in">
                      <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.5l3 3 7-7" />
                      </svg>
                      <span className="sr-only sm:not-sr-only">{l.ok}</span>
                    </span>
                  )}
                  {state === "needs" && (
                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-amber-100 text-[11px] font-medium text-amber-800 ring-1 ring-amber-600/25 ring-inset animate-page-in sm:size-auto sm:h-6 sm:px-2.5">
                      <span aria-hidden className="sm:hidden">!</span>
                      <span className="sr-only sm:not-sr-only">{l.needs}</span>
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
