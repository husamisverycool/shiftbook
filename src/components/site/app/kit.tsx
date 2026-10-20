// Pattern: docs/patterns/site.md, "The app on the page" — the pieces every drawing of the product on the
// website is made of, at Linear's density: 13px rows, hairlines, quiet icons, status circles, labels with
// a dot, people's initials, keys in caps. Colours come from the `site-app` / `site-app-dark` themes in
// globals.css, so one drawing works on a light page and a dark one. Sample data only.
import { Building2, Camera, Clock, FileSpreadsheet, Mail, MessageSquare, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const HUES = ["#6e79d6", "#d08a4a", "#4f9d83", "#b76aa8", "#5b97c9", "#c46b6b", "#8a8f3c", "#7b6fd0"];

/** A person's initials on their own colour (Linear's avatars). */
export function Avatar({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const parts = name.split(" ").filter(Boolean);
  const initials = (parts[0]![0]! + (parts.length > 1 ? parts.at(-1)![0]! : "")).toUpperCase();
  const hue = HUES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)} style={{ width: size, height: size, fontSize: Math.round(size * 0.42), backgroundColor: hue }}>
      {initials}
    </span>
  );
}

/** Several people, overlapping. */
export function Avatars({ names, size = 18 }: { names: string[]; size?: number }) {
  return (
    <span className="flex -space-x-1.5">
      {names.map((n) => (
        <Avatar key={n} name={n} size={size} className="ring-2 ring-[var(--a-bg)]" />
      ))}
    </span>
  );
}

export type StatusKind = "new" | "reading" | "check" | "ready" | "done";

/** Linear's status circles: dashed (new), part-filled (working), amber with a mark (needs a person), full. */
export function Status({ s, className }: { s: StatusKind; className?: string }) {
  const c = cn("size-3.5 shrink-0", className);
  if (s === "new")
    return (
      <svg aria-hidden viewBox="0 0 14 14" className={c}>
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--a-faint)" strokeWidth="1.5" strokeDasharray="2.2 1.8" />
      </svg>
    );
  if (s === "reading")
    return (
      <svg aria-hidden viewBox="0 0 14 14" className={cn(c, "animate-site-spin")}>
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="#d6a01e" strokeOpacity=".3" strokeWidth="1.5" />
        <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" fill="none" stroke="#d6a01e" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  if (s === "check")
    return (
      <svg aria-hidden viewBox="0 0 14 14" className={c}>
        <circle cx="7" cy="7" r="6" fill="#e5932b" />
        <path d="M7 3.8v3.6M7 9.6v.1" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (s === "ready")
    return (
      <svg aria-hidden viewBox="0 0 14 14" className={c}>
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--a-accent)" strokeWidth="1.5" />
        <path d="M7 3.5A3.5 3.5 0 1 1 3.5 7H7z" fill="var(--a-accent)" />
      </svg>
    );
  return (
    <svg aria-hidden viewBox="0 0 14 14" className={c}>
      <circle cx="7" cy="7" r="6" fill="var(--a-accent)" />
      <path d="m4.3 7.2 1.8 1.8 3.6-3.8" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type SourceKind = "email" | "text" | "photo" | "clock" | "sheet" | "portal";
const SOURCES: Record<SourceKind, { icon: LucideIcon; tint: string }> = {
  email: { icon: Mail, tint: "#5b7fe0" },
  text: { icon: MessageSquare, tint: "#3f9d6e" },
  photo: { icon: Camera, tint: "#9a6ad6" },
  clock: { icon: Clock, tint: "#7b8191" },
  sheet: { icon: FileSpreadsheet, tint: "#2f9a5b" },
  portal: { icon: Building2, tint: "#c07a32" },
};

/** Where hours came from, as a small tinted tile (Attio's record icons). */
export function Source({ kind, size = 20 }: { kind: SourceKind; size?: number }) {
  const { icon: I, tint } = SOURCES[kind];
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-[5px]" style={{ width: size, height: size, backgroundColor: `${tint}1f`, color: tint }}>
      <I className="size-[62%]" strokeWidth={2} />
    </span>
  );
}

/** A key on the keyboard (Linear's and Raycast's hints). */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-[var(--a-line)] bg-[var(--a-chip)] px-1 font-sans text-[10px] font-medium text-[var(--a-muted)]", className)}>{children}</kbd>;
}

