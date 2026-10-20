"use client";

// Pattern: docs/patterns/site/pricing.md — Stripe /pricing's floating pill bar: a small rounded bar of
// anchors held near the top while the page scrolls, the part on screen lit.
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function PillBar({ label, items }: { label: string; items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]!.id);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    items.forEach((i) => {
      const el = document.getElementById(i.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [items]);
  return (
    <nav aria-label={label} className="sticky top-20 z-30 flex justify-center px-6">
      <ul className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-[#16171d]/85 p-1 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.7)] ring-1 ring-white/10 backdrop-blur-xl [scrollbar-width:none]">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} aria-current={active === i.id ? "true" : undefined} className={cn("inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-white/50", active === i.id ? "bg-white text-[#0b0c10]" : "text-white/65 hover:text-white")}>
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
