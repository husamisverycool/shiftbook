"use client";

/**
 * Hours review grid — docs/patterns/review.md:
 * - Airtable grid: arrow keys move between cells (Cmd+arrows to the edge, Shift+arrows or Shift+click
 *   select a range), Enter edits, Space opens the side panel, Esc leaves; the view bar (row height,
 *   hide fields, group, sort); fields resized and reordered by their headers; the summary bar, one
 *   function per field, summarising the selection when there is one; copy and paste; undo and redo;
 *   right-click a row; Cmd+/ lists the shortcuts.
 * - Rippling timesheets: filters on top, approve / reject at the row's far right, bulk bar at the
 *   bottom center (bulk approve changes only high-confidence rows, SPEC §7).
 * - Restaurant365 Punch Edits: the row's values become editable in place, a reason is required
 *   before the checkmark saves (pastes and undos too: each is an audited edit), edited values carry a
 *   marker.
 */
import { ArrowDownUpIcon, CheckIcon, ChevronDownIcon, CircleIcon, EyeOffIcon, KeyboardIcon, LayersIcon, Maximize2Icon, PencilIcon, PlusIcon, Redo2Icon, RotateCcwIcon, Rows3Icon, SearchIcon, Undo2Icon, XIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ClipboardEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { addAction, approveAction, editAction, rejectAction, restoreAction } from "@/app/[locale]/(app)/convert/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { EntryChange, EditError } from "@/server/review/service";
import { useCan } from "../abilities";
import { clock, hoursMinutes, parseClock, shortDate } from "../format";
import { SourcePanel } from "./source-panel";
import { Status, type Tone } from "../status";
import { needsAttention, REFUSAL_MESSAGE, type ActionRefusal, type GridRow } from "./types";
import { Tip } from "../tip";
import {
  clampWidth,
  COLUMNS,
  defaultSummary,
  DEFAULT_VIEW,
  EDITABLE,
  editableRow,
  GROUPS,
  groupRows,
  inRange,
  inverseOf,
  moveColumn,
  normaliseView,
  NUMERIC,
  parseTsv,
  planPaste,
  PRIMARY,
  rangeOf,
  rangeSize,
  rawValue,
  ROW_HEIGHTS,
  shownColumns,
  sortRows,
  summarise,
  summariesFor,
  toTsv,
  type Column,
  type PastePlan,
  type Summary,
  type SummaryResult,
  type View,
} from "./grid-view";

/**
 * One status language (_components/status.md): read and not yet checked is not started (neutral), needs
 * review needs attention, reviewed and client approved are done, disputed needs the agency, locked and
 * rejected have ended.
 */
const STATUS_TONE: Record<GridRow["status"], Tone> = { extracted: "neutral", needs_review: "warning", reviewed: "success", client_approved: "success", disputed: "critical", locked: "neutral", rejected: "neutral" };

const REASONS = ["misread_corrected", "confirmed_client", "confirmed_worker", "matched_worker", "other"] as const;
/** Airtable's row heights, as cell padding. */
const HEIGHT_CLASS: Record<View["rowHeight"], string> = { short: "[&>td]:py-1", medium: "", tall: "[&>td]:py-4", extraTall: "[&>td]:py-7" };

// The view is the person's own, remembered in this browser (Airtable keeps a view per person's choice).
const VIEW_KEY = "granite.hoursGrid.view";
const VIEW_EVENT = "granite:hours-grid-view";
function readStoredView(): string | null {
  try {
    return window.localStorage.getItem(VIEW_KEY);
  } catch {
    return null;
  }
}
function subscribeView(onChange: () => void) {
  window.addEventListener(VIEW_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(VIEW_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
function storeView(v: View) {
  try {
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    // Storage off (a private window): the view still changes for this page.
  }
  window.dispatchEvent(new Event(VIEW_EVENT));
}

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

/** An edit saved in this session, kept to undo and redo it (each replay is itself an audited edit). */
interface Done {
  rowId: string;
  from: EntryChange;
  to: EntryChange;
  reasons: string[];
  note: string;
}

export function HoursGrid(props: { periodId: string; rows: GridRow[]; roster: { id: string; name: string }[]; period: { startsOn: string; endsOn: string }; initialQuery?: string }) {
  const t = useTranslations("convert.hours");
  const g = useTranslations("convert.hours.grid");
  const tCommon = useTranslations("common");
  const tc = useTranslations("convert");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  // Decision 0026: only the Owner and coordinators change hours; everyone else reads the grid.
  const mayChange = useCan()("hours");
  const [pending, start] = useTransition();
  const attention = props.rows.filter(needsAttention);
  // Opened for one worker (Client approvals: "Edit the hours"): every row of theirs, not only those needing review.
  const [filter, setFilter] = useState<"review" | "all">(attention.length > 0 && !props.initialQuery ? "review" : "all");
  const [query, setQuery] = useState(props.initialQuery ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [anchor, setAnchor] = useState<{ row: number; col: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [panel, setPanel] = useState<{ id: string; field: string | null } | null>(null);
  const [adding, setAdding] = useState<(Omit<Draft, "error"> & { error: AddError | null }) | null>(null);
  const [pasting, setPasting] = useState<{ plan: PastePlan; reasons: string[]; note: string; error: string | null } | null>(null);
  const [history, setHistory] = useState<{ past: Done[]; future: Done[] }>({ past: [], future: [] });
  const [menuRowId, setMenuRowId] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [fieldQuery, setFieldQuery] = useState("");
  const [dragging, setDragging] = useState<Column | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLSelectElement>(null);

  const storedView = useSyncExternalStore(subscribeView, readStoredView, () => null);
  const view = useMemo(() => {
    if (!storedView) return DEFAULT_VIEW;
    try {
      return normaliseView(JSON.parse(storedView));
    } catch {
      return DEFAULT_VIEW;
    }
  }, [storedView]);
  const setView = useCallback((patch: Partial<View>) => storeView(normaliseView({ ...view, ...patch })), [view]);
  const cols = shownColumns(view);

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
  const groups = useMemo(() => groupRows(sortRows(visible, view.sort), view.group), [visible, view.sort, view.group]);
  const ordered = useMemo(() => groups.flatMap((x) => x.rows), [groups]);
  const range = anchor ? rangeOf(anchor, active) : null;
  const multi = range !== null && rangeSize(range) > 1;
  const selectedRows = props.rows.filter((r) => selected.has(r.id));
  const bulkReady = selectedRows.filter((r) => r.confidence === "high" && (r.status === "extracted" || r.status === "needs_review"));

  const label = (c: Column) => t(`col${c[0]!.toUpperCase()}${c.slice(1)}` as "colWorker");

  const focusCell = (row: number, col: number, extend = false) => {
    const r = Math.max(0, Math.min(ordered.length - 1, row));
    const c = Math.max(0, Math.min(cols.length - 1, col));
    if (extend) setAnchor((a) => a ?? active);
    else setAnchor(null);
    setActive({ row: r, col: c });
    requestAnimationFrame(() => tableRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)?.focus());
  };

  const beginEdit = (r: GridRow) => {
    if (!mayChange || !editableRow(r)) return;
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
    const ri = ordered.findIndex((x) => x.id === r.id);
    requestAnimationFrame(() => {
      const at = active.row === ri ? active.col : 0;
      const row = tableRef.current?.querySelector<HTMLElement>(`[data-cell="${ri}:${at}"]`)?.closest("tr");
      const target = tableRef.current?.querySelector<HTMLElement>(`[data-cell="${ri}:${at}"] input, [data-cell="${ri}:${at}"] select`) ?? row?.querySelector<HTMLElement>("input, select");
      target?.focus();
    });
  };

  /** Rossum: after a value is settled, the next value still awaiting review. */
  const nextAwaiting = (fromId: string) => {
    const at = ordered.findIndex((x) => x.id === fromId);
    const next = ordered.findIndex((x, i) => i > at && needsAttention(x));
    if (next >= 0) focusCell(next, active.col);
  };

  const remember = (r: GridRow, change: EntryChange, reasons: string[], note: string) =>
    setHistory((h) => ({ past: [...h.past, { rowId: r.id, from: inverseOf(r, change), to: change, reasons, note }], future: [] }));

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
        // Attaching to another client is a choice of where hours belong, not a value to undo.
        if (!attachToClientId && Object.keys(change).length > 0) remember(r, change, d.reasons, d.note);
        setEditing(null);
        router.refresh();
        nextAwaiting(r.id);
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

  /** Airtable "insert above / below" and "duplicate": a new entry for the same worker and day (hours are added, never moved). */
  const insertLike = (r: GridRow | undefined, copyValues: boolean) => {
    if (!mayChange) return;
    setAdding({
      workerId: r?.workerId ?? "",
      workDate: r?.workDate ?? props.period.startsOn,
      inText: copyValues && r?.inMinute != null ? clock(r.inMinute, "en-GB") : "",
      outText: copyValues && r?.outMinute != null ? clock(r.outMinute, "en-GB") : "",
      breakText: copyValues && r?.breakMinutes != null ? String(r.breakMinutes) : "",
      hoursText: "",
      reasons: [],
      note: "",
      error: null,
    });
  };

  const act = (fn: () => Promise<{ ok: true } | { error: ActionRefusal }>) =>
    start(async () => {
      const r = await fn();
      if ("error" in r) toast.error(tc(`errors.${REFUSAL_MESSAGE[r.error]}`));
      router.refresh();
    });

  const editMessage = (error: EditError | "period_busy") => t(`editErrors.${error}`, { client: "", count: 1 });

  const replay = (direction: "undo" | "redo") => {
    const entry = direction === "undo" ? history.past.at(-1) : history.future.at(-1);
    if (!entry || !mayChange) return toast.message(direction === "undo" ? g("nothingToUndo") : g("nothingToRedo"));
    const note = `${direction === "undo" ? g("undoNote") : g("redoNote")}${entry.note ? `: ${entry.note}` : ""}`;
    start(async () => {
      const result = await editAction(entry.rowId, direction === "undo" ? entry.from : entry.to, entry.reasons, note);
      if (!result.ok) return void toast.error(editMessage(result.error));
      setHistory((h) => (direction === "undo" ? { past: h.past.slice(0, -1), future: [...h.future, entry] } : { past: [...h.past, entry], future: h.future.slice(0, -1) }));
      toast.success(direction === "undo" ? g("undone") : g("redone"));
      router.refresh();
    });
  };

  /** A cell as text for the clipboard: dates as ISO and times as the grid shows them, so pasting back reads them. */
  const cellText = (r: GridRow, c: Column): string => {
    switch (c) {
      case "worker":
        return r.workerName;
      case "client":
        return r.clientName ?? "";
      case "date":
        return r.workDate ?? "";
      case "in":
        return r.inMinute === null ? "" : clock(r.inMinute, locale);
      case "out":
        return r.outMinute === null ? "" : clock(r.outMinute, locale);
      case "break":
        return r.breakMinutes === null ? "" : hoursMinutes(r.breakMinutes);
      case "hours":
        return r.minutes === null ? "" : hoursMinutes(r.minutes);
      case "confidence":
        return t(`confidence.${r.confidence}`);
      case "status":
        return t(`status.${r.status}`);
      case "source":
        return r.document?.filename ?? t("manual");
    }
  };
  const copy = (cells: string[][]) => {
    const text = toTsv(cells);
    void navigator.clipboard?.writeText(text).then(
      () => toast.success(g("copied", { count: cells.reduce((n, row) => n + row.length, 0) })),
      () => undefined,
    );
  };
  const copyRange = () => {
    const rg = range ?? rangeOf(active, active);
    copy(ordered.slice(rg.r0, rg.r1 + 1).map((r) => cols.slice(rg.c0, rg.c1 + 1).map((c) => cellText(r, c))));
  };

  const onPaste = (e: ClipboardEvent<HTMLTableElement>) => {
    if (editing || !mayChange || ordered.length === 0) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const plan = planPaste({ rows: ordered, columns: cols, range: range ?? rangeOf(active, active), clipboard: parseTsv(text), roster: props.roster, period: props.period });
    setPasting({ plan, reasons: [], note: "", error: null });
  };
  const applyPaste = () => {
    if (!pasting) return;
    const { plan, reasons, note } = pasting;
    start(async () => {
      let done = 0;
      const saved: Done[] = [];
      for (const c of plan.changes) {
        const result = await editAction(c.row.id, c.change, reasons, note);
        if (!result.ok) {
          setPasting({ ...pasting, error: g("pastePartly", { done, total: plan.changes.length, reason: editMessage(result.error) }) });
          if (saved.length > 0) setHistory((h) => ({ past: [...h.past, ...saved], future: [] }));
          router.refresh();
          return;
        }
        saved.push({ rowId: c.row.id, from: inverseOf(c.row, c.change), to: c.change, reasons, note });
        done += 1;
      }
      setHistory((h) => ({ past: [...h.past, ...saved], future: [] }));
      setPasting(null);
      toast.success(g("pasteDone", { count: done }));
      router.refresh();
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (editing) {
      if (e.key === "Escape") {
        e.preventDefault();
        setEditing(null);
        focusCell(active.row, active.col);
      }
      return;
    }
    // Keys typed into a header's menu or the resize handle stay theirs.
    if ((e.target as HTMLElement).closest("thead, tfoot")) return;
    const mod = e.metaKey || e.ctrlKey;
    const row = ordered[active.row];
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === "ArrowDown") focusCell(mod ? ordered.length - 1 : active.row + 1, active.col, e.shiftKey);
    else if (key === "ArrowUp") focusCell(mod ? 0 : active.row - 1, active.col, e.shiftKey);
    else if (key === "ArrowRight") focusCell(active.row, mod ? cols.length - 1 : active.col + 1, e.shiftKey);
    else if (key === "ArrowLeft") focusCell(active.row, mod ? 0 : active.col - 1, e.shiftKey);
    else if (key === "F2" && row) beginEdit(row);
    else if (key === "Enter" && e.shiftKey) insertLike(row, false);
    else if (key === "Enter" && row) {
      // Rossum: Enter on a value already checked moves to the next one still awaiting review.
      const next = needsAttention(row) ? -1 : ordered.findIndex((r, i) => i > active.row && needsAttention(r));
      if (next >= 0) focusCell(next, active.col);
      else beginEdit(row);
    } else if (key === " " && row) setPanel({ id: row.id, field: e.shiftKey ? (cols[active.col] ?? null) : null });
    else if (mod && key === "c") copyRange();
    else if (mod && key === "z") replay(e.shiftKey ? "redo" : "undo");
    else if (mod && key === "y") replay("redo");
    else if (mod && (key === "/" || key === "?")) setShortcutsOpen(true);
    else if (mod && e.shiftKey && key === "f") filterRef.current?.focus();
    else if (mod && e.shiftKey && key === "d") setGroupOpen(true);
    else if (mod && e.shiftKey && key === "s") setSortOpen(true);
    else if (mod && key === "f") searchRef.current?.focus();
    else if (key === "Escape" && anchor) setAnchor(null);
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
    const known = ["worker_not_on_roster", "worker_ambiguous", "no_active_assignment", "several_active_assignments", "date_outside_period", "in_after_out", "crosses_midnight", "break_longer_than_shift", "total_mismatch", "over_24_hours", "unreadable", "passes_disagree", "handwriting_not_confirmed", "seen_by_one_pass", "inconsistent_reading", "row_total_mismatch", "grand_total_mismatch", "duplicate_day_in_vms", "assignment_at_other_client", "timesheet_client_unclear", "worker_app", "worker_app_too_long", "worker_app_not_allowed"];
    const reason = t(`reasons.${known.includes(base!) ? base : "other"}`);
    return field && ["worker", "date", "in", "out", "break", "total"].includes(field) ? t("reasonWithField", { reason, field: t(`fields.${field}`) }) : reason;
  };
  // Called as a function, not a component: a component declared here would remount, closing its tooltip, on every render.
  const marked = (r: GridRow, field: string, children: React.ReactNode) => {
    const f = fieldFlag(r, field);
    return (
      <Tip describes label={f.checks.map((c) => reasonText(c)).join(" · ") || undefined}>
        <span className={`inline-flex items-center gap-1 ${f.flagged ? "text-destructive" : ""}`}>
          {children}
          {f.edited && (
            <>
              <CircleIcon className="size-1.5 fill-primary text-accent-text" aria-hidden />
              <span className="sr-only">{t("edited")}</span>
            </>
          )}
        </span>
      </Tip>
    );
  };

  /** A summary as the grid writes the field's values. */
  const summaryText = (s: SummaryResult): string => {
    if (!s) return "";
    if (s.kind === "minutes") return hoursMinutes(Number(s.value));
    if (s.kind === "clock") return clock(Number(s.value), locale);
    if (s.kind === "date") return shortDate(String(s.value), locale);
    if (s.kind === "percent") return `${format.number(Number(s.value))}%`;
    return format.number(Number(s.value));
  };
  const summaryOf = (c: Column) => view.summaries[c] ?? defaultSummary(c);
  const summaryRows = multi && range ? ordered.slice(range.r0, range.r1 + 1) : ordered;

  const startResize = (c: Column, e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget.parentElement as HTMLElement | null)!;
    const startX = e.clientX;
    const startW = th.getBoundingClientRect().width;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    let width = startW;
    const move = (ev: PointerEvent) => {
      width = clampWidth(startW + ev.clientX - startX);
      th.style.width = th.style.minWidth = th.style.maxWidth = `${width}px`;
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      setView({ widths: { ...view.widths, [c]: width } });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };

  const panelRow = panel ? props.rows.find((r) => r.id === panel.id) ?? null : null;
  const panelAt = panel ? ordered.findIndex((r) => r.id === panel.id) : -1;
  const menuRow = menuRowId ? (ordered.find((r) => r.id === menuRowId) ?? null) : null;
  const hiddenCount = view.hidden.length;
  const groupLabel = (key: string) => {
    if (key === "") return g("noValue");
    if (view.group === "status") return t(`status.${key as GridRow["status"]}`);
    if (view.group === "date") return shortDate(key, locale);
    return key;
  };

  const renderCell = (c: Column, r: GridRow, isEditing: boolean, d: Draft | undefined, set: (patch: Partial<Draft>) => void): { content: React.ReactNode; className?: string } => {
    const timed = r.inMinute !== null || r.outMinute !== null;
    switch (c) {
      case "worker":
        return {
          content:
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
                {marked(r, "worker", <span className="font-medium">{r.workerName}</span>)}
                {r.workerId === null && <Badge variant="outline">{t("unmatched")}</Badge>}
                {r.reviewReasons.some((x) => x !== "worker_not_on_roster") && r.status === "needs_review" && (
                  <span className="max-w-52 text-xs whitespace-normal text-muted-foreground">
                    {[...new Set(r.reviewReasons.filter((x) => x !== "worker_not_on_roster").map((x) => reasonText(x, r)))].join(" · ")}
                  </span>
                )}
              </div>
            ),
        };
      case "client":
        return {
          content: (
            <Tip label={r.clientName ?? undefined}>
              <span className="block max-w-36 truncate">{r.clientName ?? "—"}</span>
            </Tip>
          ),
        };
      case "date":
        return {
          content:
            isEditing && d ? (
              <Input type="date" aria-label={t("colDate")} value={d.workDate} min={props.period.startsOn} max={props.period.endsOn} onChange={(e) => set({ workDate: e.target.value })} className="w-34" />
            ) : (
              marked(r, "date", <>{shortDate(r.workDate, locale)}</>)
            ),
          className: "whitespace-nowrap",
        };
      case "in":
        return {
          content:
            isEditing && d && (timed || d.inText) ? (
              <Input aria-label={t("colIn")} value={d.inText} onChange={(e) => set({ inText: e.target.value })} className="w-16 text-right" placeholder="7:00" />
            ) : (
              marked(r, "in", <>{clock(r.inMinute, locale)}</>)
            ),
          className: "text-right tabular-nums whitespace-nowrap",
        };
      case "out":
        return {
          content:
            isEditing && d && (timed || d.outText) ? (
              <Input aria-label={t("colOut")} value={d.outText} onChange={(e) => set({ outText: e.target.value })} className="w-16 text-right" placeholder="15:30" />
            ) : (
              marked(r, "out", <>{clock(r.outMinute, locale)}</>)
            ),
          className: "text-right tabular-nums whitespace-nowrap",
        };
      case "break":
        return {
          content:
            isEditing && d && timed ? (
              <Input aria-label={t("colBreak")} inputMode="numeric" value={d.breakText} onChange={(e) => set({ breakText: e.target.value })} className="w-14 text-right" />
            ) : (
              marked(r, "break", <>{r.breakMinutes === null ? "—" : hoursMinutes(r.breakMinutes)}</>)
            ),
          className: "text-right tabular-nums",
        };
      case "hours":
        return {
          content:
            isEditing && d && !timed ? (
              <Input aria-label={t("colHours")} value={d.hoursText} onChange={(e) => set({ hoursText: e.target.value })} className="w-20 text-right" placeholder="8:00" />
            ) : (
              marked(r, "total", <span className="font-medium">{hoursMinutes(r.minutes)}</span>)
            ),
          className: "text-right tabular-nums",
        };
      case "confidence":
        return { content: <Badge variant={r.confidence === "high" ? "secondary" : r.confidence === "low" ? "destructive" : "outline"}>{t(`confidence.${r.confidence}`)}</Badge> };
      case "status":
        return { content: <Status tone={STATUS_TONE[r.status]}>{t(`status.${r.status}`)}</Status> };
      case "source":
        return {
          content: (
            <Tip label={r.document?.filename ?? t("manual")}>
              <button type="button" className="block max-w-28 truncate rounded-sm text-left text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50" onClick={() => setPanel({ id: r.id, field: null })}>
                {r.document?.filename ?? t("manual")}
              </button>
            </Tip>
          ),
        };
    }
  };

  const colSpan = cols.length + (mayChange ? 2 : 1);
  const widthStyle = (c: Column) => (view.widths[c] ? { width: view.widths[c], minWidth: view.widths[c], maxWidth: view.widths[c] } : undefined);

  // Each group's first row's place in the grid, so cells keep one row number across groups.
  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((n, x) => n + x.rows.length, 0));
  const body = groups.flatMap((group, gi) => {
    const header =
      view.group === "none"
        ? []
        : [
            <TableRow key={`group-${group.key}`} className="bg-muted/40 hover:bg-muted/40" data-testid="group-row">
              <TableCell colSpan={colSpan} className="sticky left-0 text-sm font-medium">
                {groupLabel(group.key)} <span className="ml-1 font-normal text-muted-foreground">{g("groupCount", { count: group.rows.length })}</span>
              </TableCell>
            </TableRow>,
          ];
    const rows = group.rows.flatMap((r, i) => {
      const rowIndex = starts[gi]! + i;
      const isEditing = editing?.id === r.id;
      const d = editing?.draft;
      // The clients a refusal named hold for this worker and date only.
      const set = (patch: Partial<Draft>) =>
        editing && setEditing({ id: editing.id, draft: { ...editing.draft, ...patch, error: null, ...("workerId" in patch || "workDate" in patch ? { errorClients: undefined } : {}) } });
      return [
        <TableRow
          key={r.id}
          data-state={selected.has(r.id) ? "selected" : undefined}
          data-testid="hours-row"
          data-row-id={r.id}
          onContextMenu={() => setMenuRowId(r.id)}
          className={cn(HEIGHT_CLASS[view.rowHeight], r.status === "rejected" && "text-muted-foreground line-through")}
        >
          {mayChange && (
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
          )}
          {cols.map((c, ci) => {
            const { content, className } = renderCell(c, r, isEditing, d, set);
            const ranged = multi && inRange(range, rowIndex, ci);
            return (
              <TableCell
                key={c}
                data-cell={`${rowIndex}:${ci}`}
                data-field={c}
                data-in-range={ranged || undefined}
                tabIndex={active.row === rowIndex && active.col === ci ? 0 : -1}
                onFocus={() => setActive({ row: rowIndex, col: ci })}
                onMouseDown={(e) => {
                  // Airtable: Shift+click selects from the active cell to this one.
                  if (e.shiftKey && !isEditing) {
                    e.preventDefault();
                    focusCell(rowIndex, ci, true);
                  }
                }}
                onDoubleClick={() => EDITABLE.includes(c) && beginEdit(r)}
                style={isEditing ? undefined : view.widths[c] ? { maxWidth: view.widths[c], overflow: "hidden" } : undefined}
                className={cn("outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset", ranged && "bg-primary/10", className)}
              >
                {content}
              </TableCell>
            );
          })}
          <TableCell className="sticky right-0 bg-background text-right whitespace-nowrap shadow-[-8px_0_8px_-8px_var(--border)]">
            {isEditing ? null : (
              <div className="inline-flex items-center gap-0.5">
                {mayChange && (r.status === "needs_review" || r.status === "extracted") && r.workerId !== null && r.minutes !== null && (
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
                {mayChange && editableRow(r) && (
                  <IconAction label={t("edit")} onClick={() => beginEdit(r)} disabled={pending}>
                    <PencilIcon />
                  </IconAction>
                )}
                {mayChange &&
                  (r.status === "rejected" ? (
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
                  ))}
                <IconAction label={t("openSource")} onClick={() => setPanel({ id: r.id, field: null })}>
                  <Maximize2Icon />
                </IconAction>
              </div>
            )}
          </TableCell>
        </TableRow>,
        isEditing && d ? (
          <TableRow key={`${r.id}-reason`} className="bg-muted/40 hover:bg-muted/40" data-testid="reason-row">
            <TableCell colSpan={colSpan}>
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
    });
    // Airtable: a grouped view shows each group's summary under it.
    const groupSummary =
      view.group === "none" || !cols.some((c) => summaryOf(c) !== "none")
        ? []
        : [
            <TableRow key={`group-summary-${group.key}`} className="hover:bg-transparent" data-testid="group-summary">
              {mayChange && <TableCell />}
              {cols.map((c) => (
                <TableCell key={c} className={cn("text-xs text-muted-foreground tabular-nums", NUMERIC.includes(c) && "text-right")}>
                  {summaryText(summarise(group.rows.map((x) => rawValue(x, c)), summaryOf(c), c))}
                </TableCell>
              ))}
              <TableCell />
            </TableRow>,
          ];
    return [...header, ...rows, ...groupSummary];
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("sectionTitle")} className="inline-flex rounded-xl border bg-card p-0.5">
          <Button size="sm" variant={filter === "review" ? "secondary" : "ghost"} aria-pressed={filter === "review"} onClick={() => setFilter("review")}>
            {t("filterNeedsReview", { count: attention.length })}
          </Button>
          <Button size="sm" variant={filter === "all" ? "secondary" : "ghost"} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            {t("filterAll", { count: props.rows.length })}
          </Button>
        </div>
        {clients.length > 1 && (
          <NativeSelect ref={filterRef} aria-label={t("filterClient")} value={client} onChange={(e) => setClient(e.target.value)} className="w-52">
            <NativeSelectOption value="">{t("allClients")}</NativeSelectOption>
            {clients.map((c) => (
              <NativeSelectOption key={c} value={c}>
                {c}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        <NativeSelect ref={clients.length > 1 ? undefined : filterRef} aria-label={t("filterConfidence")} value={confidence} onChange={(e) => setConfidence(e.target.value)} className="w-40">
          <NativeSelectOption value="">{t("allConfidence")}</NativeSelectOption>
          {(["high", "medium", "low"] as const).map((c) => (
            <NativeSelectOption key={c} value={c}>
              {t(`confidence.${c}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <div className="relative ml-auto w-full max-w-60">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-7" />
        </div>
      </div>

      {/* Airtable's view bar: row height, hide fields, group, sort; then undo, redo and the shortcuts. */}
      <div role="toolbar" aria-label={g("viewBar")} className="flex flex-wrap items-center gap-1 text-sm" data-testid="view-bar">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant={hiddenCount > 0 ? "secondary" : "ghost"} data-testid="hide-fields" />}>
            <EyeOffIcon />
            {hiddenCount > 0 ? g("hiddenCount", { count: hiddenCount }) : g("hideFields")}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            <div className="p-1">
              <Input value={fieldQuery} onChange={(e) => setFieldQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={g("findField")} aria-label={g("findField")} className="h-7" />
            </div>
            {view.order
              .filter((c) => label(c).toLowerCase().includes(fieldQuery.trim().toLowerCase()))
              .map((c) => (
                <label key={c} className={cn("flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent", c === PRIMARY && "opacity-60")}>
                  {label(c)}
                  <Switch
                    checked={!view.hidden.includes(c)}
                    disabled={c === PRIMARY}
                    onCheckedChange={(on) => setView({ hidden: on ? view.hidden.filter((x) => x !== c) : [...view.hidden, c] })}
                    data-testid={`field-switch-${c}`}
                  />
                </label>
              ))}
            <DropdownMenuSeparator />
            <div className="flex justify-between p-1">
              <Button size="xs" variant="ghost" onClick={() => setView({ hidden: COLUMNS.filter((c) => c !== PRIMARY) })}>
                {g("hideAll")}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setView({ hidden: [] })}>
                {g("showAllFields")}
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu open={groupOpen} onOpenChange={setGroupOpen}>
          <DropdownMenuTrigger render={<Button size="sm" variant={view.group !== "none" ? "secondary" : "ghost"} data-testid="group-menu" />}>
            <LayersIcon />
            {view.group !== "none" ? g("groupedBy", { field: g(`groups.${view.group}`) }) : g("group")}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuRadioGroup value={view.group} onValueChange={(v) => setView({ group: v as View["group"] })}>
              {GROUPS.map((x) => (
                <DropdownMenuRadioItem key={x} value={x}>
                  {g(`groups.${x}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu open={sortOpen} onOpenChange={setSortOpen}>
          <DropdownMenuTrigger render={<Button size="sm" variant={view.sort ? "secondary" : "ghost"} data-testid="sort-menu" />}>
            <ArrowDownUpIcon />
            {view.sort ? g("sortedBy", { field: label(view.sort.col) }) : g("sort")}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{g("sort")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={view.sort?.col ?? ""} onValueChange={(v) => setView({ sort: v ? { col: v as Column, dir: view.sort?.dir ?? "asc" } : null })}>
                {COLUMNS.map((c) => (
                  <DropdownMenuRadioItem key={c} value={c}>
                    {label(c)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={view.sort?.dir ?? ""} onValueChange={(v) => view.sort && setView({ sort: { col: view.sort.col, dir: v as "asc" | "desc" } })}>
              <DropdownMenuRadioItem value="asc" disabled={!view.sort}>
                {g("sortAsc")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc" disabled={!view.sort}>
                {g("sortDesc")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            {view.sort && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setView({ sort: null })}>{g("clearSort")}</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="ghost" data-testid="row-height" />}>
            <Rows3Icon />
            {g("rowHeight")}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44">
            <DropdownMenuRadioGroup value={view.rowHeight} onValueChange={(v) => setView({ rowHeight: v as View["rowHeight"] })}>
              {ROW_HEIGHTS.map((h) => (
                <DropdownMenuRadioItem key={h} value={h}>
                  {g(`rowHeights.${h}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-0.5">
          {mayChange && (
            <>
              <IconAction label={g("undo")} onClick={() => replay("undo")} disabled={pending || history.past.length === 0}>
                <Undo2Icon />
              </IconAction>
              <IconAction label={g("redo")} onClick={() => replay("redo")} disabled={pending || history.future.length === 0}>
                <Redo2Icon />
              </IconAction>
            </>
          )}
          <IconAction label={g("shortcuts")} onClick={() => setShortcutsOpen(true)}>
            <KeyboardIcon />
          </IconAction>
        </div>
      </div>

      {pasting && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm" role="region" aria-label={g("pasteTitle")} data-testid="paste-bar">
          {pasting.plan.changes.length > 0 ? (
            <p className="font-medium">
              {g("pasteSummary", { cells: pasting.plan.changes.reduce((n, c) => n + Object.keys(c.change).length, 0), rows: pasting.plan.changes.length })}
            </p>
          ) : (
            <p className="font-medium">{g("pasteNothing")}</p>
          )}
          {pasting.plan.problems.length > 0 && (
            <div className="text-muted-foreground">
              <p>{g("pasteProblems", { count: pasting.plan.problems.length })}</p>
              <ul className="list-disc pl-5">
                {pasting.plan.problems.slice(0, 6).map((p, i) => (
                  <li key={i}>{g(`pasteProblem.${p.problem}`, { field: label(p.col), worker: p.row.workerName, text: p.text })}</li>
                ))}
              </ul>
            </div>
          )}
          {pasting.plan.changes.length > 0 ? (
            <ReasonControls
              reasons={pasting.reasons}
              note={pasting.note}
              error={null}
              pending={pending}
              saveLabel={g("pasteApply")}
              onChange={(patch) => setPasting({ ...pasting, ...patch, error: null })}
              onSave={applyPaste}
              onCancel={() => setPasting(null)}
            />
          ) : (
            <Button size="sm" variant="ghost" className="w-fit" onClick={() => setPasting(null)}>
              {t("cancelEdit")}
            </Button>
          )}
          {pasting.error && (
            <p role="alert" className="text-destructive">
              {pasting.error}
            </p>
          )}
        </div>
      )}

      {ordered.length === 0 ? (
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
        // Full width with no box around it (_components/table.md); its own width, so a wide row scrolls inside the grid, never the page.
        <ContextMenu>
          <ContextMenuTrigger className="@container min-w-0" data-testid="hours-grid-frame">
            <Table ref={tableRef} onKeyDown={onKeyDown} onPaste={onPaste} aria-label={t("sectionTitle")} className="text-sm" data-testid="hours-grid">
              <TableHeader>
                <TableRow>
                  {mayChange && (
                    <TableHead className="w-8">
                      <Checkbox
                        aria-label={t("selectAll")}
                        checked={ordered.length > 0 && ordered.every((r) => selected.has(r.id))}
                        onCheckedChange={(on) => setSelected(on ? new Set(ordered.map((r) => r.id)) : new Set())}
                      />
                    </TableHead>
                  )}
                  {cols.map((c, ci) => (
                    <TableHead
                      key={c}
                      style={widthStyle(c)}
                      draggable={c !== PRIMARY}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/x-granite-field", c);
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(c);
                      }}
                      onDragEnd={() => setDragging(null)}
                      onDragOver={(e) => dragging && dragging !== c && c !== PRIMARY && e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = e.dataTransfer.getData("text/x-granite-field") as Column;
                        if (from) setView({ order: moveColumn(view.order, from, c) });
                        setDragging(null);
                      }}
                      className={cn("group/th relative transition-colors", NUMERIC.includes(c) && "text-right", dragging === c && "opacity-50")}
                      data-testid={`field-${c}`}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button
                              type="button"
                              aria-label={g("fieldMenu", { field: label(c) })}
                              className="inline-flex items-center gap-1 rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                            />
                          }
                        >
                          {label(c)}
                          {view.sort?.col === c && <ArrowDownUpIcon className="size-3" aria-hidden />}
                          <ChevronDownIcon className="size-3 opacity-0 transition-opacity group-hover/th:opacity-100" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-52">
                          <DropdownMenuItem onClick={() => setView({ sort: { col: c, dir: "asc" } })}>{g("sortAsc")}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setView({ sort: { col: c, dir: "desc" } })}>{g("sortDesc")}</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem disabled={c === PRIMARY || ci <= 1} onClick={() => setView({ order: moveColumn(view.order, c, cols[ci - 1]!) })}>
                            {g("moveLeft")}
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={c === PRIMARY || ci >= cols.length - 1} onClick={() => setView({ order: moveColumn(view.order, c, cols[ci + 1]!) })}>
                            {g("moveRight")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem disabled={c === PRIMARY} onClick={() => setView({ hidden: [...view.hidden, c] })}>
                            {g("hideField")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {/* Airtable: drag a field's edge to resize it; the arrow keys do the same. */}
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={g("resizeField", { field: label(c) })}
                        aria-valuenow={view.widths[c] ?? 0}
                        aria-valuemin={0}
                        aria-valuemax={480}
                        tabIndex={0}
                        onPointerDown={(e) => startResize(c, e)}
                        onKeyDown={(e) => {
                          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                          e.preventDefault();
                          const th = e.currentTarget.parentElement!;
                          const now = view.widths[c] ?? th.getBoundingClientRect().width;
                          setView({ widths: { ...view.widths, [c]: clampWidth(now + (e.key === "ArrowRight" ? 16 : -16)) } });
                        }}
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none opacity-0 transition-opacity outline-none group-hover/th:opacity-100 hover:bg-border focus-visible:bg-ring focus-visible:opacity-100"
                      />
                    </TableHead>
                  ))}
                  <TableHead className="sticky right-0 bg-background text-right">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{body}</TableBody>
              <TableFooter>
                {/* Airtable's summary bar: one function per field; with a range selected, only the selection. */}
                <TableRow data-testid="summary-bar">
                  {mayChange && <TableCell />}
                  {cols.map((c, ci) => {
                    const s = summarise(summaryRows.map((r) => rawValue(r, c)), summaryOf(c), c);
                    return (
                      <TableCell key={c} className={cn("font-medium", NUMERIC.includes(c) && "text-right")}>
                        <div className={cn("flex items-center gap-2", NUMERIC.includes(c) && "justify-end")}>
                          {ci === 0 && <span>{multi ? g("selectionRow") : t("totalRow")}</span>}
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <button
                                  type="button"
                                  aria-label={g("summaryOf", { field: label(c) })}
                                  data-testid={`summary-${c}`}
                                  className={cn("group/sum rounded-sm px-1 tabular-nums outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50", !s && "min-w-8 text-muted-foreground")}
                                />
                              }
                            >
                              {s ? summaryText(s) : <span className="opacity-0 transition-opacity group-hover/sum:opacity-100 group-focus-visible/sum:opacity-100">{g("summaries.none")}</span>}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-48">
                              <DropdownMenuRadioGroup value={summaryOf(c)} onValueChange={(v) => setView({ summaries: { ...view.summaries, [c]: v as Summary } })}>
                                {summariesFor(c).map((fn) => (
                                  <DropdownMenuRadioItem key={fn} value={fn}>
                                    {g(`summaries.${fn}`)}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    );
                  })}
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </ContextMenuTrigger>
          {/* Airtable: right-click a row — insert above or below, duplicate; Granite rejects rather than deletes. */}
          <ContextMenuContent aria-label={g("rowMenu")} data-testid="row-menu">
            {menuRow && (
              <>
                <DropdownMenuItem onClick={() => setPanel({ id: menuRow.id, field: null })}>{g("expand")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => copy([cols.map((c) => cellText(menuRow, c))])}>{g("copyRow")}</DropdownMenuItem>
                {mayChange && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => insertLike(menuRow, false)}>{g("insertAbove")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => insertLike(menuRow, false)}>{g("insertBelow")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => insertLike(menuRow, true)}>{g("duplicate")}</DropdownMenuItem>
                    {editableRow(menuRow) && <DropdownMenuItem onClick={() => beginEdit(menuRow)}>{t("edit")}</DropdownMenuItem>}
                    {menuRow.status !== "rejected" && menuRow.status !== "locked" && menuRow.status !== "client_approved" && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => act(() => rejectAction(menuRow.id))}>
                          {t("reject")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
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
      ) : mayChange ? (
        <Button variant="ghost" size="sm" className="w-fit" data-testid="add-entry" onClick={() => insertLike(undefined, false)}>
          <PlusIcon />
          {t("addEntry")}
        </Button>
      ) : null}

      {mayChange && selected.size > 0 && (
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
            loading={pending}
            loadingLabel={tCommon("loading")}
          >
            {t("approveSelected", { count: bulkReady.length })}
          </Button>
          {selected.size > bulkReady.length && <span className="text-muted-foreground">{t("approveSelectedNote", { skipped: selected.size - bulkReady.length })}</span>}
          <Button size="icon-sm" variant="ghost" aria-label={t("cancelEdit")} onClick={() => setSelected(new Set())}>
            <XIcon />
          </Button>
        </div>
      )}

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="shortcuts-dialog">
          <DialogHeader>
            <DialogTitle>{g("shortcuts")}</DialogTitle>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {(
              [
                ["↑ ↓ ← →", "move"],
                ["⌘ + ↑ ↓ ← →", "edge"],
                ["⇧ + ↑ ↓ ← →", "range"],
                ["Enter · F2", "edit"],
                ["Esc", "leave"],
                ["Space", "expand"],
                ["⇧ Space", "expandCell"],
                ["Enter", "nextReview"],
                ["⇧ Enter", "insert"],
                ["⌘ C", "copy"],
                ["⌘ V", "paste"],
                ["⌘ Z", "undo"],
                ["⌘ ⇧ Z · ⌘ Y", "redo"],
                ["⌘ F", "find"],
                ["⌘ ⇧ F", "filter"],
                ["⌘ ⇧ D", "groupMenu"],
                ["⌘ ⇧ S", "sortMenu"],
                ["⌘ ⇧ < >", "panelNav"],
                ["⌘ /", "help"],
              ] as const
            ).map(([keys, what]) => (
              <div key={what} className="contents">
                <dt>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
                </dt>
                <dd className="text-muted-foreground">{g(`shortcutList.${what}`)}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>

      <SourcePanel
        row={panelRow}
        field={panel?.field ?? null}
        roster={props.roster}
        onClose={() => setPanel(null)}
        nav={
          panelAt >= 0
            ? {
                position: panelAt + 1,
                total: ordered.length,
                onPrevious: panelAt > 0 ? () => setPanel({ id: ordered[panelAt - 1]!.id, field: panel?.field ?? null }) : undefined,
                onNext: panelAt < ordered.length - 1 ? () => setPanel({ id: ordered[panelAt + 1]!.id, field: panel?.field ?? null }) : undefined,
              }
            : undefined
        }
      />
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
  saveLabel?: string;
  onChange: (patch: { reasons?: string[]; note?: string }) => void;
  onSave: () => void;
  /** Puts the hours on that client's assignment (the person's explicit choice). */
  onAttach?: (clientId: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("convert.hours");
  const tCommon = useTranslations("common");
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
      <Button size="sm" onClick={props.onSave} disabled={props.pending || props.reasons.length === 0} data-testid="save-edit" loading={props.pending} loadingLabel={tCommon("loading")}>
        <CheckIcon />
        {props.saveLabel ?? t("saveEdit")}
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
