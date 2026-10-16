"use client";

// Patterns: docs/patterns/approve/[token].md (Bullhorn: one row per worker, a day-by-day view opened
// from the row) and docs/patterns/approvals/[id].md (the same table for the agency).
import { addDays } from "@shiftbook/rules";
import { ChevronDownIcon, ChevronRightIcon, CircleAlertIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PortalShift } from "@/server/approvals/service";
import { clock, hoursMinutes, shortDate } from "../format";

export type ShiftView = PortalShift;

function daysOf(period: { startsOn: string; endsOn: string }): string[] {
  const out: string[] = [];
  for (let d = period.startsOn; d <= period.endsOn && out.length < 31; d = addDays(d, 1)) out.push(d);
  return out;
}

export function workerState(shifts: ShiftView[]): ShiftView["state"] {
  if (shifts.some((x) => x.state === "disputed")) return "disputed";
  return shifts.every((x) => x.state === "approved") ? "approved" : "waiting";
}

export function StateBadge({ state }: { state: ShiftView["state"] }) {
  const t = useTranslations("hoursTable.states");
  return <Badge variant={state === "disputed" ? "destructive" : state === "approved" ? "secondary" : "outline"}>{t(state)}</Badge>;
}

export function HoursTable(props: { shifts: ShiftView[]; period: { startsOn: string; endsOn: string }; shiftActions?: (shift: ShiftView) => ReactNode; shiftNote?: (shift: ShiftView) => ReactNode; initiallyOpen?: string[] }) {
  const t = useTranslations("hoursTable");
  const locale = useLocale();
  const days = daysOf(props.period);
  const [open, setOpen] = useState<Set<string>>(new Set(props.initiallyOpen ?? []));
  const workers: { id: string; name: string; shifts: ShiftView[] }[] = [];
  for (const x of props.shifts) {
    const w = workers.find((v) => v.id === x.workerId);
    if (w) w.shifts.push(x);
    else workers.push({ id: x.workerId, name: x.workerName, shifts: [x] });
  }
  const dayTotal = (shifts: ShiftView[], day: string) => shifts.filter((x) => x.workDate === day).reduce((sum, x) => sum + x.minutes, 0);
  const total = (shifts: ShiftView[]) => shifts.reduce((sum, x) => sum + x.minutes, 0);
  const toggle = (id: string) => setOpen((o) => (o.has(id) ? new Set([...o].filter((v) => v !== id)) : new Set([...o, id])));

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table aria-label={t("label")} data-testid="hours-table">
        <TableHeader>
          <TableRow>
            <TableHead>{t("worker")}</TableHead>
            {days.map((d) => (
              <TableHead key={d} className="text-right">
                {shortDate(d, locale)}
              </TableHead>
            ))}
            <TableHead className="text-right">{t("total")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workers.map((w) => {
            const expanded = open.has(w.id);
            return (
              <Fragment key={w.id}>
                <TableRow data-testid="worker-row">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-expanded={expanded}
                        aria-controls={`shifts-${w.id}`}
                        aria-label={t("showShifts", { worker: w.name })}
                        onClick={() => toggle(w.id)}
                      >
                        {expanded ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
                        {w.name}
                      </button>
                      <StateBadge state={workerState(w.shifts)} />
                    </div>
                  </TableCell>
                  {days.map((d) => {
                    const minutes = dayTotal(w.shifts, d);
                    const flagged = w.shifts.some((x) => x.workDate === d && (x.state === "disputed" || x.draft !== null));
                    return (
                      <TableCell key={d} className="text-right tabular-nums">
                        <span className="inline-flex items-center justify-end gap-1">
                          {flagged && <CircleAlertIcon className="size-3.5 text-destructive" aria-label={t("states.disputed")} />}
                          {minutes > 0 ? hoursMinutes(minutes) : "—"}
                        </span>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right font-medium tabular-nums">{hoursMinutes(total(w.shifts))}</TableCell>
                </TableRow>
                {expanded && (
                  <TableRow id={`shifts-${w.id}`} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={days.length + 2} className="p-0">
                      <div
                        className="px-4 py-3"
                        onKeyDown={(e) => {
                          if (e.key === "Escape" && !document.querySelector("[role=dialog]")) toggle(w.id);
                        }}
                      >
                        <Table aria-label={w.name}>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("day")}</TableHead>
                              <TableHead>{t("start")}</TableHead>
                              <TableHead>{t("end")}</TableHead>
                              <TableHead className="text-right">{t("break")}</TableHead>
                              <TableHead className="text-right">{t("hours")}</TableHead>
                              <TableHead>{t("state")}</TableHead>
                              {props.shiftActions && <TableHead className="w-0" />}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {w.shifts.map((x) => (
                              <Fragment key={x.entryId}>
                                <TableRow data-testid="shift-row">
                                  <TableCell>{shortDate(x.workDate, locale)}</TableCell>
                                  <TableCell className="tabular-nums">{clock(x.inMinute, locale)}</TableCell>
                                  <TableCell className="tabular-nums">{clock(x.outMinute, locale)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{x.breakMinutes === null ? "—" : t("minutes", { count: x.breakMinutes })}</TableCell>
                                  <TableCell className="text-right tabular-nums">{hoursMinutes(x.minutes)}</TableCell>
                                  <TableCell>
                                    <StateBadge state={x.state} />
                                  </TableCell>
                                  {props.shiftActions && <TableCell className="text-right whitespace-nowrap">{props.shiftActions(x)}</TableCell>}
                                </TableRow>
                                {props.shiftNote?.(x) && (
                                  <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={props.shiftActions ? 7 : 6} className="pt-0 text-sm whitespace-normal text-muted-foreground">
                                      {props.shiftNote(x)}
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Fragment>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>{t("totals")}</TableCell>
            {days.map((d) => {
              const minutes = dayTotal(props.shifts, d);
              return (
                <TableCell key={d} className="text-right tabular-nums">
                  {minutes > 0 ? hoursMinutes(minutes) : "—"}
                </TableCell>
              );
            })}
            <TableCell className="text-right tabular-nums">{hoursMinutes(total(props.shifts))}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
