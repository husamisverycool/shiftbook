"use client";

// Pattern: docs/patterns/site.md §5 — Stripe Connect's funds-flow diagram and its code panel: nodes
// joined by dashed lines with dashes travelling along them; the money nodes (your payroll provider, your
// bank) sit outside Tabulado, and a badge on Tabulado says no money passes through it. Under it a dark
// file panel with a tab per payroll system shows the import file the real exporters write for a sample
// week (src/server/site/sample-files.ts), its control totals and the clerk's note; changing system
// types the file's lines in again.
import { Tabs } from "@base-ui/react/tabs";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface FlowFile {
  format: string;
  system: string;
  filename: string;
  preview: string[];
  workers: string;
  gross: string;
  theirs: string;
  difference: string;
  note: string | null;
}

export interface WeekFlowLabels {
  sheets: string;
  tabulado: string;
  tabuladoNote: string;
  file: string;
  provider: string;
  invoices: string;
  approve: string;
  bank: string;
  never: string;
  tabsLabel: string;
  fileNote: string;
  workers: string;
  gross: string;
  theirs: string;
  difference: string;
}

function Node({ children, tone = "plain", className }: { children: React.ReactNode; tone?: "plain" | "core" | "money"; className?: string }) {
  return (
    <div
      className={cn(
        "relative rounded-xl px-4 py-3 text-[13px] leading-snug",
        tone === "plain" && "border border-white/12 bg-white/[0.04] text-[var(--s-dtext)]",
        tone === "core" && "border border-[var(--s-accent-soft)]/50 bg-[var(--s-accent)]/20 text-white shadow-[0_0_40px_-8px_var(--s-accent)]",
        tone === "money" && "border border-dashed border-emerald-300/50 bg-emerald-300/[0.06] text-emerald-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A dashed connector with dashes travelling along it. */
function Line({ vertical, className }: { vertical?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block shrink-0 text-white/40",
        vertical ? "mx-auto h-8 w-px bg-[linear-gradient(180deg,currentColor_50%,transparent_0)] bg-[length:1px_8px] animate-site-dash-y" : "h-px w-full min-w-6 bg-[linear-gradient(90deg,currentColor_50%,transparent_0)] bg-[length:8px_1px] animate-site-dash",
        className,
      )}
    />
  );
}

export function WeekFlow({ files, l }: { files: FlowFile[]; l: WeekFlowLabels }) {
  const [format, setFormat] = useState(files[0]!.format);
  const file = files.find((f) => f.format === format)!;
  return (
    <div className="flex flex-col gap-12">
      {/* The flow (Stripe Connect). Wide screens: one row and a branch; phones: one column. */}
      <div className="hidden grid-cols-[1fr_auto_1.1fr_auto_1fr_auto_1.2fr] items-center lg:grid">
        <Node>{l.sheets}</Node>
        <Line className="w-10" />
        <Node tone="core">
          <span className="block text-[14px] font-medium">{l.tabulado}</span>
          <span className="block text-[12px] text-white/70">{l.tabuladoNote}</span>
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--s-ink)] px-2.5 py-0.5 text-[11px] whitespace-nowrap text-emerald-200 ring-1 ring-emerald-300/40">{l.never}</span>
        </Node>
        <Line className="w-10" />
        <Node>{l.file}</Node>
        <Line className="w-10" />
        <Node tone="money">{l.provider}</Node>
        <Line vertical className="col-start-3" />
        <Node className="col-start-3">{l.invoices}</Node>
        <Line className="w-10" />
        <Node>{l.approve}</Node>
        <Line className="w-10" />
        <Node tone="money">{l.bank}</Node>
      </div>
      <div className="flex flex-col lg:hidden">
        <Node>{l.sheets}</Node>
        <Line vertical />
        <Node tone="core">
          <span className="block font-medium">{l.tabulado}</span>
          <span className="block text-[12px] text-white/70">{l.tabuladoNote}</span>
          <span className="mt-2 inline-block rounded-full bg-[var(--s-ink)] px-2.5 py-0.5 text-[11px] text-emerald-200 ring-1 ring-emerald-300/40">{l.never}</span>
        </Node>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col">
            <Line vertical />
            <Node>{l.file}</Node>
            <Line vertical />
            <Node tone="money">{l.provider}</Node>
          </div>
          <div className="flex flex-col">
            <Line vertical />
            <Node>{l.invoices}</Node>
            <Line vertical />
            <Node>{l.approve}</Node>
            <Line vertical />
            <Node tone="money">{l.bank}</Node>
          </div>
        </div>
      </div>

      {/* The file panel. */}
      <Tabs.Root value={format} onValueChange={(v) => setFormat(String(v))} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e0f15] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)]">
        <Tabs.List aria-label={l.tabsLabel} className="flex gap-1 overflow-x-auto border-b border-white/10 px-3 pt-3">
          {files.map((f) => (
            <Tabs.Tab key={f.format} value={f.format} className="relative shrink-0 rounded-t-lg px-3.5 py-2.5 text-[13px] whitespace-nowrap text-[var(--s-dmuted)] outline-none site-color-slow hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 data-[active]:bg-white/[0.06] data-[active]:text-white">
              {f.system}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value={format} className="outline-none">
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-3 text-[12px]">
            <span className="font-mono text-white/80">{file.filename}</span>
            <span className="hidden text-[var(--s-dmuted)] sm:inline">{l.fileNote}</span>
          </div>
          <pre key={file.format} className="overflow-x-auto px-5 py-4 font-mono text-[12px] leading-6 text-[#c9cbe0]">
            {file.preview.map((line, i) => (
              <span key={i} className="flex animate-page-in" style={{ animationDelay: `${i * 90}ms` }}>
                <span aria-hidden className="mr-5 w-4 shrink-0 text-right text-white/25 select-none">
                  {i + 1}
                </span>
                <span className={cn(i === 0 && "text-[var(--s-accent-soft)]")}>{line}</span>
              </span>
            ))}
          </pre>
          <dl className="grid grid-cols-2 border-t border-white/[0.06] text-[12px] sm:grid-cols-4">
            {[
              { k: l.workers, v: file.workers },
              { k: l.gross, v: file.gross },
              { k: l.theirs.replace("{system}", file.system), v: file.theirs },
              { k: l.difference, v: file.difference },
            ].map((x, i) => (
              <div key={x.k} className={cn("flex flex-col gap-1 px-5 py-4", i > 0 && "sm:border-l sm:border-white/[0.06]", i % 2 === 1 && "border-l border-white/[0.06]")}>
                <dt className="text-[var(--s-dmuted)]">{x.k}</dt>
                <dd className="text-[15px] text-white tabular-nums">{x.v}</dd>
              </div>
            ))}
          </dl>
          {file.note && <p className="border-t border-white/[0.06] px-5 py-3.5 text-[12px] leading-relaxed text-[var(--s-dmuted)]">{file.note}</p>}
        </Tabs.Panel>
      </Tabs.Root>
    </div>
  );
}
