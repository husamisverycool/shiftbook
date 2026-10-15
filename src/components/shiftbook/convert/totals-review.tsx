"use client";

/**
 * Review totals — docs/patterns/convert.md step 3 (Gusto review step): alerts, one error alert per
 * blocker type (a blocker on workers offers to skip them for this run, Gusto "skip employee"),
 * the Summary figures, then tabs of tables with a totals footer, 25 rows per page.
 */
import { CircleAlertIcon, InfoIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { confirmDistinctAction, skipAction } from "@/app/[locale]/(app)/convert/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { hoursMinutes, money } from "../format";
import { REFUSAL_MESSAGE } from "./types";

const ENTRY_LEVEL = new Set(["entry_needs_review", "unmatched_entry", "entry_incomplete", "outside_period", "outside_assignment", "crosses_midnight", "possible_duplicate_day", "no_entries"]);
const DOCUMENT_LEVEL = new Set(["documents_pending", "document_failed"]);
const PAGE = 25;

export interface TotalsData {
  summary: { workers: number; regular: number; overtime: number; double: number; grossCents: number; billedCents: number };
  workers: { workerId: string; name: string; regular: number; overtime: number; double: number; grossCents: number }[];
  clients: { clientId: string; name: string; minutes: number; billedCents: number }[];
  blockers: {
    code: string;
    ruleCode: string | null;
    jurisdiction: string | null;
    ruleCodes: string[];
    issues: { message: string; workerName?: string; entryIds?: string[] }[];
    workerIds: string[];
    workerNames: string[];
  }[];
  warnings: { code: string; ruleCode: string | null; issues: { message: string }[] }[];
  skipped: { workerId: string; name: string; reason: string; by: string }[];
}

export function TotalsReview({ periodId, data, locked }: { periodId: string; data: TotalsData; locked: boolean }) {
  const t = useTranslations("convert.totals");
  const tc = useTranslations("common");
  const tx = useTranslations("convert");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [skipping, setSkipping] = useState<{ workerIds: string[] } | null>(null);
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [confirmReason, setConfirmReason] = useState("");
  const [reason, setReason] = useState("");
  const skipped = new Set(data.skipped.map((s) => s.workerId));

  const confirmSkip = () =>
    skipping &&
    start(async () => {
      const r = await skipAction(periodId, skipping.workerIds, true, reason);
      if ("error" in r) {
        toast.error(tx(`errors.${REFUSAL_MESSAGE[r.error]}`));
        setSkipping(null);
        router.refresh();
      } else if (r.ok) {
        setSkipping(null);
        setReason("");
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-6">
      {(data.blockers.length > 0 || data.skipped.length > 0 || data.warnings.some((w) => !dismissed.has(w.code))) && (
        <div className="flex flex-col gap-4">
          {data.warnings
            .filter((w) => !dismissed.has(w.code))
            .map((w) => (
              <Alert key={w.code}>
                <TriangleAlertIcon />
                <AlertTitle>{t(`blockers.${w.code}` as "blockers.allocation_order_assumed")}</AlertTitle>
                <AlertDescription>
                  <Issues issues={w.issues} />
                </AlertDescription>
                <Button size="icon-xs" variant="ghost" className="absolute top-2 right-2" aria-label={t("warningsTitle")} onClick={() => setDismissed(new Set([...dismissed, w.code]))}>
                  <XIcon />
                </Button>
              </Alert>
            ))}
          {data.blockers.map((b) => (
            <Alert key={`${b.code}|${b.ruleCode ?? ""}`} variant="destructive" data-testid="blocker">
              <CircleAlertIcon />
              <AlertTitle>
                {t(`blockers.${b.code}` as "blockers.invalid_input")}
                {b.workerIds.length > 0 && <span className="font-normal"> · {t("blockerCount", { count: b.workerIds.length })}</span>}
              </AlertTitle>
              <AlertDescription className="flex flex-col gap-2 text-foreground!">
                {b.ruleCodes.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <p>
                      {t("rulesLine", {
                        place: b.jurisdiction === "US" ? t("federal") : (b.jurisdiction ?? ""),
                        rules: b.ruleCodes.map((code) => (t.has(`rules.${code}`) ? t(`rules.${code}` as "rules.weekly_overtime") : code)).join(" · "),
                      })}
                    </p>
                    {b.workerNames.length > 0 && <p>{t("workersLine", { names: b.workerNames.join(", ") })}</p>}
                  </div>
                ) : b.code === "possible_duplicate_day" ? (
                  <ul className="flex flex-col gap-2">
                    {b.issues.map((i, n) => (
                      <li key={n} className="flex flex-col gap-1">
                        <span>{i.message}</span>
                        {!locked && i.entryIds && (
                          <Button size="sm" variant="outline" className="w-fit" onClick={() => setConfirming(i.entryIds!)} data-testid="both-real">
                            {t("bothReal")}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Issues issues={b.issues} />
                )}
                {!locked &&
                  (DOCUMENT_LEVEL.has(b.code) ? (
                    <Link href={{ pathname: "/convert", query: { period: periodId, step: "upload" } }} className={buttonVariants({ size: "sm", variant: "outline", className: "w-fit" })}>
                      {t("goToUpload")}
                    </Link>
                  ) : ENTRY_LEVEL.has(b.code) ? (
                    <Link href={{ pathname: "/convert", query: { period: periodId, step: "hours" } }} className={buttonVariants({ size: "sm", variant: "outline", className: "w-fit" })}>
                      {t("edit")}
                    </Link>
                  ) : (
                    b.workerIds.length > 0 && (
                      <Button size="sm" variant="outline" className="w-fit" onClick={() => setSkipping({ workerIds: b.workerIds })} data-testid="skip-workers">
                        {t("skipWorkers", { count: b.workerIds.length })}
                      </Button>
                    )
                  ))}
              </AlertDescription>
            </Alert>
          ))}
          {data.skipped.length > 0 && (
            <Alert>
              <InfoIcon />
              <AlertTitle>{t("skippedTitle", { count: data.skipped.length })}</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                {[...new Set(data.skipped.map((s) => s.reason))].map((why) => {
                  const people = data.skipped.filter((s) => s.reason === why);
                  return (
                    <div key={why} className="flex flex-col gap-1">
                      <p className="text-foreground">{why}</p>
                      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                        {people.map((s) => (
                          <span key={s.workerId} className="inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-xs">
                            {s.name}
                            {!locked && (
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                aria-label={`${t("unskip")}: ${s.name}`}
                                disabled={pending}
                                onClick={() =>
                                  start(async () => {
                                    await skipAction(periodId, [s.workerId], false, "brought back");
                                    router.refresh();
                                  })
                                }
                              >
                                <XIcon />
                              </Button>
                            )}
                          </span>
                        ))}
                        {!locked && people.length > 1 && (
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              start(async () => {
                                await skipAction(periodId, people.map((p) => p.workerId), false, "brought back");
                                router.refresh();
                              })
                            }
                          >
                            {t("bringBackAll")}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("summaryTitle")}</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table aria-label={t("summaryTitle")} data-testid="summary">
            <TableHeader>
              <TableRow>
                <TableHead>{t("colWorkers")}</TableHead>
                <TableHead className="text-right">{t("colRegular")}</TableHead>
                <TableHead className="text-right">{t("colOvertime")}</TableHead>
                <TableHead className="text-right">{t("colGross")}</TableHead>
                <TableHead className="text-right">{t("colBilled")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="tabular-nums">{data.summary.workers}</TableCell>
                <TableCell className="text-right tabular-nums">{hoursMinutes(data.summary.regular)}</TableCell>
                <TableCell className="text-right tabular-nums">{hoursMinutes(data.summary.overtime + data.summary.double)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{money(data.summary.grossCents, locale)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{money(data.summary.billedCents, locale)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      <Tabs defaultValue="hours">
        <TabsList>
          <TabsTrigger value="hours">{t("tabHours")}</TabsTrigger>
          <TabsTrigger value="pay">{t("tabPay")}</TabsTrigger>
          <TabsTrigger value="billing">{t("tabBilling")}</TabsTrigger>
        </TabsList>
        <TabsContent value="hours">
          <Paged
            rows={data.workers}
            head={[t("colWorker"), t("colRegular"), t("colOvertime"), t("colDouble"), t("colTotal")]}
            row={(w) => [
              <span key="n" className="inline-flex items-center gap-2 font-medium">
                {w.name}
                {skipped.has(w.workerId) && <Badge variant="outline">{t("skipped")}</Badge>}
              </span>,
              hoursMinutes(w.regular),
              hoursMinutes(w.overtime),
              hoursMinutes(w.double),
              hoursMinutes(w.regular + w.overtime + w.double),
            ]}
            foot={[t("totalsRow"), hoursMinutes(data.summary.regular), hoursMinutes(data.summary.overtime), hoursMinutes(data.summary.double), hoursMinutes(data.summary.regular + data.summary.overtime + data.summary.double)]}
          />
        </TabsContent>
        <TabsContent value="pay">
          <Paged rows={data.workers} head={[t("colWorker"), t("colGross")]} row={(w) => [<span key="n" className="font-medium">{w.name}</span>, money(w.grossCents, locale)]} foot={[t("totalsRow"), money(data.summary.grossCents, locale)]} />
        </TabsContent>
        <TabsContent value="billing">
          <Paged
            rows={data.clients}
            head={[t("colClient"), t("colHoursBilled"), t("colAmount")]}
            row={(c) => [<span key="n" className="font-medium">{c.name}</span>, hoursMinutes(c.minutes), money(c.billedCents, locale)]}
            foot={[t("totalsRow"), hoursMinutes(data.clients.reduce((s, c) => s + c.minutes, 0)), money(data.summary.billedCents, locale)]}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bothRealTitle")}</DialogTitle>
            <DialogDescription>{t("bothRealBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-reason">{t("skipReasonLabel")}</Label>
            <Textarea id="confirm-reason" value={confirmReason} onChange={(e) => setConfirmReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              {tc("cancel")}
            </Button>
            <Button
              disabled={pending || confirmReason.trim() === ""}
              data-testid="confirm-both-real"
              onClick={() =>
                confirming &&
                start(async () => {
                  const r = await confirmDistinctAction(confirming, confirmReason);
                  if ("error" in r) toast.error(tx(`errors.${REFUSAL_MESSAGE[r.error]}`));
                  setConfirming(null);
                  setConfirmReason("");
                  router.refresh();
                })
              }
            >
              {t("bothRealConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={skipping !== null} onOpenChange={(open) => !open && setSkipping(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("skipTitle")}</DialogTitle>
            <DialogDescription>{t("skipBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="skip-reason">{t("skipReasonLabel")}</Label>
            <Textarea id="skip-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipping(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={confirmSkip} disabled={pending || reason.trim() === ""} data-testid="confirm-skip">
              {t("skipConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Issues({ issues }: { issues: { message: string }[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? issues : issues.slice(0, 5);
  return (
    <ul className="list-disc pl-4">
      {shown.map((i, n) => (
        <li key={n}>{i.message}</li>
      ))}
      {issues.length > shown.length && (
        <li className="list-none">
          <button type="button" className="underline underline-offset-4" onClick={() => setAll(true)}>
            +{issues.length - shown.length}
          </button>
        </li>
      )}
    </ul>
  );
}

function Paged<T>({ rows, head, row, foot }: { rows: T[]; head: string[]; row: (r: T) => ReactNode[]; foot: ReactNode[] }) {
  const t = useTranslations("convert.totals");
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {head.map((h, i) => (
                <TableHead key={h} className={i > 0 ? "text-right" : undefined}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((r, n) => (
              <TableRow key={n}>
                {row(r).map((c, i) => (
                  <TableCell key={i} className={i > 0 ? "text-right tabular-nums" : undefined}>
                    {c}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              {foot.map((c, i) => (
                <TableCell key={i} className={i > 0 ? "text-right font-medium tabular-nums" : "font-medium"}>
                  {c}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">{t("page", { page: page + 1, pages })}</span>
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {t("previous")}
          </Button>
          <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
            {t("next")}
          </Button>
        </div>
      )}
    </div>
  );
}
