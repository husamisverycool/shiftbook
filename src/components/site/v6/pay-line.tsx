"use client";

// Pattern: docs/patterns/site.md §7 — Apple's "Take a closer look": a dark stage pinned while the reader
// scrolls, a stack of pill buttons down the left that open one at a time into a caption card (⊕ turning
// to ×), and the object on the stage showing the part the open pill names. The object is one real pay line
// from the rules engine set in large type; the part named lights and the rest dims. Scrolling steps through
// the parts; pressing a pill scrolls to it. Phones and reduced motion: nothing pinned, every caption open.
import { useEffect, useRef, useState } from "react";
import { PARTS, type Part } from "@/components/site/v6/keys";
import { Eyebrow, Mono } from "@/components/site/v6/ui";
import { cn } from "@/lib/utils";


export interface PayLineLabels {
  eyebrow: string;
  title: string;
  muted: string;
  who: string;
  engine: string;
  parts: Record<Part, { name: string; caption: string }>;
  tokens: { hours: string; rate: string; exact: string; amount: string; rule: string; law: string; reading: string };
  days: { label: string; minutes: number; over: number; double: number }[];
}

const ON: Record<string, Part[]> = {
  hours: ["hours", "reading"],
  times: ["arithmetic"],
  rate: ["rate", "arithmetic"],
  equals: ["arithmetic"],
  exact: ["arithmetic", "rounding"],
  arrow: ["rounding"],
  amount: ["rounding"],
  rule: ["rule"],
  law: ["law"],
  reading: ["reading"],
  days: ["hours", "rule"],
};

function Token({ k, active, children, className }: { k: keyof typeof ON; active: Part; children: React.ReactNode; className?: string }) {
  const on = ON[k]!.includes(active);
  return <span className={cn("relative site-crossfade after:absolute after:inset-x-0 after:-bottom-1.5 after:h-[2px] after:rounded-full after:bg-[var(--s-accent-soft)] after:site-morph", on ? "text-white after:opacity-100" : "text-white/22 after:opacity-0", className)}>{children}</span>;
}

