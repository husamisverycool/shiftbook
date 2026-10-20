"use client";

// Pattern: docs/patterns/site.md §2 — Ramp's "Systems that never spoke": a section pinned while the
// reader scrolls (CSS sticky), whose scroll position takes a tangle of the week's real paperwork — the
// photographed sign-in sheet, the client's signed PDF, a supervisor's text, a time-clock export, a
// client's email disputing hours, the wage poster, the payroll deadline — joined by dashed lines, and
// pulls it into one clean week (the resolved state cross-fades in, as Ramp's does). Phones and reduced
// motion get the two states as still pictures, Before and After.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/site/reduced-motion";
import { cn } from "@/lib/utils";

export interface MondayLabels {
  label: string;
  call: string;
  callText: string;
  note: string;
  sheet: string;
  text: string;
  textFrom: string;
  clock: string;
  email: string;
  emailFrom: string;
  poster: string;
  due: string;
  weekTitle: string;
  ready: string;
  fromPhoto: string;
  fromText: string;
  disputed: string;
  fromClock: string;
  fileReady: string;
  worker: string;
  total: string;
  source: string;
  before: string;
  after: string;
  days: string[];
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** Each piece of paperwork: where it lies in the pile (left, top, width in %; turn in degrees). */
const PILE = {
  photo: { l: 3, t: 6, w: 25, r: -6 },
  text: { l: 33, t: 5, w: 25, r: 2 },
  pdf: { l: 70, t: 3, w: 27, r: 5 },
  due: { l: 39, t: 36, w: 22, r: 5 },
  clock: { l: 4, t: 58, w: 31, r: 3 },
  poster: { l: 39, t: 70, w: 23, r: -3 },
  email: { l: 66, t: 56, w: 31, r: -3 },
} as const;
type Piece = keyof typeof PILE;
const LINKS: [Piece, Piece][] = [
  ["photo", "text"],
  ["text", "due"],
  ["photo", "clock"],
  ["pdf", "email"],
  ["due", "email"],
  ["clock", "poster"],
  ["poster", "due"],
  ["pdf", "due"],
];
/** The finished week (sample data): hours by day Mon–Sun; `mark` is the day a message changed or a client disputed. */
const WEEK = [
  { name: "Robert Jones", days: ["8", "8", "8", "8", "8", "", ""], total: "40:00", kind: "photo" as const, mark: -1 },
  { name: "María José Fernández Ruiz", days: ["8", "8", "6", "8", "8", "", ""], total: "38:00", kind: "text" as const, mark: 2 },
  { name: "Jesús Delgado", days: ["8", "8", "8", "8", "8", "", ""], total: "40:00", kind: "photo" as const, mark: -1 },
  { name: "Tran Nguyen", days: ["9", "8", "8", "8", "7:37", "", ""], total: "40:37", kind: "disputed" as const, mark: 4 },
  { name: "Anita Patel", days: ["8", "8", "8", "8", "8", "", ""], total: "40:00", kind: "clock" as const, mark: -1 },
];
const GRID = "grid grid-cols-[minmax(0,1.6fr)_repeat(7,minmax(0,0.42fr))_3.25rem] gap-x-1.5 px-4 sm:grid-cols-[minmax(0,1.5fr)_repeat(7,minmax(0,0.4fr))_3.25rem_minmax(0,1.3fr)]";
const CENTER: Record<Piece, [number, number]> = { photo: [15, 22], text: [45, 13], pdf: [83, 20], due: [50, 42], clock: [19, 68], poster: [50, 77], email: [81, 66] };

function Stage({ p, l }: { p: number; l: MondayLabels }) {
  const gather = ease(seg(p, 0.15, 0.62));
  const week = ease(seg(p, 0.45, 0.78));
  const rows = (i: number) => ease(seg(p, 0.6 + i * 0.045, 0.7 + i * 0.045));
  const style = (k: Piece) => {
    const s = PILE[k];
    // Every piece is drawn into the middle, shrinking and fading as the week takes its place.
    const dx = (50 - (s.l + s.w / 2)) * gather;
    const dy = (45 - CENTER[k][1]) * gather;
    return {
      left: `${s.l}%`,
      top: `${s.t}%`,
      width: `${s.w}%`,
      transform: `translate(${dx}cqw, ${dy * 0.64}cqw) rotate(${s.r * (1 - gather)}deg) scale(${1 - gather * 0.55})`,
      opacity: 1 - seg(p, 0.42, 0.62),
    };
  };
  const card = "absolute rounded-xl bg-white p-3 shadow-[0_18px_40px_-18px_rgba(22,23,29,0.45)] ring-1 ring-black/5";
  return (
    <div className="site-dots relative aspect-[16/11] w-full [container-type:inline-size] overflow-hidden rounded-3xl bg-white text-[var(--s-text)] ring-1 ring-black/[0.06] sm:aspect-[16/9]">
      {/* The tangle's dashed lines. */}
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" style={{ opacity: 0.9 - seg(p, 0.1, 0.4) }}>
        {LINKS.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={CENTER[a][0]} y1={CENTER[a][1]} x2={CENTER[b][0]} y2={CENTER[b][1]} stroke="#c2410c" strokeOpacity=".5" strokeWidth=".25" strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      <div className={card} style={style("photo")}>
        <p className="flex items-center gap-1.5 text-[10px] text-[#c2410c]">
          <svg aria-hidden viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2.5h2.5l1 3-1.5 1a8 8 0 0 0 3.5 3.5l1-1.5 3 1V12a1.5 1.5 0 0 1-1.5 1.5A10 10 0 0 1 2.5 4 1.5 1.5 0 0 1 4 2.5z" />
          </svg>
          {l.call}
        </p>
        <p className="mt-1.5 text-[12px] leading-snug italic">{l.callText}</p>
        {/* A voicemail's waveform. */}
        <div aria-hidden className="mt-2 flex h-5 items-center gap-[2px]">
          {[3, 6, 9, 5, 12, 8, 14, 7, 10, 4, 9, 13, 6, 8, 11, 5, 7, 3, 6, 9, 4, 7].map((h, i) => (
            <span key={i} className="w-[3px] rounded-full bg-[var(--s-text)]/25" style={{ height: `${h + 4}px` }} />
          ))}
        </div>
      </div>
      <div className={cn(card, "bg-[#e9f6ec]")} style={style("text")}>
        <p className="text-[10px] text-[var(--s-muted)]">{l.textFrom}</p>
        <p className="mt-1 rounded-lg rounded-tl-sm bg-white px-2.5 py-1.5 text-[12px] leading-snug">{l.text}</p>
      </div>
      <div className={cn(card, "overflow-hidden p-0")} style={style("pdf")}>
        <p className="flex items-center gap-1.5 border-b border-[var(--s-line)] bg-[#e8f3ec] px-3 py-1.5 text-[10px] font-medium text-[#1f7a4d]">{l.sheet}</p>
        <div className="grid grid-cols-[1.5rem_repeat(4,minmax(0,1fr))] text-[9px] tabular-nums">
          {["", "A", "B", "C", "D", "1", "Name", "Mon", "Tue", "Wed", "2", "Jones", "8", "8", "8?", "3", "Fernandez", "8", "8", "6", "4", "Nguyen", "9", "8", "8"].map((c, i) => (
            <span key={i} className={cn("truncate border-r border-b border-[var(--s-line)] px-1 py-0.5", i % 5 === 0 || i < 5 ? "bg-[var(--s-paper)] text-center text-[var(--s-muted)]" : "", c === "8?" && "bg-amber-100")}>
              {c}
            </span>
          ))}
        </div>
      </div>
      <div className={cn(card, "border-l-4 border-l-[#c2410c]")} style={style("due")}>
        <p className="text-[12px] font-medium">{l.due}</p>
      </div>
      <div className={cn(card, "font-mono")} style={style("clock")}>
        <p className="mb-1 font-sans text-[10px] text-[var(--s-muted)]">{l.clock}</p>
        {["10413,Patel Anita,10/05,7:00 AM,3:30 PM,8.00", "10416,Ruiz Daniel,10/05,7:00 AM,3:30 PM,8.00", "10417,Haddad Fatima,10/05,7:00 AM,3:30 PM,8.00"].map((r) => (
          <p key={r} className="truncate text-[9px] leading-relaxed text-[var(--s-text)]/80">
            {r}
          </p>
        ))}
      </div>
      <div className={cn(card, "bg-[#fff8e6]")} style={style("poster")}>
        <p className="text-[11px] leading-snug font-medium">{l.poster}</p>
      </div>
      {/* A sticky note on the edge of the desk. */}
      <div className="absolute rounded-sm bg-[#fde68a] p-3 shadow-[0_14px_30px_-14px_rgba(22,23,29,0.5)]" style={{ ...style("due"), left: "64%", top: "34%", width: "15%" }}>
        <p className="text-[12px] leading-snug font-medium text-[#713f12]">{l.note}</p>
      </div>
      <div className={card} style={style("email")}>
        <p className="text-[10px] text-[var(--s-muted)]">{l.emailFrom}</p>
        <p className="mt-1 text-[12px] leading-snug">{l.email}</p>
      </div>

      {/* The week, once it is all in one place: by worker and day, each changed cell marked. */}
      <div
        className="absolute inset-x-[5%] top-1/2 overflow-hidden rounded-2xl bg-white shadow-[0_40px_80px_-30px_rgba(22,23,29,0.5)] ring-1 ring-black/5 sm:inset-x-[8%]"
        style={{ opacity: week, transform: `translateY(calc(-50% + ${(1 - week) * 30}px)) scale(${0.94 + week * 0.06})` }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--s-line)] px-4 py-3">
          <span className="truncate text-[13px] font-medium">{l.weekTitle}</span>
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-600/15 ring-inset">{l.ready}</span>
        </div>
        <div className={cn(GRID, "border-b border-[var(--s-line)] py-2 text-[10px] text-[var(--s-muted)]")}>
          <span>{l.worker}</span>
          {l.days.map((d) => (
            <span key={d} className="text-center">
              {d}
            </span>
          ))}
          <span className="text-right">{l.total}</span>
          <span className="hidden sm:block">{l.source}</span>
        </div>
        {WEEK.map((w, i) => (
          <div key={w.name} className={cn(GRID, "items-center border-b border-[var(--s-line)] py-2 text-[12px]")} style={{ opacity: rows(i), transform: `translateX(${(1 - rows(i)) * -12}px)` }}>
            <span className="truncate font-medium">{w.name}</span>
            {w.days.map((h, d) => (
              <span key={d} className={cn("rounded-md py-1 text-center tabular-nums", h === "" ? "text-[var(--s-muted)]/40" : "bg-[var(--s-paper)]", w.mark === d && (w.kind === "text" ? "bg-[var(--s-accent)]/12 font-medium text-[var(--s-accent)] ring-1 ring-[var(--s-accent)]/30" : "bg-amber-100 font-medium text-amber-800 ring-1 ring-amber-500/30"))}>
                {h || "·"}
              </span>
            ))}
            <span className="text-right font-medium tabular-nums">{w.total}</span>
            <span className="hidden truncate text-[11px] text-[var(--s-muted)] sm:block">{{ photo: l.fromPhoto, text: l.fromText, disputed: l.disputed, clock: l.fromClock }[w.kind]}</span>
          </div>
        ))}
        <p className="flex items-center gap-2 bg-[var(--s-paper)] px-4 py-3 text-[12px] font-medium" style={{ opacity: rows(WEEK.length) }}>
          <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
          {l.fileReady}
        </p>
      </div>
    </div>
  );
}

export function Monday({ heading, l }: { heading: React.ReactNode; l: MondayLabels }) {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const still = useReducedMotion();
  useEffect(() => {
    if (still) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      setP(clamp(-box.top / Math.max(1, box.height - window.innerHeight)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [still]);
  const after = p > 0.5;
  return (
    <>
      <div ref={ref} role="group" aria-label={l.label} className={cn("relative h-[260svh]", still ? "hidden" : "hidden lg:block")}>
        <div className="sticky top-0 flex h-svh flex-col justify-center">
          <div className="mx-auto w-full max-w-[1200px] px-6 pt-16">
            <div className="mb-8 flex items-end justify-between gap-8">
              {heading}
              {/* Ramp's before/after marker, following the scroll. */}
              <div aria-hidden className="flex shrink-0 rounded-full bg-[var(--s-paper-2)] p-1 text-[13px] font-medium">
                <span className={cn("rounded-full px-3 py-1 site-color-slow", !after ? "bg-white text-[var(--s-text)] shadow-sm" : "text-[var(--s-muted)]")}>{l.before}</span>
                <span className={cn("rounded-full px-3 py-1 site-color-slow", after ? "bg-white text-[var(--s-text)] shadow-sm" : "text-[var(--s-muted)]")}>{l.after}</span>
              </div>
            </div>
            <div aria-hidden className="mx-auto max-w-[1040px]">
              <Stage p={p} l={l} />
            </div>
          </div>
        </div>
      </div>
      <div className={cn("mx-auto w-full max-w-[1200px] px-6 py-24", still ? "" : "lg:hidden")}>
        {heading}
        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
          {[
            { p: 0, label: l.before },
            { p: 1, label: l.after },
          ].map((s) => (
            <figure key={s.label} className="flex flex-col gap-3">
              <figcaption className="text-[13px] font-medium text-[var(--s-muted)]">{s.label}</figcaption>
              <div aria-hidden>
                <Stage p={s.p} l={l} />
              </div>
            </figure>
          ))}
        </div>
      </div>
    </>
  );
}
