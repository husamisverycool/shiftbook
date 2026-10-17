"use client";

// Pattern: docs/patterns/schedule.md — When I Work Scheduler (rows by worker, job order or worksite;
// the OpenShifts row; per-day counters; "+" in a cell), Deputy (Publish with a count; the status bar
// whose counts open the next matching shift).
import { addDays } from "@shiftbook/rules";
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { GridShift, WeekView } from "@/server/schedule/queries";
import { ReadOnlyNote, useCan } from "../abilities";
import { EmptyState } from "../empty-state";
import { clock, hoursMinutes, shortDate } from "../format";
import { Page, PageHeader } from "../page";
import { PublishDialog } from "./publish-dialog";
import { ShiftDialog, type ShiftDraft } from "./shift-dialog";

export type GroupBy = "worker" | "jobOrder" | "worksite";
const GROUPS: GroupBy[] = ["worker", "jobOrder", "worksite"];
type StatusKey = "open" | "unpublished" | "awaiting" | "warnings";
const STATUS: StatusKey[] = ["open", "unpublished", "awaiting", "warnings"];

interface Row {
  key: string;
  label: string;
  sub?: string;
  shifts: GridShift[];
  /** What a "+" in this row fills in. */
  draft: Partial<ShiftDraft>;
}

const weekday = (iso: string, locale: string) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

