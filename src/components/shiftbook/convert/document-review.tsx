"use client";

/**
 * One timesheet with every value read from it — docs/patterns/documents/[documentId].md (Rossum's
 * validation screen; Dext's item details): the status messages, the document toolbar, the issues
 * that stop it being confirmed, then the document (page images with a box over every value, or the
 * file's rows) beside its data (header fields, then one line per worker-day), with Details and
 * History tabs, and Confirm with Reject below it. Clicking a value highlights where it came from;
 * Enter goes to the next value to review; Ctrl/⌘+J and Ctrl/⌘+K go to the previous and next document.
 */
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, CircleDotIcon, MinusIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { approveAction, editAction, rejectAction } from "@/app/[locale]/(app)/convert/actions";
import { learnNicknameAction, nicknameSuggestionAction } from "@/app/[locale]/(app)/convert/inbox-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { readError } from "@/lib/read-errors";
import { cn } from "@/lib/utils";
import type { DocumentReview } from "@/server/convert/document-review";
import type { EntryChange } from "@/server/review/service";
import { useCan } from "../abilities";
import { useDateTime } from "../agency-zone";
import { Collapse, TURNING } from "../collapse";
import { clock, hoursMinutes, shortDate } from "../format";
import { Crumbs, Page, PageHeader } from "../page";
import { Status } from "../status";
import { Tip } from "../tip";

const FIELDS = ["worker", "date", "in", "out", "break", "total"] as const;
type Field = (typeof FIELDS)[number];
const REASONS = ["misread_corrected", "confirmed_client", "confirmed_worker", "matched_worker", "other"] as const;
const KNOWN_REASONS = ["worker_not_on_roster", "worker_ambiguous", "no_active_assignment", "several_active_assignments", "date_outside_period", "in_after_out", "crosses_midnight", "break_longer_than_shift", "total_mismatch", "over_24_hours", "unreadable", "passes_disagree", "handwriting_not_confirmed", "seen_by_one_pass", "inconsistent_reading", "row_total_mismatch", "grand_total_mismatch", "duplicate_day_in_vms", "assignment_at_other_client", "timesheet_client_unclear", "worker_app", "worker_app_too_long", "worker_app_not_allowed"];
type Row = DocumentReview["rows"][number];
type Pick = { rowId: string; field: Field };

