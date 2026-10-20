"use client";

// Pattern: docs/patterns/site/security.md — Linear /security's decode: one phrase in the heading arrives
// as scrambled characters that settle into the words from left to right, once, over about 700ms. Screen
// readers get the words at once; reduced motion shows them still.
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/components/site/reduced-motion";

const GLYPHS = "0123456789#%&*+=<>/\\";

export function Decode({ text }: { text: string }) {
  const still = useReducedMotion();
  // The words first (so they show without the script), then the scramble settling into them.
  const [settled, setSettled] = useState(text.length);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (still) return;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 700);
      setSettled(Math.floor(p * text.length));
      setTick((n) => n + 1);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [still, text]);

  const shown = [...text].map((c, i) => (i < settled || c === " " ? c : GLYPHS[(i * 7 + tick) % GLYPHS.length])).join("");
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="text-[var(--s-accent-soft)]">
        {shown}
      </span>
    </>
  );
}
