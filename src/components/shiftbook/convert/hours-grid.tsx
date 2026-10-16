"use client";

/**
 * Hours review grid — docs/patterns/review.md:
 * - Airtable grid: arrow keys move between cells, Enter edits, Space opens the side panel, Esc
 *   leaves; checkbox per row; summary row at the bottom.
 * - Rippling timesheets: filters on top, approve / reject at the row's far right, bulk bar at the
 *   bottom center (bulk approve changes only high-confidence rows, SPEC §7).
 * - Restaurant365 Punch Edits: the row's values become editable in place, a reason is required
 *   before the checkmark saves, edited values carry a marker.
 */
import { CheckIcon, CircleIcon, Maximize2Icon, PencilIcon, PlusIcon, RotateCcwIcon, SearchIcon, XIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { addAction, approveAction, editAction, rejectAction, restoreAction } from "@/app/[locale]/(app)/convert/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter } from "@/i18n/navigation";
import type { EntryChange, EditError } from "@/server/review/service";
import { clock, hoursMinutes, parseClock, shortDate } from "../format";
import { SourcePanel } from "./source-panel";
import { needsAttention, REFUSAL_MESSAGE, type ActionRefusal, type GridRow } from "./types";

const REASONS = ["misread_corrected", "confirmed_client", "confirmed_worker", "matched_worker", "other"] as const;
const COLUMNS = ["worker", "client", "date", "in", "out", "break", "hours", "confidence", "status", "source"] as const;
type Column = (typeof COLUMNS)[number];
const EDITABLE_COLUMNS: Column[] = ["worker", "date", "in", "out", "break", "hours"];


interface Draft {
  workerId: string;
  workDate: string;
  inText: string;
  outText: string;
  breakText: string;
  hoursText: string;
  reasons: string[];
  note: string;
  error: EditError | "period_busy" | null;
  /**
   * The clients a refusal named (an assignment that day at another client than the timesheet's, or
   * the timesheet's client unclear), in name order: one "Attach to {client}" each.
   */
  errorClients?: { id: string; name: string }[];
}

type AddError = EditError | "period_busy" | "worker_required";

export function HoursGrid(props: { periodId: string; rows: GridRow[]; roster: { id: string; name: string }[]; period: { startsOn: string; endsOn: string }; initialQuery?: string }) {
  const t = useTranslations("convert.hours");
  const tc = useTranslations("convert");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const attention = props.rows.filter(needsAttention);
  // Opened for one worker (Client approvals: "Edit the hours"): every row of theirs, not only those needing review.
  const [filter, setFilter] = useState<"review" | "all">(attention.length > 0 && !props.initialQuery ? "review" : "all");
  const [query, setQuery] = useState(props.initialQuery ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [panel, setPanel] = useState<{ id: string; field: string | null } | null>(null);
  const [adding, setAdding] = useState<(Omit<Draft, "error"> & { error: AddError | null }) | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const [client, setClient] = useState("");
  const [confidence, setConfidence] = useState("");
  const clients = useMemo(() => [...new Set(props.rows.map((r) => r.clientName).filter((c): c is string => c !== null))].sort(), [props.rows]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return props.rows.filter(
      (r) =>
        (filter === "all" || needsAttention(r)) &&
        (client === "" || r.clientName === client) &&
        (confidence === "" || r.confidence === confidence) &&
        (q === "" || r.workerName.toLowerCase().includes(q) || r.workerNameRaw.toLowerCase().includes(q)),
    );
  }, [props.rows, filter, client, confidence, query]);
  const totalMinutes = visible.reduce((sum, r) => sum + (r.status === "rejected" ? 0 : (r.minutes ?? 0)), 0);
  const selectedRows = props.rows.filter((r) => selected.has(r.id));
  const bulkReady = selectedRows.filter((r) => r.confidence === "high" && (r.status === "extracted" || r.status === "needs_review"));

  const focusCell = (row: number, col: number) => {
    const r = Math.max(0, Math.min(visible.length - 1, row));
    const c = Math.max(0, Math.min(COLUMNS.length - 1, col));
    setActive({ row: r, col: c });
    requestAnimationFrame(() => tableRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)?.focus());
  };

  const beginEdit = (r: GridRow) => {
    if (r.status === "locked" || r.status === "rejected" || r.status === "client_approved") return;
    setEditing({
      id: r.id,
      draft: {
        workerId: r.workerId ?? "",
        workDate: r.workDate ?? props.period.startsOn,
        inText: r.inMinute === null ? "" : clock(r.inMinute, "en-GB"),
        outText: r.outMinute === null ? "" : r.outMinute === 1440 ? "24:00" : clock(r.outMinute, "en-GB"),
        breakText: r.breakMinutes === null ? "" : String(r.breakMinutes),
        hoursText: r.minutes === null ? "" : hoursMinutes(r.minutes),
        reasons: [],
        note: "",
        error: null,
      },
    });
    // Keep the keyboard in the row being edited: focus the active column's field, else the first one.
    const ri = visible.findIndex((x) => x.id === r.id);
    requestAnimationFrame(() => {
      const row = tableRef.current?.querySelector<HTMLElement>(`[data-cell="${ri}:${active.row === ri ? active.col : 0}"]`)?.closest("tr");
      const target =
        tableRef.current?.querySelector<HTMLElement>(`[data-cell="${ri}:${active.row === ri ? active.col : 0}"] input, [data-cell="${ri}:${active.row === ri ? active.col : 0}"] select`) ??
        row?.querySelector<HTMLElement>("input, select");
      target?.focus();
    });
  };

  const save = (r: GridRow, d: Draft, attachToClientId: string | null = null) => {
    const change: EntryChange = {};
    if ((d.workerId || null) !== r.workerId) change.workerId = d.workerId || null;
    if (d.workDate !== r.workDate) change.workDate = d.workDate;
    const timed = r.inMinute !== null || r.outMinute !== null || d.inText.trim() !== "" || d.outText.trim() !== "";
    if (timed) {
      const inMinute = parseClock(d.inText);
      const outMinute = parseClock(d.outText);
      const breakMinutes = d.breakText.trim() === "" ? 0 : Number(d.breakText);
      if (inMinute === null || outMinute === null || !Number.isInteger(breakMinutes)) {
        setEditing({ id: r.id, draft: { ...d, error: "invalid_value" } });
        return;
      }
      if (inMinute !== r.inMinute) change.inMinute = inMinute;
      if (outMinute !== r.outMinute) change.outMinute = outMinute;
      if (breakMinutes !== r.breakMinutes) change.breakMinutes = breakMinutes;
    } else {
      const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(d.hoursText);
      const minutes = m ? Number(m[1]) * 60 + Number(m[2]) : null;
      if (minutes === null) {
        setEditing({ id: r.id, draft: { ...d, error: "invalid_value" } });
        return;
      }
      if (minutes !== r.minutes) change.minutes = minutes;
    }
    start(async () => {
      const result = await editAction(r.id, change, d.reasons, d.note, attachToClientId);
      if (result.ok) {
        setEditing(null);
        router.refresh();
      } else setEditing({ id: r.id, draft: { ...d, error: result.error, errorClients: "clients" in result ? result.clients : undefined } });
    });
  };

  const saveNew = (d: NonNullable<typeof adding>) => {
    if (!d.workerId) return setAdding({ ...d, error: "worker_required" });
    const inMinute = parseClock(d.inText);
    const outMinute = parseClock(d.outText);
    const breakMinutes = d.breakText.trim() === "" ? 0 : Number(d.breakText);
    if (inMinute === null || outMinute === null || !Number.isInteger(breakMinutes)) return setAdding({ ...d, error: "invalid_value" });
    start(async () => {
      const result = await addAction(props.periodId, { workerId: d.workerId, workDate: d.workDate, inMinute, outMinute, breakMinutes }, d.reasons, d.note);
      if (result.ok) {
        setAdding(null);
        setFilter("all");
        router.refresh();
      } else setAdding({ ...d, error: result.error });
    });
  };

  const act = (fn: () => Promise<{ ok: true } | { error: ActionRefusal }>) =>
    start(async () => {
      const r = await fn();
      if ("error" in r) toast.error(tc(`errors.${REFUSAL_MESSAGE[r.error]}`));
      router.refresh();
    });

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (editing) {
      if (e.key === "Escape") {
        e.preventDefault();
        setEditing(null);
        focusCell(active.row, active.col);
      }
      return;
    }
    const row = visible[active.row];
    if (e.key === "ArrowDown") focusCell(active.row + 1, active.col);
    else if (e.key === "ArrowUp") focusCell(active.row - 1, active.col);
    else if (e.key === "ArrowRight") focusCell(active.row, active.col + 1);
    else if (e.key === "ArrowLeft") focusCell(active.row, active.col - 1);
    else if (e.key === "F2" && row) beginEdit(row);
    else if (e.key === "Enter" && row) {
      // Rossum: Enter on a value already checked moves to the next one still awaiting review.
      const next = needsAttention(row) ? -1 : visible.findIndex((r, i) => i > active.row && needsAttention(r));
      if (next >= 0) focusCell(next, active.col);
      else beginEdit(row);
    }
    else if (e.key === " " && row) setPanel({ id: row.id, field: COLUMNS[active.col] ?? null });
    else return;
    e.preventDefault();
  };

  const fieldFlag = (r: GridRow, field: string) => {
    const f = r.fields[field];
    if (!f) return { edited: false, flagged: false, checks: [] as string[] };
    return { edited: f.edited === true, flagged: f.checks.length > 0, checks: f.checks };
  };
  const reasonText = (code: string, r?: GridRow) => {
    const [base, field] = code.split(":");
    if ((base === "assignment_at_other_client" || base === "timesheet_client_unclear") && r?.otherClient) return t(`reasons.${base}_named`, { client: r.otherClient.name });
    const known = ["worker_not_on_roster", "worker_ambiguous", "no_active_assignment", "several_active_assignments", "date_outside_period", "in_after_out", "crosses_midnight", "break_longer_than_shift", "total_mismatch", "over_24_hours", "unreadable", "passes_disagree", "handwriting_not_confirmed", "seen_by_one_pass", "inconsistent_reading", "row_total_mismatch", "grand_total_mismatch", "duplicate_day_in_vms", "assignment_at_other_client", "timesheet_client_unclear"];
    const reason = t(`reasons.${known.includes(base!) ? base : "other"}`);
    return field && ["worker", "date", "in", "out", "break", "total"].includes(field) ? t("reasonWithField", { reason, field: t(`fields.${field}`) }) : reason;
  };
  const Marked = ({ r, field, children }: { r: GridRow; field: string; children: React.ReactNode }) => {
    const f = fieldFlag(r, field);
    return (
      <span className={`inline-flex items-center gap-1 ${f.flagged ? "text-destructive" : ""}`} title={f.checks.map((c) => reasonText(c)).join(" · ") || undefined}>
        {children}
        {f.edited && (
          <>
            <CircleIcon className="size-1.5 fill-primary text-primary" aria-hidden />
            <span className="sr-only">{t("edited")}</span>
          </>
        )}
      </span>
    );
  };

  const panelRow = panel ? props.rows.find((r) => r.id === panel.id) ?? null : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("sectionTitle")} className="inline-flex rounded-lg border p-0.5">
          <Button size="sm" variant={filter === "review" ? "secondary" : "ghost"} aria-pressed={filter === "review"} onClick={() => setFilter("review")}>
            {t("filterNeedsReview", { count: attention.length })}
          </Button>
          <Button size="sm" variant={filter === "all" ? "secondary" : "ghost"} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            {t("filterAll", { count: props.rows.length })}
          </Button>
        </div>
        {clients.length > 1 && (
          <NativeSelect aria-label={t("filterClient")} value={client} onChange={(e) => setClient(e.target.value)} className="w-52">
            <NativeSelectOption value="">{t("allClients")}</NativeSelectOption>
            {clients.map((c) => (
              <NativeSelectOption key={c} value={c}>
                {c}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        <NativeSelect aria-label={t("filterConfidence")} value={confidence} onChange={(e) => setConfidence(e.target.value)} className="w-40">
          <NativeSelectOption value="">{t("allConfidence")}</NativeSelectOption>
          {(["high", "medium", "low"] as const).map((c) => (
            <NativeSelectOption key={c} value={c}>
              {t(`confidence.${c}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <div className="relative ml-auto w-full max-w-60">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-7" />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
          <CheckIcon className="size-5" />
          <p>{t("noRows")}</p>
          {filter === "review" && (
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setFilter("all")}>
              {t("showAll")}
            </Button>
          )}
        </div>
      ) : (
        <div className="@container overflow-x-auto rounded-lg border" data-testid="hours-grid-frame">
          <Table ref={tableRef} onKeyDown={onKeyDown} aria-label={t("sectionTitle")} className="text-sm" data-testid="hours-grid">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    aria-label={t("selectAll")}
                    checked={visible.length > 0 && visible.every((r) => selected.has(r.id))}
                    onCheckedChange={(on) => setSelected(on ? new Set(visible.map((r) => r.id)) : new Set())}
                  />
                </TableHead>
                {COLUMNS.map((c) => (
                  <TableHead key={c} className={["in", "out", "break", "hours"].includes(c) ? "text-right" : undefined}>
                    {t(`col${c[0]!.toUpperCase()}${c.slice(1)}` as "colWorker")}
                  </TableHead>
                ))}
                <TableHead className="sticky right-0 bg-background text-right">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r, ri) => {
                const isEditing = editing?.id === r.id;
                const d = editing?.draft;
                // The clients a refusal named hold for this worker and date only.
                const set = (patch: Partial<Draft>) =>
                  editing && setEditing({ id: editing.id, draft: { ...editing.draft, ...patch, error: null, ...("workerId" in patch || "workDate" in patch ? { errorClients: undefined } : {}) } });
                const timed = r.inMinute !== null || r.outMinute !== null;
                const cell = (ci: number, content: React.ReactNode, className?: string) => (
                  <TableCell
                    key={COLUMNS[ci]}
                    data-cell={`${ri}:${ci}`}
                    tabIndex={active.row === ri && active.col === ci ? 0 : -1}
                    onFocus={() => setActive({ row: ri, col: ci })}
                    onDoubleClick={() => EDITABLE_COLUMNS.includes(COLUMNS[ci]!) && beginEdit(r)}
                    className={`outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${className ?? ""}`}
                  >
                    {content}
                  </TableCell>
                );
                return [
                  <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined} data-testid="hours-row" className={r.status === "rejected" ? "text-muted-foreground line-through" : undefined}>
                    <TableCell>
                      <Checkbox
                        aria-label={t("selectRow")}
                        checked={selected.has(r.id)}
                        onCheckedChange={(on) => {
                          const next = new Set(selected);
                          if (on) next.add(r.id);
                          else next.delete(r.id);
                          setSelected(next);
                        }}
                      />
                    </TableCell>
                    {cell(
                      0,
                      isEditing && d ? (
                        <NativeSelect aria-label={t("colWorker")} value={d.workerId} onChange={(e) => set({ workerId: e.target.value })} className="w-44">
                          <NativeSelectOption value="">{t("matchWorker")}</NativeSelectOption>
                          {props.roster.map((w) => (
                            <NativeSelectOption key={w.id} value={w.id}>
                              {w.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      ) : (
                        <div className="flex min-w-40 flex-col gap-0.5">
                          <Marked r={r} field="worker">
                            <span className="font-medium">{r.workerName}</span>
                          </Marked>
                          {r.workerId === null && <Badge variant="outline">{t("unmatched")}</Badge>}
                          {r.reviewReasons.some((c) => c !== "worker_not_on_roster") && r.status === "needs_review" && (
                            <span className="max-w-52 text-xs whitespace-normal text-muted-foreground">
                              {[...new Set(r.reviewReasons.filter((c) => c !== "worker_not_on_roster").map((c) => reasonText(c, r)))].join(" · ")}
                            </span>
                          )}
                        </div>
                      ),
                    )}
                    {cell(1, <span className="block max-w-36 truncate" title={r.clientName ?? undefined}>{r.clientName ?? "—"}</span>)}
                    {cell(
                      2,
                      isEditing && d ? (
                        <Input type="date" aria-label={t("colDate")} value={d.workDate} min={props.period.startsOn} max={props.period.endsOn} onChange={(e) => set({ workDate: e.target.value })} className="w-34" />
                      ) : (
                        <Marked r={r} field="date">
                          {shortDate(r.workDate, locale)}
                        </Marked>
                      ),
                      "whitespace-nowrap",
                    )}
                    {cell(
                      3,
                      isEditing && d && (timed || d.inText) ? (
                        <Input aria-label={t("colIn")} value={d.inText} onChange={(e) => set({ inText: e.target.value })} className="w-16 text-right" placeholder="7:00" />
                      ) : (
                        <Marked r={r} field="in">
                          {clock(r.inMinute, locale)}
                        </Marked>
                      ),
                      "text-right tabular-nums whitespace-nowrap",
                    )}
                    {cell(
                      4,
                      isEditing && d && (timed || d.outText) ? (
                        <Input aria-label={t("colOut")} value={d.outText} onChange={(e) => set({ outText: e.target.value })} className="w-16 text-right" placeholder="15:30" />
                      ) : (
                        <Marked r={r} field="out">
                          {clock(r.outMinute, locale)}
                        </Marked>
                      ),
                      "text-right tabular-nums whitespace-nowrap",
                    )}
                    {cell(
                      5,
                      isEditing && d && timed ? (
                        <Input aria-label={t("colBreak")} inputMode="numeric" value={d.breakText} onChange={(e) => set({ breakText: e.target.value })} className="w-14 text-right" />
                      ) : (
                        <Marked r={r} field="break">
                          {r.breakMinutes === null ? "—" : hoursMinutes(r.breakMinutes)}
                        </Marked>
                      ),
                      "text-right tabular-nums",
                    )}
                    {cell(
                      6,
                      isEditing && d && !timed ? (
                        <Input aria-label={t("colHours")} value={d.hoursText} onChange={(e) => set({ hoursText: e.target.value })} className="w-20 text-right" placeholder="8:00" />
                      ) : (
                        <Marked r={r} field="total">
                          <span className="font-medium">{hoursMinutes(r.minutes)}</span>
                        </Marked>
                      ),
                      "text-right tabular-nums",
                    )}
                    {cell(7, <Badge variant={r.confidence === "high" ? "secondary" : r.confidence === "low" ? "destructive" : "outline"}>{t(`confidence.${r.confidence}`)}</Badge>)}
                    {cell(8, <span className="whitespace-nowrap">{t(`status.${r.status}`)}</span>)}
                    {cell(
                      9,
                      <button type="button" className="block max-w-28 truncate text-left text-muted-foreground underline-offset-4 hover:underline" title={r.document?.filename ?? t("manual")} onClick={() => setPanel({ id: r.id, field: null })}>
                        {r.document?.filename ?? t("manual")}
                      </button>,
                    )}
                    <TableCell className="sticky right-0 bg-background text-right whitespace-nowrap shadow-[-8px_0_8px_-8px_var(--border)]">
                      {isEditing ? null : (
                        <div className="inline-flex items-center gap-0.5">
                          {(r.status === "needs_review" || r.status === "extracted") && r.workerId !== null && r.minutes !== null && (
                            <IconAction
                              label={t("approve")}
                              disabled={pending}
                              onClick={() =>
                                start(async () => {
                                  const result = await approveAction([r.id], false);
                                  if ("error" in result) toast.error(tc(`errors.${REFUSAL_MESSAGE[result.error]}`));
                                  else if (result.skipped > 0) toast.error(t("approveRefused"));
                                  router.refresh();
                                })
                              }
                            >
                              <CheckIcon />
                            </IconAction>
                          )}
                          {r.status !== "rejected" && r.status !== "locked" && r.status !== "client_approved" && (
                            <IconAction label={t("edit")} onClick={() => beginEdit(r)} disabled={pending}>
                              <PencilIcon />
                            </IconAction>
                          )}
                          {r.status === "rejected" ? (
                            <IconAction label={t("undoReject")} onClick={() => act(() => restoreAction(r.id))} disabled={pending}>
                              <RotateCcwIcon />
                            </IconAction>
                          ) : (
                            r.status !== "locked" &&
                            r.status !== "client_approved" && (
                              <IconAction label={t("reject")} onClick={() => act(() => rejectAction(r.id))} disabled={pending}>
                                <XIcon />
                              </IconAction>
                            )
                          )}
                          <IconAction label={t("openSource")} onClick={() => setPanel({ id: r.id, field: null })}>
                            <Maximize2Icon />
                          </IconAction>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>,
                  isEditing && d ? (
                    <TableRow key={`${r.id}-reason`} className="bg-muted/40 hover:bg-muted/40" data-testid="reason-row">
                      <TableCell colSpan={COLUMNS.length + 2}>
                        {/* Kept to the grid's visible width, so a wide grid never pushes the controls or the message out of view. */}
                        <div className="sticky left-2 max-w-[calc(100cqw-1rem)] whitespace-normal">
                          <ReasonControls
                            reasons={d.reasons}
                            note={d.note}
                            error={d.error}
                            errorClients={d.errorClients}
                            attachClients={d.errorClients ?? (r.otherClient && d.workerId === (r.workerId ?? "") && d.workDate === r.workDate ? [r.otherClient] : [])}
                            pending={pending}
                            onChange={(patch) => set(patch)}
                            onSave={() => save(r, d)}
                            onAttach={(clientId) => save(r, d, clientId)}
                            onCancel={() => setEditing(null)}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">{t("reasonBody")}</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null,
                ];
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell />
                <TableCell colSpan={6} className="font-medium">
                  {t("totalRow")}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{hoursMinutes(totalMinutes)}</TableCell>
                <TableCell colSpan={4} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {adding ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3" data-testid="add-row">
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect aria-label={t("colWorker")} value={adding.workerId} onChange={(e) => setAdding({ ...adding, workerId: e.target.value, error: null })} className="w-48">
              <NativeSelectOption value="">{t("matchWorker")}</NativeSelectOption>
              {props.roster.map((w) => (
                <NativeSelectOption key={w.id} value={w.id}>
                  {w.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input type="date" aria-label={t("colDate")} value={adding.workDate} min={props.period.startsOn} max={props.period.endsOn} onChange={(e) => setAdding({ ...adding, workDate: e.target.value, error: null })} className="w-36" />
            <Input aria-label={t("colIn")} placeholder="7:00" value={adding.inText} onChange={(e) => setAdding({ ...adding, inText: e.target.value, error: null })} className="w-20 text-right" />
            <Input aria-label={t("colOut")} placeholder="15:30" value={adding.outText} onChange={(e) => setAdding({ ...adding, outText: e.target.value, error: null })} className="w-20 text-right" />
            <Input aria-label={t("colBreak")} inputMode="numeric" placeholder="30" value={adding.breakText} onChange={(e) => setAdding({ ...adding, breakText: e.target.value, error: null })} className="w-16 text-right" />
          </div>
          <ReasonControls
            reasons={adding.reasons}
            note={adding.note}
            error={adding.error}
            pending={pending}
            onChange={(patch) => setAdding({ ...adding, ...patch, error: null })}
            onSave={() => saveNew(adding)}
            onCancel={() => setAdding(null)}
          />
          <p className="text-xs text-muted-foreground">{t("reasonBody")}</p>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          data-testid="add-entry"
          onClick={() => setAdding({ workerId: "", workDate: props.period.startsOn, inText: "", outText: "", breakText: "", hoursText: "", reasons: [], note: "", error: null })}
        >
          <PlusIcon />
          {t("addEntry")}
        </Button>
      )}

      {selected.size > 0 && (
        <div role="toolbar" aria-label={t("bulkBar")} className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center gap-3 rounded-lg border bg-popover px-4 py-2 text-sm shadow-lg">
          <span>{t("selected", { count: selected.size })}</span>
          <Button
            size="sm"
            disabled={pending || bulkReady.length === 0}
            onClick={() =>
              start(async () => {
                const r = await approveAction([...selected], true);
                if ("error" in r) toast.error(tc(`errors.${REFUSAL_MESSAGE[r.error]}`));
                else if (r.skipped > 0) toast.message(t("approveSelectedNote", { skipped: r.skipped }));
                setSelected(new Set());
                router.refresh();
              })
            }
          >
            {t("approveSelected", { count: bulkReady.length })}
          </Button>
          {selected.size > bulkReady.length && <span className="text-muted-foreground">{t("approveSelectedNote", { skipped: selected.size - bulkReady.length })}</span>}
          <Button size="icon-sm" variant="ghost" aria-label={t("cancelEdit")} onClick={() => setSelected(new Set())}>
            <XIcon />
          </Button>
        </div>
      )}

      <SourcePanel row={panelRow} field={panel?.field ?? null} roster={props.roster} onClose={() => setPanel(null)} />
    </div>
  );
}

function ReasonControls(props: {
  reasons: string[];
  note: string;
  error: AddError | null;
  /** The clients the refusal named. */
  errorClients?: { id: string; name: string }[];
  /** Clients the hours can be attached to: the ones a refusal named, or the one the row already names. */
  attachClients?: { id: string; name: string }[];
  pending: boolean;
  onChange: (patch: { reasons?: string[]; note?: string }) => void;
  onSave: () => void;
  /** Puts the hours on that client's assignment (the person's explicit choice). */
  onAttach?: (clientId: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("convert.hours");
  const format = useFormatter();
  const named = props.errorClients ?? [];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{t("reasonTitle")}</span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" data-testid="reason-trigger" />}>
          {props.reasons.length === 0 ? t("chooseReasons") : t("reasonsChosen", { count: props.reasons.length })}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-64">
          {REASONS.map((code) => (
            <DropdownMenuCheckboxItem
              key={code}
              checked={props.reasons.includes(code)}
              onCheckedChange={(on) => props.onChange({ reasons: on ? [...props.reasons, code] : props.reasons.filter((x) => x !== code) })}
            >
              {t(`editReasons.${code}`)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Input aria-label={t("note")} placeholder={t("notePlaceholder")} value={props.note} onChange={(e) => props.onChange({ note: e.target.value })} className="max-w-72" />
      <Button size="sm" onClick={props.onSave} disabled={props.pending || props.reasons.length === 0} data-testid="save-edit">
        <CheckIcon />
        {t("saveEdit")}
      </Button>
      <Button size="sm" variant="ghost" onClick={props.onCancel} disabled={props.pending}>
        {t("cancelEdit")}
      </Button>
      {props.error && (
        <span role="alert" className="text-sm whitespace-normal text-destructive">
          {t(`editErrors.${props.error}`, { client: format.list(named.map((c) => c.name), { type: "conjunction" }), count: Math.max(1, named.length) })}
        </span>
      )}
      {props.onAttach &&
        props.attachClients?.map((c) => (
          <Button key={c.id} size="sm" variant="outline" onClick={() => props.onAttach?.(c.id)} disabled={props.pending || props.reasons.length === 0} data-testid="attach-other-client">
            {t("attachTo", { client: c.name })}
          </Button>
        ))}
    </div>
  );
}

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={label} onClick={onClick} disabled={disabled} />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