export function ScheduleView({ view, today, by }: { view: WeekView; today: string; by: GroupBy }) {
  const t = useTranslations("schedule");
  const tn = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const may = useCan()("placements");
  const [editing, setEditing] = useState<{ shift: GridShift | null; draft: Partial<ShiftDraft> } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const cursor = useRef<Record<StatusKey, number>>({ open: 0, unpublished: 0, awaiting: 0, warnings: 0 });

  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const q = p.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  };

  const byId = useMemo(() => new Map(view.shifts.map((s) => [s.id, s])), [view.shifts]);
  const open = view.shifts.filter((s) => s.state === "open");
  const rows = useMemo<Row[]>(() => {
    const assigned = view.shifts.filter((s) => s.state !== "open");
    if (by === "worker") {
      const ids = [...new Set(assigned.map((s) => s.workerId!))];
      return ids
        .map((workerId) => ({ key: workerId, label: assigned.find((s) => s.workerId === workerId)!.workerName ?? "—", shifts: assigned.filter((s) => s.workerId === workerId), draft: { workerId } }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }
    if (by === "jobOrder")
      return view.jobOrders.map((j) => ({ key: j.id, label: j.position, sub: `${j.clientName} · ${j.worksiteName}`, shifts: view.shifts.filter((s) => s.jobOrderId === j.id), draft: { jobOrderId: j.id } }));
    const sites = [...new Map(view.shifts.map((s) => [s.worksiteId, s])).values()];
    return sites
      .map((s) => ({ key: s.worksiteId, label: s.worksiteName, sub: s.clientName, shifts: view.shifts.filter((x) => x.worksiteId === s.worksiteId), draft: { jobOrderId: view.jobOrders.find((j) => j.worksiteName === s.worksiteName && j.clientName === s.clientName)?.id } }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [by, view.shifts, view.jobOrders]);

  // Deputy's status bar: each click opens the next matching shift, in grid order.
  const jump = (key: StatusKey) => {
    const ids = view.status[key];
    if (ids.length === 0) return;
    const at = cursor.current[key] % ids.length;
    cursor.current[key] = at + 1;
    const shift = byId.get(ids[at]!);
    if (!shift) return;
    document.querySelector(`[data-shift-id="${shift.id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    setEditing({ shift, draft: {} });
  };

  const header = (
    <PageHeader
      title={t("title")}
      actions={
        <>
          <NativeSelect aria-label={t("client")} className="w-48" value={view.clientId ?? ""} onChange={(e) => go({ client: e.target.value || null })} data-testid="schedule-client">
            <NativeSelectOption value="">{t("allClients")}</NativeSelectOption>
            {view.clients.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <div role="group" aria-label={t("week")} className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label={t("previousWeek")} onClick={() => go({ week: addDays(view.weekStart, -7) })} data-testid="schedule-previous">
              <ChevronLeftIcon />
            </Button>
            <Button variant="outline" onClick={() => go({ week: null })} data-testid="schedule-this-week">
              {t("thisWeek")}
            </Button>
            <Button variant="outline" size="icon" aria-label={t("nextWeek")} onClick={() => go({ week: addDays(view.weekStart, 7) })} data-testid="schedule-next">
              <ChevronRightIcon />
            </Button>
          </div>
          <div role="group" aria-label={t("groupBy")} className="flex gap-1 rounded-lg bg-muted p-[3px]">
            {GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={g === by}
                onClick={() => go({ by: g === "worker" ? null : g })}
                className={cn("rounded-md px-3 py-1 text-sm font-medium text-foreground/60 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-muted-foreground", g === by && "bg-background text-foreground shadow-sm dark:text-foreground")}
                data-testid={`schedule-by-${g}`}
              >
                {t(`groups.${g}`)}
              </button>
            ))}
          </div>
          {may && (
            <Button onClick={() => setPublishing(true)} disabled={view.shifts.length === 0} data-testid="schedule-publish">
              {view.status.unpublished.length > 0 ? t("publishCount", { count: view.status.unpublished.length }) : t("publish")}
            </Button>
          )}
        </>
      }
      description={!may ? <ReadOnlyNote text={t("dialog.readOnly")} /> : `${shortDate(view.days[0]!, locale)} – ${shortDate(view.days[6]!, locale)}`}
    />
  );

  if (view.jobOrders.length === 0 && view.shifts.length === 0)
    return (
      <Page>
        {header}
        <EmptyState
          icon={CalendarDaysIcon}
          title={t("noJobOrders")}
          description={t("noJobOrdersHint")}
          action={
            <Link href="/job-orders" className={buttonVariants({ variant: "outline" })}>
              {t("goToJobOrders")}
            </Link>
          }
          testId="schedule-empty"
        />
      </Page>
    );

  const cell = (row: Row | null, date: string, shifts: GridShift[]) => (
    <div role="gridcell" className="group/cell relative flex min-h-16 flex-col gap-1 border-b border-l p-1" key={date}>
      {shifts.map((s) => (
        <Chip key={s.id} shift={s} by={by} inOpenRow={row === null} onOpen={() => setEditing({ shift: s, draft: {} })} />
      ))}
      {may && (
        <button
          type="button"
          aria-label={t("addShift", { date: shortDate(date, locale) })}
          onClick={() => setEditing({ shift: null, draft: { ...(row?.draft ?? {}), workDate: date } })}
          className="flex h-6 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity motion-state group-hover/cell:opacity-100 hover:bg-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50"
          data-testid={`schedule-add-${row?.key ?? "open"}-${date}`}
        >
          <PlusIcon className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );

  return (
    <Page className="pb-24">
      {header}
      <div className="overflow-x-auto rounded-lg border" data-testid="schedule-grid">
        <div role="grid" aria-label={t("title")} className="grid min-w-[60rem] grid-cols-[minmax(10rem,13rem)_repeat(7,minmax(7.5rem,1fr))] text-sm">
          <div role="row" className="contents">
            <div role="columnheader" className="border-b bg-muted/40 p-2" />
            {view.counters.map((c) => (
              <div role="columnheader" key={c.date} aria-current={c.date === today ? "date" : undefined} className="border-b border-l bg-muted/40 p-2">
                <div className={cn("font-medium", c.date === today && "font-semibold underline decoration-2 underline-offset-4")}>
                  {weekday(c.date, locale)} {shortDate(c.date, locale)}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">{t("dayCounter", { shifts: c.shifts, hours: hoursMinutes(c.minutes) })}</div>
              </div>
            ))}
          </div>
          <div role="row" className="contents" data-testid="schedule-open-row">
            <div role="rowheader" className="border-b p-2">
              <div className="font-medium">{t("openShifts")}</div>
              <div className="text-xs text-muted-foreground">{t("rowCount", { count: open.length })}</div>
            </div>
            {view.days.map((d) => cell(null, d, open.filter((s) => s.workDate === d)))}
          </div>
          {rows.map((row) => (
            <div role="row" className="contents" key={row.key} data-testid={`schedule-row-${row.key}`}>
              <div role="rowheader" className="min-w-0 border-b p-2">
                <div className="truncate font-medium">{row.label}</div>
                <div className="truncate text-xs text-muted-foreground">{row.sub ? `${row.sub} · ` : ""}{t("rowCount", { count: row.shifts.length })}</div>
              </div>
              {view.days.map((d) => cell(row, d, row.shifts.filter((s) => s.workDate === d && (by !== "worker" || s.state !== "open"))))}
            </div>
          ))}
        </div>
      </div>

      {/* Deputy's status bar: clickable counts. */}
      <nav aria-label={t("status.label")} className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur md:left-(--sidebar-width)" data-testid="schedule-status">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 md:px-8">
          {STATUS.map((k) => (
            <Button key={k} variant="ghost" size="sm" disabled={view.status[k].length === 0} onClick={() => jump(k)} data-testid={`schedule-status-${k}`}>
              {k === "warnings" && view.status.warnings.length > 0 && <TriangleAlertIcon className="text-destructive" aria-hidden />}
              <span className="tabular-nums">{t(`status.${k}`, { count: view.status[k].length })}</span>
            </Button>
          ))}
        </div>
      </nav>

      {editing && <ShiftDialog key={editing.shift?.id ?? "new"} view={view} shift={editing.shift} draft={editing.draft} today={today} may={may} onClose={() => setEditing(null)} />}
      {publishing && <PublishDialog view={view} onClose={() => setPublishing(false)} />}
      <span className="sr-only">{tn("schedule")}</span>
    </Page>
  );
}

function Chip({ shift: s, by, inOpenRow, onOpen }: { shift: GridShift; by: GroupBy; inOpenRow: boolean; onOpen: () => void }) {
  const t = useTranslations("schedule");
  const locale = useLocale();
  const who = inOpenRow ? s.position : by === "worker" ? s.position : by === "jobOrder" ? (s.workerName ?? t("states.open")) : `${s.position} · ${s.workerName ?? t("states.open")}`;
  const words: string[] = [];
  if (s.unpublished) words.push(t("states.unpublished"));
  if (s.noShow) words.push(t("states.noShow"));
  else if (s.state === "awaiting") words.push(t("states.awaiting"));
  else if (s.state === "confirmed") words.push(t("states.confirmed"));
  if (s.warning) words.push(t(`states.${s.warning}`, { name: s.warningWorkerName ?? "—" }));
  if (s.overlap) words.push(t("states.overlap"));
  const warn = s.warning !== null || s.overlap || s.noShow;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-shift-id={s.id}
      data-testid="schedule-chip"
      data-state={s.state}
      className={cn(
        "flex w-full min-w-0 flex-col rounded-md border px-2 py-1 text-left text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
        s.unpublished && "border-dashed",
        s.state === "confirmed" && !s.unpublished && "bg-muted/60",
        warn && "border-destructive/60",
      )}
    >
      <span className="font-medium tabular-nums">
        {clock(s.startMinute, locale)}–{clock(s.endMinute % 1440, locale)}
      </span>
      <span className="truncate text-muted-foreground">{who}</span>
      {words.length > 0 && <span className={cn("truncate", warn ? "text-destructive" : "text-muted-foreground")}>{words.join(" · ")}</span>}
    </button>
  );
}
