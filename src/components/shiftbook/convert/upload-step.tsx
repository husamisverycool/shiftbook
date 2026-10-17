"use client";

/**
 * Upload step and inbox from docs/patterns/inbox.md (Dext "Add documents" panel → Processing → list;
 * Dext's Inbox · Processing · Archive tabs, column settings and Actions menu; Expensify's search,
 * Filters, Export, reading states, row selection and totals footer). Refused files are listed with
 * their reason at once; accepted files are read in the background and the list refreshes until reading
 * is done. A row opens the document review (docs/patterns/documents/[documentId].md).
 */
import { ChevronDownIcon, FileTextIcon, Loader2Icon, SearchIcon, UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { archiveAction, retryAction, uploadTimesheets, type UploadResult } from "@/app/[locale]/(app)/convert/actions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { unzipSync } from "fflate";
import { readError } from "@/lib/read-errors";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { MAX_TIMESHEET_BYTES } from "@/lib/limits";
import { cn } from "@/lib/utils";
import { useCan } from "../abilities";
import { useDateTime } from "../agency-zone";
import { EmptyState } from "../empty-state";
import { hoursMinutes } from "../format";
import { Status } from "../status";
import { Tip } from "../tip";
import { MapFileDialog } from "./map-file-dialog";
import { REFUSAL_MESSAGE, type ActionRefusal } from "./types";

export interface UploadDoc {
  id: string;
  filename: string;
  kind: string;
  status: "received" | "reading" | "read" | "failed" | "archived";
  /** Its reading stopped part-way: shown like a failed reading, with Retry and Archive. */
  stuck: boolean;
  error: string | null;
  clientName: string | null;
  entries: number;
  needsReview: number;
  minutes: number;
  receivedVia: "upload" | "email" | "manual";
  receivedAt: string;
}

const MEDIA_TYPES: Record<string, string> = { csv: "text/csv", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
type Tab = "inbox" | "processing" | "archive";
type StatusFilter = "read" | "review" | "failed";
type KindFilter = "image" | "pdf" | "timeclock" | "vms";
const DENSITY_KEY = "granite.inbox.density";

const kindGroup = (kind: string): KindFilter => (kind === "image" ? "image" : kind === "pdf" ? "pdf" : kind === "vms_export" ? "vms" : "timeclock");
/** A CSV cell that a spreadsheet cannot run as a formula. */
const cell = (v: string | number) => {
  const text = String(v);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

export function UploadStep({ periodId, documents, demo = false }: { periodId: string; documents: UploadDoc[]; demo?: boolean }) {
  const t = useTranslations("convert.upload");
  const ti = useTranslations("inbox");
  // Why a timesheet could not be read, in the reader's language (the stored reason is Granite's English).
  const said = (error: string | null) => {
    const why = readError(error);
    if (!why) return error;
    return why.key === "noRecording" ? t("noRecording") : t(`readErrors.${why.key}`, why.values ?? {});
  };
  const tcommon = useTranslations("common");
  const tc = useTranslations("convert.errors");
  const router = useRouter();
  const when = useDateTime();
  const mayChange = useCan()("hours");
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [refused, setRefused] = useState<UploadResult["refused"]>([]);
  const [uploading, start] = useTransition();
  const failed = (d: UploadDoc) => d.status === "failed" || d.stuck;
  const processing = documents.filter((d) => (d.status === "received" || d.status === "reading") && !d.stuck);
  const inbox = documents.filter((d) => d.status === "read" || failed(d));
  const archived = documents.filter((d) => d.status === "archived" && !d.stuck);
  // One timesheet, or every one that could not be read (Dext's inbox: a bulk action with one reason).
  const [archiving, setArchiving] = useState<UploadDoc | UploadDoc[] | "unreadable" | null>(null);
  const unreadable = documents.filter(failed);
  const [archiveReason, setArchiveReason] = useState("");
  const [mapping, setMapping] = useState<UploadDoc | null>(null);
  const [tab, setTab] = useState<Tab>("inbox");
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<StatusFilter[]>([]);
  const [kinds, setKinds] = useState<KindFilter[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [density, setDensity] = useState<"comfortable" | "compact">(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
    } catch {
      return "comfortable";
    }
  });
  const run = (fn: () => Promise<{ ok: true } | { error: ActionRefusal }>) =>
    start(async () => {
      const r = await fn();
      if ("error" in r) toast.error(tc(REFUSAL_MESSAGE[r.error]));
      router.refresh();
    });

  // Keep the list fresh while files are being read.
  useEffect(() => {
    if (processing.length === 0) return;
    const timer = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(timer);
  }, [processing.length, router]);

  // Demo only (decision 0031): the sample timesheets go into the same upload as dropped files.
  const [fetchingSamples, startSamples] = useTransition();
  const loadSamples = () =>
    startSamples(async () => {
      const response = await fetch("/api/demo/samples");
      if (!response.ok) return void toast.error(tcommon("retry"));
      const zip = unzipSync(new Uint8Array(await response.arrayBuffer()));
      const files = Object.entries(zip)
        .filter(([path, bytes]) => !path.endsWith("/") && bytes.length > 0)
        .map(([path, bytes]) => new File([bytes as BlobPart], path.split("/").pop()!, { type: MEDIA_TYPES[path.split(".").pop()!.toLowerCase()] ?? "application/octet-stream" }));
      send(files);
    });

  // One file per request, so a batch never meets the request size limit; files over the limit are
  // refused here with the same reason the server gives.
  const send = (files: FileList | File[]) => {
    const list = [...files];
    if (list.length === 0) return;
    start(async () => {
      const refusedNow: UploadResult["refused"] = [];
      for (const f of list) {
        if (f.size > MAX_TIMESHEET_BYTES) {
          refusedNow.push({ filename: f.name, reason: "tooLarge" });
          continue;
        }
        const form = new FormData();
        form.append("files", f);
        const result = await uploadTimesheets(periodId, form);
        refusedNow.push(...result.refused);
        if (result.locked) {
          toast.error(tc("periodLocked"));
          break;
        }
        if (result.busy) {
          toast.error(tc("busy"));
          break;
        }
      }
      setRefused(refusedNow);
      router.refresh();
    });
  };

  const tabDocs = tab === "inbox" ? inbox : tab === "archive" ? archived : processing;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tabDocs.filter((d) => {
      if (q && !d.filename.toLowerCase().includes(q) && !(d.clientName ?? "").toLowerCase().includes(q)) return false;
      if (statuses.length > 0) {
        const s: StatusFilter = failed(d) ? "failed" : d.needsReview > 0 ? "review" : "read";
        if (!statuses.includes(s)) return false;
      }
      if (kinds.length > 0 && !kinds.includes(kindGroup(d.kind))) return false;
      return true;
    });
  }, [tabDocs, query, statuses, kinds]);
  const picked = shown.filter((d) => selected.has(d.id));
  const allPicked = shown.length > 0 && picked.length === shown.length;
  const lastPicked = useRef<string | null>(null);
  const toggle = (id: string, range: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      // Shift+click selects the range from the last row picked (Expensify).
      if (range && lastPicked.current) {
        const a = shown.findIndex((d) => d.id === lastPicked.current);
        const b = shown.findIndex((d) => d.id === id);
        if (a >= 0 && b >= 0) {
          for (const d of shown.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(d.id);
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      lastPicked.current = id;
      return next;
    });
  const setDensityKept = (d: "comfortable" | "compact") => {
    setDensity(d);
    try {
      window.localStorage.setItem(DENSITY_KEY, d);
    } catch {
      // A browser that keeps nothing still shows the density chosen now.
    }
  };
  const statusWord = (d: UploadDoc) => (failed(d) ? t("status.failed") : t(`status.${d.status}`));
  const exportCsv = (docs: UploadDoc[]) => {
    const lines = [
      [ti("cols.file"), ti("cols.status"), ti("cols.via"), ti("cols.received"), ti("cols.client"), ti("cols.kind"), ti("cols.entries"), ti("cols.review"), ti("cols.hours")],
      ...docs.map((d) => [d.filename, statusWord(d), ti(`via.${d.receivedVia}`), d.receivedAt, d.clientName ?? "", t(`kind.${d.kind}`), d.entries, d.needsReview, hoursMinutes(d.minutes)]),
    ];
    const blob = new Blob([lines.map((l) => l.map(cell).join(",")).join("\n") + "\n"], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `timesheets-${tab}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const readAgain = (docs: UploadDoc[]) =>
    run(async () => {
      for (const d of docs.filter(failed)) {
        const r = await retryAction(d.id);
        if ("error" in r) return r;
      }
      setSelected(new Set());
      return { ok: true as const };
    });
  const archiveTargets = archiving === "unreadable" ? unreadable : Array.isArray(archiving) ? archiving : archiving ? [archiving] : [];
  const rowPad = density === "compact" ? "py-1" : "py-2.5";
  const totals = { docs: shown.length, entries: shown.reduce((n, d) => n + d.entries, 0), minutes: shown.reduce((n, d) => n + d.minutes, 0) };
  const filters = statuses.length + kinds.length;

  return (
    <div className="flex flex-col gap-8">
      {mayChange && (
        <section aria-label={t("dropTitle")} className="flex flex-col gap-3">
          <div
            data-testid="drop-zone"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              send(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center transition-colors ${dragging ? "border-primary bg-muted" : ""}`}
          >
            {uploading ? <Loader2Icon className="size-6 animate-spin text-muted-foreground" /> : <UploadIcon className="size-6 text-muted-foreground" />}
            <p className="font-medium">{uploading ? t("uploading") : t("dropTitle")}</p>
            <p className="max-w-prose text-sm text-muted-foreground">{t("dropBody")}</p>
            <input
              ref={input}
              type="file"
              multiple
              className="sr-only"
              aria-label={t("select")}
              tabIndex={-1}
              data-testid="file-input"
              accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,.csv,.xlsx"
              onChange={(e) => {
                if (e.target.files) send(e.target.files);
                e.target.value = "";
              }}
            />
            <Button variant="outline" onClick={() => input.current?.click()} disabled={uploading}>
              {t("select")}
            </Button>
          </div>
          {demo && documents.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("demoSamples")}{" "}
              <Button variant="link" className="h-auto p-0 text-foreground underline underline-offset-4" onClick={loadSamples} disabled={uploading || fetchingSamples} data-testid="use-samples">
                {t("useSamples")}
              </Button>
            </p>
          )}
          {refused.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl border bg-card p-3 text-sm" data-testid="refused">
              <p className="font-medium">{t("refused")}</p>
              <ul className="flex flex-col gap-0.5">
                {refused.map((r) => (
                  <li key={r.filename} className="text-muted-foreground">
                    {r.filename} — {t(r.reason)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-lg font-semibold">{t("documents")}</h2>
          {mayChange && unreadable.length >= 2 && (
            <Button size="sm" variant="outline" onClick={() => setArchiving("unreadable")} disabled={uploading} data-testid="archive-unreadable">
              {t("archiveUnreadable", { count: unreadable.length })}
            </Button>
          )}
        </div>
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as Tab);
            setSelected(new Set());
          }}
        >
          <TabsList variant="line" className="h-10! w-full justify-start gap-6 border-b">
            {(["inbox", "processing", "archive"] as const).map((k) => (
              <TabsTrigger key={k} value={k} data-testid={`inbox-tab-${k}`}>
                {ti(`tabs.${k}`)}
                <span className="text-muted-foreground tabular-nums">{(k === "inbox" ? inbox : k === "archive" ? archived : processing).length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="h-8 w-full sm:w-64">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ti("search")} aria-label={ti("search")} data-testid="inbox-search" />
          </InputGroup>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" data-testid="inbox-filters" />}>
              {filters > 0 ? ti("filtersCount", { count: filters }) : ti("filters")}
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{ti("filterStatus")}</DropdownMenuLabel>
                {(["read", "review", "failed"] as const).map((s) => (
                  <DropdownMenuCheckboxItem key={s} checked={statuses.includes(s)} onCheckedChange={() => setStatuses((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}>
                    {ti(`statusFilter.${s}`)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>{ti("filterKind")}</DropdownMenuLabel>
                {(["image", "pdf", "timeclock", "vms"] as const).map((k) => (
                  <DropdownMenuCheckboxItem key={k} checked={kinds.includes(k)} onCheckedChange={() => setKinds((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))}>
                    {ti(`kindFilter.${k}`)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
              {filters > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setStatuses([]);
                      setKinds([]);
                    }}
                  >
                    {ti("clearFilters")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" data-testid="inbox-columns" />}>
              {ti("display")}
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{ti("density")}</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={density} onValueChange={(v) => setDensityKept(v as "comfortable" | "compact")}>
                  <DropdownMenuRadioItem value="comfortable">{ti("comfortable")}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="compact">{ti("compact")}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto flex items-center gap-2">
            {picked.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="sm" data-testid="inbox-actions" />}>
                  {ti("actions", { count: picked.length })}
                  <ChevronDownIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportCsv(picked)}>{ti("exportSelected")}</DropdownMenuItem>
                  {mayChange && picked.some(failed) && (
                    <>
                      <DropdownMenuItem onClick={() => readAgain(picked)} data-testid="bulk-read-again">
                        {ti("readAgain")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setArchiving(picked.filter(failed))} data-testid="bulk-archive">
                        {ti("archiveSelected")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="outline" size="sm" onClick={() => exportCsv(shown)} disabled={shown.length === 0} data-testid="inbox-export">
              {ti("export")}
            </Button>
          </div>
        </div>

        {tab === "processing" ? (
          processing.length > 0 ? (
            <section className="flex flex-col gap-2" data-testid="processing">
              <p className="text-sm text-muted-foreground">{t("processingBody", { count: processing.length })}</p>
              <ul className="flex flex-col gap-1">
                {processing.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-sm">
                    <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                    {d.filename}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <EmptyState icon={FileTextIcon} title={ti("emptyProcessing")} className="min-h-0 py-12" />
          )
        ) : shown.length === 0 ? (
          tabDocs.length > 0 ? (
            <EmptyState
              kind="filtered"
              icon={SearchIcon}
              title={ti("noMatch")}
              className="min-h-0 py-12"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setStatuses([]);
                    setKinds([]);
                  }}
                >
                  {ti("clearFilters")}
                </Button>
              }
            />
          ) : (
            <EmptyState icon={FileTextIcon} title={tab === "archive" ? ti("emptyArchive") : t("empty")} className="min-h-0 py-12" />
          )
        ) : (
          <div className="min-w-0">
            <Table aria-label={t("documents")}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox checked={allPicked} indeterminate={picked.length > 0 && !allPicked} onCheckedChange={() => setSelected(allPicked ? new Set() : new Set(shown.map((d) => d.id)))} aria-label={ti("selectAll")} data-testid="select-all" />
                  </TableHead>
                  <TableHead>{t("colFile")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead>{ti("cols.via")}</TableHead>
                  <TableHead>{ti("cols.received")}</TableHead>
                  <TableHead>{t("colClient")}</TableHead>
                  <TableHead>{t("colKind")}</TableHead>
                  <TableHead className="text-right">{t("colEntries")}</TableHead>
                  <TableHead className="text-right">{t("colReview")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((d) => {
                  const unmapped = readError(d.error)?.key === "unmapped" && /\.(csv|xlsx)$/i.test(d.filename);
                  return (
                    <TableRow
                      key={d.id}
                      data-testid="document-row"
                      data-state={selected.has(d.id) ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={(e) => {
                        // A click inside a button, link or the checkbox is that control's own.
                        if ((e.target as HTMLElement).closest("button,a,input,label,[role=checkbox]")) return;
                        router.push(`/documents/${d.id}`);
                      }}
                    >
                      <TableCell className={rowPad} onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(d.id)} onClick={(e) => toggle(d.id, e.shiftKey)} aria-label={ti("selectRow", { file: d.filename })} />
                      </TableCell>
                      <TableCell className={cn("max-w-64 font-medium", rowPad)}>
                        <Tip label={d.filename}>
                          <Link href={`/documents/${d.id}`} className="block truncate rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">
                            {d.filename}
                          </Link>
                        </Tip>
                      </TableCell>
                      <TableCell className={rowPad}>
                        {failed(d) ? (
                          <div className="flex flex-col gap-1">
                            <Status tone="critical" data-testid="document-status">
                              {t("status.failed")}
                            </Status>
                            {(d.stuck || d.error) && <span className="max-w-80 text-xs whitespace-normal text-muted-foreground">{d.stuck ? t("stuck") : said(d.error)}</span>}
                            {mayChange && (
                              <div className="flex gap-3">
                                {unmapped && (
                                  <Button variant="link" size="sm" className="h-auto justify-start px-0" onClick={() => setMapping(d)} data-testid="map-this-file">
                                    {ti("mapThisFile")}
                                  </Button>
                                )}
                                <Button variant="link" size="sm" className="h-auto justify-start px-0" onClick={() => run(() => retryAction(d.id))}>
                                  {tcommon("retry")}
                                </Button>
                                <Button variant="link" size="sm" className="h-auto justify-start px-0" onClick={() => setArchiving(d)} data-testid="archive">
                                  {t("archive")}
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          // Read is done (or has values to review); archived has ended (_components/status.md).
                          <Status tone={d.status === "archived" ? "neutral" : d.needsReview > 0 ? "warning" : "success"} data-testid="document-status">
                            {t(`status.${d.status}`)}
                          </Status>
                        )}
                      </TableCell>
                      <TableCell className={cn("text-muted-foreground", rowPad)}>{ti(`via.${d.receivedVia}`)}</TableCell>
                      <TableCell className={cn("whitespace-nowrap text-muted-foreground tabular-nums", rowPad)}>{when(d.receivedAt)}</TableCell>
                      <TableCell className={rowPad}>{d.clientName ?? "—"}</TableCell>
                      <TableCell className={rowPad}>{t(`kind.${d.kind}`)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", rowPad)}>{d.entries}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", rowPad)}>{d.needsReview}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow data-testid="inbox-totals">
                  <TableCell />
                  <TableCell colSpan={6} className="text-muted-foreground">
                    {ti("totals", { docs: totals.docs, entries: totals.entries })}
                  </TableCell>
                  <TableCell colSpan={2} className="text-right tabular-nums">
                    {ti("totalHours", { hours: hoursMinutes(totals.minutes) })}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </section>

      <Dialog open={archiving !== null} onOpenChange={(open) => !open && setArchiving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{archiveTargets.length > 1 ? t("archiveAllTitle", { count: archiveTargets.length }) : t("archiveTitle")}</DialogTitle>
            <DialogDescription>{t("archiveBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="archive-reason">{t("archiveReason")}</Label>
            <Textarea id="archive-reason" value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiving(null)}>
              {tcommon("cancel")}
            </Button>
            <Button
              disabled={uploading || archiveReason.trim() === ""}
              data-testid="confirm-archive"
              onClick={() => {
                const targets = archiveTargets;
                const reason = archiveReason;
                if (targets.length === 0) return;
                setArchiving(null);
                setArchiveReason("");
                setSelected(new Set());
                // Each through the same archive as one at a time; the first refusal stops the rest.
                run(async () => {
                  for (const doc of targets) {
                    const r = await archiveAction(doc.id, reason);
                    if ("error" in r) return r;
                  }
                  return { ok: true as const };
                });
              }}
              loading={uploading}
              loadingLabel={tcommon("loading")}
            >
              {t("archiveConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MapFileDialog documentId={mapping?.id ?? null} filename={mapping?.filename ?? ""} onClose={() => setMapping(null)} />
    </div>
  );
}
