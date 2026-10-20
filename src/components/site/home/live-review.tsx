"use client";

// Pattern: docs/patterns/site.md §1 — the product as the hero, working on sample data. Linear's hero: the
// real app frame (a sidebar of sections, the work beside it) on a lit floor, leaning back and flattening
// as the page scrolls (Check's flip-up). Cursor's and Granola's self-playing window with a stage switch:
// the week's hours fill row by row, the one total the two readings disagree on waits for a person and is
// decided; then the Illinois week's pay lines from the real rules engine with their explanations, the
// total rolling in (Stripe's odometer); then the payroll file the real exporter writes. Pressing a stage
// stops the play there. Deel's status chips float over the photograph at different depths. Mercury's
// disclosure is docked on the frame's foot. Plays only while on screen; holds still for reduced motion.
import { Tabs } from "@base-ui/react/tabs";
import { useEffect, useState } from "react";
import { Money, Odometer } from "@/components/site/blocks";
import { useReducedMotion } from "@/components/site/reduced-motion";
import { useInView } from "@/components/site/use-in-view";
import { TabuladoMark } from "@/components/shiftbook/brand-mark";
import { cn } from "@/lib/utils";

export interface LiveReviewLabels {
  title: string;
  nav: string;
  inbox: string;
  toCheck: string;
  thisWeek: string;
  clients: string;
  files: string;
  invoices: string;
  heading: string;
  tabsLabel: string;
  hours: string;
  pay: string;
  file: string;
  worker: string;
  source: string;
  total: string;
  photo: string;
  clock: string;
  text: string;
  disagree: string;
  keep: string;
  kept: string;
  payTitle: string;
  weekTotal: string;
  fileReady: string;
  docked: string;
  sample: string;
  pause: string;
  play: string;
  read1: string;
  read2: string;
}

export interface LiveReviewLine {
  label: string;
  hours: string;
  amount: string;
  explain: string;
}

/** The week by worker (sample data): Mon–Fri hours, the total, where it came from. */
const ROWS = [
  { name: "Robert Jones", days: ["8", "8", "8", "8", "8"], total: "40:00", from: "photo", doubt: true },
  { name: "María José Fernández Ruiz", days: ["8", "8", "6", "8", "8"], total: "38:00", from: "text" },
  { name: "Jesús Delgado", days: ["8", "8", "8", "8", "8"], total: "40:00", from: "photo" },
  { name: "Tran Nguyen", days: ["9", "8", "8", "8", "7:37"], total: "40:37", from: "photo" },
  { name: "Anita Patel", days: ["8", "8", "8", "8", "8"], total: "40:00", from: "clock" },
  { name: "Kateryna Bondarenko", days: ["7:30", "8", "8", "8", "8"], total: "39:30", from: "photo" },
] as const;
const DAYS = ["M", "T", "W", "T", "F"];

/** The play, in milliseconds: the rows, the decision, the pay lines, the file, a rest, again. */
const T = { decide: 2800, pay: 4200, file: 8200, end: 12500 };
const STAGES = ["hours", "pay", "file"] as const;
type Stage = (typeof STAGES)[number];

