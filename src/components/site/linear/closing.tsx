// Pattern: docs/patterns/site.md — Linear's pre-footer (linear.app, 2026-10-20):
// a centred two-sentence title (72px, weight 510, at most 16ch) and two pills, Linear's light and dark ones.

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
