"use client";

/**
 * Side panel for one entry — docs/patterns/review.md item 8: the entry's values, the source page
 * with a box around each value (Rossum: read but not reviewed · checked · stops confirmation; hover
 * names the field; zoom controls), and the entry's audit log in time order (Restaurant365).
 */
import { MinusIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { entryHistory, type HistoryEvent } from "@/app/[locale]/(app)/convert/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { clock, hoursMinutes, shortDate } from "../format";
import type { GridRow } from "./types";
import { useDateTime } from "../agency-zone";
import { Tip } from "../tip";

const FIELDS = ["worker", "date", "in", "out", "break", "total"] as const;

const REASON_CODES = ["misread_corrected", "confirmed_client", "confirmed_worker", "matched_worker", "other"];

export function SourcePanel({ row, field, roster, onClose }: { row: GridRow | null; field: string | null; roster: { id: string; name: string }[]; onClose: () => void }) {
  const t = useTranslations("convert.hours");
  const locale = useLocale();
  const when = useDateTime();
  const [zoom, setZoom] = useState(1);
  const [history, setHistory] = useState<{ id: string; events: HistoryEvent[] } | null>(null);
  const rowId = row?.id ?? null;

  useEffect(() => {
    if (!rowId) return;
    let live = true;
    void entryHistory(rowId).then((events) => live && setHistory({ id: rowId, events }));
    return () => {
      live = false;
    };
  }, [rowId]);

  const boxes = row
    ? FIELDS.flatMap((name) => {
        const f = row.fields[name];
        return f?.box && f.page ? [{ name, page: f.page, box: f.box, state: f.checks.length > 0 ? "stops" : f.edited || row.status === "reviewed" ? "checked" : "read" }] : [];
      })
    : [];
  const pages = [...new Set(boxes.map((b) => b.page))].sort((a, b) => a - b);
  const showPages = row?.document && (row.document.kind === "image" || row.document.kind === "pdf") ? (pages.length > 0 ? pages : [1]) : [];
  const sourceRow = row ? (Object.values(row.fields).find((f) => f?.source)?.source?.row ?? null) : null;
  const events = history && history.id === rowId ? history.events : null;
  const label = (name: string) => (name === "total" ? t("colHours") : t(`col${name[0]!.toUpperCase()}${name.slice(1)}` as "colWorker"));

  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl" data-testid="source-panel">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle>{row.workerName}</SheetTitle>
              <SheetDescription>
                {shortDate(row.workDate, locale)} · {row.clientName ?? "—"} · {t(`status.${row.status}`)}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-6 px-4 pb-6">
              <dl className="grid grid-cols-4 gap-2 text-sm">
                {(
                  [
                    ["colIn", clock(row.inMinute, locale)],
                    ["colOut", clock(row.outMinute, locale)],
                    ["colBreak", row.breakMinutes === null ? "—" : hoursMinutes(row.breakMinutes)],
                    ["colHours", hoursMinutes(row.minutes)],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex flex-col">
                    <dt className="text-muted-foreground">{t(k)}</dt>
                    <dd className="font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              {FIELDS.map((name) => {
                const f = row.fields[name];
                return f && f.agree === false ? (
                  <p key={name} className="text-sm text-destructive">
                    {label(name)} — {t("readings", { a: f.passA ?? "—", b: f.passB ?? "—" })}
                  </p>
                ) : null;
              })}

              {showPages.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <div className="flex items-center gap-1">
                    <Button size="icon-sm" variant="outline" aria-label={t("zoomOut")} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
                      <MinusIcon />
                    </Button>
                    <Button size="icon-sm" variant="outline" aria-label={t("zoomIn")} onClick={() => setZoom((z) => Math.min(4, z + 0.5))}>
                      <PlusIcon />
                    </Button>
                    <Button size="icon-sm" variant="outline" aria-label={t("zoomReset")} onClick={() => setZoom(1)}>
                      <RotateCcwIcon />
                    </Button>
                    <span className="ml-2 truncate text-xs text-muted-foreground">{row.document!.filename}</span>
                  </div>
                  <div className="max-h-[60vh] overflow-auto rounded-md border">
                    {showPages.map((page) => (
                      <div key={page} className="relative" style={{ width: `${zoom * 100}%` }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- private, per-agency page image */}
                        <img src={`/api/documents/${row.document!.id}/pages/${page}`} alt={t("sourcePage", { page })} className="block w-full" />
                        {boxes
                          .filter((b) => b.page === page)
                          .map((b) => (
                            <Tip key={b.name} label={label(b.name)}>
                              <div
                                data-state={b.state}
                                className={`absolute rounded-sm border-2 ${b.state === "stops" ? "border-destructive bg-destructive/10" : b.state === "checked" ? "border-primary bg-primary/10" : "border-muted-foreground/70"} ${field === b.name || (field === "hours" && b.name === "total") ? "ring-2 ring-ring" : ""}`}
                                style={{ left: `${b.box.x / 10}%`, top: `${b.box.y / 10}%`, width: `${b.box.w / 10}%`, height: `${b.box.h / 10}%` }}
                              />
                            </Tip>
                          ))}
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                row.document && (
                  <p className="text-sm text-muted-foreground">
                    {sourceRow ? t("noImage", { file: row.document.filename, row: sourceRow }) : t("noImageNoRow", { file: row.document.filename })}
                  </p>
                )
              )}

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{t("history")}</h3>
                {events === null ? null : events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
                ) : (
                  <ol className="flex flex-col gap-2 text-sm">
                    {events.map((e, i) => (
                      <li key={i} className="flex flex-col border-l-2 pl-3">
                        <span className="font-medium">{t(`historyActions.${["create", "update", "approve", "delete", "reset"].includes(e.action) ? e.action : "update"}` as "historyActions.update")}</span>
                        <span className="text-xs text-muted-foreground">
                          {when(e.at)} · {e.actor}
                        </span>
                        {e.reason && <span className="text-xs">{readableReason(e.reason, (code) => t(`editReasons.${code}` as "editReasons.other"))}</span>}
                        <Changes before={e.before} after={e.after} roster={roster} locale={locale} />
                        <Attached after={e.after} />
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** "matched_worker, other: called the site" → "Matched to the right worker · Other: called the site". */
function readableReason(reason: string, label: (code: string) => string): string {
  return reason
    .split(", ")
    .map((part) => {
      const [code, ...rest] = part.split(": ");
      if (!code || !REASON_CODES.includes(code)) return part;
      return rest.length > 0 ? `${label(code)}: ${rest.join(": ")}` : label(code);
    })
    .join(" · ");
}

/** "Attached to {client}": hours a person put on another client than the timesheet's (kept as data in the log). */
function Attached({ after }: { after: unknown }) {
  const t = useTranslations("convert.hours");
  const a = after && typeof after === "object" ? (after as { attachedToClient?: unknown; timesheetClient?: unknown }) : {};
  if (typeof a.attachedToClient !== "string") return null;
  return (
    <span className="text-xs">
      {typeof a.timesheetClient === "string"
        ? t("historyAttached", { client: a.attachedToClient, timesheet: a.timesheetClient })
        : t("historyAttachedUnclear", { client: a.attachedToClient })}
    </span>
  );
}

const FIELD_LABEL: Record<string, string> = { workerId: "colWorker", workDate: "colDate", inMinute: "colIn", outMinute: "colOut", breakMinutes: "colBreak", minutes: "colHours", status: "colStatus" };

function Changes({ before, after, roster, locale }: { before: unknown; after: unknown; roster: { id: string; name: string }[]; locale: string }) {
  const t = useTranslations("convert.hours");
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return null;
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const keys = Object.keys(FIELD_LABEL).filter((k) => k in a && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  if (keys.length === 0) return null;
  const show = (k: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (k === "workerId") return roster.find((w) => w.id === v)?.name ?? "—";
    if (k === "workDate") return shortDate(String(v), locale);
    if (k === "inMinute" || k === "outMinute") return clock(Number(v), locale);
    if (k === "breakMinutes" || k === "minutes") return hoursMinutes(Number(v));
    if (k === "status") return t(`status.${String(v)}` as "status.reviewed");
    return String(v);
  };
  return (
    <ul className="text-xs text-muted-foreground">
      {keys.map((k) => (
        <li key={k}>
          {t(FIELD_LABEL[k] as "colWorker")}: {show(k, b[k])} → {show(k, a[k])}
        </li>
      ))}
    </ul>
  );
}