function useScrollTilt(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      setT(Math.min(1, Math.max(0, window.scrollY / 420)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return t;
}

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function LiveReview({ l, lines, total, file }: { l: LiveReviewLabels; lines: LiveReviewLine[]; total: string; file: { filename: string; preview: string[] } }) {
  const still = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  const [chosen, setChosen] = useState<Stage | null>(null);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const playing = !still && !paused && chosen === null && inView;
  const tilt = useScrollTilt();

  useEffect(() => {
    if (!playing) return;
    const started = performance.now() - elapsed;
    const id = window.setInterval(() => setElapsed((performance.now() - started) % T.end), 60);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart from where it stopped, not on every tick
  }, [playing]);

  // What is on screen: the chosen stage at its end, or the play's moment (its end when still).
  const t = chosen === "hours" ? T.pay - 1 : chosen === "pay" ? T.file - 1 : chosen === "file" || still ? T.end - 1 : elapsed;
  const stage: Stage = t < T.pay ? "hours" : t < T.file ? "pay" : "file";
  const rowsShown = stage === "hours" ? Math.min(ROWS.length, Math.floor(t / 220) + 1) : ROWS.length;
  const decided = t >= T.decide;
  const linesShown = stage === "pay" ? Math.min(lines.length, Math.floor((t - T.pay) / 380) + 1) : lines.length;
  const shownTotal = stage === "pay" && linesShown === lines.length ? total : stage === "file" ? total : "$0.00";
  const fileLines = stage === "file" ? Math.min(file.preview.length, Math.floor((t - T.file) / 260) + 1) : 0;
  const nav = [
    { label: l.inbox, d: "M2.5 9.5h3l1 2h3l1-2h3M2.5 9.5 4 3.5h8l1.5 6v3h-11z" },
    { label: l.toCheck, d: "M8 2.5 14 13H2zM8 6.5v3M8 11.2v.1", count: decided ? 0 : 1 },
    { label: l.thisWeek, d: "M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3", active: true },
    { label: l.clients, d: "M3 13.5V5l5-2.5 5 2.5v8.5M6 13.5V9h4v4.5" },
    { label: l.files, d: "M4 2.5h5l3 3v8H4zM9 2.5v3h3" },
    { label: l.invoices, d: "M4 2.5h8v11l-2-1-2 1-2-1-2 1zM6 6h4M6 8.5h4" },
  ];

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[1120px] [perspective:2000px]">
      {/* Linear's lit floor. */}
      <div aria-hidden className="absolute inset-x-[8%] -bottom-24 h-48 rounded-[50%] bg-[radial-gradient(closest-side,rgba(130,140,255,0.35),transparent)] blur-2xl" />
      {/* Linear's floating window over the frame: the one question the week has for a person. */}
      <div className="absolute -right-6 -bottom-16 z-20 hidden w-[310px] animate-page-in [animation-delay:900ms] lg:block xl:-right-16">
        <div className="overflow-hidden rounded-xl bg-[#14151c]/95 text-white shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/12 backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-white/[0.08] px-3.5 py-2.5 text-[12px]">
            <TabuladoMark className="size-3.5 text-white" />
            <span className="font-medium">{l.toCheck}</span>
            <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium site-crossfade", decided ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300")}>{decided ? l.kept : "1"}</span>
          </div>
          <div className="px-3.5 py-3">
            <p className="text-[12px] leading-snug text-white/85">Robert Jones · {l.disagree}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[11px]">
              {["8", "6"].map((n, i) => (
                <span key={n} className={cn("rounded-lg py-2 ring-1 site-crossfade", i === 0 && decided ? "bg-white text-[var(--s-text)] ring-white" : "bg-white/[0.04] ring-white/10")}>
                  <span className="block text-[10px] text-current opacity-60">{i === 0 ? l.read1 : l.read2}</span>
                  <span className="text-[18px] font-medium tabular-nums">{n}</span>
                </span>
              ))}
            </div>
            <span className={cn("mt-3 flex h-8 items-center justify-center rounded-full text-[12px] font-medium site-crossfade", decided ? "bg-emerald-500/15 text-emerald-300" : "bg-white text-[var(--s-text)]")}>{decided ? l.kept : l.keep}</span>
          </div>
        </div>
      </div>
      <div
        className="relative origin-top overflow-hidden rounded-2xl bg-white text-[var(--s-text)] shadow-[0_50px_100px_-30px_rgba(8,9,20,0.75),0_30px_60px_-30px_rgba(8,9,20,0.6)] ring-1 ring-white/10"
        style={still ? undefined : { transform: `rotateX(${(1 - tilt) * 14}deg) scale(${0.94 + tilt * 0.06})` }}
      >
        <div className="grid min-h-[460px] grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)]">
          {/* Linear's sidebar. */}
          <nav aria-label={l.nav} className="hidden flex-col gap-0.5 border-r border-[var(--s-line)] bg-[var(--s-paper)] p-3 md:flex">
            <span className="mb-3 flex items-center gap-2 px-2 pt-1 text-[13px] font-medium">
              <TabuladoMark className="size-4" />
              {l.title}
            </span>
            {nav.map((n) => (
              <span key={n.label} className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px]", n.active ? "bg-white font-medium text-[var(--s-text)] shadow-[0_1px_2px_rgba(22,23,29,0.08)]" : "text-[var(--s-muted)]")}>
                <Icon d={n.d} />
                <span className="flex-1">{n.label}</span>
                {!!n.count && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-medium text-amber-800">{n.count}</span>}
              </span>
            ))}
          </nav>

          <Tabs.Root value={stage} onValueChange={(v) => setChosen(v as Stage)} className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-3 border-b border-[var(--s-line)] px-4 py-3 sm:px-5">
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{l.heading}</p>
              <Tabs.List aria-label={l.tabsLabel} className="flex rounded-full bg-[var(--s-paper-2)] p-0.5 text-[12px]">
                {STAGES.map((s) => (
                  <Tabs.Tab key={s} value={s} className="rounded-full px-3 py-1.5 font-medium whitespace-nowrap text-[var(--s-muted)] outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)] data-[active]:bg-white data-[active]:text-[var(--s-text)] data-[active]:shadow-sm">
                    {l[s]}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              {!still && (
                <button
                  type="button"
                  onClick={() => {
                    if (chosen) {
                      setChosen(null);
                      setPaused(false);
                    } else setPaused((p) => !p);
                  }}
                  aria-label={playing ? l.pause : l.play}
                  className="flex size-8 items-center justify-center rounded-full text-[var(--s-muted)] outline-none site-color-slow hover:bg-[var(--s-paper-2)] hover:text-[var(--s-text)] focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)]"
                >
                  <svg aria-hidden viewBox="0 0 12 12" className="size-3" fill="currentColor">
                    {playing ? (
                      <>
                        <rect x="2.5" y="2" width="2.5" height="8" rx=".6" />
                        <rect x="7" y="2" width="2.5" height="8" rx=".6" />
                      </>
                    ) : (
                      <path d="M3.5 2.2v7.6L10 6z" />
                    )}
                  </svg>
                </button>
              )}
            </div>

            <div className="relative flex-1">
              <Tabs.Panel value="hours" keepMounted className={cn("absolute inset-0 outline-none site-crossfade", stage === "hours" ? "opacity-100" : "pointer-events-none opacity-0")}>
                <table className="w-full text-left text-[12px]">
                  <thead className="text-[11px] text-[var(--s-muted)]">
                    <tr className="border-b border-[var(--s-line)]">
                      <th className="px-4 py-2.5 font-normal sm:px-5">{l.worker}</th>
                      {DAYS.map((d, i) => (
                        <th key={i} className="hidden w-10 py-2.5 text-center font-normal sm:table-cell">
                          {d}
                        </th>
                      ))}
                      <th className="hidden px-3 py-2.5 font-normal lg:table-cell">{l.source}</th>
                      <th className="px-4 py-2.5 text-right font-normal sm:px-5">{l.total}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((r, i) => (
                      <tr key={r.name} className={cn("border-b border-[var(--s-line)] site-crossfade", i < rowsShown ? "opacity-100" : "opacity-0")}>
                        <td className="max-w-0 px-4 py-2.5 sm:px-5">
                          <span className="block truncate font-medium">{r.name}</span>
                        </td>
                        {r.days.map((h, d) => (
                          <td key={d} className="hidden py-1.5 text-center sm:table-cell">
                            <span className={cn("inline-block min-w-8 rounded-md px-1 py-1 tabular-nums", r.from === "text" && d === 2 ? "bg-[var(--s-accent)]/10 font-medium text-[var(--s-accent)]" : "bg-[var(--s-paper)]")}>{h}</span>
                          </td>
                        ))}
                        <td className="hidden px-3 py-2.5 text-[11px] text-[var(--s-muted)] lg:table-cell">{l[r.from]}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums sm:px-5">
                          {"doubt" in r ? (
                            <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-[11px] font-medium ring-1 ring-inset site-crossfade", decided ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-amber-50 text-amber-800 ring-amber-600/25")}>{decided ? l.kept : "8 · 6"}</span>
                          ) : (
                            <span className="font-medium">{r.total}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* The cell waiting for a person, until it is decided. */}
                <div className={cn("absolute right-4 bottom-4 left-4 flex items-center justify-between gap-3 rounded-xl bg-[var(--s-ink)] px-4 py-3 text-white shadow-xl site-crossfade", rowsShown === ROWS.length && !decided ? "opacity-100" : "translate-y-2 opacity-0")}>
                  <span className="text-[12px]">{l.disagree}</span>
                  <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-white px-3 text-[12px] font-medium text-[var(--s-text)]">{l.keep}</span>
                </div>
              </Tabs.Panel>

              <Tabs.Panel value="pay" keepMounted className={cn("absolute inset-0 flex flex-col outline-none site-crossfade", stage === "pay" ? "opacity-100" : "pointer-events-none opacity-0")}>
                <p className="border-b border-[var(--s-line)] px-5 py-2.5 text-[11px] text-[var(--s-muted)]">{l.payTitle}</p>
                <ul className="flex-1">
                  {lines.map((line, i) => (
                    <li key={line.label} className={cn("border-b border-[var(--s-line)] px-5 py-2.5 site-crossfade", i < linesShown ? "opacity-100" : "translate-y-1 opacity-0")}>
                      <div className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="font-medium">
                          {line.label} <span className="font-normal text-[var(--s-muted)]">· {line.hours}</span>
                        </span>
                        <Money value={line.amount} className="font-medium" />
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--s-muted)]">{line.explain}</p>
                    </li>
                  ))}
                </ul>
                <div className="flex items-baseline justify-between px-5 py-3">
                  <span className="text-[12px] text-[var(--s-muted)]">{l.weekTotal}</span>
                  <Odometer value={shownTotal} className="text-[22px] font-[450] tracking-[-0.02em]" />
                </div>
              </Tabs.Panel>

              <Tabs.Panel value="file" keepMounted className={cn("absolute inset-0 flex flex-col bg-[#0e0f15] outline-none site-crossfade", stage === "file" ? "opacity-100" : "pointer-events-none opacity-0")}>
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-2.5 text-[11px]">
                  <span className="truncate font-mono text-white/80">{file.filename}</span>
                  <span className={cn("flex shrink-0 items-center gap-1.5 text-emerald-300 site-crossfade", fileLines === file.preview.length ? "opacity-100" : "opacity-0")}>
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    {l.fileReady}
                  </span>
                </div>
                <pre className="flex-1 overflow-hidden px-5 py-4 font-mono text-[11px] leading-6 text-[#c9cbe0]">
                  {file.preview.map((line, i) => (
                    <span key={i} className={cn("flex site-crossfade", i < fileLines ? "opacity-100" : "opacity-0")}>
                      <span aria-hidden className="mr-4 w-3 shrink-0 text-right text-white/25 select-none">
                        {i + 1}
                      </span>
                      <span className={cn("truncate", i === 0 && "text-[var(--s-accent-soft)]")}>{line}</span>
                    </span>
                  ))}
                </pre>
              </Tabs.Panel>
            </div>
          </Tabs.Root>
        </div>
        {/* Mercury's disclosure docked on the product. */}
        <p className="border-t border-white/10 bg-[var(--s-ink)] px-5 py-2.5 text-center text-[12px] leading-relaxed text-white/80">
          {l.docked}
          <a href="#note-1" className="ml-0.5 align-super text-[0.75em] underline-offset-2 hover:underline">
            1
          </a>
        </p>
      </div>
      <p className="mt-6 text-center text-[12px] text-[var(--s-dmuted)]">{l.sample}</p>
    </div>
  );
}
