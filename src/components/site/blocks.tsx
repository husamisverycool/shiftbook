// The website's shared pieces (slice aa; docs/research/website-visual-slice-aa.md). Mercury's palette
// bands (near-black navy, warm paper), Stripe's and Attio's two-tone headings at regular weight,
// Campfire's flooding pill button, Mercury's frosted controls over photographs.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A page section in the 1200px column (Mercury's content width), 24px sides. */
export function Section({ id, className, children, labelledBy, inner }: { id?: string; className?: string; children: ReactNode; labelledBy?: string; inner?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("scroll-mt-20 px-6 py-24 md:py-32", className)}>
      <div className={cn("mx-auto w-full max-w-[1200px]", inner)}>{children}</div>
    </section>
  );
}

/**
 * Stripe's two-tone heading (statement, then its elaboration in grey), at Mercury's regular weight
 * with tight tracking. `tone="dark"` on the navy bands.
 */
export function TwoTone({ id, strong, muted, className, as: Tag = "h2", tone = "light" }: { id?: string; strong: string; muted?: string; className?: string; as?: "h1" | "h2" | "h3"; tone?: "light" | "dark" }) {
  return (
    <Tag id={id} className={cn("max-w-[22em] text-[clamp(1.875rem,2.2vw+1rem,2.75rem)] leading-[1.08] font-[450] tracking-[-0.03em] text-balance", tone === "dark" ? "text-[var(--s-dtext)]" : "text-[var(--s-text)]", className)}>
      {strong}
      {muted && <span className={tone === "dark" ? "text-[var(--s-dmuted)]" : "text-[var(--s-muted)]"}> {muted}</span>}
    </Tag>
  );
}

/** Mercury's small label above a page heading: sentence case, muted, the body face. */
export function Eyebrow({ children, tone = "light", className }: { children: ReactNode; tone?: "light" | "dark"; className?: string }) {
  return <p className={cn("mb-5 text-[15px] font-medium", tone === "dark" ? "text-[var(--s-dmuted)]" : "text-[var(--s-muted)]", className)}>{children}</p>;
}

/**
 * Campfire's pill: the label at the left, a round arrow at the right; on hover three circles grow out of
 * the arrow one after another until the darkest fills the pill (timings in globals.css `site-flood`).
 */
export function FloodButton({ href, children, tone = "accent", className }: { href: string; children: ReactNode; tone?: "accent" | "light"; className?: string }) {
  const base = tone === "accent" ? "bg-[var(--s-accent)] text-white" : "bg-white text-[var(--s-text)]";
  const circle = "absolute inset-0 rounded-full site-flood group-hover/flood:scale-[26] group-focus-visible/flood:scale-[26]";
  return (
    <a
      href={href}
      className={cn(
        "group/flood relative isolate inline-flex h-12 items-center overflow-clip rounded-full py-3 pr-16 pl-6 text-[15px] font-medium outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)] focus-visible:ring-offset-2",
        base,
        className,
      )}
    >
      <span className="relative z-10 site-color-slow group-hover/flood:text-white">{children}</span>
      <span aria-hidden className="absolute top-1/2 right-2 size-8 -translate-y-1/2">
        <span className={cn(circle, "bg-[var(--s-accent-2)] [transition-delay:0ms]")} />
        <span className={cn(circle, "bg-[var(--s-ink-3)] [transition-delay:60ms]")} />
        <span className={cn(circle, "bg-[var(--s-ink)] [transition-delay:120ms]")} />
        <span className={cn("absolute inset-0 rounded-full", tone === "accent" ? "bg-white/15" : "bg-[var(--s-text)]")} />
        <svg viewBox="0 0 16 16" className="absolute top-1/2 left-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </span>
    </a>
  );
}

/** Mercury's frosted pill over a photograph or a dark band. */
export function FrostButton({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} className={cn("inline-flex h-12 items-center rounded-full border border-white/20 bg-white/10 px-6 text-[15px] font-medium text-white backdrop-blur-[20px] outline-none site-color-slow hover:bg-white/18 focus-visible:ring-2 focus-visible:ring-white/60", className)}>
      {children}
    </a>
  );
}

