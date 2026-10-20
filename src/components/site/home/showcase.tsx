// Pattern: docs/patterns/site.md §4 — the stage pieces the bento and chapters are built from. Cursor's
// panel: a public-domain painting with the product's windows standing on it. Stripe's panel: a field of
// soft colour (here Tabulado's blue, teal and amber) under the product. Cursor's and Attio's window: a
// light frame with three dots and a title. And the six bento cards' live product pieces, sample data only.
import Image from "next/image";
import type { ReactNode } from "react";
import { Scale } from "lucide-react";
import { Money } from "@/components/site/blocks";
import { Avatar, Badge, Btn, Kbd, Ref, Source, Status } from "@/components/site/app/kit";
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

/** Cursor's and Attio's window: a frame, three dots, a title, the app's own theme inside. */
export function Window({ title, children, className, dark }: { title: string; children: ReactNode; className?: string; dark?: boolean }) {
  return (
    <div className={cn("site-app overflow-hidden rounded-xl shadow-[0_30px_60px_-24px_rgba(20,21,28,0.45),0_8px_20px_-12px_rgba(20,21,28,0.25)] ring-1", dark ? "site-app-dark ring-white/10" : "ring-black/[0.07]", className)}>
      <div className="flex h-8 items-center gap-2 border-b border-[var(--a-line)] bg-[var(--a-side)] px-3">
        <span aria-hidden className="flex gap-1.5">
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} className="size-2 rounded-full" style={{ backgroundColor: dark ? "rgb(255 255 255 / 0.15)" : c }} />
          ))}
        </span>
        <span className="mx-auto truncate text-[10.5px] font-medium text-[var(--a-muted)]">{title}</span>
        <span className="w-8" />
      </div>
      {children}
    </div>
  );
}

/** Bento a — the two readings of one sheet, field by field; the one that differs waits for a person. */
export function ReadTwiceMock({ l }: { l: { title: string; a: string; b: string; needs: string; ok: string; keep: string; fields: { label: string; a: string; b: string }[] } }) {
  return (
    <Window title={l.title} className="w-full max-w-[480px]">
      <div className="flex items-center gap-2 border-b border-[var(--a-line)] px-4 py-2.5">
        <Avatar name={l.fields[0]!.a} size={20} />
        <span className="text-[12.5px] font-semibold">{l.fields[0]!.a}</span>
        <Source kind="photo" size={18} />
        <Ref className="ml-auto">IN-316</Ref>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_6.5rem] gap-x-2 border-b border-[var(--a-line)] bg-[var(--a-panel)] px-4 py-1.5 text-[10.5px] text-[var(--a-faint)]">
        <span />
        <span>{l.a}</span>
        <span>{l.b}</span>
        <span />
      </div>
      {l.fields.slice(1).map((f) => {
        const same = f.a === f.b;
        return (
          <div key={f.label} className={cn("grid h-9 grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_6.5rem] items-center gap-x-2 border-b border-[var(--a-line-2)] px-4 text-[12px] last:border-b-0", !same && "bg-amber-500/[0.07]")}>
            <span className="flex min-w-0 items-center gap-2 text-[var(--a-muted)]">
              <Status s={same ? "done" : "check"} />
              <span className="truncate">{f.label}</span>
            </span>
            <span className="font-medium tabular-nums">{f.a}</span>
            <span className={cn("font-medium tabular-nums", !same && "text-amber-700")}>{f.b}</span>
            {same ? (
              <Badge tone="green" className="hidden justify-self-end sm:inline-flex">
                {l.ok}
              </Badge>
            ) : (
              <Badge tone="amber" className="hidden justify-self-end sm:inline-flex">
                {l.needs}
              </Badge>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-2 border-t border-[var(--a-line)] bg-[var(--a-panel)] px-4 py-2">
        <Btn primary>
          {l.keep} 8 <Kbd className="border-white/30 bg-white/15 text-white">1</Kbd>
        </Btn>
        <Btn>
          {l.keep} 6 <Kbd>2</Kbd>
        </Btn>
      </div>
    </Window>
  );
}

/** Bento b — one pay line with its explanation and its law, as the pay screen shows them. */
export function PayLineMock({ l }: { l: { title: string; label: string; hours: string; amount: string; explain: string; law: string } }) {
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-3">
      <Window title={l.title}>
        <div className="flex items-center gap-2 px-4 pt-3 text-[12.5px]">
          <Status s="done" />
          <span className="font-semibold">{l.label}</span>
          <span className="text-[var(--a-muted)]">· {l.hours}</span>
          <Badge tone="grey" className="ml-1">
            IL
          </Badge>
          <Money value={l.amount} className="ml-auto text-[17px] font-semibold tracking-[-0.02em]" />
        </div>
        <p className="mx-4 mt-2 mb-3 line-clamp-3 border-l-2 border-[var(--a-accent)] pl-2.5 font-mono text-[10px] leading-relaxed text-[var(--a-muted)]">{l.explain}</p>
      </Window>
      <div className="site-app site-app-dark ml-8 flex gap-2.5 rounded-xl px-3.5 py-3 text-[11px] leading-snug shadow-[0_20px_40px_-16px_rgba(20,21,28,0.6)] ring-1 ring-white/10">
        <Scale aria-hidden className="mt-px size-3.5 shrink-0 text-[var(--a-accent)]" />
        <span className="text-[var(--a-text)]/85">{l.law}</span>
      </div>
    </div>
  );
}

/** Bento c — the payroll file as written, in a dark editor. */
export function FileMock({ filename, lines }: { filename: string; lines: string[] }) {
  return (
    <Window title={filename} dark className="w-full max-w-[520px]">
      <pre className="overflow-hidden bg-[var(--a-bg)] px-4 py-3 font-mono text-[10.5px] leading-[1.9]">
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
