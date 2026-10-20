// Pattern: docs/patterns/site.md §13 — Linear /insights' "Tech specs": the title and its grey line held at
// the left while the reader scrolls, and at the right an accordion of rows (a label, a chevron, hairlines
// between) that open onto chips or a short paragraph. Native disclosures, so the keyboard works as is.
import { Mono } from "@/components/site/v6/ui";

export interface SpecRow {
  label: string;
  chips?: string[];
  text?: string;
}

export function Specs({ id, title, muted, rows }: { id: string; title: string; muted: string; rows: SpecRow[] }) {
  return (
    <section aria-labelledby={id} data-tone="ink" className="px-6 py-28 text-white md:py-36">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-10 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-16">
        <div className="site-reveal md:sticky md:top-28 md:self-start">
          <h2 id={id} className="text-[clamp(1.75rem,1.6vw+1rem,2.5rem)] leading-[1.08] font-[500] tracking-[-0.03em]">
            {title}
          </h2>
          <p className="mt-3 max-w-[30ch] text-[17px] leading-relaxed text-[var(--s-dmuted)]">{muted}</p>
        </div>
        <div className="site-reveal border-t border-white/[0.08] [--reveal-delay:100ms]">
          {rows.map((r) => (
            <details key={r.label} className="group/spec border-b border-white/[0.08]">
              <summary className="flex h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-sm text-[15px] text-white/90 outline-none site-color-slow hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 [&::-webkit-details-marker]:hidden">
                {r.label}
                <svg aria-hidden viewBox="0 0 16 16" className="size-4 text-white/45 motion-state group-open/spec:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </summary>
              <div className="pb-6">
                {r.chips && (
                  <ul className="flex flex-wrap gap-1.5">
                    {r.chips.map((c) => (
                      <li key={c} className="rounded-md px-2.5 py-1 ring-1 ring-white/[0.12]">
                        <Mono className="text-[10.5px] text-white/75 normal-case tracking-[0.02em]">{c}</Mono>
                      </li>
                    ))}
                  </ul>
                )}
                {r.text && <p className={r.chips ? "mt-3 max-w-[56ch] text-[14px] leading-relaxed text-[var(--s-dmuted)]" : "max-w-[56ch] text-[14px] leading-relaxed text-[var(--s-dmuted)]"}>{r.text}</p>}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
