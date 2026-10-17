"use client";

// Pattern: docs/patterns/job-orders.md and assignments.md — Linear issue list (view header with
// filter and display options; filters in the URL; sticky collapsible group headers with counts;
// J/K or arrows to highlight, X to select, Shift to extend, Cmd/Ctrl+A, Esc; F filters, Shift+V
// display options, C create; bulk bar at the bottom) with Attio's record preview as the side panel
// ("N of M", previous/next, expand, close), opened and closed with Space as in Linear's peek. Drawn
// as Linear's own screenshots show its list (https://linear.app/docs/filters,
// https://linear.app/docs/display-options): one line per row — a status icon, the title, its muted
// detail, then the properties as small rounded chips each with its icon; groups as tinted bands with
// their icon and count; applied filters as segmented chips (field · operator · value · ×); display
// options as a panel of Grouping and Ordering choices and property toggles. The icons are lucide's.
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronDownIcon, ChevronRightIcon, ListFilterIcon, Maximize2Icon, PanelRightOpenIcon, Rows3Icon, SlidersHorizontalIcon, XIcon, type LucideIcon } from "lucide-react";
export type { RowIcon } from "../status-icon";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { EmptyState } from "../empty-state";
import { PageHeader } from "../page";
import { typing } from "../app-sidebar";
import { StatusIcon, type RowIcon } from "../status-icon";

export interface Column<R> {
  key: string;
  label: string;
  cell: (r: R) => ReactNode;
  className?: string;
  /** Shown as a small rounded chip, as Linear's rows show labels and projects; dates stay plain text. */
  chip?: boolean;
  /** The chip's icon (Linear's chips each lead with one). */
  icon?: LucideIcon;
}
export interface Grouping<R> {
  key: string;
  label: string;
  /** Null groups nothing. */
  value: ((r: R) => string) | null;
  /** The band's icon, from a row of the group (Linear's group headers lead with the status's or project's icon). */
  icon?: (sample: R) => RowIcon;
}

export interface Ordering<R> {
  key: string;
  label: string;
  value: (r: R) => string;
}
export interface FilterDef<R> {
  key: string;
  label: string;
  /** Leads the applied filter's chip (Linear's filter bar). */
  icon?: LucideIcon;
  options: { value: string; label: string }[];
  test: (r: R, value: string) => boolean;
}

interface Props<R extends { id: string }> {
  /** Display options are personal: kept in this browser under this key (Linear: personal by default). */
  storageKey: string;
  title: string;
  /** One muted line under the title (decision 0029, page header). */
  description?: ReactNode;
  /** Key figures between the header and the rows (decision 0029). */
  figures?: ReactNode;
  rows: R[];
  primary: (r: R) => string;
  /** The row's second line; `grouping` is the group the rows are in, so a property its band names is left out. */
  secondary?: (r: R, grouping: string) => string | null;
  /** The row's status icon at its left (Linear). */
  status?: (r: R) => RowIcon;
  hrefFor: (r: R) => string;
  columns: Column<R>[];
  defaultColumns: string[];
  groupings: Grouping<R>[];
  defaultGrouping: string;
  orderings: Ordering<R>[];
  defaultOrdering: string;
  filters: FilterDef<R>[];
  panel: (r: R) => ReactNode;
  actions?: ReactNode;
  onCreate?: () => void;
  bulk?: (selected: R[], clear: () => void) => ReactNode;
  empty: ReactNode;
}

interface Display {
  grouping: string;
  ordering: string;
  columns: string[];
}

function readDisplay(key: string, fallback: Display): Display {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const d = JSON.parse(raw) as Partial<Display>;
    return { grouping: d.grouping ?? fallback.grouping, ordering: d.ordering ?? fallback.ordering, columns: Array.isArray(d.columns) ? d.columns : fallback.columns };
  } catch {
    return fallback;
  }
}

const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

