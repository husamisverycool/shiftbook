// Pattern: docs/patterns/site.md §2 — Mercury's dark product panels beside its accordion: one floating
// panel of rows with superscript cents, faded panels behind it, a pointer that moves to the action, and
// Check's payroll table whose rows move from draft to done. Sample data from the demo agency.
import { Initials, Money, Pill } from "@/components/site/blocks";
import { cn } from "@/lib/utils";

export interface BandVisualLabels {
  files: string;
  kindPhoto: string;
  kindPdf: string;
  kindClock: string;
  kindPortal: string;
  readTwice: string;
  reading: string;
  review: string;
  toCheck: string;
  disagree: string;
  disagreeNote: string;
  keep: string;
  approvals: string;
  approved: string;
  waiting: string;
  disputed: string;
  payroll: string;
  totals: string;
  gross: string;
  hours: string;
  difference: string;
  download: string;
  ready: string;
  invoices: string;
  workers: string;
}

/** Mercury's floating panel: a lighter navy card with a hairline, deep shadow, 16px corners. */
function Panel({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-white/8 bg-[#20212b] shadow-[0_40px_80px_-24px_rgba(0,0,0,0.7)]", className)}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <span className="text-[13px] font-medium text-[var(--s-dtext)]">{title}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Mercury's pointer: a plain arrow that travels to the thing to press. */
function Pointer({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 22" className={cn("pointer-events-none absolute size-5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]", className)}>
      <path d="M2 1.5v16.8l4.6-4.3 3 6.8 3-1.3-3-6.6h6.3z" fill="white" stroke="#14151c" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

/** Two faded panels peeking from under the main one (Mercury's stacked depth). */
function Ghosts() {
  return (
    <div aria-hidden className="absolute inset-x-6 -bottom-6 top-24 -z-10 grid grid-cols-[1fr_1.6fr] gap-4 opacity-60 [mask-image:linear-gradient(to_bottom,#000_30%,transparent)]">
      <div className="rounded-2xl border border-white/6 bg-[#1b1c25]" />
      <div className="rounded-2xl border border-white/6 bg-[#1b1c25]" />
    </div>
  );
}

export function FilesVisual({ v }: { v: BandVisualLabels }) {
  const rows = [
    { kind: v.kindPhoto, name: "prairie-line-oct-6.jpg", done: true },
    { kind: v.kindPdf, name: "harbor-foods-week-41.pdf", done: true },
    { kind: v.kindClock, name: "kronos-export-1011.csv", done: true },
    { kind: v.kindPortal, name: "fieldglass-timesheets.xlsx", done: false },
  ];
  return (
    <div className="relative isolate">
      <Ghosts />
      <Panel title={v.files} aside={<span className="text-[12px] text-[var(--s-dmuted)]">{v.workers.replace("{count}", "37")}</span>}>
        <ul className="flex flex-col pb-2">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center gap-3 border-t border-white/6 px-5 py-3">
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/6 font-mono text-[10px] text-[var(--s-dmuted)] uppercase">
                {r.name.split(".").pop()}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] text-[var(--s-dtext)]">{r.name}</span>
                <span className="text-[12px] text-[var(--s-dmuted)]">{r.kind}</span>
              </span>
              {r.done ? (
                <Pill tone="green" dark>
                  {v.readTwice}
                </Pill>
              ) : (
                <span className="animate-site-shimmer text-[12px] font-medium text-[var(--s-dmuted)]">{v.reading}</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

export function ReviewVisual({ v }: { v: BandVisualLabels }) {
  return (
    <div className="relative isolate">
      <Ghosts />
      <Panel title={v.review} aside={<Pill tone="amber" dark>{v.toCheck}</Pill>}>
        <div className="relative mx-5 mb-5 overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed sample picture, sized by its box */}
          <img src="/site/sign-in-sheet.jpg" alt="" width={900} height={555} className="block h-auto w-full opacity-90" />
          <span aria-hidden className="absolute top-[34%] left-[68.5%] h-[9%] w-[11%] rounded-md ring-2 ring-amber-300 shadow-[0_0_0_9999px_rgba(20,21,28,0.35)]" />
          <div className="absolute top-[47%] left-[40%] w-[min(17rem,56%)] rounded-xl border border-white/10 bg-[#20212b]/95 p-3 shadow-2xl backdrop-blur">
            <p className="text-[12px] font-medium text-[var(--s-dtext)]">{v.disagree}</p>
            <p className="mt-0.5 text-[11px] text-[var(--s-dmuted)]">{v.disagreeNote}</p>
            <div className="mt-2.5 flex gap-2">
              <span className="inline-flex h-7 items-center rounded-full bg-[var(--s-accent)] px-3 text-[11px] font-medium text-white">{v.keep}</span>
              <span className="inline-flex h-7 items-center rounded-full bg-white/8 px-3 text-[11px] text-[var(--s-dtext)]">6</span>
            </div>
          </div>
          <Pointer className="top-[44%] left-[75%] animate-site-cursor" />
        </div>
      </Panel>
    </div>
  );
}

export function ApprovalVisual({ v }: { v: BandVisualLabels }) {
  const rows = [
    { client: "Prairie Line Manufacturing", hours: "612:30", state: "approved" as const },
    { client: "Harbor Foods Distribution", hours: "418:00", state: "approved" as const },
    { client: "Riverside Events", hours: "96:45", state: "disputed" as const },
    { client: "Northgate Logistics", hours: "1,204:15", state: "waiting" as const },
  ];
  return (
    <div className="relative isolate">
      <Ghosts />
      <Panel title={v.approvals}>
        <ul className="flex flex-col pb-2">
          {rows.map((r) => (
            <li key={r.client} className="flex items-center gap-3 border-t border-white/6 px-5 py-3">
              <Initials name={r.client} dark />
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--s-dtext)]">{r.client}</span>
              <span className="hidden font-mono text-[12px] text-[var(--s-dmuted)] tabular-nums sm:inline">{r.hours}</span>
              {r.state === "approved" && (
                <Pill tone="green" dark>
                  {v.approved}
                </Pill>
              )}
              {r.state === "disputed" && (
                <Pill tone="amber" dark>
                  {v.disputed}
                </Pill>
              )}
              {r.state === "waiting" && (
                <Pill tone="grey" dark>
                  {v.waiting}
                </Pill>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

export function PayrollVisual({ v }: { v: BandVisualLabels }) {
  const rows = [
    { label: v.hours, value: "2,331:30", money: false },
    { label: v.gross, value: "$48,206.75", money: true },
    { label: v.difference, value: "$0.00", money: true },
  ];
  return (
    <div className="relative isolate">
      <Ghosts />
      <Panel title={`${v.payroll} · Gusto`} aside={<Pill tone="green" dark>{v.ready}</Pill>}>
        <dl className="flex flex-col pb-1">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between border-t border-white/6 px-5 py-3">
              <dt className="text-[13px] text-[var(--s-dmuted)]">{r.label}</dt>
              <dd className="text-[15px] text-[var(--s-dtext)] tabular-nums">{r.money ? <Money value={r.value} /> : r.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between gap-3 border-t border-white/6 px-5 py-4">
          <span className="text-[12px] text-[var(--s-dmuted)]">
            {v.invoices} · 4 · {v.totals}
          </span>
          <span className="relative inline-flex h-8 items-center rounded-full bg-white px-4 text-[12px] font-medium text-[var(--s-text)]">
            {v.download}
            <span aria-hidden className="absolute inset-0 rounded-full ring-2 ring-white/60 animate-site-ring" />
          </span>
        </div>
      </Panel>
    </div>
  );
}
