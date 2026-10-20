"use client";

// Pattern: docs/patterns/site.md — Raycast's "What else can Raycast do?" (raycast.com, 2026-10-20): at the
// left a 24px white question, then one paragraph of short sentences at 24px on 38px lines, all grey but the
// current one, which is white with a faint glow; under it a small chip (icon and name) and a two-line grey
// caption; at the right a window, about 500px, over a dim backdrop, showing what the current sentence
// does. The sentence moves on by itself while on screen; pointing at one or the arrow keys choose it.
import { BadgeCheck, Bell, FileText, Lock, ScrollText, Timer, Users, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { APPROVALS, CLIENTS, INVOICES, WEEK, type Demo } from "@/components/site/app/data";
import { Avatar, Badge } from "@/components/site/app/kit";
import { useReducedMotion } from "@/components/site/reduced-motion";
import { useInView } from "@/components/site/use-in-view";
import { cn } from "@/lib/utils";

const KEYS = ["read", "names", "explain", "file", "approve", "remind", "ssn", "il720"] as const;
type Key = (typeof KEYS)[number];
const ICONS: Record<Key, LucideIcon> = { read: ScrollText, names: Users, explain: FileText, file: FileText, approve: BadgeCheck, remind: Bell, ssn: Lock, il720: Timer };
const STEP_MS = 3200;

function Rows({ children }: { children: ReactNode }) {
  return <div className="flex flex-col divide-y divide-white/[0.05]">{children}</div>;
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-3 px-4 py-2.5 text-[13px] text-[var(--a-text)]", className)}>{children}</div>;
}

function Panel({ k, demo }: { k: Key; demo: Demo }) {
  const t = useTranslations("site.linear.whatElse.panel");
  switch (k) {
    case "read":
      return (
        <Rows>
          <Row className="text-[11px] text-[var(--a-faint)]">
            <span className="flex-1">{t("worker")}</span>
            <span className="w-16 text-right">{t("first")}</span>
            <span className="w-16 text-right">{t("second")}</span>
          </Row>
          {[
            [WEEK[1]!.name, "38:00", "38:00"],
            [WEEK[0]!.name, "40:00", "38:00"],
            [WEEK[4]!.name, "40:00", "40:00"],
            [WEEK[6]!.name, "40:00", "40:00"],
          ].map(([n, a, b]) => (
            <Row key={n}>
              <Avatar name={n!} size={20} />
              <span className="flex-1 truncate">{n}</span>
              <span className={cn("w-16 text-right tabular-nums", a !== b ? "text-amber-300" : "text-[var(--a-muted)]")}>{a}</span>
              <span className={cn("w-16 text-right tabular-nums", a !== b ? "text-amber-300" : "text-[var(--a-muted)]")}>{b}</span>
            </Row>
          ))}
        </Rows>
      );
    case "names":
      return (
        <Rows>
          {[
            ["Bobby J.", WEEK[0]!.name],
            ["MJ Fernández", WEEK[1]!.name],
            ["Kat B.", WEEK[5]!.name],
            ["D. Carter", WEEK[6]!.name],
          ].map(([written, name]) => (
            <Row key={written}>
              <span className="w-28 truncate text-[var(--a-muted)]">“{written}”</span>
              <span aria-hidden className="text-[var(--a-faint)]">→</span>
              <Avatar name={name!} size={20} />
              <span className="flex-1 truncate">{name}</span>
            </Row>
          ))}
        </Rows>
      );
    case "explain": {
      const line = demo.lines.find((l) => l !== demo.lines[0]) ?? demo.lines[0]!;
      return (
        <div>
          <Rows>
            {demo.lines.slice(0, 3).map((l) => (
              <Row key={l.label} className={l === line ? "bg-white/[0.04]" : undefined}>
                <span className="flex-1">{l.label}</span>
                <span className="text-[var(--a-muted)] tabular-nums">{l.hours}</span>
                <span className="w-20 text-right tabular-nums">{l.amount}</span>
              </Row>
            ))}
          </Rows>
          <p className="border-t border-white/[0.05] px-4 py-3 text-[12px] leading-relaxed text-[var(--a-muted)]">{line.explain}</p>
        </div>
      );
    }
    case "file": {
      const f = demo.files.find((x) => /paychex/i.test(x.system)) ?? demo.files[0]!;
      return (
        <div>
          <Row className="justify-between">
            <span className="truncate">{f.filename}</span>
            <Badge tone="green">{t("balanced")}</Badge>
          </Row>
          <div className="overflow-hidden border-t border-white/[0.05] px-4 py-3">
            {f.preview.slice(0, 6).map((p, i) => (
              <p key={i} className={cn("truncate text-[12px] leading-6 tabular-nums", i === 0 ? "text-[var(--a-faint)]" : "text-[var(--a-muted)]")}>
                {p}
              </p>
            ))}
          </div>
        </div>
      );
    }
    case "approve":
      return (
        <Rows>
          {APPROVALS.slice(0, 4).map((a) => (
            <Row key={a.client}>
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: CLIENTS[a.client].color }} />
              <span className="flex-1 truncate">{CLIENTS[a.client].name}</span>
              <span className="text-[var(--a-faint)] tabular-nums">{a.hours}</span>
              <Badge tone={a.status === "approved" ? "green" : a.status === "opened" ? "blue" : "grey"}>{t(a.status)}</Badge>
            </Row>
          ))}
        </Rows>
      );
    case "remind":
      return (
        <Rows>
          {INVOICES.filter((i) => i.status !== "draft").slice(0, 4).map((i, n) => (
            <Row key={i.no}>
              <span className="w-20 text-[var(--a-faint)] tabular-nums">{i.no}</span>
              <span className="flex-1 truncate">{CLIENTS[i.client].name}</span>
              <span className="tabular-nums">{i.total}</span>
              <Badge tone={i.status === "paid" ? "green" : n === 1 ? "amber" : "grey"}>{t(i.status === "paid" ? "paid" : n === 1 ? "reminded" : "due")}</Badge>
            </Row>
          ))}
        </Rows>
      );
    case "ssn":
      return (
        <Rows>
          {[
            [WEEK[2]!.name, "4417"],
            [WEEK[3]!.name, "0932"],
            [WEEK[7]!.name, "2265"],
          ].map(([n, last]) => (
            <Row key={n}>
              <Avatar name={n!} size={20} />
              <span className="flex-1 truncate">{n}</span>
              <span className="text-[var(--a-muted)] tabular-nums">•••-••-{last}</span>
              <Lock aria-hidden className="size-3.5 text-[var(--a-faint)]" />
            </Row>
          ))}
          <Row className="text-[12px] text-[var(--a-faint)]">{t("reveal")}</Row>
        </Rows>
      );
    case "il720":
      return (
        <Rows>
          {[
            [WEEK[0]!.name, 702],
            [WEEK[3]!.name, 640],
            [WEEK[1]!.name, 488],
          ].map(([n, h]) => (
            <Row key={n as string}>
              <Avatar name={n as string} size={20} />
              <span className="w-40 truncate">{n}</span>
              <span aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <span className={cn("block h-full rounded-full", (h as number) > 700 ? "bg-amber-400" : "bg-white/40")} style={{ width: `${((h as number) / 720) * 100}%` }} />
              </span>
              <span className="w-16 text-right text-[var(--a-muted)] tabular-nums">{h}/720</span>
            </Row>
          ))}
        </Rows>
      );
  }
}

