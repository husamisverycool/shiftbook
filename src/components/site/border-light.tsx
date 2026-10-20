"use client";

// Pattern: docs/patterns/site.md §6 — Stripe's bento card: a 1px border with a soft light that trails the
// pointer a second behind, and the card itself on top. Without a pointer it is a plain hairline.
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BorderLight({ children, className, inner }: { children: ReactNode; className?: string; inner?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el || e.pointerType !== "mouse") return;
        const box = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - box.left - 200}px`);
        el.style.setProperty("--my", `${e.clientY - box.top - 200}px`);
      }}
      className={cn("group/light relative isolate overflow-hidden rounded-2xl bg-[var(--s-line)] p-px", className)}
    >
      <span aria-hidden className="pointer-events-none absolute top-0 left-0 -z-10 size-[400px] rounded-full bg-[radial-gradient(circle,var(--s-accent)_0%,color-mix(in_oklch,var(--s-accent)_40%,#f2a65a)_35%,transparent_68%)] opacity-0 site-follow group-hover/light:opacity-70 [transform:translate3d(var(--mx,-400px),var(--my,-400px),0)]" />
      <div className={cn("relative h-full rounded-[15px] bg-white", inner)}>{children}</div>
    </div>
  );
}
