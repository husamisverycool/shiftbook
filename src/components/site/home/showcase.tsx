// Pattern: docs/patterns/site.md §4 — the stage pieces the bento and chapters are built from. Cursor's
// panel: a public-domain painting with the product's windows standing on it. Stripe's panel: a field of
// soft colour (here Tabulado's blue, teal and amber) under the product. Cursor's and Attio's window: a
// light frame with three dots and a title. And the six bento cards' live product pieces, sample data only.
import Image from "next/image";
import type { ReactNode } from "react";
import { Money, Pill } from "@/components/site/blocks";
import { cn } from "@/lib/utils";

const ART = {
  poppies: { src: "/site/art/poppy-field.jpg", w: 2000, h: 1270 },
  field: { src: "/site/art/cloudy-field.jpg", w: 1168, h: 1462 },
  poplars: { src: "/site/art/poplars.jpg", w: 1491, h: 1462 },
} as const;
export type ArtName = keyof typeof ART;

/** Cursor's stage: a painting filling the panel, slightly quietened, the product standing on it. */
export function ArtPanel({ art, children, className, focus = "50% 50%" }: { art: ArtName; children: ReactNode; className?: string; focus?: string }) {
  const a = ART[art];
  return (
    <div className={cn("relative isolate overflow-hidden rounded-2xl bg-[var(--s-card)]", className)}>
      <Image src={a.src} alt="" fill sizes="(min-width: 1200px) 800px, 100vw" className="-z-10 object-cover saturate-[0.85]" style={{ objectPosition: focus }} />
      <div aria-hidden className="absolute inset-0 -z-10 bg-white/10" />
      {children}
    </div>
  );
}

/** Stripe's stage: soft fields of colour meeting, with a fine grain. */
export function GradientPanel({ tone, children, className }: { tone: "dawn" | "dusk" | "ink"; children: ReactNode; className?: string }) {
  const fields = {
    dawn: "bg-[radial-gradient(120%_90%_at_100%_0%,#f6b26b_0%,transparent_55%),radial-gradient(90%_80%_at_0%_100%,#7aa7ff_0%,transparent_60%),radial-gradient(70%_70%_at_60%_70%,#9ee6d1_0%,transparent_65%),linear-gradient(135deg,#eef1ff,#fff4e6)]",
    dusk: "bg-[radial-gradient(110%_90%_at_0%_0%,#5b6cff_0%,transparent_55%),radial-gradient(90%_80%_at_100%_100%,#f29b6b_0%,transparent_60%),radial-gradient(60%_60%_at_70%_30%,#c9b6ff_0%,transparent_65%),linear-gradient(135deg,#dfe4ff,#ffe9dc)]",
    ink: "bg-[radial-gradient(90%_80%_at_100%_0%,rgba(91,108,255,0.55)_0%,transparent_60%),radial-gradient(80%_70%_at_0%_100%,rgba(46,200,170,0.28)_0%,transparent_60%),linear-gradient(160deg,#151826,#0c0d14)]",
  }[tone];
  return <div className={cn("site-grain relative isolate overflow-hidden rounded-2xl", fields, className)}>{children}</div>;
}

/** Cursor's and Attio's window: a light frame, three dots, a title. */
export function Window({ title, children, className, dark }: { title: string; children: ReactNode; className?: string; dark?: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-xl shadow-[0_30px_60px_-24px_rgba(20,21,28,0.45),0_8px_20px_-12px_rgba(20,21,28,0.25)] ring-1", dark ? "bg-[#101119] text-[#d4d6e4] ring-white/10" : "bg-white text-[var(--s-text)] ring-black/[0.07]", className)}>
      <div className={cn("flex items-center gap-2 border-b px-3 py-2", dark ? "border-white/[0.07]" : "border-[var(--s-line)] bg-[#fafaf8]")}>
        <span aria-hidden className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn("size-2 rounded-full", dark ? "bg-white/15" : "bg-black/12")} />
          ))}
        </span>
        <span className={cn("mx-auto truncate text-[10px] font-medium", dark ? "text-white/45" : "text-[var(--s-muted)]")}>{title}</span>
        <span className="w-6" />
      </div>
      {children}
    </div>
  );
}

