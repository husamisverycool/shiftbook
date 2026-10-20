// Pattern: docs/patterns/site.md §7 — Linear's chapter: a full-width hairline with a soft shadow, the
// chapter's name large at the left in two lines, a paragraph and a link at the right, then a product scene
// as wide as the page that fades into the dark at its edges, then a "Features" row of names with a plus
// that opens each one's sentence (Linear's + buttons, as disclosures).
import type { ReactNode } from "react";

export function Chapter({ id, title, body, link, features, featuresLabel, children }: { id: string; title: string; body: string; link?: { href: string; label: string }; features?: { name: string; text: string }[]; featuresLabel?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="relative bg-[#08090c] px-6 py-28 text-[var(--s-dtext)] md:py-36">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-white/[0.08] shadow-[0_1px_30px_rgba(255,255,255,0.06)]" />
      <div className="mx-auto w-full max-w-[1240px]">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-16">
          <h2 id={id} className="max-w-[12ch] text-[clamp(2.25rem,3vw+1rem,3.5rem)] leading-[1.04] font-[500] tracking-[-0.035em] text-balance text-white">
            {title}
          </h2>
          <div className="flex flex-col items-start gap-6 md:pt-3">
            <p className="max-w-[34ch] text-[clamp(1.125rem,0.5vw+1rem,1.375rem)] leading-snug text-[var(--s-dmuted)]">{body}</p>
            {link && (
              <a href={link.href} className="group/cl inline-flex items-center gap-1.5 rounded-sm text-[15px] text-white outline-none focus-visible:ring-2 focus-visible:ring-white/50">
                {link.label}
                <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 motion-state group-hover/cl:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </a>
            )}
          </div>
        </div>
        <div className="mt-16 md:mt-20">{children}</div>
        {features && features.length > 0 && (
          <div className="mt-16 grid grid-cols-1 gap-8 border-t border-white/[0.08] pt-10 md:grid-cols-[1fr_2fr]">
            <p className="text-[14px] text-[var(--s-dmuted)]">{featuresLabel}</p>
            <ul className="grid grid-cols-1 gap-x-10 gap-y-1 sm:grid-cols-2">
              {features.map((f) => (
                <li key={f.name}>
                  <details className="group/ft">
                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm py-1.5 text-[15px] text-[var(--s-dtext)]/85 outline-none site-color-slow hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 [&::-webkit-details-marker]:hidden">
                      {f.name}
                      <span aria-hidden className="text-[var(--s-dmuted)] motion-state group-open/ft:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="max-w-[40ch] pb-3 text-[14px] leading-relaxed text-[var(--s-dmuted)]">{f.text}</p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
