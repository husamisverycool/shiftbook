"use client";

// Pattern: docs/patterns/site.md §1 — the product as the hero, playing a Monday by itself. Linear's hero:
// the app frame in its dark theme on a lit floor, leaning back and flattening as the page scrolls. Cursor's
// and Granola's self-playing window: hours arrive in the inbox and are read; ⌘K opens Raycast's menu and
// types; the week opens on the one cell the two readings disagree on, and a person keeps 8; the pay run
// fills from the real engine; the payroll file is written by the real exporter. Linear's keystroke chips
// show each key as it is pressed. Below, Cursor's step bar fills with the play; pressing a step holds
// it there. Plays only while on screen; holds the last step still for reduced motion.
import { Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Demo } from "@/components/site/app/data";
import { AGENCY, AppWindow } from "@/components/site/app/frame";
import { Kbd } from "@/components/site/app/kit";
import { FileScreen, InboxScreen, Palette, PayScreen, WeekScreen } from "@/components/site/app/screens";
import { useReducedMotion } from "@/components/site/reduced-motion";
import { useInView } from "@/components/site/use-in-view";
import { cn } from "@/lib/utils";

/** The play, in milliseconds from the start of the loop. */
const STEPS = [
  { key: "inbox", from: 0, to: 4800 },
  { key: "check", from: 4800, to: 8400 },
  { key: "pay", from: 8400, to: 11800 },
  { key: "file", from: 11800, to: 16000 },
] as const;
const END = 16000;
const KEYS = [
  { at: 2700, to: 3500, keys: ["⌘", "K"] },
  { at: 4300, to: 4900, keys: ["⏎"] },
  { at: 6600, to: 7300, keys: ["1"] },
  { at: 8000, to: 8600, keys: ["G", "P"] },
  { at: 11300, to: 12000, keys: ["⌘", "E"] },
];
const QUERY = "week";

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

export function HeroPlayer({ demo }: { demo: Demo }) {
  const t = useTranslations("site.app.hero");
  const w = useTranslations("site.home.window");
  const still = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  const [chosen, setChosen] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const playing = !still && !paused && chosen === null && inView;
  const tilt = useScrollTilt();

  useEffect(() => {
    if (!playing) return;
    const started = performance.now() - elapsed;
    const id = window.setInterval(() => setElapsed((performance.now() - started) % END), 50);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart from where it stopped, not on every tick
  }, [playing]);

  // The moment on screen: a chosen step at its end, the play's moment, or (still) the last step.
  const now = chosen !== null ? STEPS[chosen]!.to - 1 : still ? END - 1 : elapsed;
  const step = STEPS.findIndex((s) => now >= s.from && now < s.to);
  const local = now - STEPS[step]!.from;
  const arrived = step === 0 ? Math.min(6, 1 + Math.floor(local / 320)) : 6;
  const reading = step === 0 && local < 2200;
  const paletteOpen = step === 0 && local >= 2700;
  const typed = QUERY.slice(0, Math.max(0, Math.floor((local - 3000) / 130)));
  const decided = step > 1 || (step === 1 && local >= 1900);
  const shownLines = step === 2 ? Math.max(0, Math.floor((local - 500) / 380)) : demo.lines.length;
  const fileLines = step === 3 ? Math.floor((local - 400) / 230) : demo.files[0]!.preview.length;
  const key = chosen === null && !still ? KEYS.find((k) => now >= k.at && now < k.to) : undefined;

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[1180px] [perspective:2200px]">
      {/* Linear's lit floor. */}
      <div aria-hidden className="absolute inset-x-[6%] -bottom-20 h-56 rounded-[50%] bg-[radial-gradient(closest-side,rgba(130,140,255,0.38),transparent)] blur-2xl" />
      <div className="relative origin-top" style={still ? undefined : { transform: `rotateX(${(1 - tilt) * 12}deg) scale(${0.95 + tilt * 0.05})` }}>
        <AppWindow dark title={`${AGENCY} — Tabulado`} className="shadow-[0_60px_120px_-30px_rgba(4,5,14,0.9),0_30px_60px_-30px_rgba(4,5,14,0.7)]">
          <div aria-hidden className="relative h-[520px] md:h-[580px]">
            <div key={step} className="absolute inset-0 animate-site-screen-in">
              {step === 0 && <InboxScreen arrived={arrived} reading={reading} className="h-full" />}
              {step === 1 && <WeekScreen decided={decided} className="h-full" />}
              {step === 2 && <PayScreen demo={demo} shown={shownLines} className="h-full" />}
              {step === 3 && <FileScreen demo={demo} linesShown={fileLines} className="h-full" />}
            </div>
            {/* ⌘K over the inbox. */}
            <div className={cn("absolute inset-0 flex items-start justify-center bg-black/35 px-4 pt-[12%] site-crossfade", paletteOpen ? "opacity-100" : "pointer-events-none opacity-0")}>
              <Palette query={typed} active={0} className={cn("site-morph", paletteOpen ? "translate-y-0" : "-translate-y-2")} />
            </div>
            {/* The key just pressed. */}
            <div className={cn("absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-black/70 p-1.5 shadow-xl ring-1 ring-white/10 backdrop-blur site-crossfade", key ? "opacity-100" : "translate-y-1 opacity-0")}>
              {(key?.keys ?? ["⌘"]).map((k) => (
                <Kbd key={k} className="h-7 min-w-7 border-white/15 bg-white/10 text-[13px] text-white">
                  {k}
                </Kbd>
              ))}
            </div>
          </div>
          {/* Mercury's disclosure docked on the product. */}
          <p className="border-t border-white/10 bg-[#0c0d11] px-5 py-2.5 text-center text-[12px] leading-relaxed text-white/70">
            {w("docked")}
            <a href="#note-1" className="ml-0.5 align-super text-[0.75em] underline-offset-2 hover:underline">
              1
            </a>
          </p>
        </AppWindow>
      </div>

      {/* Cursor's step bar: each step fills while it plays; pressing one holds it. */}
      <div className="relative mt-8 flex items-center gap-2">
        <ol className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          {STEPS.map((s, i) => {
            const fill = chosen !== null ? (i <= chosen ? 1 : 0) : still ? 1 : now >= s.to ? 1 : now < s.from ? 0 : (now - s.from) / (s.to - s.from);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setChosen(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={cn("flex w-full flex-col gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-white/50", i === step ? "text-white" : "text-white/45 hover:text-white/75")}
                >
                  <span className="relative block h-[2px] overflow-hidden rounded-full bg-white/15">
                    <span className="absolute inset-y-0 left-0 bg-white" style={{ width: `${fill * 100}%` }} />
                  </span>
                  <span className="text-[13px] font-medium site-color-slow">{t(s.key)}</span>
                  <span className="hidden text-[12px] leading-snug text-white/50 md:block">{t(`${s.key}Body`)}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {!still && (
          <button
            type="button"
            onClick={() => {
              if (chosen !== null) {
                setChosen(null);
                setPaused(false);
              } else setPaused((p) => !p);
            }}
            aria-label={playing ? w("pause") : w("play")}
            className="flex size-9 shrink-0 items-center justify-center self-start rounded-full bg-white/10 text-white outline-none site-color-slow hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60"
          >
            {playing ? <Pause aria-hidden className="size-3.5" fill="currentColor" /> : <Play aria-hidden className="size-3.5" fill="currentColor" />}
          </button>
        )}
      </div>
      <p className="mt-6 text-[12px] text-[var(--s-dmuted)]">{w("sample")}</p>
    </div>
  );
}
