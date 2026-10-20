// Pattern: docs/patterns/site.md, "One system" — the small pieces every part of the sixth design shares,
// after Linear's measured tokens and Attio's sheet: the eyebrow pill above a heading, the mono micro-label,
// the footnote mark that points at the footer's numbered notes (Apple, Mercury), the two pill buttons
// (Linear's light primary and dark secondary with its inset ring), and Attio's barcode texture.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Attio's eyebrow: a small tinted pill above a section's heading. */
export function Eyebrow({ children, tone = "light", className }: { children: ReactNode; tone?: "light" | "dark"; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-lg px-2 text-[13px] font-medium tracking-[-0.01em]", tone === "dark" ? "bg-white/[0.07] text-[var(--s-accent-soft)]" : "bg-[var(--s-accent)]/10 text-[var(--s-accent)]", className)}>
      {children}
    </span>
  );
}

/** Linear's and Raycast's mono micro-label: 11px, upper case, spaced. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[11px] tracking-[0.08em] uppercase", className)}>{children}</span>;
}

/** A footnote mark: the number of the footer's note it stands for. */
export function Sup({ n, className }: { n: number; className?: string }) {
  return (
    <a href={`#note-${n}`} className={cn("ml-0.5 align-super text-[0.6em] font-normal no-underline opacity-70 outline-none hover:opacity-100 focus-visible:underline", className)}>
      {n}
    </a>
  );
}

/** Linear's pills: light primary, dark secondary with an inset ring. */
export function Pill({ href, children, tone = "primary", className }: { href: string; children: ReactNode; tone?: "primary" | "secondary" | "outline"; className?: string }) {
  return (
    <a
      href={href}
      className={cn(
        "group/pill inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium outline-none site-color-slow focus-visible:ring-2",
        tone === "primary" && "bg-[#e9e9eb] text-[#0b0c10] shadow-[0_0_1px_rgba(0,0,0,0.08),0_1px_1px_rgba(0,0,0,0.07),0_3px_2px_rgba(0,0,0,0.04)] hover:bg-white focus-visible:ring-white/60",
        tone === "secondary" && "bg-[#16171d] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(0,0,0,0.6)] hover:bg-[#1d1e25] focus-visible:ring-white/50",
        tone === "outline" && "text-[var(--s-text)] ring-1 ring-[var(--s-line)] ring-inset hover:bg-black/[0.03] focus-visible:ring-[var(--s-accent-soft)]",
        className,
      )}
    >
      {children}
    </a>
  );
}

/** An arrow that nudges on its link's hover. */
export function Arrow({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={cn("size-3.5 motion-state group-hover/pill:translate-x-0.5", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

/** Attio's barcode: fine vertical lines fading in from the top, a quiet divider. */
export function Barcode({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  return (
    <div
      aria-hidden
      className={cn("h-24 w-full [mask-image:linear-gradient(to_bottom,transparent,#000)]", className)}
      style={{ backgroundImage: `repeating-linear-gradient(90deg, ${tone === "dark" ? "rgb(255 255 255 / 0.07)" : "rgb(22 23 29 / 0.09)"} 0 1px, transparent 1px 8px)` }}
    />
  );
}

/** A section's heading row, Linear's split: the heading left, a paragraph (and link) right. */
export function SplitHead({ id, eyebrow, title, muted, body, tone = "light", link }: { id: string; eyebrow?: string; title: string; muted?: string; body?: string; tone?: "light" | "dark"; link?: ReactNode }) {
  const dark = tone === "dark";
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-10">
      <div className="site-reveal flex flex-col items-start gap-5 md:col-span-6">
        {eyebrow && <Eyebrow tone={tone}>{eyebrow}</Eyebrow>}
        <h2 id={id} className={cn("max-w-[16ch] text-[clamp(2rem,2.6vw+1rem,3.25rem)] leading-[1.04] font-[500] tracking-[-0.03em] text-balance", dark ? "text-white" : "text-[var(--s-text)]")}>
          {title}
          {muted && <span className={dark ? "text-white/45" : "text-[var(--s-muted)]"}> {muted}</span>}
        </h2>
      </div>
      {(body || link) && (
        <div className="site-reveal flex flex-col items-start gap-5 [--reveal-delay:120ms] md:col-span-5 md:col-start-8 md:self-end">
          {body && <p className={cn("max-w-[40ch] text-[17px] leading-relaxed", dark ? "text-[var(--s-dmuted)]" : "text-[var(--s-muted)]")}>{body}</p>}
          {link}
        </div>
      )}
    </div>
  );
}
