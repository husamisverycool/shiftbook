"use client";

// Pattern: docs/patterns/site.md §5 — Attio's pinned product tour: the steps of the week down the left,
// each a number, a name and a sentence, the current one lit with a bar that fills as the reader scrolls;
// on the right the app in its light theme, pinned, changing screen with each step. Behind the app, Stripe's
// soft field of colour shifts hue from step to step. Pressing a step scrolls to it. On a phone nothing is
// pinned: each step's words, then its screen. Reduced motion: the screens change without moving.
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { Demo } from "@/components/site/app/data";
import { AGENCY, AppWindow } from "@/components/site/app/frame";
import { ApprovalsScreen, FileScreen, InboxScreen, InvoicesScreen, PayScreen, WeekScreen } from "@/components/site/app/screens";
import { useReducedMotion } from "@/components/site/reduced-motion";
import { cn } from "@/lib/utils";

const STEPS = ["inbox", "check", "pay", "approve", "invoice", "file"] as const;
type Step = (typeof STEPS)[number];
const WASH: Record<Step, string> = {
  inbox: "radial-gradient(80% 70% at 85% 10%, #b9c6ff 0%, transparent 60%), radial-gradient(70% 60% at 10% 90%, #c7ecff 0%, transparent 60%)",
  check: "radial-gradient(80% 70% at 85% 10%, #ffd9a8 0%, transparent 60%), radial-gradient(70% 60% at 10% 90%, #ffe9c9 0%, transparent 60%)",
  pay: "radial-gradient(80% 70% at 85% 10%, #c9b8ff 0%, transparent 60%), radial-gradient(70% 60% at 10% 90%, #b9d2ff 0%, transparent 60%)",
  approve: "radial-gradient(80% 70% at 85% 10%, #b5ecd2 0%, transparent 60%), radial-gradient(70% 60% at 10% 90%, #d4f3e3 0%, transparent 60%)",
  invoice: "radial-gradient(80% 70% at 85% 10%, #ffc4c4 0%, transparent 60%), radial-gradient(70% 60% at 10% 90%, #ffe0cf 0%, transparent 60%)",
  file: "radial-gradient(80% 70% at 85% 10%, #a9e3ea 0%, transparent 60%), radial-gradient(70% 60% at 10% 90%, #c3d3ff 0%, transparent 60%)",
};

function Screen({ step, demo, since, className }: { step: Step; demo: Demo; since: number; className?: string }) {
  if (step === "inbox") return <InboxScreen arrived={Math.min(6, 2 + Math.floor(since / 260))} className={className} />;
  if (step === "check") return <WeekScreen decided={since > 2200} className={className} />;
  if (step === "pay") return <PayScreen demo={demo} shown={Math.floor(since / 380)} className={className} />;
  if (step === "approve") return <ApprovalsScreen approved={since > 1400 ? 3 : 2} className={className} />;
  if (step === "invoice") return <InvoicesScreen className={className} />;
  return <FileScreen demo={demo} system={Math.floor(since / 1800) % demo.files.length} className={className} />;
}

/** Milliseconds since `step` became the shown one (frozen at a late moment for reduced motion). */
function useSince(step: Step, active: boolean): number {
  const still = useReducedMotion();
  const [since, setSince] = useState(0);
  useEffect(() => {
    if (still || !active) return;
    const start = performance.now();
    const id = window.setInterval(() => setSince(performance.now() - start), 100);
    return () => {
      window.clearInterval(id);
      setSince(0);
    };
  }, [step, active, still]);
  return still ? 2600 : since;
}

export function ProductTour({ demo }: { demo: Demo }) {
  const t = useTranslations("site.app.tour");
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const run = box.height - window.innerHeight;
      setOnScreen(box.top < window.innerHeight && box.bottom > 0);
      setProgress(run > 0 ? Math.min(0.9999, Math.max(0, -box.top / run)) : 0);
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
  }, []);

  const index = Math.floor(progress * STEPS.length);
  const step = STEPS[index]!;
  const within = progress * STEPS.length - index;
  const since = useSince(step, onScreen);
  const goTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + ((i + 0.05) / STEPS.length) * (el.offsetHeight - window.innerHeight), behavior: "smooth" });
  };

  return (
    <>
      {/* Wide screens: pinned. */}
      <div ref={ref} className="relative hidden lg:block" style={{ height: `${STEPS.length * 75 + 25}vh` }}>
        <div className="sticky top-0 flex h-svh items-center">
          <div className="mx-auto grid w-full max-w-[1240px] grid-cols-[minmax(0,330px)_minmax(0,1fr)] items-center gap-14 px-6">
            <ol className="flex flex-col">
              {STEPS.map((s, i) => (
                <li key={s}>
                  <button type="button" onClick={() => goTo(i)} aria-current={i === index ? "step" : undefined} className="group/step relative flex w-full gap-4 rounded-lg py-3.5 pr-2 pl-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)]">
                    {/* The step's bar, filling as the reader scrolls through it. */}
                    <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] overflow-hidden rounded-full bg-[var(--s-line)]">
                      <span className="absolute inset-x-0 top-0 bg-[var(--s-text)]" style={{ height: `${i < index ? 100 : i === index ? within * 100 : 0}%` }} />
                    </span>
                    <span className={cn("font-mono text-[12px] tabular-nums site-color-slow", i === index ? "text-[var(--s-text)]" : "text-[var(--s-muted)]/60")}>{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex flex-col">
                      <span className={cn("text-[17px] font-medium tracking-[-0.01em] site-color-slow", i === index ? "text-[var(--s-text)]" : "text-[var(--s-muted)]/70 group-hover/step:text-[var(--s-text)]")}>{t(`${s}.name`)}</span>
                      <span className={cn("grid site-morph", i === index ? "mt-1.5 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                        <span className="overflow-hidden text-[14px] leading-relaxed text-[var(--s-muted)]">{t(`${s}.body`)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="relative isolate overflow-hidden rounded-[22px] bg-white/60 p-8 ring-1 ring-black/[0.05]">
              {STEPS.map((s) => (
                <span key={s} aria-hidden className={cn("absolute inset-0 -z-10 site-crossfade", s === step ? "opacity-100" : "opacity-0")} style={{ backgroundImage: WASH[s] }} />
              ))}
              <AppWindow title={`${AGENCY} — Tabulado`}>
                <div aria-hidden className="relative h-[540px]">
                  <div key={step} className="absolute inset-0 animate-site-screen-in">
                    <Screen step={step} demo={demo} since={since} className="h-full" />
                  </div>
                </div>
              </AppWindow>
              <p className="sr-only">{t(`${step}.body`)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Phones and tablets: each step, then its screen. */}
      <ol className="mx-auto flex w-full max-w-[720px] flex-col gap-16 px-6 lg:hidden">
        {STEPS.map((s, i) => (
          <li key={s} className="site-reveal">
            <p className="font-mono text-[12px] text-[var(--s-muted)]">{String(i + 1).padStart(2, "0")}</p>
            <h3 className="mt-1 text-[20px] font-medium tracking-[-0.01em]">{t(`${s}.name`)}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--s-muted)]">{t(`${s}.body`)}</p>
            <div className="relative isolate mt-5 overflow-hidden rounded-2xl p-3 ring-1 ring-black/[0.05]" style={{ backgroundImage: WASH[s] }}>
              <AppWindow>
                <div aria-hidden className="relative h-[380px]">
                  <Screen step={s} demo={demo} since={4000} className="h-full" />
                </div>
              </AppWindow>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
