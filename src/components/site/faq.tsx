"use client";

// Pattern: docs/patterns/site/pricing.md — Mercury's and Ramp's questions: a list of questions between
// hairlines, each a button with aria-expanded and a plus that turns to a cross; the answer opens with the
// state-change motion.
import { Accordion } from "@base-ui/react/accordion";

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <Accordion.Root multiple className="border-t border-[var(--s-line)]">
      {items.map((i) => (
        <Accordion.Item key={i.q} className="group/faq border-b border-[var(--s-line)]">
          <Accordion.Header render={<h3 />}>
            <Accordion.Trigger className="flex w-full items-center justify-between gap-6 rounded-sm py-5 text-left text-[17px] font-medium text-[var(--s-text)] outline-none site-color-slow hover:text-[var(--s-text)]/75 focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)]">
              {i.q}
              <span aria-hidden className="relative size-3.5 shrink-0 text-[var(--s-muted)] motion-state group-data-[open]/faq:rotate-45">
                <span className="absolute top-1/2 left-0 h-px w-full bg-current" />
                <span className="absolute top-0 left-1/2 h-full w-px bg-current" />
              </span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel className="h-[var(--accordion-panel-height)] overflow-hidden motion-state [transition-property:height] data-[ending-style]:h-0 data-[starting-style]:h-0">
            <p className="max-w-[64ch] pb-6 text-[15px] leading-relaxed text-[var(--s-muted)]">{i.a}</p>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