const minutesOf = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (minute: number | null) => (minute === null ? "" : `${String(Math.floor((minute % 1440) / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);

export function DocumentReviewView({ review }: { review: DocumentReview }) {
  const t = useTranslations("documentReview");
  const th = useTranslations("convert.hours");
  const tu = useTranslations("convert.upload");
  const tc = useTranslations("common");
  const locale = useLocale();
  const when = useDateTime();
  const router = useRouter();
  const mayChange = useCan()("hours");
  const { doc, rows } = review;
  const [zoom, setZoom] = useState(1);
  const [pick, setPick] = useState<Pick | null>(null);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [value, setValue] = useState("");
  const [nickname, setNickname] = useState<{ entryId: string; nickname: string; givenName: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(true);
  const [pending, start] = useTransition();
  const cells = useRef(new Map<string, HTMLButtonElement>());
  const fileRows = useRef(new Map<number, HTMLTableRowElement>());

  const field = (r: Row, f: Field) => r.fields[f];
  const blocks = (r: Row, f: Field) => r.status === "needs_review" && ((field(r, f)?.checks.length ?? 0) > 0 || (f === "worker" && r.workerId === null));
  const checked = (r: Row, f: Field) => r.status === "reviewed" || r.status === "client_approved" || r.status === "locked" || field(r, f)?.edited === true;
  const toReview = rows.filter((r) => r.status === "needs_review");
  const order = useMemo(() => rows.flatMap((r) => FIELDS.map((f) => ({ rowId: r.id, field: f }))), [rows]);
  const picked = pick ? rows.find((r) => r.id === pick.rowId) ?? null : null;
  const pickedField = picked && pick ? field(picked, pick.field) : undefined;
  const isImage = doc.kind === "image" || doc.kind === "pdf";
  const pages = isImage ? Array.from({ length: Math.max(1, doc.pageCount ?? 1) }, (_, i) => i + 1) : [];
  const boxes = rows.flatMap((r) => FIELDS.flatMap((f) => (field(r, f)?.box && field(r, f)?.page ? [{ rowId: r.id, field: f, page: field(r, f)!.page!, box: field(r, f)!.box!, state: blocks(r, f) ? "stops" : checked(r, f) ? "checked" : "read" }] : [])));
  const label = (f: Field) => (f === "total" ? th("colHours") : th(`col${f[0]!.toUpperCase()}${f.slice(1)}` as "colWorker"));
  const valueText = (r: Row, f: Field) => {
    if (f === "worker") return r.workerName;
    if (f === "date") return r.workDate ? shortDate(r.workDate, locale) : "—";
    if (f === "in") return clock(r.inMinute, locale);
    if (f === "out") return clock(r.outMinute, locale);
    if (f === "break") return r.breakMinutes === null ? "—" : String(r.breakMinutes);
    return hoursMinutes(r.minutes);
  };
  const reasonText = (code: string, r: Row) => {
    const [base, f] = code.split(":");
    if ((base === "assignment_at_other_client" || base === "timesheet_client_unclear") && r.otherClient) return th(`reasons.${base}_named`, { client: r.otherClient.name });
    const text = th(`reasons.${KNOWN_REASONS.includes(base!) ? base : "other"}`);
    return f && (FIELDS as readonly string[]).includes(f) ? th("reasonWithField", { reason: text, field: th(`fields.${f}`) }) : text;
  };

  const choose = (p: Pick) => {
    setPick(p);
    setEditing(false);
  };
  // The chosen value's cell takes focus, wherever it was chosen from (the image, the issues, Enter).
  useEffect(() => {
    if (pick) cells.current.get(`${pick.rowId}:${pick.field}`)?.focus();
  }, [pick]);
  // Enter: the next value that still needs review (Rossum).
  const nextToReview = (from: Pick | null) => {
    const start = from ? order.findIndex((o) => o.rowId === from.rowId && o.field === from.field) + 1 : 0;
    const rest = [...order.slice(start), ...order.slice(0, start)];
    return rest.find((o) => {
      const r = rows.find((x) => x.id === o.rowId)!;
      return blocks(r, o.field);
    });
  };

  // The source row of a time file follows the chosen value.
  useEffect(() => {
    const n = pickedField?.source?.row;
    if (n) fileRows.current.get(n)?.scrollIntoView({ block: "nearest" });
  }, [pickedField]);

  // Ctrl/⌘+J previous, Ctrl/⌘+K next document (Dext); the menu's own ⌘K yields to this page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const to = key === "j" ? review.previousId : key === "k" ? review.nextId : null;
      if (key !== "j" && key !== "k") return;
      e.preventDefault();
      e.stopPropagation();
      if (to) router.push(`/documents/${to}`);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [review.previousId, review.nextId, router]);

  const openEdit = () => {
    if (!picked || !pick) return;
    const f = pick.field;
    setValue(f === "worker" ? (picked.workerId ?? "") : f === "date" ? (picked.workDate ?? "") : f === "in" ? hhmm(picked.inMinute) : f === "out" ? hhmm(picked.outMinute) : f === "break" ? String(picked.breakMinutes ?? "") : String(picked.minutes ?? ""));
    setReason(f === "worker" ? "matched_worker" : "misread_corrected");
    setNote("");
    setEditing(true);
  };
  const saveEdit = () =>
    start(async () => {
      if (!picked || !pick) return;
      const f = pick.field;
      const num = (v: string) => (v.trim() === "" ? null : Number.isInteger(Number(v)) ? Number(v) : NaN);
      const change: EntryChange =
        f === "worker"
          ? { workerId: value || null }
          : f === "date"
            ? { workDate: value }
            : f === "in"
              ? { inMinute: minutesOf(value) }
              : f === "out"
                ? { outMinute: (() => {
                    const m = minutesOf(value);
                    return m !== null && picked.inMinute !== null && m <= picked.inMinute ? m + 1440 : m;
                  })() }
                : f === "break"
                  ? { breakMinutes: num(value) }
                  : { minutes: num(value) };
      if (Object.values(change).some((v) => typeof v === "number" && Number.isNaN(v))) return void toast.error(th("editErrors.invalid_value"));
      const r = await editAction(picked.id, change, reason ? [reason] : [], note);
      if (!r.ok) return void toast.error(th(`editErrors.${r.error}`, { client: "", count: 1 }));
      setEditing(false);
      toast.success(t("saved"));
      if (f === "worker") {
        const s = await nicknameSuggestionAction(picked.id);
        if (s) setNickname({ entryId: picked.id, ...s });
      }
      router.refresh();
    });
  const confirm = () =>
    start(async () => {
      const ids = rows.filter((r) => r.status === "needs_review" || r.status === "extracted").map((r) => r.id);
      if (ids.length > 0) {
        const r = await approveAction(ids, false);
        if ("error" in r) return void toast.error(t("refused"));
        if (r.skipped > 0) return void toast.error(t("stillToReview", { count: r.skipped }));
      }
      toast.success(t("confirmed"));
      // After Confirm, the next document that needs review (Rossum); otherwise back to the inbox.
      router.push(review.nextToReviewId ? `/documents/${review.nextToReviewId}` : `/convert?period=${doc.period.id}&step=upload`);
    });
  const reject = () =>
    start(async () => {
      for (const r of rows.filter((x) => x.status !== "rejected" && x.status !== "locked" && x.status !== "client_approved")) {
        const done = await rejectAction(r.id);
        if ("error" in done) return void toast.error(t("refused"));
      }
      setRejecting(false);
      toast.success(t("rejected"));
      router.refresh();
    });

  const failedWhy = doc.status === "failed" ? readError(doc.error) : null;
  const allDone = rows.length > 0 && rows.every((r) => r.status !== "needs_review" && r.status !== "extracted");

  return (
    <Page width="wide" className="gap-5" data-testid="document-review">
      <PageHeader
        context={<Crumbs label={tc("breadcrumb")} items={[{ label: t("inbox", { start: shortDate(doc.period.startsOn, locale), end: shortDate(doc.period.endsOn, locale) }), href: `/convert?period=${doc.period.id}&step=upload` }]} />}
        title={doc.filename}
        titleTestId="document-title"
        status={<Status tone={doc.status === "failed" ? "critical" : toReview.length > 0 ? "warning" : doc.status === "archived" ? "neutral" : "success"}>{doc.status === "read" && toReview.length > 0 ? t("toReview") : tu(`status.${doc.status}`)}</Status>}
        description={[tu(`kind.${doc.kind}`), doc.clientName ?? t("noClient"), t("received", { via: t(`via.${doc.receivedVia}`), at: when(doc.receivedAt) }), t("lines", { count: rows.length })].join(" · ")}
        actions={
          <div className="flex items-center gap-1">
            <Tip label={t("previous")}>
              <Button variant="outline" size="icon-sm" aria-label={t("previous")} disabled={!review.previousId} onClick={() => review.previousId && router.push(`/documents/${review.previousId}`)} data-testid="previous-document">
                <ChevronLeftIcon />
              </Button>
            </Tip>
            <Tip label={t("next")}>
              <Button variant="outline" size="icon-sm" aria-label={t("next")} disabled={!review.nextId} onClick={() => review.nextId && router.push(`/documents/${review.nextId}`)} data-testid="next-document">
                <ChevronRightIcon />
              </Button>
            </Tip>
          </div>
        }
      />

      {/* Status messages (Dext). */}
      {doc.status === "failed" && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t("failedTitle")}</AlertTitle>
          <AlertDescription>{failedWhy ? (failedWhy.key === "noRecording" ? tu("noRecording") : tu(`readErrors.${failedWhy.key}`, failedWhy.values ?? {})) : doc.error}</AlertDescription>
        </Alert>
      )}
      {toReview.length > 0 && (
        <Alert data-testid="review-message">
          <CircleDotIcon />
          <AlertTitle>{t("valuesToReview", { count: toReview.length })}</AlertTitle>
        </Alert>
      )}

      {/* Issues that stop confirmation (Dext "Please resolve these issues"; Rossum's blocker list, expandable). */}
      {toReview.length > 0 && (
        <section className="rounded-lg border" data-testid="issues">
          <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium transition-colors outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset" aria-expanded={issuesOpen} onClick={() => setIssuesOpen((o) => !o)}>
            <ChevronRightIcon className={cn("size-4", TURNING, issuesOpen && "rotate-90")} aria-hidden />
            {t("issues", { count: toReview.length })}
          </button>
          <Collapse open={issuesOpen}>
            <ul className="flex flex-col divide-y border-t">
              {toReview.map((r) => (
                <li key={r.id}>
                  <button type="button" className="flex w-full flex-wrap gap-x-3 px-4 py-2 text-left text-sm transition-colors outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset" onClick={() => choose({ rowId: r.id, field: (FIELDS.find((f) => blocks(r, f)) ?? "worker") as Field })}>
                    <span className="font-medium">{r.workerName}</span>
                    <span className="text-muted-foreground">{r.workDate ? shortDate(r.workDate, locale) : "—"}</span>
                    <span>{(r.reviewReasons.length > 0 ? r.reviewReasons : ["other"]).map((c) => reasonText(c, r)).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Collapse>
        </section>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Document pane (Dext: the image on the left). */}
        <section aria-label={t("documentPane")} className="flex min-w-0 flex-col gap-3">
          {isImage ? (
            <>
              <div className="flex items-center gap-1">
                <Button size="icon-sm" variant="outline" aria-label={th("zoomOut")} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
                  <MinusIcon />
                </Button>
                <Button size="icon-sm" variant="outline" aria-label={th("zoomIn")} onClick={() => setZoom((z) => Math.min(4, z + 0.5))}>
                  <PlusIcon />
                </Button>
                <Button size="icon-sm" variant="outline" aria-label={th("zoomReset")} onClick={() => setZoom(1)}>
                  <RotateCcwIcon />
                </Button>
              </div>
              <div className="max-h-[75svh] overflow-auto rounded-lg border bg-muted/30" data-testid="document-pages">
                {doc.status === "failed" || doc.pageCount === null ? (
                  <p className="p-6 text-sm text-muted-foreground">{th("noImage")}</p>
                ) : (
                  pages.map((page) => (
                    <div key={page} className="relative" style={{ width: `${zoom * 100}%` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- a stored page image served by the app, sized by its container */}
                      <img src={`/api/documents/${doc.id}/pages/${page}`} alt={th("sourcePage", { page })} className="block w-full" />
                      {boxes
                        .filter((b) => b.page === page)
                        .map((b) => {
                          const on = pick?.rowId === b.rowId && pick.field === b.field;
                          return (
                            <button
                              type="button"
                              key={`${b.rowId}:${b.field}`}
                              aria-label={`${label(b.field)} · ${rows.find((r) => r.id === b.rowId)?.workerName ?? ""}`}
                              data-testid={on ? "box-highlighted" : "box"}
                              onClick={() => choose({ rowId: b.rowId, field: b.field })}
                              className={cn(
                                "absolute rounded-sm border-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                b.state === "stops" ? "border-destructive/70 bg-destructive/10" : b.state === "checked" ? "border-emerald-600/70 bg-emerald-600/10" : "border-sky-600/60 bg-sky-600/5",
                                on && "border-foreground bg-foreground/15 ring-2 ring-foreground",
                              )}
                              style={{ left: `${b.box.x / 10}%`, top: `${b.box.y / 10}%`, width: `${b.box.w / 10}%`, height: `${b.box.h / 10}%` }}
                            />
                          );
                        })}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : review.file ? (
            <div className="max-h-[75svh] overflow-auto rounded-lg border" data-testid="document-file">
              <Table aria-label={t("fileRows")}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-muted-foreground">#</TableHead>
                    {review.file.header.map((h, i) => (
                      <TableHead key={i} className={cn(pickedField?.source?.column === h && "text-foreground")}>
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {review.file.rows.map((r) => (
                    <TableRow
                      key={r.n}
                      ref={(el) => {
                        if (el) fileRows.current.set(r.n, el);
                      }}
                      data-state={pickedField?.source?.row === r.n ? "selected" : undefined}
                      data-testid={pickedField?.source?.row === r.n ? "file-row-highlighted" : undefined}
                    >
                      <TableCell className="text-muted-foreground tabular-nums">{r.n}</TableCell>
                      {r.values.map((v, i) => (
                        <TableCell key={i} className={cn("whitespace-nowrap", pickedField?.source?.row === r.n && pickedField.source.column === review.file!.header[i] && "font-semibold ring-2 ring-foreground ring-inset")}>
                          {v}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="rounded-lg border p-6 text-sm text-muted-foreground">{th("noImageNoRow")}</p>
          )}
        </section>

        {/* Data pane (Rossum: header fields, then line items; Dext: Details · History). */}
        <section aria-label={t("dataPane")} className="flex min-w-0 flex-col gap-4">
          <Tabs defaultValue="details">
            <TabsList variant="line" className="h-10! w-full justify-start gap-6 border-b">
              <TabsTrigger value="details">{t("details")}</TabsTrigger>
              <TabsTrigger value="history" data-testid="history-tab">
                {t("history")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="flex flex-col gap-5 pt-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t("client")}</dt>
                  <dd>{doc.clientName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("period")}</dt>
                  <dd>{`${shortDate(doc.period.startsOn, locale)} – ${shortDate(doc.period.endsOn, locale)}`}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("kind")}</dt>
                  <dd>{tu(`kind.${doc.kind}`)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("totalHours")}</dt>
                  <dd className="tabular-nums">{hoursMinutes(rows.filter((r) => r.status !== "rejected").reduce((n, r) => n + (r.minutes ?? 0), 0))}</dd>
                </div>
              </dl>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noLines")}</p>
              ) : (
                <div className="min-w-0 overflow-x-auto">
                  <Table aria-label={t("lines", { count: rows.length })}>
                    <TableHeader>
                      <TableRow>
                        {FIELDS.map((f) => (
                          <TableHead key={f} className={cn(f === "total" && "text-right")}>
                            {label(f)}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id} data-testid="review-line" className={cn(r.status === "rejected" && "text-muted-foreground line-through")}>
                          {FIELDS.map((f) => {
                            const on = pick?.rowId === r.id && pick.field === f;
                            const stop = blocks(r, f);
                            return (
                              <TableCell key={f} className={cn("p-1", f === "total" && "text-right")}>
                                <button
                                  type="button"
                                  ref={(el) => {
                                    if (el) cells.current.set(`${r.id}:${f}`, el);
                                  }}
                                  data-testid={`value-${f}`}
                                  data-review={stop ? "stops" : undefined}
                                  aria-pressed={on}
                                  onClick={() => choose({ rowId: r.id, field: f })}
                                  onKeyDown={(e) => {
                                    if (e.key !== "Enter") return;
                                    e.preventDefault();
                                    const next = nextToReview({ rowId: r.id, field: f });
                                    if (next) choose(next);
                                  }}
                                  className={cn(
                                    "inline-flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
                                    f === "total" && "justify-end tabular-nums",
                                    stop && "text-destructive",
                                    on && "bg-muted ring-1 ring-foreground",
                                  )}
                                >
                                  {valueText(r, f)}
                                  {checked(r, f) && <CheckIcon className="size-3 text-emerald-600" aria-label={t("checkedValue")} />}
                                </button>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Field details: both passes, the checks, and Correct (SPEC §7: a reason, audited). */}
              {picked && pick && (
                <div className="flex flex-col gap-3 rounded-lg border p-4 text-sm" data-testid="field-details">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-medium">{label(pick.field)}</span>
                    <span className="text-muted-foreground">
                      {picked.workerName} · {picked.workDate ? shortDate(picked.workDate, locale) : "—"}
                    </span>
                  </div>
                  {pickedField && (
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      {pickedField.passA !== null && (
                        <>
                          <dt className="text-muted-foreground">{t("passA")}</dt>
                          <dd>{pickedField.passA}</dd>
                        </>
                      )}
                      {pickedField.passB !== null && (
                        <>
                          <dt className="text-muted-foreground">{t("passB")}</dt>
                          <dd>{pickedField.passB}</dd>
                        </>
                      )}
                      {pickedField.source && (
                        <>
                          <dt className="text-muted-foreground">{t("source")}</dt>
                          <dd>{th("sourceRow", { row: pickedField.source.row })}</dd>
                        </>
                      )}
                      <dt className="text-muted-foreground">{t("confidence")}</dt>
                      <dd>{th(`confidence.${pickedField.confidence}`)}</dd>
                      {pickedField.checks.length > 0 && (
                        <>
                          <dt className="text-muted-foreground">{t("checks")}</dt>
                          <dd>{pickedField.checks.map((c) => reasonText(c, picked)).join(" · ")}</dd>
                        </>
                      )}
                    </dl>
                  )}
                  {mayChange && !editing && picked.status !== "locked" && picked.status !== "client_approved" && (
                    <div>
                      <Button size="sm" variant="outline" onClick={openEdit} data-testid="correct-value">
                        {t("correct")}
                      </Button>
                    </div>
                  )}
                  {editing && (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="review-value">{label(pick.field)}</Label>
                        {pick.field === "worker" ? (
                          <NativeSelect id="review-value" value={value} onChange={(e) => setValue(e.target.value)} data-testid="review-value">
                            <NativeSelectOption value="">{th("unmatched")}</NativeSelectOption>
                            {review.roster.map((w) => (
                              <NativeSelectOption key={w.id} value={w.id}>
                                {w.name}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        ) : (
                          <Input
                            id="review-value"
                            type={pick.field === "date" ? "date" : pick.field === "in" || pick.field === "out" ? "time" : "number"}
                            min={pick.field === "date" ? doc.period.startsOn : 0}
                            max={pick.field === "date" ? doc.period.endsOn : undefined}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            data-testid="review-value"
                          />
                        )}
                        {(pick.field === "break" || pick.field === "total") && <span className="text-xs text-muted-foreground">{t("inMinutes")}</span>}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="review-reason">{th("reasonLabel")}</Label>
                        <NativeSelect id="review-reason" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="review-reason">
                          {REASONS.map((r) => (
                            <NativeSelectOption key={r} value={r}>
                              {th(`editReasons.${r}`)}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="review-note">{th("note")}</Label>
                        <Textarea id="review-note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder={th("notePlaceholder")} />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveEdit} loading={pending} loadingLabel={tc("loading")} data-testid="save-value">
                          {th("saveEdit")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                          {th("cancelEdit")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* A match that teaches the nickname map (docs/patterns/settings/names.md). */}
              {nickname && (
                <Alert data-testid="nickname-prompt">
                  <AlertTitle>{t("rememberNickname", { nickname: nickname.nickname, given: nickname.givenName })}</AlertTitle>
                  <AlertDescription>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          start(async () => {
                            const r = await learnNicknameAction(nickname.entryId);
                            setNickname(null);
                            if (r.ok) toast.success(t("nicknameLearned", { nickname: nickname.nickname, given: nickname.givenName }));
                          })
                        }
                        data-testid="remember-nickname"
                      >
                        {t("remember")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setNickname(null)}>
                        {t("notNow")}
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
            <TabsContent value="history" className="pt-4">
              {review.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">{th("historyEmpty")}</p>
              ) : (
                <ol className="flex flex-col divide-y text-sm" data-testid="document-history">
                  {review.history.map((h) => (
                    <li key={h.id} className="flex flex-col gap-0.5 py-2">
                      <span>
                        <span className="font-medium">{h.actor}</span> · {t(`historyAction.${h.action === "create" || h.action === "update" || h.action === "delete" ? h.action : "other"}`)} · {h.entityType === "source_document" ? t("theDocument") : t("aLine")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {when(h.at)}
                        {h.reason ? ` · ${h.reason}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>
          </Tabs>

          {/* Action area (Rossum): Confirm, with Reject directly below. */}
          {mayChange && rows.length > 0 && (
            <div className="flex flex-col gap-2 border-t pt-4">
              <Button onClick={confirm} disabled={allDone} loading={pending} loadingLabel={tc("loading")} data-testid="confirm-document">
                {allDone ? t("allConfirmed") : t("confirm")}
              </Button>
              <Button variant="outline" onClick={() => setRejecting(true)} disabled={pending || rows.every((r) => r.status === "rejected")} data-testid="reject-document">
                {t("reject")}
              </Button>
              {toReview.length > 0 && (
                <Button
                  variant="link"
                  size="sm"
                  className="self-start px-0"
                  onClick={() => {
                    const next = nextToReview(pick);
                    if (next) choose(next);
                  }}
                >
                  {t("nextValue")}
                </Button>
              )}
            </div>
          )}
        </section>
      </div>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rejectTitle")}</DialogTitle>
            <DialogDescription>{t("rejectBody", { count: rows.length })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={reject} loading={pending} loadingLabel={tc("loading")} data-testid="confirm-reject">
              {t("reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        {t("shortcuts")} · <Link href={`/convert?period=${doc.period.id}&step=hours`} className="rounded-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">{t("openHours")}</Link>
      </p>
    </Page>
  );
}
