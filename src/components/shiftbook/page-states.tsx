// A page loading (docs/patterns/_components/loading.md): Polaris SkeletonPage — the page's own outline
// at its own width, a list area's title as real text, bars 8px high with 12px gaps and the last line
// of a group 80% wide; Carbon's slow pulse (decision 0037), still under reduced motion.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Page } from "./page";

export type Shape = "list" | "record" | "settings" | "dashboard";

function Bar({ className }: { className?: string }) {
  return <div aria-hidden className={cn("h-2 animate-skeleton rounded-sm bg-muted", className)} />;
}

/** Polaris SkeletonBodyText: `lines` bars, 12px apart, the last at 80%. */
function Lines({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: lines }, (_, n) => (
        <Bar key={n} className={n === lines - 1 ? "w-4/5" : "w-full"} />
      ))}
    </div>
  );
}

/** Polaris SkeletonDisplayText for a title: at least 120×28. */
function TitleBar() {
  return <Bar className="h-7 w-40" />;
}

/** Varying row widths, so the outline reads as a list rather than a block. */
const ROW_WIDTHS = ["w-48", "w-36", "w-56", "w-40", "w-52", "w-32", "w-44", "w-48"];

function ListBody() {
  return (
    <div className="flex flex-col">
      {ROW_WIDTHS.map((w, n) => (
        <div key={n} className="flex items-center gap-6 border-b py-4">
          <Bar className={w} />
          <Bar className="hidden w-24 sm:block" />
          <Bar className="ml-auto w-16" />
        </div>
      ))}
    </div>
  );
}

function RecordBody() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex flex-col gap-10">
        {[4, 3].map((lines, n) => (
          <div key={n} className="flex flex-col gap-4">
            <Bar className="h-3 w-30" />
            <div className="border-b" />
            <Lines lines={lines} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-5">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="flex flex-col gap-2">
            <Bar className="w-20" />
            <Bar className="w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsBody() {
  return (
    <div className="flex flex-col gap-12">
      {[3, 2].map((rows, n) => (
        <div key={n} className="flex flex-col gap-3">
          <Bar className="h-3 w-30" />
          <Bar className="w-64" />
          <div className="rounded-lg border bg-card px-4">
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} className="flex min-h-15 items-center justify-between gap-4 border-b py-3 last:border-b-0">
                <div className="flex flex-col gap-2">
                  <Bar className="w-32" />
                  <Bar className="w-48" />
                </div>
                <Bar className="h-7 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardBody() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap gap-x-16 gap-y-6">
        {[0, 1, 2].map((n) => (
          <div key={n} className="flex flex-col gap-3">
            <Bar className="w-20" />
            <Bar className="h-6 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((n) => (
          <div key={n} className="flex flex-col gap-4 rounded-lg border bg-card p-4">
            <Bar className="h-3 w-30" />
            <Bar className="h-6 w-24" />
            <div className="h-32 animate-skeleton rounded-sm bg-muted" aria-hidden />
          </div>
        ))}
      </div>
    </div>
  );
}

const BODY: Record<Shape, () => ReactNode> = { list: ListBody, record: RecordBody, settings: SettingsBody, dashboard: DashboardBody };
const WIDTH = { list: "wide", record: "default", settings: "narrow", dashboard: "wide" } as const;

/**
 * The outline shown while a page loads: the frame stays, the page's header (its title as text when
 * it is fixed), tab bars when it has tabs, then the body in its shape.
 */
export function PageSkeleton({ shape, title, tabs = 0, label }: { shape: Shape; title?: ReactNode; tabs?: number; label: string }) {
  const Body = BODY[shape];
  return (
    <Page width={WIDTH[shape]} className={cn(shape === "settings" && "max-w-188 gap-8")} role="status" aria-label={label} data-testid="page-skeleton">
      <header className="flex flex-col gap-3">
        {shape === "record" && <Bar className="w-28" />}
        <div className="flex items-start justify-between gap-4">
          {title ? <h1 className="text-[28px] leading-9 font-bold tracking-tight">{title}</h1> : <TitleBar />}
          {shape !== "settings" && <Bar className="h-8 w-24" />}
        </div>
        {shape === "record" && <Bar className="w-1/2 max-w-md" />}
        {tabs > 0 && (
          <div className="flex gap-6 border-b pb-3">
            {Array.from({ length: tabs }, (_, n) => (
              <Bar key={n} className="h-3 w-16" />
            ))}
          </div>
        )}
      </header>
      <Body />
    </Page>
  );
}
