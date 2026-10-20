"use client";

// Pattern: docs/patterns/site.md §10 — Stripe Tax's filing step: the text at the left; at the right a
// spreadsheet card of the file itself (its name in mono on the title bar, the columns as written) bleeding
// off the column's edge, an export dialog overlapping its lower corner, and a numbered summary card in
// Stripe's form style. The file is the real exporter's output for a sample week; choosing a system in the
// dialog shows that system's file. The totals are the exporter's control totals.
import { Check, Download } from "lucide-react";
import { useState } from "react";
import { Eyebrow, Mono } from "@/components/site/v6/ui";
import { cn } from "@/lib/utils";

export interface ArtefactFile {
  system: string;
  filename: string;
  preview: string[];
  workers: string;
  gross: string;
  theirs: string;
  difference: string;
  note: string | null;
}

export interface ArtefactLabels {
  eyebrow: string;
  title: string;
  muted: string;
  body: string;
  checks: string[];
  dialog: string;
  week: string;
  format: string;
  download: string;
  summary: string;
  workers: string;
  gross: string;
  theirs: string;
  difference: string;
  preview: string;
}

export function FileArtefact({ id, l, files }: { id: string; l: ArtefactLabels; files: ArtefactFile[] }) {
  const [chosen, setChosen] = useState(0);
  const file = files[chosen]!;
  const rows = file.preview.map((line) => line.split(","));
  const head = rows.findIndex((r) => r.length > 2);
  const meta = rows.slice(0, head).map((r) => r.join(","));
  const header = rows[head]!;
  const body = rows.slice(head + 1);
  return (
    <section aria-labelledby={id} data-tone="paper" className="overflow-x-clip px-6 pt-28 pb-44 md:pt-40 md:pb-56">
      <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="site-reveal flex flex-col items-start gap-5 lg:col-span-4 lg:pt-10">
          <Eyebrow>{l.eyebrow}</Eyebrow>
          <h2 id={id} className="text-[clamp(2rem,2.2vw+1rem,2.75rem)] leading-[1.06] font-[500] tracking-[-0.03em] text-balance">
            {l.title} <span className="text-[var(--s-muted)]">{l.muted}</span>
          </h2>
          <p className="max-w-[38ch] text-[16px] leading-relaxed text-[var(--s-muted)]">{l.body}</p>
          <ul className="mt-2 flex flex-col gap-3">
            {l.checks.map((c) => (
              <li key={c} className="flex items-start gap-2.5 text-[15px]">
                <span aria-hidden className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--s-accent)]/12 text-[var(--s-accent)]">
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
                {c}
              </li>
            ))}
          </ul>
        </div>

        <div className="site-reveal relative [--reveal-delay:120ms] lg:col-span-8">
          {/* The file, as a spreadsheet, running off the edge. */}
          <div className="overflow-hidden rounded-lg bg-white shadow-[0_30px_60px_-12px_rgba(50,50,93,0.25),0_18px_36px_-18px_rgba(0,0,0,0.3)] ring-1 ring-black/[0.06] lg:mr-[-12vw]">
            <div className="flex items-center gap-3 border-b border-black/[0.07] bg-[#f6f8fa] px-4 py-2.5">
              <span aria-hidden className="flex gap-1.5">
                {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                  <span key={c} className="size-2.5 rounded-full" style={{ backgroundColor: c }} />
                ))}
              </span>
              <Mono className="truncate text-[11px] text-[#3c4257] normal-case tracking-normal">{file.filename}</Mono>
              <Mono className="ml-auto hidden text-[10px] text-[#8792a2] sm:block">{l.preview}</Mono>
            </div>
            <div className="relative overflow-hidden">
              {meta.length > 0 && <p className="border-b border-black/[0.05] px-4 py-1.5 font-mono text-[11px] text-[#8792a2]">{meta.join(" ")}</p>}
              <table key={file.system} className="w-max min-w-full animate-page-in border-collapse font-mono text-[11.5px]">
                <thead>
                  <tr className="bg-[#fafbfc] text-left text-[#697386]">
                    <th className="w-8 border-r border-b border-black/[0.06] px-2 py-2 text-right font-normal text-[#a3acb9]">1</th>
                    {header.map((h, i) => (
                      <th key={i} className="border-r border-b border-black/[0.06] px-3 py-2 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((r, i) => (
                    <tr key={i} className="text-[#1a1f36]">
                      <td className="border-r border-b border-black/[0.06] px-2 py-2 text-right text-[#a3acb9]">{i + 2}</td>
                      {header.map((_, j) => (
                        <td key={j} className="border-r border-b border-black/[0.06] px-3 py-2 whitespace-nowrap">
                          {r[j] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white" />
            </div>
          </div>

          {/* The export dialog over its lower corner. */}
          <div className="relative mx-auto mt-6 w-full max-w-[320px] rounded-xl bg-white p-4 shadow-[0_30px_60px_-12px_rgba(50,50,93,0.3),0_18px_36px_-18px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.06] sm:absolute sm:-bottom-36 sm:-left-6 sm:mt-0 lg:-left-10">
            <p className="text-[14px] font-semibold text-[#1a1f36]">{l.dialog}</p>
            <Mono className="mt-1 block text-[10px] text-[#8792a2]">{l.week}</Mono>
            <p className="mt-4 text-[12px] font-medium text-[#3c4257]">{l.format}</p>
            <div role="radiogroup" aria-label={l.format} className="mt-2 flex flex-col gap-1">
              {files.map((f, i) => (
                <button key={f.system} type="button" role="radio" aria-checked={i === chosen} onClick={() => setChosen(i)} className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)]", i === chosen ? "bg-[var(--s-accent)]/[0.08] text-[#1a1f36]" : "text-[#3c4257] hover:bg-black/[0.03]")}>
                  <span aria-hidden className={cn("flex size-3.5 items-center justify-center rounded-full ring-1", i === chosen ? "ring-[var(--s-accent)]" : "ring-black/20")}>
                    {i === chosen && <span className="size-1.5 rounded-full bg-[var(--s-accent)]" />}
                  </span>
                  {f.system}
                </button>
              ))}
            </div>
            <span className="mt-4 flex h-9 items-center justify-center gap-2 rounded-md bg-[var(--s-accent)] text-[13px] font-medium text-white">
              <Download aria-hidden className="size-3.5" />
              {l.download}
            </span>
          </div>

          {/* Stripe's numbered summary: the file's control totals. */}
          <dl className="relative mx-auto mt-4 w-full max-w-[360px] rounded-xl bg-white p-5 text-[13px] shadow-[0_30px_60px_-12px_rgba(50,50,93,0.25)] ring-1 ring-black/[0.06] sm:absolute sm:right-0 sm:-bottom-44 sm:mt-0 lg:right-[-4vw]">
            <p className="mb-3 text-[14px] font-semibold text-[#1a1f36]">{l.summary}</p>
            {[
              { k: l.workers, v: file.workers },
              { k: l.gross, v: file.gross },
              { k: l.theirs.replace("{system}", file.system), v: file.theirs },
              { k: l.difference, v: file.difference },
            ].map((r, i) => (
              <div key={r.k} className="flex items-baseline gap-3 border-b border-dashed border-black/[0.08] py-2 last:border-b-0">
                <span className="w-4 font-mono text-[11px] text-[#a3acb9]">{i + 1}.</span>
                <dt className="flex-1 text-[#3c4257]">{r.k}</dt>
                <dd className={cn("font-mono font-medium tabular-nums", i === 3 ? "text-[var(--s-accent)]" : "text-[#1a1f36]")}>{r.v}</dd>
              </div>
            ))}
            {file.note && <p className="mt-3 text-[11.5px] leading-relaxed text-[#697386]">{file.note}</p>}
          </dl>
        </div>
      </div>
    </section>
  );
}
