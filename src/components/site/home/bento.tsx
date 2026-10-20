"use client";

// Pattern: docs/patterns/site.md §6 — the bento's live pieces, each the real thing on sample data:
// Resend's button whose presses add to a timeline (a client approves; it stops at the files, because
// Tabulado never moves money); Apple's fanned phones with a language switch that turns all three screens;
// Column's map with only the covered states lit (a tile map, one square per state); Rippling's guardrail
// shown as a feature (a Social Security number shown only with a reason, and the look logged).
import { useState } from "react";
import { Money } from "@/components/site/blocks";
import { cn } from "@/lib/utils";

const CHECK = (
  <svg
    aria-hidden
    viewBox="0 0 16 16"
    className="size-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 8.5l3 3 7-7" />
  </svg>
);

export function ApproveCard({
  l,
}: {
  l: { approve: string; reset: string; events: string[]; now: string };
}) {
  const [shown, setShown] = useState(0);
  const approved = shown > 0;
  return (
    <div className="flex h-full flex-col gap-5 sm:flex-row [.approve-row_&]:sm:flex-col">
      <div className="flex-1 rounded-xl border border-[var(--s-line)] bg-[var(--s-paper)] p-4">
        <p className="text-[13px] font-medium">Prairie Line Manufacturing</p>
        <p className="text-[12px] text-[var(--s-muted)]">Oct 5 – 11</p>
        <ul className="mt-3 flex flex-col text-[12px]">
          {[
            ["Robert Jones", "40:00"],
            ["María José Fernández Ruiz", "38:00"],
            ["Tran Nguyen", "40:37"],
          ].map(([n, h]) => (
            <li
              key={n}
              className="flex justify-between gap-3 border-b border-[var(--s-line)] py-1.5 last:border-b-0"
            >
              <span className="truncate">{n}</span>
              <span className="text-[var(--s-muted)] tabular-nums">{h}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            if (approved) return setShown(0);
            l.events.forEach((_, i) =>
              window.setTimeout(() => setShown(i + 1), i * 450),
            );
          }}
          className={cn(
            "mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-[13px] font-medium outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)] focus-visible:ring-offset-2",
            approved
              ? "bg-white text-[var(--s-text)] ring-1 ring-[var(--s-line)] hover:bg-[var(--s-paper-2)]"
              : "bg-[var(--s-text)] text-white hover:bg-[var(--s-ink-3)]",
          )}
        >
          {approved ? l.reset : l.approve}
        </button>
      </div>
      <ol
        aria-live="polite"
        className="relative flex flex-1 flex-col gap-3 pl-5 before:absolute before:top-1 before:bottom-1 before:left-[5px] before:w-px before:bg-[var(--s-line)]"
      >
        {l.events.map((e, i) => (
          <li
            key={e}
            className={cn(
              "relative text-[13px] site-crossfade",
              i < shown ? "opacity-100" : "translate-y-1 opacity-0",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute top-1 -left-5 flex size-[11px] items-center justify-center rounded-full ring-2 ring-white",
                i === l.events.length - 1
                  ? "bg-[var(--s-muted)]"
                  : "bg-emerald-500",
              )}
            />
            <span
              className={cn(
                "block",
                i === l.events.length - 1
                  ? "text-[var(--s-muted)]"
                  : "font-medium",
              )}
            >
              {e}
            </span>
            <span className="block text-[11px] text-[var(--s-muted)]">
              {l.now}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The worker app's three screens in English and in Spanish (sample data). */
const SCREENS = {
  en: {
    shifts: "My shifts",
    rows: [
      ["Tue, Oct 6", "3:00 PM – 11:30 PM", "Confirmed"],
      ["Wed, Oct 7", "3:00 PM – 11:30 PM", "Confirmed"],
      ["Sat, Oct 10", "7:00 AM – 3:30 PM", "Offered"],
    ],
    accept: "Accept",
    clockTitle: "Prairie Line · Dock 3",
    clockIn: "Clock in",
    here: "You're at the worksite",
    stub: "Pay stub · week of Oct 5",
    regular: "Regular · 40:00",
    overtime: "Overtime · 4:00",
    gross: "Gross",
  },
  es: {
    shifts: "Mis turnos",
    rows: [
      ["mar 6 oct", "3:00 PM – 11:30 PM", "Confirmado"],
      ["mié 7 oct", "3:00 PM – 11:30 PM", "Confirmado"],
      ["sáb 10 oct", "7:00 AM – 3:30 PM", "Ofrecido"],
    ],
    accept: "Aceptar",
    clockTitle: "Prairie Line · Andén 3",
    clockIn: "Registrar entrada",
    here: "Está en el lugar de trabajo",
    stub: "Talón de pago · semana del 5 oct",
    regular: "Regular · 40:00",
    overtime: "Horas extra · 4:00",
    gross: "Bruto",
  },
} as const;

function Phone({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-[118px] shrink-0 rounded-[24px] bg-[var(--s-ink)] p-[5px] shadow-[0_24px_40px_-16px_rgba(22,23,29,0.5)]",
        className,
      )}
    >
      <div className="relative flex h-[260px] flex-col overflow-hidden rounded-[21px] bg-white px-2.5 pt-6 pb-3 text-[9px] leading-tight">
        <span
          aria-hidden
          className="absolute top-1.5 left-1/2 h-3 w-10 -translate-x-1/2 rounded-full bg-[var(--s-ink)]"
        />
        {children}
      </div>
    </div>
  );
}

export function PhonesCard({
  label,
  initial,
}: {
  label: string;
  initial: "en" | "es";
}) {
  const [lang, setLang] = useState<"en" | "es">(initial);
  const s = SCREENS[lang];
  return (
    <div className="flex h-full flex-col">
      <div
        role="radiogroup"
        aria-label={label}
        className="flex w-fit gap-0.5 self-end rounded-full bg-[var(--s-paper-2)] p-0.5 text-[12px]"
      >
        {(["en", "es"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={lang === k}
            lang={k}
            onClick={() => setLang(k)}
            className={cn(
              "rounded-full px-3 py-1 font-medium outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)]",
              lang === k
                ? "bg-white text-[var(--s-text)] shadow-sm"
                : "text-[var(--s-muted)]",
            )}
          >
            {k === "en" ? "English" : "Español"}
          </button>
        ))}
      </div>
      <div
        lang={lang}
        aria-hidden
        className="mt-4 flex flex-1 items-end justify-center"
      >
        <Phone className="-mr-3 translate-y-3 -rotate-6">
          <p className="text-[11px] font-semibold">{s.shifts}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {s.rows.map(([d, h, st], i) => (
              <li key={d} className="rounded-lg bg-[var(--s-paper)] p-1.5">
                <p className="font-medium">{d}</p>
                <p className="text-[var(--s-muted)]">{h}</p>
                <p
                  className={cn(
                    "mt-0.5 font-medium",
                    i === 2 ? "text-[var(--s-accent)]" : "text-emerald-700",
                  )}
                >
                  {i === 2 ? `${st} · ${s.accept}` : st}
                </p>
              </li>
            ))}
          </ul>
        </Phone>
        <Phone className="relative z-10">
          <p className="text-[var(--s-muted)]">{s.clockTitle}</p>
          <p className="mt-6 text-center text-[26px] font-[450] tracking-[-0.03em] tabular-nums">
            2:58
          </p>
          <p className="text-center text-[var(--s-muted)]">PM</p>
          <span className="mt-auto flex h-8 items-center justify-center rounded-full bg-[var(--s-text)] text-[10px] font-medium text-white">
            {s.clockIn}
          </span>
          <p className="mt-1.5 flex items-center justify-center gap-1 text-emerald-700">
            <span aria-hidden className="size-1 rounded-full bg-current" />
            {s.here}
          </p>
        </Phone>
        <Phone className="-ml-3 translate-y-3 rotate-6">
          <p className="text-[11px] font-semibold">{s.stub}</p>
          <dl className="mt-3 flex flex-col gap-1.5">
            <div className="flex justify-between">
              <dt>{s.regular}</dt>
              <dd>$730.00</dd>
            </div>
            <div className="flex justify-between">
              <dt>{s.overtime}</dt>
              <dd>$109.50</dd>
            </div>
          </dl>
          <div className="mt-auto flex items-baseline justify-between border-t border-[var(--s-line)] pt-2">
            <span>{s.gross}</span>
            <Money value="$839.50" className="text-[15px] font-medium" />
          </div>
        </Phone>
      </div>
    </div>
  );
}

/** NPR's tile map of the states (column, row); one square each. */
const TILES: [string, number, number][] = [
  ["AK", 0, 0],
  ["ME", 10, 0],
  ["WI", 5, 1],
  ["VT", 9, 1],
  ["NH", 10, 1],
  ["WA", 0, 2],
  ["ID", 1, 2],
  ["MT", 2, 2],
  ["ND", 3, 2],
  ["MN", 4, 2],
  ["IL", 5, 2],
  ["MI", 6, 2],
  ["NY", 8, 2],
  ["MA", 9, 2],
  ["OR", 0, 3],
  ["NV", 1, 3],
  ["WY", 2, 3],
  ["SD", 3, 3],
  ["IA", 4, 3],
  ["IN", 5, 3],
  ["OH", 6, 3],
  ["PA", 7, 3],
  ["NJ", 8, 3],
  ["CT", 9, 3],
  ["RI", 10, 3],
  ["CA", 0, 4],
  ["UT", 1, 4],
  ["CO", 2, 4],
  ["NE", 3, 4],
  ["MO", 4, 4],
  ["KY", 5, 4],
  ["WV", 6, 4],
  ["VA", 7, 4],
  ["MD", 8, 4],
  ["DE", 9, 4],
  ["AZ", 1, 5],
  ["NM", 2, 5],
  ["KS", 3, 5],
  ["AR", 4, 5],
  ["TN", 5, 5],
  ["NC", 6, 5],
  ["SC", 7, 5],
  ["DC", 8, 5],
  ["OK", 3, 6],
  ["LA", 4, 6],
  ["MS", 5, 6],
  ["AL", 6, 6],
  ["GA", 7, 6],
  ["HI", 0, 7],
  ["TX", 3, 7],
  ["FL", 8, 7],
];

export function MapCard({
  covered,
  label,
  names,
}: {
  covered: readonly string[];
  label: string;
  names: Record<string, string>;
}) {
  return (
    <figure
      aria-label={`${label}: ${covered.map((c) => names[c]).join(", ")}`}
      className="flex flex-col gap-4"
    >
      <div aria-hidden className="grid grid-cols-11 gap-[3px]">
        {TILES.map(([code, c, r]) => {
          const lit = covered.includes(code);
          return (
            <span
              key={code}
              style={{ gridColumn: c + 1, gridRow: r + 1 }}
              className={cn(
                "flex aspect-square items-center justify-center rounded-[3px] text-[7px] font-medium sm:text-[8px]",
                lit
                  ? "bg-[var(--s-accent)] text-white shadow-[0_0_14px_-2px_var(--s-accent)]"
                  : "bg-[var(--s-paper-2)] text-[var(--s-muted)]/70",
              )}
            >
              {code}
            </span>
          );
        })}
      </div>
      <figcaption className="flex flex-wrap gap-1.5">
        {covered.map((c) => (
          <span
            key={c}
            className="rounded-full bg-[var(--s-accent)]/10 px-2.5 py-1 text-[12px] font-medium text-[var(--s-accent)]"
          >
            {names[c]}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function SsnCard({
  l,
}: {
  l: {
    reveal: string;
    why: string;
    w4: string;
    i9: string;
    revealed: string;
    hide: string;
    log: string;
    past: string[];
  };
}) {
  const [step, setStep] = useState<"hidden" | "asking" | "shown">("hidden");
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--s-line)] bg-[var(--s-paper)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">
              María José Fernández Ruiz
            </p>
            {/* A test number (9xx), never a real one. */}
            <p className="font-mono text-[14px] tracking-wider tabular-nums">
              {step === "shown" ? "912-48-0142" : "•••-••-0142"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStep(step === "hidden" ? "asking" : "hidden")}
            className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium ring-1 ring-[var(--s-line)] outline-none site-color-slow hover:bg-[var(--s-paper-2)] focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)]"
          >
            {step === "hidden" ? l.reveal : l.hide}
          </button>
        </div>
        {step === "asking" && (
          <div className="flex flex-wrap items-center gap-2 animate-page-in">
            <span className="text-[12px] text-[var(--s-muted)]">{l.why}</span>
            {[l.w4, l.i9].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setReason(r);
                  setStep("shown");
                }}
                className="rounded-full bg-white px-3 py-1 text-[12px] ring-1 ring-[var(--s-line)] outline-none site-color-slow hover:ring-[var(--s-accent)] focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)]"
              >
                {r}
              </button>
            ))}
          </div>
        )}
        {step === "shown" && (
          <p
            aria-live="polite"
            className="flex items-center gap-1.5 text-[12px] text-emerald-700 animate-page-in"
          >
            {CHECK}
            {l.revealed.replace("{reason}", reason)}
          </p>
        )}
      </div>
      {/* The activity log: added to, never edited. */}
      <div>
        <p className="text-[12px] font-medium text-[var(--s-muted)]">{l.log}</p>
        <ol className="mt-2 flex flex-col text-[12px]">
          {step === "shown" && (
            <li className="flex justify-between gap-3 border-b border-[var(--s-line)] py-2 animate-page-in">
              <span className="truncate font-medium">
                {l.revealed.replace("{reason}", reason)}
              </span>
            </li>
          )}
          {l.past.map((e) => (
            <li
              key={e}
              className="truncate border-b border-[var(--s-line)] py-2 text-[var(--s-muted)] last:border-b-0"
            >
              {e}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
