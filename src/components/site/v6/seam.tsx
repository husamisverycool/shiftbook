// Pattern: docs/patterns/site.md §11 — Mercury's figures across the seam: a centred line on the light
// band, then four large figures standing exactly on the line where the light band meets the dark one, the
// top half of each numeral dark on light and the bottom half light on dark, thin dividers between them
// that change colour at the same line, and the captions below on the dark band with footnote marks.
import { Sup } from "@/components/site/v6/ui";

export function Seam({ id, title, figures }: { id: string; title: string; figures: { value: string; label: string; note?: number }[] }) {
  return (
    <section aria-labelledby={id}>
      <div className="bg-[var(--s-paper)] px-6 pt-28 pb-16 md:pt-36">
        <h2 id={id} className="site-reveal mx-auto max-w-[20em] text-center text-[clamp(1.75rem,1.6vw+1rem,2.5rem)] leading-[1.1] font-[500] tracking-[-0.03em] text-balance text-[var(--s-text)]">
          {title}
        </h2>
      </div>
      <div className="bg-[linear-gradient(180deg,var(--s-paper)_50%,var(--s-ink)_50%)]">
        <dl className="mx-auto grid w-full max-w-[1200px] grid-cols-4">
          {figures.map((f, i) => (
            <div key={f.label} className="relative flex flex-col items-center">
              {i > 0 && <span aria-hidden className="absolute -inset-y-10 left-0 w-px bg-[linear-gradient(180deg,transparent,rgba(22,23,29,0.14)_30%,rgba(22,23,29,0.14)_50%,rgba(255,255,255,0.14)_50%,rgba(255,255,255,0.14)_70%,transparent)]" />}
              <dd className="relative py-2 text-[clamp(2.5rem,7vw,6.5rem)] leading-none font-[400] tracking-[-0.05em] tabular-nums">
                <span className="text-[var(--s-text)] [clip-path:inset(0_0_50%_0)]">{f.value}</span>
                <span aria-hidden className="absolute inset-0 py-2 text-white [clip-path:inset(50%_0_0_0)]">
                  {f.value}
                </span>
              </dd>
              <dt className="sr-only">{f.label}</dt>
            </div>
          ))}
        </dl>
      </div>
      <div className="bg-[var(--s-ink)] px-6 pt-6 pb-10">
        <ul aria-hidden className="mx-auto grid w-full max-w-[1200px] grid-cols-4 gap-x-3">
          {figures.map((f) => (
            <li key={f.label} className="mx-auto max-w-[18ch] text-center text-[11px] leading-snug sm:text-[13px] text-[var(--s-dmuted)]">
              {f.label}
              {f.note && <Sup n={f.note} />}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