function Stage({ l, active }: { l: PayLineLabels; active: Part }) {
  const max = 13 * 60;
  return (
    <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,#121319,#0b0c10)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.07] sm:p-10 lg:p-12">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[70%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(130,140,255,0.16),transparent)]" />
      <Mono className="relative block text-white/40">{l.who}</Mono>
      {/* The line, as an equation. */}
      <p aria-hidden className="relative mt-8 flex flex-wrap items-baseline gap-x-[0.35em] gap-y-3 text-[clamp(1.75rem,3.2vw+0.5rem,3.75rem)] leading-none font-[500] tracking-[-0.035em] tabular-nums">
        <Token k="hours" active={active}>{l.tokens.hours}</Token>
        <Token k="times" active={active}>×</Token>
        <Token k="rate" active={active}>{l.tokens.rate}</Token>
        <Token k="equals" active={active}>=</Token>
        <Token k="exact" active={active}>{l.tokens.exact}</Token>
        <Token k="arrow" active={active}>→</Token>
        <Token k="amount" active={active}>{l.tokens.amount}</Token>
      </p>
      <div aria-hidden className="relative mt-8 flex flex-wrap gap-2">
        {(["rule", "law", "reading"] as const).map((k) => (
          <span key={k} className={cn("rounded-md px-2.5 py-1.5 ring-1 site-crossfade", ON[k]!.includes(active) ? "bg-white/[0.08] text-white ring-white/20" : "text-white/30 ring-white/[0.07]")}>
            <Mono>{l.tokens[k]}</Mono>
          </span>
        ))}
      </div>
      {/* The week by day: the hours past 8 lit. */}
      <div aria-hidden className={cn("relative mt-10 grid grid-cols-5 gap-3 site-crossfade sm:max-w-[420px]", ON.days!.includes(active) ? "opacity-100" : "opacity-35")}>
        {l.days.map((d) => (
          <div key={d.label} className="flex flex-col items-center gap-2">
            <div className="flex h-24 w-full max-w-9 flex-col-reverse overflow-hidden rounded-[5px] bg-white/[0.04]">
              <span className="block bg-white/25" style={{ height: `${((d.minutes - d.over - d.double) / max) * 100}%` }} />
              <span className="block bg-[var(--s-accent-soft)]" style={{ height: `${(d.over / max) * 100}%` }} />
              <span className="block bg-amber-400/70" style={{ height: `${(d.double / max) * 100}%` }} />
            </div>
            <Mono className="text-[10px] text-white/40">{d.label}</Mono>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PayLine({ id, l, explain }: { id: string; l: PayLineLabels; explain: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const el = ref.current;
      if (!el || el.offsetParent === null) return;
      const box = el.getBoundingClientRect();
      const run = box.height - window.innerHeight;
      const p = run > 0 ? Math.min(0.9999, Math.max(0, -box.top / run)) : 0;
      setIndex(Math.floor(p * PARTS.length));
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

  const goTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + ((i + 0.3) / PARTS.length) * (el.offsetHeight - window.innerHeight), behavior: "smooth" });
  };
  const active = PARTS[index]!;
  const head = (
    <div className="flex flex-col items-start gap-5">
      <Eyebrow tone="dark">{l.eyebrow}</Eyebrow>
      <h2 id={id} className="max-w-[14ch] text-[clamp(2rem,2.6vw+1rem,3.25rem)] leading-[1.04] font-[500] tracking-[-0.03em] text-balance text-white">
        {l.title} <span className="text-white/45">{l.muted}</span>
      </h2>
    </div>
  );
  const explainBlock = <p className="font-mono text-[12px] leading-relaxed text-white/45">{explain}</p>;

  return (
    <section aria-labelledby={id} data-tone="night" className="text-white">
      {/* Wide screens: pinned. */}
      <div ref={ref} className="relative hidden lg:block" style={{ height: `${PARTS.length * 50 + 100}vh` }}>
        <div className="sticky top-0 flex h-svh items-center">
          <div className="mx-auto grid w-full max-w-[1240px] grid-cols-[340px_minmax(0,1fr)] items-center gap-14 px-6">
            <div className="flex flex-col gap-10">
              {head}
              <ul className="flex flex-col gap-2">
                {PARTS.map((p, i) => {
                  const open = i === index;
                  return (
                    <li key={p}>
                      <button type="button" aria-expanded={open} onClick={() => goTo(i)} className={cn("w-full overflow-hidden rounded-[22px] text-left outline-none site-morph focus-visible:ring-2 focus-visible:ring-white/50", open ? "bg-white/[0.09] px-5 py-4" : "bg-white/[0.045] px-5 py-2.5 hover:bg-white/[0.07]")}>
                        <span className="flex items-center gap-3 text-[15px] font-medium">
                          <span aria-hidden className={cn("flex size-5 items-center justify-center rounded-full ring-1 ring-white/40 site-morph", open && "rotate-45")}>
                            <svg viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <path d="M5 1.5v7M1.5 5h7" />
                            </svg>
                          </span>
                          {l.parts[p].name}
                        </span>
                        <span className={cn("grid site-morph", open ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                          <span className="overflow-hidden pl-8 text-[14px] leading-relaxed text-white/65">{l.parts[p].caption}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex flex-col gap-5">
              <Stage l={l} active={active} />
              <div className="px-2">
                <Mono className="text-[10px] text-white/35">{l.engine}</Mono>
                <div className="mt-2 line-clamp-2">{explainBlock}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Phones and tablets: the line, then every part with its caption. */}
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-10 px-6 py-24 lg:hidden">
        {head}
        <Stage l={l} active="arithmetic" />
        <dl className="flex flex-col divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {PARTS.map((p) => (
            <div key={p} className="py-4">
              <dt className="text-[15px] font-medium">{l.parts[p].name}</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-white/60">{l.parts[p].caption}</dd>
            </div>
          ))}
        </dl>
        <div>
          <Mono className="text-[10px] text-white/35">{l.engine}</Mono>
          <div className="mt-2">{explainBlock}</div>
        </div>
      </div>
    </section>
  );
}
