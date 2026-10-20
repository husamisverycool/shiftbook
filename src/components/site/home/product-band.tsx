"use client";

// Pattern: docs/patterns/site.md §2 — Mercury's dark split: a heading over an accordion at the left (the
// open item's title with a small dot and its sentence, the others as plain titles between hairlines, a
// "Launch demo" link under it), the open item's product panel at the right cross-fading in. Arrow keys
// move between items (Base UI tabs, vertical). On phones the panel sits under the list.
import { Tabs } from "@base-ui/react/tabs";
import { useState } from "react";
import { ApprovalVisual, FilesVisual, PayrollVisual, ReviewVisual, type BandVisualLabels } from "./band-visuals";
import { cn } from "@/lib/utils";

export interface ProductBandStep {
  title: string;
  body: string;
}

const VISUALS = [FilesVisual, ReviewVisual, ApprovalVisual, PayrollVisual];

export function ProductBand({ label, steps, v, demo, sample }: { label: string; steps: ProductBandStep[]; v: BandVisualLabels; demo: { href: string; label: string } | null; sample: string }) {
  const [open, setOpen] = useState(0);
  return (
    <Tabs.Root value={open} onValueChange={(value) => setOpen(Number(value))} orientation="vertical" className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
      <div className="flex flex-col">
        <Tabs.List aria-label={label} className="flex flex-col border-t border-[var(--s-dline)]">
          {steps.map((s, i) => (
            <Tabs.Tab key={s.title} value={i} className="group/step flex flex-col items-start gap-1.5 border-b border-[var(--s-dline)] py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/40">
              <span className="flex items-center gap-2.5 text-[15px] font-medium text-[var(--s-dmuted)] site-color-slow group-hover/step:text-[var(--s-dtext)] group-data-[active]/step:text-[var(--s-dtext)]">
                <span aria-hidden className="size-1.5 rounded-full bg-[var(--s-accent-soft)] opacity-0 site-color-slow group-data-[active]/step:opacity-100" />
                {s.title}
              </span>
              <span className="hidden max-w-[44ch] pl-4 text-[14px] leading-relaxed text-[var(--s-dmuted)] group-data-[active]/step:block group-data-[active]/step:animate-page-in">{s.body}</span>
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {demo && (
          <a href={demo.href} className="mt-8 self-start rounded-sm text-[15px] font-medium text-[var(--s-dtext)] underline decoration-white/40 underline-offset-[6px] outline-none site-color-slow hover:decoration-white focus-visible:ring-2 focus-visible:ring-white/50">
            {demo.label}
          </a>
        )}
      </div>
      <div className="relative min-w-0">
        {/* Every panel stays mounted and stacked, so changing step is a cross-fade (Mercury). */}
        <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
          {VISUALS.map((Visual, i) => (
            <Tabs.Panel key={i} value={i} keepMounted className={cn("site-crossfade outline-none", open === i ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0")}>
              <Visual v={v} />
            </Tabs.Panel>
          ))}
        </div>
        <p className="mt-10 text-[13px] text-[var(--s-dmuted)]">{sample}</p>
      </div>
    </Tabs.Root>
  );
}
