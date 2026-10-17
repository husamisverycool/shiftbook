"use client";

/**
 * Review totals — docs/patterns/convert.md step 4 (Gusto review step): the approval (Approve in the
 * heading row; once approved, who and when with Unapprove — Rise, Check), warnings acknowledged by
 * approving, the Summary figures, then tabs of tables with a totals footer, 25 rows per page.
 * Blocking problems are on the Exceptions step; a blocked run never reaches this step.
 * A correction's review shows was / now / difference per worker and per client (slice e).
 */
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { unapproveRunAction } from "@/app/[locale]/(app)/convert/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import type { Say } from "@shiftbook/rules";
import type { Spoken } from "@/lib/engine-say";
import { useEngineSay } from "../engine-say";
import { hoursMinutes, money, signedHours, signedMoney } from "../format";
import { useDateTime } from "../agency-zone";

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
    issues: { message: string; say?: Say | null; workerId?: string; workerName?: string; entryIds?: string[]; grossCents?: number; heldCents?: number; clientId?: string; clientName?: string }[];
    workerIds: string[];
    workerNames: string[];
  }[];
  warnings: TotalsData["blockers"];
  skipped: { workerId: string; name: string; reason: string; by: string }[];
  /** Who approved the run and when (slice e), while it stays approved. */
  approval: { by: string; at: Date } | null;
  canApprove: boolean;
  /** A correction: its differences against the paid version it corrects (slice e). */
  correction: CorrectionData | null;
}

export interface CorrectionData {
  version: number;
  baseVersion: number;
  reason: string;
  workers: { workerId: string; name: string; wasCents: number; nowCents: number; diffCents: number; regular: number; overtime: number; double: number }[];
  clients: { clientId: string; name: string; wasCents: number; nowCents: number; diffCents: number; minutes: number }[];
  decisions: { id: string; workerId: string; name: string; decision: string; differenceCents: number; note: string; by: string; fits: boolean }[];
  summary: { workers: number; regular: number; overtime: number; double: number; payDiffCents: number; billDiffCents: number };
  noSkip: string[];
  /** Skipped in the version it corrects (paid separately): they cannot be brought back. */
  noBringBack: string[];
}

