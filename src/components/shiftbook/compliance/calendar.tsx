"use client";

// Pattern: docs/patterns/compliance/calendar.md — Google Calendar (week, month and agenda views by
// w/2, m/3, a/5; t today; j or n next range; g go to a date), Outlook on the web (Shift+Left
// previous range).
import { addDays, addMonths, workweekStart, type Weekday } from "@shiftbook/rules";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { ComplianceItem } from "@/server/compliance/queries";
import { longDate } from "../format";
import { typing } from "../app-sidebar";
import { StatusBadge } from "./status-badge";

export type CalendarView = "month" | "week" | "agenda";
const VIEWS: CalendarView[] = ["month", "week", "agenda"];
/** The agenda shows four weeks from its first day; previous and next move by four weeks. */
const AGENDA_DAYS = 28;
const MAX_CHIPS = 3;

/** The days a view shows for a date: the month's weeks, the week, or four weeks from the date. */
export function rangeOf(view: CalendarView, date: string, startsOn: Weekday): { from: string; to: string } {
  if (view === "week") {
    const from = workweekStart(date, startsOn);
    return { from, to: addDays(from, 6) };
  }
  if (view === "agenda") return { from: date, to: addDays(date, AGENDA_DAYS - 1) };
  const first = `${date.slice(0, 8)}01`;
  const last = addDays(addMonths(first, 1), -1);
  const from = workweekStart(first, startsOn);
  return { from, to: addDays(workweekStart(last, startsOn), 6) };
}

const step = (view: CalendarView, date: string, by: 1 | -1) => (view === "month" ? `${addMonths(`${date.slice(0, 8)}01`, by)}` : addDays(date, by * (view === "week" ? 7 : AGENDA_DAYS)));

