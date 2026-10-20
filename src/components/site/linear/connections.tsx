// Pattern: docs/patterns/site.md — Stripe's "Connect to existing systems" diagram (stripe.com, 2026-10-20):
// the heading and a grey paragraph at the top left; under them a field of fine dots fading at its edges,
// the company's dark square in the middle, dotted lines out to small pills and on to a group of tiles at the
// left, one tray at the right, a tray of dashed slots above (reached by a bracket with two pills) and a row
// of dashed slots below, the slots filling in as the diagram arrives. Drawn in Linear's monochrome: hours
// in at the left, the five rule books above, the payroll systems at the right, one invoice per client
// below, and the bank left unconnected — Tabulado never moves money. Phones: the same pieces as a list.
import { TabuladoMark } from "@/components/shiftbook/brand-mark";
import { CLIENTS } from "@/components/site/app/data";
import { Source, type SourceKind } from "@/components/site/app/kit";
import { svg } from "@/components/site/linear/logos";
import type { ReactNode } from "react";

const W = 1040;
const H = 560;
const at = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

const SOURCES: SourceKind[] = ["email", "text", "photo", "sheet", "clock", "portal"];
const SYSTEMS = [
  { file: "gusto", name: "Gusto", h: 14 },
  { file: "adp", name: "ADP", h: 15 },
  { file: "paychex", name: "Paychex", h: 8 },
  { file: "quickbooks", name: "QuickBooks", h: 17 },
  { file: "paylocity", name: "Paylocity", h: 13 },
];

function Place({ x, y, children, delay = 0 }: { x: number; y: number; children: ReactNode; delay?: number }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={at(x, y)}>
      <div className="site-reveal" style={{ ["--reveal-delay" as string]: `${delay}ms` }}>
        {children}
      </div>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-7 items-center rounded-md bg-[var(--l-level-2)] px-2.5 l-text-mini font-[510] whitespace-nowrap text-[var(--l-text-2)] ring-1 ring-white/[0.1]">{children}</span>;
}

function Slot({ children, dashed }: { children?: ReactNode; dashed?: boolean }) {
  return <span className={dashed ? "flex h-9 items-center justify-center rounded-md border border-dashed border-white/[0.14] px-3 l-text-mini whitespace-nowrap text-[var(--l-text-4)]" : "flex h-9 items-center justify-center rounded-md bg-white/[0.04] px-3 l-text-mini whitespace-nowrap text-[var(--l-text-2)] ring-1 ring-white/[0.08]"}>{children}</span>;
}

export interface ConnectionsText {
  title: string;
  body: string;
  readTwice: string;
  rules: string;
  changes: string;
  file: string;
  invoices: string;
  bank: string;
  books: string[];
  sources: string;
  clients: string;
}

