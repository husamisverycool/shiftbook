"use client";

// Pattern: docs/patterns/site/pricing.md — Gusto's, Warp's and Mercury's FAQ as an accordion: each
// question a button with aria-expanded, the answer opening with Primer's state-change motion.
import { Accordion } from "@base-ui/react/accordion";
import { PlusIcon } from "lucide-react";

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <Accordion.Root multiple className="divide-y border-y">
      {items.map((i) => (
        <Accordion.Item key={i.q} className="group/faq">
          <Accordion.Header render={<h3 />}>
            <Accordion.Trigger className="flex w-full items-center justify-between gap-6 py-5 text-left text-base font-medium outline-none transition-colors hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm">
              {i.q}
              <PlusIcon aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform motion-state group-data-[open]/faq:rotate-45" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel className="h-[var(--accordion-panel-height)] overflow-hidden transition-[height] motion-state data-[starting-style]:h-0 data-[ending-style]:h-0">
            <p className="max-w-[68ch] pb-5 text-base leading-relaxed text-muted-foreground">{i.a}</p>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
