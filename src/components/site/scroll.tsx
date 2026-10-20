"use client";

// The page's movement as the reader scrolls, in one place (docs/patterns/site.md, "Scroll"):
// - Linear's and Attio's arrivals: anything marked `site-reveal` comes in from a blur the first time it
//   reaches the screen. Hidden only after this script marks the page, so nothing hides without it.
// - Apple's product pages: anything marked `data-parallax="<speed>"` drifts against the scroll.
// - Apple's and Stripe's colour that flows: a ToneGroup holds parts of one lightness (all dark, or all
//   light) and fades its one background to the colour of the part in the middle of the screen.
// Reduced motion: nothing hides, nothing drifts; the colours still change, without the fade.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "@/components/site/reduced-motion";
import { cn } from "@/lib/utils";

export function ScrollStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();

  useEffect(() => {
    const root = ref.current;
    if (!root || still) return;
    root.classList.add("site-armed");
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-shown", "");
          reveal.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    root.querySelectorAll(".site-reveal").forEach((el) => reveal.observe(el));

    const drifting = [...root.querySelectorAll<HTMLElement>("[data-parallax]")];
    let frame = 0;
    const drift = () => {
      frame = 0;
      const mid = window.innerHeight / 2;
      for (const el of drifting) {
        const box = el.parentElement?.getBoundingClientRect();
        if (!box || box.bottom < -200 || box.top > window.innerHeight + 200) continue;
        const speed = Number(el.dataset.parallax) || 0;
        el.style.setProperty("--parallax", `${((box.top + box.height / 2 - mid) * -speed).toFixed(1)}px`);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(drift);
    };
    drift();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      reveal.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
      root.classList.remove("site-armed");
    };
  }, [still]);

  return <div ref={ref}>{children}</div>;
}

/** One background for parts of one lightness, taking the colour of the part in the middle of the screen. */
export function ToneGroup({ tones, children, className }: { tones: Record<string, string>; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const first = Object.values(tones)[0]!;
  const [tone, setTone] = useState(first);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const name = (e.target as HTMLElement).dataset.tone;
          if (e.isIntersecting && name && tones[name]) setTone(tones[name]);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    root.querySelectorAll("[data-tone]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [tones]);

  return (
    <div ref={ref} className={cn("site-tone-field relative", className)} style={{ backgroundColor: tone }}>
      {children}
    </div>
  );
}