export function WhatElse({ id, demo }: { id: string; demo: Demo }) {
  const t = useTranslations("site.linear.whatElse");
  const still = useReducedMotion();
  const [ref, inView] = useInView<HTMLElement>(0.35);
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const playing = inView && !still && !held;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setActive((a) => (a + 1) % KEYS.length), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, active]);

  const key = KEYS[active]!;
  const Icon = ICONS[key];
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowDown" && e.key !== "ArrowLeft" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = (active + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : KEYS.length - 1)) % KEYS.length;
    setActive(next);
    (e.currentTarget.closest("p")?.querySelectorAll("[role=button]")[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <section ref={ref} aria-labelledby={id} className="py-32 md:py-40" onMouseLeave={() => setHeld(false)}>
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-16 px-6 md:px-20 lg:grid-cols-[minmax(0,400px)_1fr] lg:gap-24">
        <div className="site-reveal">
          <h2 id={id} className="l-title-3 font-[510] text-[var(--l-text)]">
            {t("title")}
          </h2>
          <p className="mt-1 l-title-3 leading-[1.6] text-[var(--l-text-4)]">
            {KEYS.map((k, i) => (
              <span key={k}>
                <span
                  role="button"
                  aria-pressed={i === active}
                  tabIndex={i === active ? 0 : -1}
                  onMouseEnter={() => {
                    setHeld(true);
                    setActive(i);
                  }}
                  onFocus={() => {
                    setHeld(true);
                    setActive(i);
                  }}
                  onBlur={() => setHeld(false)}
                  onClick={() => setActive(i)}
                  onKeyDown={onKey}
                  className={cn("cursor-default rounded-sm outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-white/30", i === active ? "text-[var(--l-text)] [text-shadow:0_0_18px_rgba(255,255,255,0.45)]" : "hover:text-[var(--l-text-3)]")}
                >
                  {t(`items.${k}.sentence`)}
                </span>{" "}
              </span>
            ))}
            <span>{t("more")}</span>
          </p>
          <div aria-live="polite" className="mt-14 min-h-[88px]">
            <span className="inline-flex items-center gap-2 rounded-md bg-white/[0.06] px-2 py-1 l-text-small font-[510] text-[var(--l-text)]">
              <Icon aria-hidden className="size-3.5 text-[var(--l-text-3)]" />
              {t(`items.${key}.name`)}
            </span>
            <p className="mt-3 max-w-[300px] l-text-small text-[var(--l-text-3)]">{t(`items.${key}.caption`)}</p>
          </div>
        </div>
        <div aria-hidden className="site-reveal relative h-[340px] w-full md:h-[420px] max-w-[600px] justify-self-center overflow-hidden rounded-[14px] border border-white/[0.06] bg-[var(--l-panel)] [--reveal-delay:120ms]">
          <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.05)_0_2px,transparent_2px_26px)] [mask-image:linear-gradient(135deg,#000,transparent_45%)]" />
          <div className="site-app site-app-dark absolute top-10 right-4 left-6 overflow-hidden md:top-16 md:right-8 md:left-14 rounded-xl bg-[#121314] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.08]">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3 text-[13px] font-[510] text-[var(--a-text)]">
              <Icon className="size-3.5 text-[var(--a-muted)]" />
              {t(`items.${key}.name`)}
            </div>
            <div key={key} className="animate-page-in">
              <Panel k={key} demo={demo} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
