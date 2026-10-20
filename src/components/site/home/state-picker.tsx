"use client";

// Pattern: docs/patterns/site.md §4 — Stripe's country tabs re-rendering one product card, with Apple's
// toggle the visitor plays with: one sample week, four states. The week's pay lines come from Tabulado's
// own rules engine on the server (src/server/site/state-week.ts), so switching state shows what the app
// would pay. Linear's chart of hours by day with the state's thresholds drawn across it; Stripe's
// odometer rolls the week's total. Arrow keys move between states (Base UI tabs).
import { Tabs } from "@base-ui/react/tabs";
import { useState } from "react";
import { Money, Odometer } from "@/components/site/blocks";
import { cn } from "@/lib/utils";

export interface StateView {
  state: string;
  name: string;
  total: string;
  lines: { label: string; hours: string; amount: string; explain: string }[];
  days: { label: string; regular: number; overtime: number; double: number; sentHome: number }[];
  /** California draws its daily thresholds; the others say overtime is weekly. */
  daily: boolean;
}

export interface StatePickerLabels {
  tabsLabel: string;
  chartLabel: string;
  regular: string;
  overtime: string;
  double: string;
  sentHome: string;
  daily8: string;
  daily12: string;
  weekly: string;
  sentNote: string;
  total: string;
  who: string;
  why: string;
}

const MAX = 14 * 60;

export function StatePicker({ views, l }: { views: StateView[]; l: StatePickerLabels }) {
  const [state, setState] = useState(views[0]!.state);
  const [open, setOpen] = useState<number | null>(null);
  const view = views.find((v) => v.state === state)!;
  const pct = (m: number) => `${(m / MAX) * 100}%`;

  return (
    <Tabs.Root value={state} onValueChange={(v) => { setState(String(v)); setOpen(null); }}>
      <Tabs.List aria-label={l.tabsLabel} className="flex w-fit flex-wrap gap-1 rounded-full bg-[var(--s-paper-2)] p-1">
        {views.map((v) => (
          <Tabs.Tab key={v.state} value={v.state} className="h-9 rounded-full px-4 text-[14px] font-medium text-[var(--s-muted)] outline-none site-color-slow hover:text-[var(--s-text)] focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)] data-[active]:bg-white data-[active]:text-[var(--s-text)] data-[active]:shadow-[0_1px_3px_rgba(22,23,29,0.12)]">
            {v.name}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      <Tabs.Panel value={state} className="mt-8 grid grid-cols-1 overflow-hidden rounded-2xl bg-white text-[var(--s-text)] shadow-[0_30px_60px_-30px_rgba(22,23,29,0.3)] ring-1 ring-black/5 outline-none lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Hours by day. */}
        <figure className="border-b border-[var(--s-line)] p-6 lg:border-r lg:border-b-0">
          <figcaption className="flex items-center justify-between text-[13px] text-[var(--s-muted)]">
            <span>{l.chartLabel}</span>
            {!view.daily && <span>{l.weekly}</span>}
          </figcaption>
          <div className="relative mt-6 h-64">
            {/* Gridlines every 2 hours. */}
            {[2, 4, 6, 8, 10, 12, 14].map((h) => (
              <span key={h} aria-hidden className="absolute inset-x-0 border-t border-dashed border-[var(--s-line)]" style={{ bottom: pct(h * 60) }}>
                <span className="absolute -top-2 -left-0.5 -translate-x-full pr-2 text-[10px] text-[var(--s-muted)] tabular-nums">{h}</span>
              </span>
            ))}
            {/* California's daily thresholds. */}
            {[
              { m: 480, label: l.daily8 },
              { m: 720, label: l.daily12 },
            ].map((x) => (
              <span key={x.m} aria-hidden className={cn("absolute inset-x-0 z-10 border-t-[1.5px] border-dashed site-morph", x.m === 480 ? "border-[var(--s-accent)]" : "border-amber-500", view.daily ? "opacity-100" : "opacity-0")} style={{ bottom: pct(x.m) }}>
                <span className={cn("absolute right-0 -top-5 rounded bg-white px-1 text-[10px] font-medium", x.m === 480 ? "text-[var(--s-accent)]" : "text-amber-700")}>{x.label}</span>
              </span>
            ))}
            <div className="absolute inset-0 ml-4 grid grid-cols-6 items-end gap-3">
              {view.days.map((d) => (
                <div key={d.label} className="flex h-full flex-col items-center justify-end">
                  <div className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-md">
                    <span className="block bg-[var(--s-text)] site-morph" style={{ height: `${(d.regular / MAX) * 16}rem` }} />
                    <span className="block bg-[var(--s-accent)] site-morph" style={{ height: `${(d.overtime / MAX) * 16}rem` }} />
                    <span className="block bg-amber-500 site-morph" style={{ height: `${(d.double / MAX) * 16}rem` }} />
                    <span className="block bg-[repeating-linear-gradient(135deg,var(--s-green)_0_3px,transparent_3px_7px)] ring-1 ring-[var(--s-green)] ring-inset site-morph" style={{ height: `${(d.sentHome / MAX) * 16}rem` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 ml-4 grid grid-cols-6 gap-3 text-center text-[11px] text-[var(--s-muted)]">
            {view.days.map((d) => (
              <span key={d.label}>{d.label}</span>
            ))}
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-[var(--s-muted)]">
            {[
              { c: "bg-[var(--s-text)]", t: l.regular },
              { c: "bg-[var(--s-accent)]", t: l.overtime },
              { c: "bg-amber-500", t: l.double },
              { c: "bg-[repeating-linear-gradient(135deg,var(--s-green)_0_2px,transparent_2px_4px)] ring-1 ring-[var(--s-green)]", t: l.sentHome },
            ].map((k) => (
              <li key={k.t} className="flex items-center gap-1.5">
                <span aria-hidden className={cn("size-2.5 rounded-sm", k.c)} />
                {k.t}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-[var(--s-muted)]">{l.sentNote}</p>
        </figure>

        {/* The pay lines, as the engine wrote them. */}
        <div className="flex flex-col">
          <p className="border-b border-[var(--s-line)] px-6 py-4 text-[13px] text-[var(--s-muted)]">{l.who}</p>
          <ul className="flex-1">
            {view.lines.map((line, i) => (
              <li key={`${view.state}-${line.label}`} className="animate-page-in border-b border-[var(--s-line)]" style={{ animationDelay: `${i * 70}ms` }}>
                <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} className="flex w-full flex-col gap-1 px-6 py-4 text-left outline-none site-color-slow hover:bg-[var(--s-paper)] focus-visible:bg-[var(--s-paper)]">
                  <span className="flex w-full items-baseline justify-between gap-4">
                    <span className="text-[15px] font-medium">
                      {line.label} <span className="font-normal text-[var(--s-muted)]">· {line.hours}</span>
                    </span>
                    <Money value={line.amount} className="text-[15px] font-medium" />
                  </span>
                  <span className={cn("text-[12px] leading-relaxed text-[var(--s-muted)]", open === i ? "" : "line-clamp-1")}>
                    <span className="font-medium text-[var(--s-text)]/70">{l.why}: </span>
                    {line.explain}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between bg-[var(--s-paper)] px-6 py-5">
            <span className="text-[14px] text-[var(--s-muted)]">{l.total}</span>
            <Odometer value={view.total} className="text-[34px] font-[450] tracking-[-0.03em]" />
          </div>
        </div>
      </Tabs.Panel>
    </Tabs.Root>
  );
}