export function ComplianceCalendar({ items, view, date, today, startsOn, nextDue }: { items: ComplianceItem[]; view: CalendarView; date: string; today: string; startsOn: Weekday; nextDue: string | null }) {
  const t = useTranslations("compliance");
  const tc = useTranslations("compliance.calendar");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const goTo = useRef<HTMLInputElement>(null);
  const [day, setDay] = useState<string | null>(null);
  const range = rangeOf(view, date, startsOn);
  const go = (next: { view?: CalendarView; date?: string }) => {
    const p = new URLSearchParams(params.toString());
    const v = next.view ?? view;
    const d = next.date ?? date;
    if (v === "month") p.delete("view");
    else p.set("view", v);
    if (d === today) p.delete("date");
    else p.set("date", d);
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector("[role=dialog]")) return;
      const k = e.key.toLowerCase();
      const to: Record<string, () => void> = {
        m: () => go({ view: "month" }),
        "3": () => go({ view: "month" }),
        w: () => go({ view: "week" }),
        "2": () => go({ view: "week" }),
        a: () => go({ view: "agenda" }),
        "5": () => go({ view: "agenda" }),
        t: () => go({ date: today }),
        j: () => go({ date: step(view, date, 1) }),
        n: () => go({ date: step(view, date, 1) }),
        g: () => goTo.current?.focus(),
      };
      if (e.shiftKey && e.key === "ArrowLeft") {
        e.preventDefault();
        go({ date: step(view, date, -1) });
        return;
      }
      if (e.shiftKey && e.key === "ArrowRight") {
        e.preventDefault();
        go({ date: step(view, date, 1) });
        return;
      }
      if (!e.shiftKey && to[k]) {
        e.preventDefault();
        to[k]();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const inRange = items.filter((i) => i.dueOn >= range.from && i.dueOn <= range.to);
  const on = (d: string) => inRange.filter((i) => i.dueOn === d);
  const days: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) days.push(d);
  const label =
    view === "month"
      ? new Date(`${date.slice(0, 8)}01T12:00:00Z`).toLocaleDateString(locale === "es" ? "es-US" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" })
      : `${longDate(range.from, locale)} – ${longDate(range.to, locale)}`;
  const chip = (i: ComplianceItem) => (
    <Link
      key={i.id}
      href={`/compliance/${i.id}`}
      className={cn(
        "block truncate rounded px-1.5 py-0.5 text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        i.status === "overdue" ? "border border-destructive text-destructive" : i.status === "due_soon" ? "bg-primary/10" : i.status === "done" || i.status === "not_applicable" ? "text-muted-foreground line-through" : "bg-muted/60",
      )}
      title={`${t(`kinds.${i.kind}` as "kinds.ma_job_order")} — ${i.subject} (${t(`statuses.${i.status}`)})`}
      data-testid="calendar-chip"
    >
      <span className="sr-only">{t(`statuses.${i.status}`)}: </span>
      {t(`kinds.${i.kind}` as "kinds.ma_job_order")}
    </Link>
  );
  const weekdays = days.slice(0, 7).map((d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale === "es" ? "es-US" : "en-US", { weekday: "short", timeZone: "UTC" }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Button variant="outline" size="sm" onClick={() => go({ date: today })} data-testid="calendar-today">
          {tc("today")}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={tc("previous")} onClick={() => go({ date: step(view, date, -1) })} data-testid="calendar-previous">
          <ChevronLeftIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={tc("next")} onClick={() => go({ date: step(view, date, 1) })} data-testid="calendar-next">
          <ChevronRightIcon />
        </Button>
        <h2 className="mr-auto text-lg font-semibold first-letter:uppercase" data-testid="calendar-range" aria-live="polite">
          {label}
        </h2>
        <div className="flex flex-col gap-1">
          <Label htmlFor="calendar-go" className="text-xs text-muted-foreground">
            {tc("goTo")}
          </Label>
          <Input id="calendar-go" ref={goTo} type="date" className="w-44" value={date} onChange={(e) => e.target.value && go({ date: e.target.value })} />
        </div>
        <div role="group" aria-label={tc("view")} className="flex gap-1 rounded-lg bg-muted p-[3px]">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={v === view}
              onClick={() => go({ view: v })}
              className={cn("rounded-md px-3 py-1 text-sm font-medium text-foreground/60 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-muted-foreground", v === view && "bg-background text-foreground shadow-sm dark:text-foreground")}
              data-testid={`calendar-view-${v}`}
            >
              {tc(`views.${v}`)}
            </button>
          ))}
        </div>
      </div>
      {inRange.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="calendar-nothing">
          {tc("nothing")} {nextDue && nextDue > range.to ? tc("nextDue", { date: longDate(nextDue, locale) }) : ""}
        </p>
      )}
      {view === "agenda" ? (
        <ol className="flex flex-col gap-3" data-testid="calendar-agenda">
          {days
            .filter((d) => on(d).length > 0)
            .map((d) => (
              <li key={d} className="overflow-hidden rounded-xl border bg-card">
                <h3 className={cn("border-b bg-muted/40 px-3 py-1.5 text-sm font-medium", d === today && "text-primary")}>{longDate(d, locale)}</h3>
                <ul>
                  {on(d).map((i) => (
                    <li key={i.id} className="flex items-center gap-3 border-b px-3 py-2 transition-colors last:border-b-0 hover:bg-muted/40">
                      <Link href={`/compliance/${i.id}`} className="flex min-w-0 flex-1 flex-col rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                        <span className="truncate text-sm font-medium">{t(`kinds.${i.kind}` as "kinds.ma_job_order")}</span>
                        <span className="truncate text-xs text-muted-foreground">{i.subject}</span>
                      </Link>
                      <StatusBadge status={i.status} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
        </ol>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card" data-testid={`calendar-${view}`}>
          <div className="grid min-w-[44rem] grid-cols-7">
            {weekdays.map((w, n) => (
              <div key={n} className="border-b px-2 py-1 text-xs font-medium text-muted-foreground">
                {w}
              </div>
            ))}
            {days.map((d) => {
              const list = on(d);
              const outside = view === "month" && d.slice(0, 7) !== date.slice(0, 7);
              const shown = view === "month" ? list.slice(0, MAX_CHIPS) : list;
              return (
                <div key={d} className={cn("flex flex-col gap-0.5 border-r border-b p-1 [&:nth-child(7n)]:border-r-0", view === "month" ? "min-h-24" : "min-h-64", outside && "bg-muted/30 text-muted-foreground")} aria-label={tc("dayLabel", { date: longDate(d, locale), count: list.length })} role="group">
                  <span className={cn("w-fit rounded-full px-1.5 text-xs tabular-nums", d === today && "bg-primary text-primary-foreground")}>{Number(d.slice(8))}</span>
                  {shown.map(chip)}
                  {list.length > shown.length && (
                    <button type="button" className="w-fit rounded px-1.5 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50" onClick={() => setDay(d)} data-testid="calendar-more">
                      {tc("more", { count: list.length - shown.length })}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{tc("keys")}</p>
      <Dialog open={day !== null} onOpenChange={(o) => !o && setDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{day ? longDate(day, locale) : ""}</DialogTitle>
            <DialogDescription className="sr-only">{day ? tc("dayLabel", { date: longDate(day, locale), count: on(day).length }) : ""}</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1">{day && on(day).map((i) => <li key={i.id}>{chip(i)}</li>)}</ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