/** A quiet text link with Stripe's arrow that nudges on hover. */
export function ArrowLink({ href, children, tone = "light", className }: { href: string; children: ReactNode; tone?: "light" | "dark"; className?: string }) {
  return (
    <a href={href} className={cn("group/al inline-flex items-center gap-1.5 rounded-sm text-[15px] font-medium underline decoration-1 underline-offset-[6px] outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)]", tone === "dark" ? "text-[var(--s-dtext)] decoration-white/30 hover:decoration-white" : "text-[var(--s-text)] decoration-black/25 hover:decoration-black", className)}>
      {children}
      <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 motion-state group-hover/al:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8h10M9 4l4 4-4 4" />
      </svg>
    </a>
  );
}

/** A status pill inside the product pictures (Deel's and Check's semantic pills), fixed colours. */
export function Pill({ tone, children, dark, className }: { tone: "green" | "amber" | "grey" | "blue" | "accent"; children: ReactNode; dark?: boolean; className?: string }) {
  const tones = dark
    ? { green: "bg-emerald-400/12 text-emerald-300 ring-emerald-400/25", amber: "bg-amber-400/12 text-amber-300 ring-amber-400/25", grey: "bg-white/6 text-white/60 ring-white/12", blue: "bg-sky-400/12 text-sky-300 ring-sky-400/25", accent: "bg-indigo-400/15 text-indigo-200 ring-indigo-400/30" }
    : { green: "bg-emerald-50 text-emerald-700 ring-emerald-600/15", amber: "bg-amber-50 text-amber-700 ring-amber-600/20", grey: "bg-stone-100 text-stone-600 ring-stone-500/15", blue: "bg-sky-50 text-sky-700 ring-sky-600/15", accent: "bg-indigo-50 text-indigo-700 ring-indigo-600/15" };
  return <span className={cn("inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

/** Initials in a round tile (people) with a steady colour from the name. */
export function Initials({ name, className, dark }: { name: string; className?: string; dark?: boolean }) {
  const hues = dark ? ["bg-indigo-400/20 text-indigo-200", "bg-emerald-400/20 text-emerald-200", "bg-amber-400/20 text-amber-200", "bg-rose-400/20 text-rose-200", "bg-sky-400/20 text-sky-200"] : ["bg-indigo-100 text-indigo-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-800", "bg-rose-100 text-rose-700", "bg-sky-100 text-sky-700"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <span aria-hidden className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", hues[h % hues.length], className)}>
      {letters}
    </span>
  );
}

/** Mercury's money with superscript cents ("$2,023,267.¹²"). */
export function Money({ value, className }: { value: string; className?: string }) {
  const m = /^(.*)\.(\d{2})$/.exec(value);
  if (!m) return <span className={className}>{value}</span>;
  return (
    <span className={cn("tabular-nums", className)}>
      {m[1]}
      <span className="align-[0.45em] text-[0.62em] opacity-70">.{m[2]}</span>
    </span>
  );
}

/**
 * Stripe's odometer: each digit of a figure is a column of 0–9 that rolls to its place when the figure
 * changes; other characters stand still. Screen readers read the figure once, plainly.
 */
export function Odometer({ value, className }: { value: string; className?: string }) {
  const chars = [...value];
  return (
    <span className={cn("relative inline-flex tabular-nums", className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden className="inline-flex overflow-hidden [mask-image:linear-gradient(180deg,transparent,#000_18%,#000_82%,transparent)]">
        {chars.map((c, i) =>
          /\d/.test(c) ? (
            <span key={`${chars.length - i}`} className="relative inline-block h-[1.15em] w-[0.62em] overflow-hidden leading-[1.15em]">
              <span className="absolute inset-x-0 top-0 flex flex-col site-roll" style={{ transform: `translateY(${-Number(c) * 1.15}em)` }}>
                {DIGITS.map((d) => (
                  <span key={d} className="h-[1.15em] text-center">
                    {d}
                  </span>
                ))}
              </span>
            </span>
          ) : (
            <span key={`${chars.length - i}`} className="inline-block h-[1.15em] leading-[1.15em]">
              {c}
            </span>
          ),
        )}
      </span>
    </span>
  );
}
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
