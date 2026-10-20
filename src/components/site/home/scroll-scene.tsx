"use client";

// Pattern: docs/patterns/site.md §5 — Apple's and Stripe's scroll-pinned product story: the section is
// four screens tall, its picture stays pinned while the reader scrolls, and the scroll itself drives the
// picture through four states; the captions at the left light one at a time with a filling rail (Stripe
// Billing's chapters). Ramp's receipt matching supplies the motion inside it: a document is scanned, its
// lines lift into structured rows, the rows are matched and resolved, and finished cards fan out. Drawn in
// Mercury's warm grainy card with white pieces and sparkle chips. Phones and reduced motion get the four
// states as still pictures, one under each caption.
import { useEffect, useRef, useState } from "react";
import { Money, TwoTone } from "@/components/site/blocks";
import { useReducedMotion } from "@/components/site/reduced-motion";
import { cn } from "@/lib/utils";

export interface SceneLabels {
  steps: { title: string; body: string }[];
  kept: string;
  matched: string;
  approved: string;
  balanced: string;
  approveHours: string;
  importFile: string;
  invoice: string;
  reading: string;
  sheet: string;
  rowsTitle: string;
  label: string;
}

/** The demo agency's sheet: as written, the roster's name, the hours. */
const ROWS = [
  { written: "Bob Jones", person: "Robert Jones", hours: "8:00", doubt: true },
  { written: "Maria Fernandez", person: "María José Fernández Ruiz", hours: "8:00" },
  { written: "Chuy Delgado", person: "Jesús Delgado", hours: "8:00" },
  { written: "Andre Lewis", person: "Andre Lewis", hours: "8:00" },
  { written: "K. Bondarenko", person: "Kateryna Bondarenko", hours: "7:30" },
];

const clamp = (n: number) => Math.min(1, Math.max(0, n));
/** How far `p` has got through the stretch from `a` to `b`, 0 to 1. */
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Mercury's movement curve, applied to scroll so pieces settle instead of sliding linearly. */
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function Sparkle({ children, className, style }: { children: string; className?: string; style?: React.CSSProperties }) {
  return (
    <span style={style} className={cn("absolute z-30 inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-medium whitespace-nowrap text-[var(--s-text)] shadow-[0_6px_20px_-6px_rgba(22,23,29,0.3)] ring-1 ring-black/5", className)}>
      <svg aria-hidden viewBox="0 0 12 12" className="size-3 text-[var(--s-muted)]" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
        <path d="M6 1c.4 2.6 2.4 4.6 5 5-2.6.4-4.6 2.4-5 5-.4-2.6-2.4-4.6-5-5 2.6-.4 4.6-2.4 5-5z" />
      </svg>
      {children}
    </span>
  );
}

function Tick() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

