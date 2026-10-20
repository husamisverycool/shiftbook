// Pattern: docs/patterns/site.md — Linear's changelog and pre-footer (linear.app, 2026-10-20). Changelog:
// the title (48px) at the left, then one hairline across the page with a dot over each of four entries, the
// newest dot lit; each entry a title (15px, #d0d6e0, 510, one line), two grey lines, and the date. Pre-footer:
// a centred two-sentence title (72px, weight 510, at most 16ch) and two pills, Linear's light and dark ones.
import { cn } from "@/lib/utils";

export function Changelog({ id, title, entries }: { id: string; title: string; entries: { key: string; title: string; body: string; date: string }[] }) {
  return (
    <section aria-labelledby={id} className="py-32 md:py-40">
      <div className="mx-auto w-full max-w-[1440px] px-6 md:px-20">
        <h2 id={id} className="site-reveal l-title-6 text-[var(--l-text)]">
          {title}
        </h2>
        <ol className="site-reveal relative mt-16 grid grid-cols-1 gap-10 pt-10 sm:grid-cols-2 lg:mt-[72px] lg:grid-cols-4 lg:gap-8">
          <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-[var(--l-line)]" />
          {entries.map((e, i) => (
            <li key={e.key} className="relative flex flex-col">
              <span aria-hidden className={cn("absolute -top-[45px] left-0 size-[9px] rounded-full ring-4 ring-[var(--l-bg)]", i === 0 ? "bg-[var(--l-text)] shadow-[0_0_10px_rgba(255,255,255,0.6)]" : "bg-[var(--l-text-4)]")} />
              <span className="truncate l-text-regular font-[510] text-[var(--l-text-2)]">{e.title}</span>
              <span className="mt-2 line-clamp-2 l-text-regular text-[var(--l-text-3)]">{e.body}</span>
              <span className="mt-3 l-text-mini text-[var(--l-text-4)]">{e.date}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Prefooter({ id, title, primary, secondary }: { id: string; title: string; primary: { href: string; label: string }; secondary: { href: string; label: string } }) {
  return (
    <section aria-labelledby={id} className="flex flex-col items-center px-6 pt-40 pb-48 text-center md:pt-48 md:pb-56">
      <h2 id={id} className="site-reveal max-w-[16ch] l-title-9 text-balance text-[var(--l-text)]">
        {title}
      </h2>
      <div className="site-reveal mt-10 flex flex-wrap justify-center gap-3 [--reveal-delay:100ms]">
        <a href={primary.href} className="inline-flex h-10 items-center rounded-full bg-[#e5e5e6] px-4 l-text-regular font-[510] text-[#08090a] shadow-[0_0_1px_rgba(0,0,0,0.08),0_1px_1px_rgba(0,0,0,0.07),0_3px_2px_rgba(0,0,0,0.04)] outline-none site-color-slow hover:bg-white focus-visible:ring-2 focus-visible:ring-white/60">
          {primary.label}
        </a>
        <a href={secondary.href} className="inline-flex h-10 items-center rounded-full bg-[#141516] px-4 l-text-regular font-[510] text-[var(--l-text)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03),inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_1px_rgba(0,0,0,0.6),0_4px_4px_rgba(0,0,0,0.1)] outline-none site-color-slow hover:bg-[#1c1d1f] focus-visible:ring-2 focus-visible:ring-white/40">
          {secondary.label}
        </a>
      </div>
    </section>
  );
}