export function TotalsReview({ periodId, data, locked }: { periodId: string; data: TotalsData; locked: boolean }) {
  const t = useTranslations("convert.totals");
  const ta = useTranslations("convert.approval");
  const tx = useTranslations("convert");
  const locale = useLocale();
  const dateTime = useDateTime();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [unapproving, setUnapproving] = useState(false);
  const [reason, setReason] = useState("");
  const skipped = new Set(data.skipped.map((s) => s.workerId));
  const warningCount = data.warnings.reduce((sum, w) => sum + w.issues.length, 0);

  const unapprove = () =>
    start(async () => {
      const r = await unapproveRunAction(periodId, reason);
      if (r.ok) {
        toast.success(ta("unapproved"));
        setUnapproving(false);
        setReason("");
      } else {
        const key = { not_allowed: "errors.notAllowed", reason_required: "errors.generic", period_locked: "errors.periodLocked", busy: "errors.busy", generic: "errors.generic" } as const;
        toast.error(tx(key[r.error]));
      }
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      {data.approval ? (
        <Alert data-testid="approval">
          <CircleCheckIcon />
          <AlertTitle>{ta("approvedTitle", { name: data.approval.by, when: dateTime(data.approval.at) })}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>{ta("approvedBody")}</p>
            {!locked && data.canApprove && (
              <Button size="sm" variant="outline" className="w-fit" onClick={() => setUnapproving(true)} data-testid="unapprove">
                {ta("unapprove")}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        !locked &&
        (!data.canApprove ? (
          <Alert>
            <InfoIcon />
            <AlertTitle>{ta("ownerOnly")}</AlertTitle>
          </Alert>
        ) : (
          warningCount > 0 && <p className="text-sm text-muted-foreground">{ta("warningsAck", { count: warningCount })}</p>
        ))
      )}
      {(data.skipped.length > 0 || data.warnings.some((w) => !dismissed.has(w.code))) && (
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
          {data.skipped.length > 0 && (
            <Alert>
              <InfoIcon />
              <AlertTitle>{t("skippedTitle", { count: data.skipped.length })}</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                {[...new Set(data.skipped.map((s) => s.reason))].map((why) => (
                  <div key={why} className="flex flex-col gap-1">
                    <p className="text-foreground">{why}</p>
                    <p>
                      {data.skipped
                        .filter((s) => s.reason === why)
                        .map((s) => s.name)
                        .join(", ")}
                    </p>
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {data.correction ? (
        <CorrectionTotals c={data.correction} />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t("summaryTitle")}</h2>
            <div className="min-w-0">
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
            <TabsList variant="line" className="h-10! w-full justify-start border-b">
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
        </>
      )}

      <Dialog open={unapproving} onOpenChange={setUnapproving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ta("unapproveTitle")}</DialogTitle>
            <DialogDescription>{ta("unapproveBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="unapprove-reason">{ta("reason")}</Label>
            <Textarea id="unapprove-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnapproving(false)}>
              {ta("cancel")}
            </Button>
            <Button onClick={unapprove} disabled={pending || reason.trim() === ""} data-testid="confirm-unapprove">
              {ta("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A correction's figures: the differences, and was / now / difference per worker and client. */
function CorrectionTotals({ c }: { c: CorrectionData }) {
  const t = useTranslations("convert.totals");
  const tr = useTranslations("convert.correction");
  const locale = useLocale();
  const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((total, r) => total + f(r), 0);
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("summaryTitle")}</h2>
        <div className="min-w-0">
          <Table aria-label={t("summaryTitle")} data-testid="summary">
            <TableHeader>
              <TableRow>
                <TableHead>{tr("summaryWorkers")}</TableHead>
                <TableHead className="text-right">{tr("summaryRegular")}</TableHead>
                <TableHead className="text-right">{tr("summaryOvertime")}</TableHead>
                <TableHead className="text-right">{tr("summaryPay")}</TableHead>
                <TableHead className="text-right">{tr("summaryBill")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="tabular-nums">{c.summary.workers}</TableCell>
                <TableCell className="text-right tabular-nums">{signedHours(c.summary.regular)}</TableCell>
                <TableCell className="text-right tabular-nums">{signedHours(c.summary.overtime + c.summary.double)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{signedMoney(c.summary.payDiffCents, locale)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{signedMoney(c.summary.billDiffCents, locale)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      <Tabs defaultValue="pay">
        <TabsList variant="line" className="h-10! w-full justify-start border-b">
          <TabsTrigger value="hours">{t("tabHours")}</TabsTrigger>
          <TabsTrigger value="pay">{t("tabPay")}</TabsTrigger>
          <TabsTrigger value="billing">{t("tabBilling")}</TabsTrigger>
        </TabsList>
        <TabsContent value="hours">
          <Paged
            rows={c.workers}
            head={[t("colWorker"), t("colRegular"), t("colOvertime"), t("colDouble"), t("colTotal")]}
            row={(w) => [<span key="n" className="font-medium">{w.name}</span>, signedHours(w.regular), signedHours(w.overtime), signedHours(w.double), signedHours(w.regular + w.overtime + w.double)]}
            foot={[t("totalsRow"), signedHours(c.summary.regular), signedHours(c.summary.overtime), signedHours(c.summary.double), signedHours(c.summary.regular + c.summary.overtime + c.summary.double)]}
          />
        </TabsContent>
        <TabsContent value="pay">
          <Paged
            rows={c.workers}
            head={[t("colWorker"), tr("colWas"), tr("colNow"), tr("colDifference")]}
            row={(w) => [<span key="n" className="font-medium">{w.name}</span>, money(w.wasCents, locale), money(w.nowCents, locale), signedMoney(w.diffCents, locale)]}
            foot={[t("totalsRow"), money(sum(c.workers, (w) => w.wasCents), locale), money(sum(c.workers, (w) => w.nowCents), locale), signedMoney(c.summary.payDiffCents, locale)]}
          />
        </TabsContent>
        <TabsContent value="billing">
          <Paged
            rows={c.clients}
            head={[t("colClient"), t("colHoursBilled"), tr("colWas"), tr("colNow"), tr("colDifference")]}
            row={(r) => [<span key="n" className="font-medium">{r.name}</span>, signedHours(r.minutes), money(r.wasCents, locale), money(r.nowCents, locale), signedMoney(r.diffCents, locale)]}
            foot={[t("totalsRow"), signedHours(sum(c.clients, (r) => r.minutes)), money(sum(c.clients, (r) => r.wasCents), locale), money(sum(c.clients, (r) => r.nowCents), locale), signedMoney(c.summary.billDiffCents, locale)]}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Issues({ issues }: { issues: Spoken[] }) {
  const [all, setAll] = useState(false);
  // The engine's messages in the reader's language (decision 0030); the English is the record.
  const say = useEngineSay();
  const shown = all ? issues : issues.slice(0, 5);
  return (
    <ul className="list-disc pl-4">
      {shown.map((i, n) => (
        <li key={n}>{say(i)}</li>
      ))}
      {issues.length > shown.length && (
        <li className="list-none">
          <button type="button" className="underline underline-offset-4 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" onClick={() => setAll(true)}>
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
      <div className="min-w-0">
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