export function Connections({ id, text }: { id: string; text: ConnectionsText }) {
  const clients = Object.values(CLIENTS).slice(0, 3);
  return (
    <section aria-labelledby={id} className="py-32 md:py-40">
      <div className="mx-auto w-full max-w-[1440px] px-6 md:px-20">
        <div className="site-reveal max-w-[40ch]">
          <h2 id={id} className="l-title-4 text-[var(--l-text)]">
            {text.title}
          </h2>
          <p className="mt-4 l-title-2 text-[var(--l-text-3)]">{text.body}</p>
        </div>

        {/* The diagram, from 768px. */}
        <div aria-hidden className="relative mx-auto mt-16 hidden aspect-[1040/560] w-full max-w-[1040px] md:block">
          <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:12px_12px] [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_72%)]" />
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" fill="none">
            <g stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" strokeDasharray="1 4" strokeLinecap="round">
              <path d="M252 280 H478" />
              <path d="M562 280 H805" />
              <path d="M520 238 V160 M360 160 H680 M360 160 V82 M680 160 V82" />
              <path d="M520 322 V452" />
            </g>
          </svg>

          {/* Centre. */}
          <Place x={520} y={280}>
            <span className="flex size-[84px] items-center justify-center rounded-2xl bg-[linear-gradient(160deg,#232427,#141516)] text-[var(--l-text)] shadow-[0_20px_40px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.12]">
              <TabuladoMark className="size-9" />
            </span>
          </Place>

          {/* Hours in. */}
          <Place x={170} y={280} delay={100}>
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/[0.03] p-2 ring-1 ring-white/[0.08]">
              {SOURCES.map((s) => (
                <span key={s} className="flex size-11 items-center justify-center rounded-lg bg-[var(--l-level-2)] ring-1 ring-white/[0.06] [&>span]:!bg-transparent [&>span]:!text-[var(--l-text-2)]">
                  <Source kind={s} size={22} />
                </span>
              ))}
            </div>
          </Place>
          <Place x={365} y={280} delay={150}>
            <Pill>{text.readTwice}</Pill>
          </Place>

          {/* Rule books above. */}
          <Place x={520} y={62} delay={200}>
            <div className="flex gap-2 rounded-xl bg-white/[0.03] p-2 ring-1 ring-white/[0.08]">
              {text.books.map((b, i) => (
                <div key={b} className="site-reveal" style={{ ["--reveal-delay" as string]: `${300 + i * 120}ms` }}>
                  <Slot>{b}</Slot>
                </div>
              ))}
            </div>
          </Place>
          <Place x={360} y={160} delay={150}>
            <Pill>{text.rules}</Pill>
          </Place>
          <Place x={680} y={160} delay={150}>
            <Pill>{text.changes}</Pill>
          </Place>

          {/* Payroll systems at the right. */}
          <Place x={680} y={280} delay={150}>
            <Pill>{text.file}</Pill>
          </Place>
          <Place x={890} y={280} delay={250}>
            <ul className="flex w-[170px] flex-col gap-1 rounded-xl bg-white/[0.03] p-2 text-[var(--l-text)] ring-1 ring-white/[0.08]">
              {SYSTEMS.map((s) => (
                <li key={s.file} className="flex h-9 items-center rounded-md bg-[var(--l-level-2)] px-3 ring-1 ring-white/[0.06]">
                  <span className="block" style={{ height: s.h }} dangerouslySetInnerHTML={{ __html: svg(s.file) }} />
                </li>
              ))}
            </ul>
          </Place>

          {/* Invoices below. */}
          <Place x={520} y={380} delay={150}>
            <Pill>{text.invoices}</Pill>
          </Place>
          <Place x={520} y={490} delay={200}>
            <div className="flex gap-2">
              {clients.map((c, i) => (
                <div key={c.name} className="site-reveal" style={{ ["--reveal-delay" as string]: `${300 + i * 120}ms` }}>
                  <Slot dashed>{c.name}</Slot>
                </div>
              ))}
            </div>
          </Place>

          {/* The bank, not connected. */}
          <Place x={905} y={490} delay={400}>
            <span className="flex h-11 w-[170px] items-center justify-center rounded-xl border border-dashed border-white/[0.12] l-text-mini text-[var(--l-text-4)]">{text.bank}</span>
          </Place>
        </div>

        {/* Phones: the same pieces, listed. */}
        <dl className="mt-12 grid grid-cols-1 gap-6 md:sr-only">
          {[
            [text.sources, text.readTwice],
            [text.books.join(", "), text.rules],
            [SYSTEMS.map((s) => s.name).join(", "), text.file],
            [text.clients, text.invoices],
          ].map(([what, how]) => (
            <div key={how} className="border-t border-[var(--l-line)] pt-4">
              <dt className="l-text-regular font-[510] text-[var(--l-text-2)]">{how}</dt>
              <dd className="mt-1 l-text-regular text-[var(--l-text-3)]">{what}</dd>
            </div>
          ))}
          <div className="border-t border-[var(--l-line)] pt-4">
            <dt className="l-text-regular text-[var(--l-text-4)]">{text.bank}</dt>
          </div>
        </dl>
      </div>
    </section>
  );
}