/** Linear's label: a coloured dot and a word in a hairline pill. */
export function Tag({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[20px] shrink-0 items-center gap-1.5 rounded-full border border-[var(--a-line)] px-2 text-[11px] whitespace-nowrap text-[var(--a-muted)]", className)}>
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

/** A soft status pill (Attio's and Stripe's dashboard badges). */
export function Badge({ tone, children, className }: { tone: "green" | "amber" | "blue" | "grey" | "red"; children: ReactNode; className?: string }) {
  const tones = {
    green: "bg-emerald-500/12 text-emerald-700 [.site-app-dark_&]:text-emerald-300",
    amber: "bg-amber-500/14 text-amber-800 [.site-app-dark_&]:text-amber-300",
    blue: "bg-[var(--a-sel)] text-[var(--a-accent)]",
    grey: "bg-[var(--a-chip)] text-[var(--a-muted)]",
    red: "bg-rose-500/12 text-rose-700 [.site-app-dark_&]:text-rose-300",
  }[tone];
  return <span className={cn("inline-flex h-[20px] shrink-0 items-center rounded-[5px] px-1.5 text-[11px] font-medium whitespace-nowrap", tones, className)}>{children}</span>;
}

/** A record's number, Linear's grey monospace ID. */
export function Ref({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("shrink-0 font-mono text-[10.5px] text-[var(--a-faint)] tabular-nums", className)}>{children}</span>;
}

/** How sure a reading is: a short bar (two readings agreeing fill it). */
export function Sure({ value, className }: { value: number; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-block h-1 w-10 overflow-hidden rounded-full bg-[var(--a-chip)]", className)}>
      <span className={cn("block h-full rounded-full", value > 0.9 ? "bg-emerald-500" : value > 0.6 ? "bg-[var(--a-accent)]" : "bg-amber-500")} style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  );
}

/** The app's buttons: one filled, the rest quiet. Drawings only, so they are spans. */
export function Btn({ primary, children, className }: { primary?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium whitespace-nowrap", primary ? "bg-[var(--a-accent)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_1px_2px_rgb(0_0_0/0.2)] [.site-app-dark_&]:text-[#0c0d11]" : "text-[var(--a-text)] shadow-[var(--a-shadow)]", className)}>
      {children}
    </span>
  );
}

/** A property row in a record's side panel (Linear's and Attio's details). */
export function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2 py-[5px] text-[12px]">
      <span className="truncate text-[var(--a-muted)]">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 truncate">{children}</span>
    </div>
  );
}

/** A list's group heading (Linear's "In progress 4"). */
export function Group({ status, label, count, className }: { status: StatusKind; label: string; count: number; className?: string }) {
  return (
    <div className={cn("flex h-8 items-center gap-2 border-b border-[var(--a-line-2)] bg-[var(--a-panel)] px-4 text-[12px] font-medium", className)}>
      <Status s={status} />
      {label}
      <span className="font-normal text-[var(--a-faint)]">{count}</span>
    </div>
  );
}

/** A small sparkline of a figure over recent weeks (Stripe's dashboard tiles). */
export function Spark({ points, className }: { points: number[]; className?: string }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * 100).toFixed(1)},${(26 - ((p - min) / (max - min || 1)) * 22).toFixed(1)}`).join(" ");
  return (
    <svg aria-hidden viewBox="0 0 100 28" preserveAspectRatio="none" className={cn("h-7 w-full overflow-visible", className)}>
      <path d={`${d} L100,28 L0,28 Z`} fill="var(--a-accent)" fillOpacity=".08" />
      <path d={d} fill="none" stroke="var(--a-accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
