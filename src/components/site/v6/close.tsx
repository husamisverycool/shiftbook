// Pattern: docs/patterns/site.md §14 — Linear's close: a lot of room, a centred two-line statement and two
// pills (light, then dark), on Attio's faint field of vertical lines fading out from the middle with one
// soft glow of the accent; then a hairline and Stripe's two icon columns (an outlined icon tile, a title,
// two grey lines, a link with an arrow).
import type { ReactNode } from "react";
import { Arrow, Pill } from "@/components/site/v6/ui";

export function Close({
  id,
  title,
  line2,
  primary,
  secondary,
  columns,
}: {
  id: string;
  title: string;
  line2?: string;
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
  columns?: {
    icon: ReactNode;
    title: string;
    body: string;
    link: string;
    href: string;
  }[];
}) {
  return (
    <section
      aria-labelledby={id}
      data-tone="ink"
      className="relative isolate overflow-hidden px-6 pt-40 pb-24 text-white md:pt-52"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [mask-image:radial-gradient(60%_55%_at_50%_35%,#000,transparent)]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.05) 0 1px, transparent 1px 7px)",
        }}
      />
      <div
        aria-hidden
        className="absolute top-[8%] left-1/2 -z-10 h-[420px] w-[min(900px,90vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(107,120,255,0.28),transparent)] blur-2xl animate-site-breathe"
      />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center text-center">
        <h2
          id={id}
          className="site-reveal text-[clamp(2.25rem,4vw+1rem,4.25rem)] leading-[1.02] font-[500] tracking-[-0.04em] text-balance"
        >
          {title}
          {line2 && (
            <>
              <br />
              <span className="text-white/45">{line2}</span>
            </>
          )}
        </h2>
        <div className="site-reveal mt-10 flex flex-wrap justify-center gap-3 [--reveal-delay:120ms]">
          <Pill href={primary.href}>{primary.label}</Pill>
          <Pill href={secondary.href} tone="secondary">
            {secondary.label}
          </Pill>
        </div>
        {columns && (
          <div className="mt-36 grid w-full grid-cols-1 gap-10 border-t border-white/[0.08] pt-12 text-left sm:grid-cols-2 md:max-w-[880px]">
            {columns.map((c) => (
              <a
                key={c.title}
                href={c.href}
                className="group/pill site-reveal flex flex-col items-start gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <span
                  aria-hidden
                  className="flex size-9 items-center justify-center rounded-lg text-[var(--s-accent-soft)] ring-1 ring-white/15"
                >
                  {c.icon}
                </span>
                <span className="text-[15px] font-medium text-white">
                  {c.title}
                </span>
                <span className="max-w-[36ch] text-[14px] leading-relaxed text-[var(--s-dmuted)]">
                  {c.body}
                </span>
                <span className="mt-1 inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--s-accent-soft)]">
                  {c.link}
                  <Arrow />
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
