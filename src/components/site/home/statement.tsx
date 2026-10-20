"use client";

// Pattern: docs/patterns/site.md §6 — Check's statement: one large sentence whose words turn from grey to
// ink as it is scrolled through the middle of the screen. With reduced motion it is simply ink.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/site/reduced-motion";
import { cn } from "@/lib/utils";

export function Statement({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");
  const [progress, setProgress] = useState(words.length);
  const still = useReducedMotion();
  const lit = still ? words.length : progress;
  useEffect(() => {
    if (still) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const view = window.innerHeight;
      // 0 when the sentence's top reaches 80% of the screen, 1 when its bottom reaches 45%.
      const start = view * 0.8;
      const end = view * 0.45;
      const progress = (start - box.top) / (start - end + box.height);
      setProgress(Math.round(Math.min(1, Math.max(0, progress)) * words.length));
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
  }, [still, words.length]);
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <span key={i} className={cn("site-color-slow", i < lit ? "text-[var(--s-text)]" : "text-[var(--s-text)]/20")}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
