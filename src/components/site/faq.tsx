"use client";

// Pattern: docs/patterns/site/pricing.md — Mercury's and Ramp's questions: a list of questions between
// hairlines, each a button with aria-expanded and a plus that turns to a cross; the answer opens with the
// state-change motion.
import { Accordion } from "@base-ui/react/accordion";
import { cn } from "@/lib/utils";

export function Faq({ items, tone = "light" }: { items: { q: string; a: string }[]; tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  return (
    <Accordion.Root multiple className={cn("border-t", dark ? "border-white/[0.08]" : "border-[var(--s-line)]")}>
      {items.map((i) => (
        <Accordion.Item key={i.q} className={cn("group/faq border-b", dark ? "border-white/[0.08]" : "border-[var(--s-line)]")}>
          <Accordion.Header render={<h3 />}>
            <Accordion.Trigger className={cn("flex w-full items-center justify-between gap-6 rounded-sm py-5 text-left text-[17px] font-medium outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)]", dark ? "text-white hover:text-white/75" : "text-[var(--s-text)] hover:text-[var(--s-text)]/75")}>
              {i.q}
              <span aria-hidden className={cn("relative size-3.5 shrink-0 motion-state group-data-[open]/faq:rotate-45", dark ? "text-white/45" : "text-[var(--s-muted)]")}>
                <span className="absolute top-1/2 left-0 h-px w-full bg-current" />
                <span className="absolute top-0 left-1/2 h-full w-px bg-current" />
              </span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel className="h-[var(--accordion-panel-height)] overflow-hidden motion-state [transition-property:height] data-[ending-style]:h-0 data-[starting-style]:h-0">
            <p className={cn("max-w-[64ch] pb-6 text-[15px] leading-relaxed", dark ? "text-[var(--s-dmuted)]" : "text-[var(--s-muted)]")}>{i.a}</p>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