export function RecordList<R extends { id: string }>(p: Props<R>) {
  const t = useTranslations("list");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fallback = useMemo<Display>(() => ({ grouping: p.defaultGrouping, ordering: p.defaultOrdering, columns: p.defaultColumns }), [p.defaultGrouping, p.defaultOrdering, p.defaultColumns]);
  const [display, setDisplay] = useState<Display>(fallback);
  useEffect(() => {
    const stored = readDisplay(p.storageKey, fallback);
    // Personal display options live in this browser only, so they are read after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplay(stored);
  }, [p.storageKey, fallback]);
  const saveDisplay = (d: Display) => {
    setDisplay(d);
    try {
      window.localStorage.setItem(p.storageKey, JSON.stringify(d));
    } catch {
      // Storage unavailable (private window): the choice lasts for this visit.
    }
  };

  // Filters live in the URL so a link shares the filtered view (Linear).
  const applied = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const f of p.filters) {
      const v = params.get(f.key);
      if (v) out[f.key] = v.split(",").filter(Boolean);
    }
    return out;
  }, [params, p.filters]);
  const setFilter = (key: string, values: string[]) => {
    const next = new URLSearchParams(params.toString());
    if (values.length > 0) next.set(key, values.join(","));
    else next.delete(key);
    const q = next.toString();
    router.replace(`${pathname}${q ? `?${q}` : ""}`, { scroll: false });
  };
  const clearFilters = () => router.replace(pathname, { scroll: false });

  const grouping = p.groupings.find((g) => g.key === display.grouping) ?? p.groupings[0]!;
  const ordering = p.orderings.find((o) => o.key === display.ordering) ?? p.orderings[0]!;
  const visibleColumns = p.columns.filter((c) => display.columns.includes(c.key));

  const filtered = useMemo(
    () => p.rows.filter((r) => p.filters.every((f) => !applied[f.key] || applied[f.key]!.some((v) => f.test(r, v)))),
    [p.rows, p.filters, applied],
  );
  const groups = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => cmp(ordering.value(a), ordering.value(b)) || cmp(a.id, b.id));
    if (!grouping.value) return [{ key: "", label: "", rows: sorted }];
    const map = new Map<string, R[]>();
    for (const r of sorted) map.set(grouping.value(r), [...(map.get(grouping.value(r)) ?? []), r]);
    return [...map].sort((a, b) => cmp(a[0], b[0])).map(([key, rows]) => ({ key, label: key, rows }));
  }, [filtered, grouping, ordering]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const navigable = useMemo(() => groups.flatMap((g) => (collapsed.has(g.key) ? [] : g.rows)), [groups, collapsed]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLElement>());

  const panelRow = panelId ? (filtered.find((r) => r.id === panelId) ?? null) : null;
  const panelIndex = panelRow ? navigable.findIndex((r) => r.id === panelRow.id) : -1;

  const move = useCallback(
    (delta: number, extend: boolean) => {
      if (navigable.length === 0) return;
      const at = highlight ? navigable.findIndex((r) => r.id === highlight) : -1;
      const next = navigable[Math.max(0, Math.min(navigable.length - 1, at < 0 ? 0 : at + delta))]!;
      setHighlight(next.id);
      if (panelId) setPanelId(next.id);
      rowRefs.current.get(next.id)?.scrollIntoView({ block: "nearest" });
      if (extend) {
        const from = navigable.findIndex((r) => r.id === (anchor ?? highlight ?? next.id));
        const to = navigable.findIndex((r) => r.id === next.id);
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        setSelected(new Set(navigable.slice(lo, hi + 1).map((r) => r.id)));
        if (!anchor) setAnchor(highlight ?? next.id);
      } else setAnchor(null);
    },
    [navigable, highlight, anchor, panelId],
  );
  const toggleSelect = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || document.querySelector("[role=dialog],[role=menu],[role=alertdialog]")) return;
      const key = e.key;
      if ((e.metaKey || e.ctrlKey) && key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(navigable.map((r) => r.id)));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (key === "ArrowDown" || key === "j" || key === "J") {
        e.preventDefault();
        move(1, e.shiftKey);
      } else if (key === "ArrowUp" || key === "k" || key === "K") {
        e.preventDefault();
        move(-1, e.shiftKey);
      } else if (key === " ") {
        e.preventDefault();
        const id = highlight ?? navigable[0]?.id ?? null;
        if (!highlight && id) setHighlight(id);
        setPanelId((cur) => (cur ? null : id));
      } else if (key === "Enter" && highlight) {
        const r = navigable.find((x) => x.id === highlight);
        if (r) router.push(p.hrefFor(r));
      } else if ((key === "x" || key === "X") && highlight) {
        e.preventDefault();
        toggleSelect(highlight);
      } else if (key === "Escape") {
        if (panelId) setPanelId(null);
        else clearSelection();
      } else if (key === "f" || key === "F") {
        e.preventDefault();
        setFilterOpen(true);
      } else if (key === "V" && e.shiftKey) {
        e.preventDefault();
        setDisplayOpen(true);
      } else if ((key === "c" || key === "C") && p.onCreate) {
        e.preventDefault();
        p.onCreate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigable, highlight, panelId, move, router, p, clearSelection]);

  const selectedRows = filtered.filter((r) => selected.has(r.id));
  const anyFilter = Object.keys(applied).length > 0;
  const optionLabel = (f: FilterDef<R>, v: string) => f.options.find((o) => o.value === v)?.label ?? v;

  return (
    <div className="flex min-h-[calc(100svh-3rem)]">
      <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
        {/* View header (Linear), as the shared page header (decision 0029) */}
        <PageHeader
          title={p.title}
          description={p.description}
          actions={
            <>
              <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
                <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                  <ListFilterIcon />
                  {t("filter")}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {p.filters.map((f) => (
                    <DropdownMenuSub key={f.key}>
                      <DropdownMenuSubTrigger>
                        {f.icon && <f.icon className="text-muted-foreground" />}
                        {f.label}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="max-h-80 overflow-auto">
                        {f.options.map((o) => {
                          const on = applied[f.key]?.includes(o.value) ?? false;
                          return (
                            <DropdownMenuCheckboxItem
                              key={o.value}
                              checked={on}
                              onCheckedChange={() => setFilter(f.key, on ? (applied[f.key] ?? []).filter((v) => v !== o.value) : [...(applied[f.key] ?? []), o.value])}
                            >
                              {o.label}
                            </DropdownMenuCheckboxItem>
                          );
                        })}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Display options (Linear): Grouping and Ordering as choices, the properties as toggles. */}
              <Popover open={displayOpen} onOpenChange={setDisplayOpen}>
                <PopoverTrigger render={<Button variant="outline" size="sm" />}>
                  <SlidersHorizontalIcon />
                  {t("display")}
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 gap-0 p-0" data-testid="display-options">
                  <div className="flex flex-col gap-2 p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Rows3Icon className="size-4 text-muted-foreground" aria-hidden />
                      <span className="flex-1 text-foreground/70">{t("grouping")}</span>
                      <NativeSelect size="sm" className="w-40" value={display.grouping} onChange={(e) => saveDisplay({ ...display, grouping: e.target.value })} data-testid="display-grouping">
                        {p.groupings.map((g) => (
                          <NativeSelectOption key={g.key} value={g.key}>
                            {g.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <ArrowUpDownIcon className="size-4 text-muted-foreground" aria-hidden />
                      <span className="flex-1 text-foreground/70">{t("ordering")}</span>
                      <NativeSelect size="sm" className="w-40" value={display.ordering} onChange={(e) => saveDisplay({ ...display, ordering: e.target.value })} data-testid="display-ordering">
                        {p.orderings.map((o) => (
                          <NativeSelectOption key={o.key} value={o.key}>
                            {o.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </label>
                  </div>
                  <div className="flex flex-col gap-2 border-t p-3">
                    <p className="text-xs font-medium text-foreground/70">{t("properties")}</p>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("properties")}>
                      {p.columns.map((c) => {
                        const on = display.columns.includes(c.key);
                        return (
                          <button
                            key={c.key}
                            type="button"
                            aria-pressed={on}
                            onClick={() => saveDisplay({ ...display, columns: on ? display.columns.filter((k) => k !== c.key) : [...display.columns, c.key] })}
                            className={cn("h-6 rounded-md border px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50", on ? "border-border bg-muted text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="border-t p-1.5">
                    <Button variant="ghost" size="sm" className="w-full justify-start text-foreground/70" onClick={() => saveDisplay(fallback)}>
                      {t("reset")}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              {p.actions}
            </>
          }
        />
        {p.figures}

        {/* Applied filters as Linear's segmented chips: the field with its icon · the operator · the values · remove. */}
        {anyFilter && (
          <div className="-mt-2 flex flex-wrap items-center gap-2" data-testid="filter-chips">
            {p.filters
              .filter((f) => applied[f.key])
              .map((f) => (
                <span key={f.key} className="inline-flex h-7 items-stretch divide-x overflow-hidden rounded-md border text-xs">
                  <span className="flex items-center gap-1.5 px-2">
                    {f.icon && <f.icon className="size-3.5 text-muted-foreground" aria-hidden />}
                    {f.label}
                  </span>
                  <span className="flex items-center px-2 text-muted-foreground">{applied[f.key]!.length > 1 ? t("isAnyOf") : t("is")}</span>
                  <span className="flex max-w-64 items-center truncate px-2 font-medium">{applied[f.key]!.map((v) => optionLabel(f, v)).join(", ")}</span>
                  <button type="button" className="flex items-center px-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted" aria-label={t("removeFilter", { name: f.label })} onClick={() => setFilter(f.key, [])}>
                    <XIcon className="size-3.5" />
                  </button>
                </span>
              ))}
            <Button variant="ghost" size="sm" className="h-7 text-foreground/70" onClick={clearFilters}>
              {t("clearFilters")}
            </Button>
          </div>
        )}

        {/* Rows, in groups */}
        <div className={cn(filtered.length > 0 && "border-t")} role="grid" aria-label={p.title} aria-multiselectable="true">
          {filtered.length === 0 ? (
            p.rows.length === 0 ? (
              p.empty
            ) : (
              <EmptyState
                kind="filtered"
                icon={ListFilterIcon}
                title={t("noResults")}
                action={
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    {t("clearFilters")}
                  </Button>
                }
              />
            )
          ) : (
            groups.map((g) => (
              <Fragment key={g.key || "all"}>
                {grouping.value && (
                  // The group's band (Linear): its icon, its name, its count; the chevron hides its rows.
                  <div role="row" className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b bg-muted/70 px-2 text-sm font-medium backdrop-blur">
                    <span role="columnheader" className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-expanded={!collapsed.has(g.key)}
                        aria-label={t(collapsed.has(g.key) ? "expandGroup" : "collapseGroup", { name: g.label })}
                        className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                        onClick={() =>
                          setCollapsed((cur) => {
                            const next = new Set(cur);
                            if (next.has(g.key)) next.delete(g.key);
                            else next.add(g.key);
                            return next;
                          })
                        }
                      >
                        {collapsed.has(g.key) ? <ChevronRightIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
                      </button>
                      {grouping.icon && g.rows[0] && <StatusIcon status={grouping.icon(g.rows[0])} decorative />}
                      {g.label}
                      <span className="font-normal text-foreground/70 tabular-nums">{g.rows.length}</span>
                    </span>
                  </div>
                )}
                {!collapsed.has(g.key) &&
                  g.rows.map((r) => {
                    const isHighlighted = highlight === r.id;
                    const isSelected = selected.has(r.id);
                    return (
                      <div
                        key={r.id}
                        role="row"
                        aria-selected={isSelected}
                        data-testid="record-row"
                        data-highlighted={isHighlighted || undefined}
                        ref={(el) => {
                          if (el) rowRefs.current.set(r.id, el);
                          else rowRefs.current.delete(r.id);
                        }}
                        onMouseEnter={() => setHighlight(r.id)}
                        className={cn(
                          "group flex min-h-11 items-center gap-3 border-b border-border/70 px-2 text-sm",
                          isHighlighted && "bg-muted/60",
                          isSelected && "bg-muted",
                          panelId === r.id && "ring-1 ring-ring ring-inset",
                        )}
                      >
                        <span role="gridcell" className="flex w-5 shrink-0 items-center">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(r.id)}
                            aria-label={t("selectRow", { name: p.primary(r) })}
                            className={cn("transition-opacity", !isSelected && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100", selected.size > 0 && "opacity-100")}
                          />
                        </span>
                        {/* One line, as Linear's rows: the status icon, the name, its muted detail; the properties at the right. */}
                        <span role="gridcell" className="flex min-w-0 flex-1 items-center gap-2.5">
                          {p.status && <StatusIcon status={p.status(r)} />}
                          <span className="flex min-w-0 flex-1 items-baseline gap-2">
                            <Link href={p.hrefFor(r)} className="max-w-[60%] shrink-0 truncate font-medium hover:underline">
                              {p.primary(r)}
                            </Link>
                            {p.secondary?.(r, grouping.key) && <span className="min-w-0 truncate text-muted-foreground">{p.secondary(r, grouping.key)}</span>}
                          </span>
                        </span>
                        {visibleColumns.map((c) => (
                          <span key={c.key} role="gridcell" className={cn("hidden shrink-0 text-muted-foreground md:block", c.className)}>
                            {c.chip ? (
                              <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border px-2 text-xs whitespace-nowrap text-foreground/80">
                                {c.icon && <c.icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                                {c.cell(r)}
                              </span>
                            ) : (
                              c.cell(r)
                            )}
                          </span>
                        ))}
                        <span role="gridcell" className="shrink-0">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("preview", { name: p.primary(r) })}
                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={() => {
                              setHighlight(r.id);
                              setPanelId((cur) => (cur === r.id ? null : r.id));
                            }}
                          >
                            <PanelRightOpenIcon />
                          </Button>
                        </span>
                      </div>
                    );
                  })}
              </Fragment>
            ))
          )}
        </div>
      </div>

      {/* Side panel (Attio record preview) */}
      {panelRow && (
        <aside aria-label={t("panel")} data-testid="side-panel" className="sticky top-0 hidden h-svh w-96 shrink-0 overflow-y-auto border-l bg-background lg:block">
          <div className="flex items-center gap-1 border-b px-3 py-2 text-sm">
            <span className="mr-auto text-muted-foreground tabular-nums">{t("position", { n: panelIndex + 1, total: navigable.length })}</span>
            <Button variant="ghost" size="icon-sm" aria-label={t("previous")} disabled={panelIndex <= 0} onClick={() => move(-1, false)}>
              <ArrowUpIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("next")} disabled={panelIndex >= navigable.length - 1} onClick={() => move(1, false)}>
              <ArrowDownIcon />
            </Button>
            <Link href={p.hrefFor(panelRow)} aria-label={t("expand")} className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted">
              <Maximize2Icon className="size-4" />
            </Link>
            <Button variant="ghost" size="icon-sm" aria-label={t("close")} onClick={() => setPanelId(null)}>
              <XIcon />
            </Button>
          </div>
          <div className="flex flex-col gap-4 p-4">
            <h2 className="text-lg font-semibold">{p.primary(panelRow)}</h2>
            {p.panel(panelRow)}
          </div>
        </aside>
      )}

      {/* Bulk action bar (Linear) */}
      {selectedRows.length > 0 && (
        <div role="toolbar" aria-label={t("bulk")} className="fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-background px-4 py-2 text-sm shadow-lg">
          <span className="tabular-nums">{t("selected", { count: selectedRows.length })}</span>
          {p.bulk?.(selectedRows, clearSelection)}
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            {t("clearSelection")}
          </Button>
        </div>
      )}
    </div>
  );
}
