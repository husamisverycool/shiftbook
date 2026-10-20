"use client";

// Pattern: docs/patterns/site.md §5 — Stripe Billing's chapters (the open item swaps the picture beside
// it) with Gusto's numbered steps; arrow keys move between steps (Base UI tabs, vertical). On phones each
// step shows its picture under it.
import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface WeekStep {
  title: string;
  body: string;
  picture: ReactNode;
}

export function WeekSteps({ label, steps }: { label: string; steps: WeekStep[] }) {
  return (
    <>
      <Tabs.Root defaultValue={0} orientation="vertical" className="hidden gap-10 lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Tabs.List aria-label={label} className="flex flex-col gap-1">
          {steps.map((s, i) => (
            <Tabs.Tab
              key={s.title}
              value={i}
              className={cn(
                "group/step flex gap-4 rounded-xl border border-transparent px-4 py-4 text-left outline-none transition-colors motion-state",
                "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 data-[active]:border-border data-[active]:bg-muted/50",
              )}
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums text-muted-foreground group-data-[active]/step:border-foreground group-data-[active]/step:bg-foreground group-data-[active]/step:text-background">
                {i + 1}
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-base font-semibold">{s.title}</span>
                <span className="text-sm leading-relaxed text-muted-foreground">{s.body}</span>
              </span>
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {steps.map((s, i) => (
          <Tabs.Panel key={s.title} value={i} className="animate-page-in outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-xl">
            {s.picture}
          </Tabs.Panel>
        ))}
      </Tabs.Root>
      <ol className="flex flex-col gap-12 lg:hidden">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-4">
            <div className="flex gap-4">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold tabular-nums text-background">{i + 1}</span>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </div>
            {s.picture}
          </li>
        ))}
      </ol>
    </>
  );
}
