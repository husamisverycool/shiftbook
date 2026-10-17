"use client";

// Pattern: docs/patterns/workers.md — Toast Payroll Team page (an always-visible search that finds
// people the status filter hides; Add employee; the Status filter on Active by default with the
// others by checkbox; a row's name opens the profile) and its "missing from the Team page" help;
// drawn as Stripe's current lists (the Status filter as a pill whose menu holds the checkbox, a
// hairline, the table, the number of results under it).
import { ContactRoundIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuCheckboxItem, DropdownMenuGroup, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { PayrollSystem } from "@/exports/targets";
import type { WorkerRow } from "@/server/workers/queries";
import { ReadOnlyNote, useCan } from "../abilities";
import { typing } from "../app-sidebar";
import { EmptyState } from "../empty-state";
import { listDate } from "../format";
import { FilterPill, ListToolbar, ResultsCount } from "../list-controls";
import { Page, PageHeader, TableFrame } from "../page";
import { PersonAvatar } from "../person";
import { Status } from "../status";
import { AddWorkerDialog } from "./add-worker";
import { Tip } from "../tip";

/** Accents and case do not matter to the search ("Pena" finds "Peña"). */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function WorkersView({ rows, system, today }: { rows: WorkerRow[]; system: PayrollSystem | null; today: string }) {
  const t = useTranslations("workers");
  const locale = useLocale();
  const mayChange = useCan()("workers");
  const [query, setQuery] = useState("");
  const [includeEnded, setIncludeEnded] = useState(false);
  const [adding, setAdding] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  // "/" focuses the search, as in most lists people know.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = fold(query.trim());
  // Toast: the search finds people the status filter hides; without a search, ended workers only when included.
  const shown = useMemo(
    () => rows.filter((r) => (q ? fold(`${r.firstName} ${r.lastName}`).includes(q) || fold(`${r.lastName}, ${r.firstName}`).includes(q) || r.payrollNumbers.some((n) => fold(n).includes(q)) : includeEnded || r.status === "active")),
    [rows, q, includeEnded],
  );
  const endedCount = rows.length - rows.filter((r) => r.status === "active").length;

  return (
    <Page>
      <PageHeader
        title={t("title")}
        description={mayChange ? undefined : <ReadOnlyNote text={t("readOnly")} />}
        actions={
          mayChange && (
            <Button size="sm" onClick={() => setAdding(true)} data-testid="add-worker">
              <PlusIcon />
              {t("add")}
            </Button>
          )
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ContactRoundIcon}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            mayChange && (
              <Button size="sm" onClick={() => setAdding(true)}>
                <PlusIcon />
                {t("add")}
              </Button>
            )
          }
          testId="workers-empty"
        />
      ) : (
        <>
          {/* Toast's search and Status filter, set as Stripe's filter row: the search, then the status as a pill
              whose menu holds the checkbox for ended workers; a hairline under them that the table sits on. */}
          <div className="flex min-w-0 flex-col">
            <ListToolbar>
              <form role="search" className="relative" onSubmit={(e) => e.preventDefault()}>
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={search}
                  type="search"
                  aria-label={t("searchLabel")}
                  placeholder={t("search")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setQuery("");
                  }}
                  className="h-7 w-80 pl-8"
                  data-testid="worker-search"
                />
              </form>
              <FilterPill label={t("col.status")} value={includeEnded ? t("statusAll") : t("status.active")} testId="status-filter">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t("col.status")}</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem checked={includeEnded} onCheckedChange={(on) => setIncludeEnded(on === true)} data-testid="include-ended">
                    {t("includeEnded")}
                  </DropdownMenuCheckboxItem>
                </DropdownMenuGroup>
              </FilterPill>
            </ListToolbar>

            {shown.length === 0 ? (
              <div className="mt-6 flex flex-col items-start gap-3 rounded-xl border border-dashed p-6 text-sm" data-testid="workers-no-match">
                {q ? (
                  <>
                    <p>{t("noMatch", { query: query.trim() })}</p>
                    <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                      {t("clearSearch")}
                    </Button>
                  </>
                ) : (
                  <>
                    <p>{t("noActive")}</p>
                    {endedCount > 0 && (
                      <Button variant="outline" size="sm" onClick={() => setIncludeEnded(true)}>
                        {t("includeEnded")}
                      </Button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <TableFrame className="mb-4">
                <Table aria-label={t("title")} data-testid="workers-list">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("col.name")}</TableHead>
                      <TableHead>{t("col.placement")}</TableHead>
                      <TableHead>{t("col.hired")}</TableHead>
                      <TableHead>{t("col.payroll")}</TableHead>
                      <TableHead>{t("col.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((r) => (
                      <TableRow key={r.id} data-testid="worker-row" className={r.status === "ended" ? "text-muted-foreground" : undefined}>
                        <TableCell>
                          {/* Initials beside the name (decision 0029; Geist entity). */}
                          <div className="flex items-center gap-3">
                            <PersonAvatar name={`${r.firstName} ${r.lastName}`} id={r.id} size="default" />
                            <div className="min-w-0">
                              <Link href={`/workers/${r.id}`} className="font-medium text-foreground underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                                {r.lastName}, {r.firstName}
                              </Link>
                              <div className="text-xs text-muted-foreground">{t(`language.${r.preferredLanguage === "es" ? "es" : "en"}`)}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {r.placements.length === 0 ? (
                            <span className="text-muted-foreground">{t("notPlaced")}</span>
                          ) : (
                            <span className="flex flex-wrap items-center gap-2">
                              {t("placementAt", { position: r.placements[0]!.position, client: r.placements[0]!.clientName })}
                              {r.placements.length > 1 && (
                                <Tip describes focusable label={<span className="whitespace-pre-line">{r.placements.slice(1).map((p) => t("placementAt", { position: p.position, client: p.clientName })).join("\n")}</span>}>
                                  <Badge variant="outline">{t("more", { count: r.placements.length - 1 })}</Badge>
                                </Tip>
                              )}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{r.hireDate ? listDate(r.hireDate, locale, today) : "—"}</TableCell>
                        <TableCell>
                          {r.payrollNumber === null || system === null ? (
                            <span className="text-muted-foreground">{t("payroll.noSystem")}</span>
                          ) : r.payrollNumber === "set" ? (
                            <span className="text-muted-foreground">{t("payroll.set")}</span>
                          ) : (
                            <Status tone="warning">{t("payroll.missing", { system: t(`systems.${system}`) })}</Status>
                          )}
                        </TableCell>
                        <TableCell>
                          <Status tone={r.status === "active" ? "success" : "neutral"}>{t(`status.${r.status}`)}</Status>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            )}
            <ResultsCount shown={shown.length} total={q ? rows.length : undefined} testId="worker-count" />
          </div>
        </>
      )}

      {adding && <AddWorkerDialog today={today} onClose={() => setAdding(false)} />}
    </Page>
  );
}
