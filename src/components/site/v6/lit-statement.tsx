"use client";

// Pattern: docs/patterns/site.md §4 — Attio's scroll-lit paragraph: one large statement, every word its
// own span, lighting from grey to ink one after another as the section crosses the screen (each word's
// colour eases over 500ms). Words marked with *stars* in the message light to the accent instead. Attio's
// barcode texture under it. Reduced motion, or no script: every word lit.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/site/reduced-motion";
import { Barcode } from "@/components/site/v6/ui";
import { cn } from "@/lib/utils";

export function LitStatement({ id, label, text }: { id: string; label: string; text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const still = useReducedMotion();
  const [lit, setLit] = useState(Number.POSITIVE_INFINITY);
  // "*word*" marks an accented word; the stars are not shown.
  const words = text.split(" ").map((w) => ({ w: w.replaceAll("*", ""), accent: w.includes("*") }));

  useEffect(() => {
    if (still) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      // From the paragraph's top at 85% of the screen to its bottom at 45%.
      const start = window.innerHeight * 0.85;
      const end = window.innerHeight * 0.45;
      const p = Math.min(1, Math.max(0, (start - box.top) / (start - end + box.height)));
      setLit(Math.round(p * words.length));
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
    <section aria-labelledby={id} data-tone="paper" className="px-6 pt-32 md:pt-44">
      <h2 id={id} className="sr-only">
        {label}
      </h2>
      <p ref={ref} className="mx-auto max-w-[1080px] text-center text-[clamp(1.75rem,2.4vw+1rem,3rem)] leading-[1.18] font-[500] tracking-[-0.03em] text-balance">
        <span className="sr-only">{words.map((w) => w.w).join(" ")}</span>
        <span aria-hidden>
          {words.map((w, i) => (
            <span key={i} className={cn("site-word", i < lit ? (w.accent ? "text-[var(--s-accent)]" : "text-[var(--s-text)]") : "text-[var(--s-text)]/[0.16]")}>
              {w.w}{" "}
            </span>
          ))}
        </span>
      </p>
      <Barcode className="mx-auto mt-24 max-w-[1240px]" />
    </section>
  );
}
