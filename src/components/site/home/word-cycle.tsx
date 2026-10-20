"use client";

// Pattern: docs/patterns/site.md §7 — Campfire's feature list: a tall column of names in large type, faded
// at its top and bottom edges, with a light moving down it one name at a time; the lit name is ink, the
// rest grey. Hovering a name lights it and holds the cycle. With reduced motion nothing moves.
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/components/site/reduced-motion";
import { cn } from "@/lib/utils";

export function WordCycle({ words, label }: { words: string[]; label: string }) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const still = useReducedMotion();
  useEffect(() => {
    if (held || still) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % words.length), 1800);
    return () => window.clearTimeout(id);
  }, [held, still, index, words.length]);
  return (
    <ul aria-label={label} onMouseLeave={() => setHeld(false)} className="flex flex-col [mask-image:linear-gradient(to_bottom,transparent,#000_14%,#000_86%,transparent)] py-6">
      {words.map((w, i) => (
        <li
          key={w}
          onMouseEnter={() => {
            setHeld(true);
            setIndex(i);
          }}
          className={cn("cursor-default py-1 text-[clamp(1.5rem,1.6vw+1rem,2.5rem)] leading-[1.15] font-[450] tracking-[-0.03em] site-color-slow", !still && i === index ? "text-[var(--s-text)]" : "text-[var(--s-text)]/22")}
        >
          {w}
        </li>
      ))}
    </ul>
  );
}