/** The picture at scroll position `p` (0 to 1). */
function Stage({ p, l }: { p: number; l: SceneLabels }) {
  // 1. The photographed sheet: scanned, then moved aside.
  const aside = ease(seg(p, 0.22, 0.34));
  const scan = seg(p, 0.03, 0.22);
  const fadePhoto = seg(p, 0.72, 0.82);
  // 2. The rows lift into a table and are matched; the doubtful cell is decided.
  const rowsIn = ease(seg(p, 0.25, 0.32));
  const decided = p > 0.46;
  // 3. The client approves.
  const approvalIn = ease(seg(p, 0.5, 0.58));
  const approved = p > 0.63;
  // 4. The payroll file and the invoices fan out; the totals agree.
  const out = ease(seg(p, 0.75, 0.84));
  const fan = ease(seg(p, 0.82, 0.92));
  const balanced = p > 0.9;
  const dimEarlier = seg(p, 0.74, 0.82);

  return (
    <div className="site-grain relative aspect-[5/4] w-full overflow-hidden rounded-3xl bg-[var(--s-card)] [perspective:1400px]">
      {/* The sheet. */}
      <div
        className="absolute z-10 overflow-hidden rounded-xl bg-white shadow-[0_30px_70px_-30px_rgba(22,23,29,0.45)] ring-1 ring-black/5"
        style={{
          left: `${lerp(8, 4, aside)}%`,
          top: `${lerp(9, 16, aside)}%`,
          width: `${lerp(84, 50, aside)}%`,
          transform: `rotate(${lerp(-1.5, -3.5, aside)}deg) rotateX(${lerp(8, 0, seg(p, 0, 0.12))}deg)`,
          opacity: 1 - fadePhoto * 0.65,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed sample picture, sized by its box */}
        <img src="/site/sign-in-sheet.jpg" alt="" width={900} height={555} className="block h-auto w-full" />
        {/* The read part tints as the line passes (Ramp's scan). */}
        <span aria-hidden className="absolute inset-x-0 top-0 bg-[var(--s-accent)]/8" style={{ height: `${scan * 100}%`, opacity: 1 - aside }} />
        <span aria-hidden className="absolute inset-x-0 h-px bg-[var(--s-accent)] shadow-[0_0_18px_4px_var(--s-accent-soft)]" style={{ top: `${scan * 100}%`, opacity: scan > 0 && scan < 1 ? 1 : 0 }} />
        <span className="absolute top-2.5 left-2.5 rounded-md bg-[var(--s-ink)]/80 px-2 py-0.5 text-[11px] text-white backdrop-blur" style={{ opacity: 1 - aside }}>
          {scan < 1 ? `${l.reading}…` : l.sheet}
        </span>
      </div>
      {scan >= 1 && aside < 0.2 && <Sparkle className="top-[6%] right-[9%] animate-page-in">{l.steps[0]!.title}</Sparkle>}

      {/* The rows. */}
      <div
        className="absolute top-[9%] right-[4%] z-20 w-[50%] overflow-hidden rounded-xl bg-white shadow-[0_30px_70px_-30px_rgba(22,23,29,0.45)] ring-1 ring-black/5"
        style={{ opacity: rowsIn * (1 - dimEarlier * 0.6), transform: `translateY(${lerp(24, 0, rowsIn)}px) scale(${lerp(1, 0.94, dimEarlier)})` }}
      >
        <p className="border-b border-[var(--s-line)] px-4 py-2.5 text-[11px] text-[var(--s-muted)]">{l.rowsTitle}</p>
        <ul>
          {ROWS.map((r, i) => {
            const shown = ease(seg(p, 0.28 + i * 0.025, 0.31 + i * 0.025));
            const match = seg(p, 0.36 + i * 0.02, 0.37 + i * 0.02);
            return (
              <li key={r.written} className="relative flex h-10 items-center gap-3 border-b border-[var(--s-line)] px-4 last:border-b-0" style={{ opacity: shown, transform: `translateX(${lerp(-16, 0, shown)}px)` }}>
                <span className="relative min-w-0 flex-1 text-[12px]">
                  <span className="absolute inset-0 truncate text-[#2c3a8f] italic" style={{ opacity: 1 - match }}>
                    {r.written}
                  </span>
                  <span className="block truncate font-medium" style={{ opacity: match }}>
                    {r.person}
                  </span>
                </span>
                {r.doubt ? (
                  <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium ring-1 ring-inset site-crossfade", decided ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15" : "bg-amber-50 text-amber-700 ring-amber-600/20")}>{decided ? l.kept : "8 · 6"}</span>
                ) : (
                  <span className="text-[12px] text-[var(--s-muted)] tabular-nums">{r.hours}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {p > 0.4 && p < 0.5 && <Sparkle className="top-[50%] right-[30%] animate-page-in">{l.matched}</Sparkle>}

      {/* The client's approval. */}
      <div
        className="absolute bottom-[8%] left-[10%] z-20 w-[52%] rounded-xl bg-white p-4 shadow-[0_30px_70px_-24px_rgba(22,23,29,0.5)] ring-1 ring-black/5"
        style={{ opacity: approvalIn * (1 - dimEarlier * 0.7), transform: `translateY(${lerp(40, 0, approvalIn)}px) scale(${lerp(1, 0.94, dimEarlier)})` }}
      >
        <p className="text-[13px] font-medium">Prairie Line Manufacturing</p>
        <p className="text-[11px] text-[var(--s-muted)]">Oct 5 – 11 · 612:30</p>
        <span className={cn("mt-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium site-crossfade", approved ? "bg-emerald-600 text-white" : "bg-[var(--s-text)] text-white")}>
          {approved && <Tick />}
          {approved ? l.approved : l.approveHours}
        </span>
      </div>

      {/* The payroll file and the invoices (Ramp's fanned cards). */}
      <div className="absolute right-[6%] bottom-[9%] z-30 w-[44%]" style={{ opacity: out, transform: `translateY(${lerp(60, 0, out)}px)` }}>
        {[2, 1, 0].map((k) => (
          <div
            key={k}
            className="absolute right-0 bottom-[calc(100%+14px)] w-[78%] rounded-xl bg-white p-3.5 shadow-[0_20px_40px_-20px_rgba(22,23,29,0.45)] ring-1 ring-black/5"
            style={{ transform: `translate(${lerp(0, -k * 26, fan)}px, ${lerp(0, -k * 12, fan)}px) rotate(${lerp(0, -k * 4, fan)}deg)`, transformOrigin: "bottom left" }}
          >
            <p className="text-[11px] text-[var(--s-muted)]">
              {l.invoice} INV-104{3 - k}
            </p>
            <Money value={["$14,212.50", "$9,880.00", "$24,114.25"][k]!} className="text-[17px] font-medium tracking-[-0.02em]" />
          </div>
        ))}
        <div className="rounded-xl bg-[var(--s-ink)] p-4 text-white shadow-[0_30px_70px_-24px_rgba(22,23,29,0.6)]">
          <p className="text-[11px] text-white/60">{l.importFile} · Gusto</p>
          <Money value="$48,206.75" className="mt-0.5 block text-[24px] font-[450] tracking-[-0.03em]" />
        </div>
      </div>
      {balanced && <Sparkle className="bottom-[34%] left-[8%] animate-page-in">{l.balanced}</Sparkle>}
    </div>
  );
}

export function ScrollScene({ id, strong, muted, labels }: { id: string; strong: string; muted: string; labels: SceneLabels }) {
  const heading = (headingId?: string) => <TwoTone id={headingId} strong={strong} muted={muted} className="text-[clamp(1.5rem,1vw+1.1rem,2rem)]" />;
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
  const active = Math.min(3, Math.floor(p * 4));

  return (
    <>
      {/* Wide screens with motion: pinned for four screens of scrolling. */}
      <div ref={ref} aria-label={labels.label} role="group" className={cn("relative h-[400svh]", still ? "hidden" : "hidden lg:block")}>
        <div className="sticky top-0 flex h-svh items-center">
          <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] items-center gap-16 px-6 pt-16">
            <div>
              {heading(still ? undefined : id)}
              <ol className="mt-10 flex flex-col gap-1">
                {labels.steps.map((s, i) => {
                  const fill = clamp(p * 4 - i);
                  return (
                    <li key={s.title} className="relative py-3 pl-6">
                      <span aria-hidden className="absolute top-0 bottom-0 left-0 w-px bg-[var(--s-line)]">
                        <span className="absolute inset-x-0 top-0 bg-[var(--s-text)]" style={{ height: `${fill * 100}%` }} />
                      </span>
                      <p className={cn("text-[17px] font-medium site-color-slow", i === active ? "text-[var(--s-text)]" : "text-[var(--s-text)]/35")}>{s.title}</p>
                      <p className={cn("mt-1 max-w-[40ch] text-[15px] leading-relaxed site-color-slow", i === active ? "text-[var(--s-muted)]" : "text-[var(--s-muted)]/40")}>{s.body}</p>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div aria-hidden>
              <Stage p={p} l={labels} />
            </div>
          </div>
        </div>
      </div>
      {/* Phones and reduced motion: the four states as still pictures, each under its caption. */}
      <div className={cn("mx-auto w-full max-w-[1200px] px-6 py-24", still ? "" : "lg:hidden")}>
        {heading(still ? id : undefined)}
        <div className="mt-12 grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-2">
          {labels.steps.map((s, i) => (
            <div key={s.title} className="flex flex-col gap-4">
              <div aria-hidden>
                <Stage p={[0.24, 0.48, 0.7, 1][i]!} l={labels} />
              </div>
              <div>
                <h3 className="text-[15px] font-medium">{s.title}</h3>
                <p className="mt-1 max-w-[46ch] text-[15px] leading-relaxed text-[var(--s-muted)]">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