/** Bento a — the two readings of one sheet, field by field; the one that differs waits for a person. */
export function ReadTwiceMock({ l }: { l: { title: string; a: string; b: string; needs: string; ok: string; fields: { label: string; a: string; b: string }[] } }) {
  return (
    <Window title={l.title} className="w-full max-w-[460px]">
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_auto] gap-x-3 border-b border-[var(--s-line)] px-4 py-2 text-[10px] text-[var(--s-muted)]">
        <span />
        <span>{l.a}</span>
        <span>{l.b}</span>
        <span />
      </div>
      {l.fields.map((f) => {
        const same = f.a === f.b;
        return (
          <div key={f.label} className={cn("grid grid-cols-[minmax(0,1fr)_5rem_5rem_auto] items-center gap-x-3 border-b border-[var(--s-line)] px-4 py-2 text-[12px] last:border-b-0", !same && "bg-amber-50/80")}>
            <span className="text-[var(--s-muted)]">{f.label}</span>
            <span className="truncate font-medium tabular-nums">{f.a}</span>
            <span className={cn("truncate font-medium tabular-nums", !same && "text-amber-800")}>{f.b}</span>
            {same ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                <svg aria-hidden viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8.5l3 3 7-7" />
                </svg>
                {l.ok}
              </span>
            ) : (
              <Pill tone="amber">{l.needs}</Pill>
            )}
          </div>
        );
      })}
    </Window>
  );
}

/** Bento b — one pay line with its explanation and its law, as the pay screen shows them. */
export function PayLineMock({ l }: { l: { title: string; label: string; hours: string; amount: string; explain: string; law: string } }) {
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-3">
      <Window title={l.title}>
        <div className="flex items-baseline justify-between gap-3 px-4 pt-3 text-[13px]">
          <span className="font-medium">
            {l.label} <span className="font-normal text-[var(--s-muted)]">· {l.hours}</span>
          </span>
          <Money value={l.amount} className="text-[17px] font-medium" />
        </div>
        <p className="line-clamp-3 px-4 pt-1 pb-3 text-[11px] leading-snug text-[var(--s-muted)]">{l.explain}</p>
      </Window>
      <div className="ml-8 rounded-xl bg-[var(--s-ink)] px-4 py-3 text-[11px] leading-snug text-white/85 shadow-[0_20px_40px_-16px_rgba(20,21,28,0.6)]">
        <span className="mr-1.5 inline-flex rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-medium text-white">§</span>
        {l.law}
      </div>
    </div>
  );
}

/** Bento c — the payroll file as written, in a dark editor. */
export function FileMock({ filename, lines }: { filename: string; lines: string[] }) {
  return (
    <Window title={filename} dark className="w-full max-w-[520px]">
      <pre className="overflow-hidden px-4 py-3 font-mono text-[10.5px] leading-[1.9]">
        {lines.map((line, i) => (
          <span key={i} className="flex">
            <span aria-hidden className="mr-3 w-3 shrink-0 text-right text-white/25 select-none">
              {i + 1}
            </span>
            <span className={cn("truncate", i === 0 ? "text-[#aab4ff]" : "text-[#d4d6e4]")}>{line}</span>
          </span>
        ))}
      </pre>
    </Window>
  );
}

/** Bento d — one invoice per client, fanned. */
export function InvoicesMock({ l }: { l: { invoice: string; due: string; backup: string } }) {
  const invoices = [
    { client: "Northgate Logistics", no: "INV-1044", total: "$24,114.25" },
    { client: "Harbor Foods Distribution", no: "INV-1042", total: "$9,880.00" },
    { client: "Prairie Line Manufacturing", no: "INV-1043", total: "$14,212.50" },
  ];
  return (
    <div className="relative h-[230px] w-full max-w-[340px]">
      {invoices.map((inv, i) => (
        <div key={inv.no} className="absolute inset-x-0 top-0 rounded-xl bg-white p-4 shadow-[0_24px_50px_-20px_rgba(20,21,28,0.5)] ring-1 ring-black/[0.06]" style={{ transform: `translate(${(i - 2) * 22}px, ${(2 - i) * -14 + 28}px) rotate(${(i - 2) * 4}deg)`, zIndex: i }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] text-[var(--s-muted)]">
                {l.invoice} {inv.no}
              </p>
              <p className="mt-0.5 text-[13px] font-medium">{inv.client}</p>
            </div>
            <Money value={inv.total} className="text-[16px] font-medium" />
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--s-muted)]">
            <span>{l.due}</span>
            <span className="rounded-full bg-[var(--s-paper)] px-2 py-0.5">{l.backup}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
