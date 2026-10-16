"use client";

/**
 * Exceptions — docs/patterns/convert.md step 3 (Gusto blocker list: a summary alert, then one row per
 * kind of problem with its title, its description and the action that fixes it at the right;
 * TempWorks proofing: all errors resolved to continue, checked again on return; Rise People and
 * Staffology: warnings never block). Skipped workers are listed with "bring back" as before.
 * In a correction (slice e), a worker's difference the payroll file cannot carry is settled by a
 * recorded decision instead of a skip, and a correction with nothing to correct can be discarded.
 */
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { confirmDistinctAction, skipAction } from "@/app/[locale]/(app)/convert/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { money } from "../format";
import { DecisionButton, DiscardCorrectionButton, RemoveDecisionButton } from "./correction-actions";
import type { TotalsData } from "./totals-review";
import { REFUSAL_MESSAGE } from "./types";

const ENTRY_LEVEL = new Set(["entry_needs_review", "unmatched_entry", "entry_incomplete", "outside_period", "outside_assignment", "crosses_midnight", "possible_duplicate_day", "no_entries"]);
const DOCUMENT_LEVEL = new Set(["documents_pending", "document_failed"]);
const TO_APPROVALS = new Set(["client_dispute_open", "client_approval_missing"]);

type Group = TotalsData["blockers"][number];

/** Blockers about a client's invoice settings (slice g): the fix opens the client's page. */
const CLIENT_SETTINGS = new Set(["po_missing", "vms_refused", "invoice_problem"]);
const clientsOf = (g: Group) => [...new Map(g.issues.filter((i) => i.clientId && i.clientName).map((i) => [i.clientId!, { id: i.clientId!, name: i.clientName! }])).values()];

export function ExceptionsStep({ periodId, data, locked }: { periodId: string; data: Pick<TotalsData, "blockers" | "warnings" | "skipped" | "correction" | "canApprove">; locked: boolean }) {
  const t = useTranslations("convert.totals");
  const tr = useTranslations("convert.correction");
  const te = useTranslations("convert.exceptions");
  const tc = useTranslations("common");
  const tx = useTranslations("convert");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [skipping, setSkipping] = useState<{ workerIds: string[] } | null>(null);
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [confirmReason, setConfirmReason] = useState("");
  const [reason, setReason] = useState("");
  const blocking = data.blockers.length;
  const correction = data.correction;
  // In a correction, a worker paid in the version it corrects is settled by a decision, not skipped (E10).
  const skippable = (ids: string[]) => ids.filter((id) => !correction?.noSkip.includes(id));
  const decide = (i: Group["issues"][number]) =>
    correction && data.canApprove && !locked && i.workerId && i.grossCents !== undefined ? (
      <DecisionButton
        periodId={periodId}
        workerId={i.workerId}
        name={i.workerName ?? ""}
        netCents={i.grossCents}
        heldCents={i.heldCents ?? 0}
        baseVersion={correction.baseVersion}
      />
    ) : null;

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

  const description = (g: Group): ReactNode =>
    g.ruleCodes.length > 0 ? (
      <div className="flex flex-col gap-1">
        <p>
          {t("rulesLine", {
            place: g.jurisdiction === "US" ? t("federal") : (g.jurisdiction ?? ""),
            rules: g.ruleCodes.map((code) => (t.has(`rules.${code}`) ? t(`rules.${code}` as "rules.weekly_overtime") : code)).join(" · "),
          })}
        </p>
        {g.workerNames.length > 0 && <p>{t("workersLine", { names: g.workerNames.join(", ") })}</p>}
      </div>
    ) : g.code === "possible_duplicate_day" ? (
      <ul className="flex flex-col gap-2">
        {g.issues.map((i, n) => (
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
    ) : g.code === "correction_decision_needed" || (correction && g.code === "export_refused") ? (
      // A correction: each worker's difference is settled by a recorded decision.
      <ul className="flex flex-col gap-2">
        {g.issues.map((i, n) => (
          <li key={n} className="flex flex-col gap-1">
            <span>{i.message}</span>
            <span className="w-fit">{decide(i)}</span>
          </li>
        ))}
      </ul>
    ) : g.code === "export_refused" ? (
      // What a person skipping the worker pays by hand (the run computed it; the file cannot carry it).
      <ul className="flex flex-col gap-2">
        {g.issues.map((i, n) => (
          <li key={n} className="flex flex-col gap-1">
            <span>{i.message}</span>
            {i.grossCents !== undefined && i.workerName && <span className="text-foreground" data-testid="gross-by-hand">{t("grossByHand", { name: i.workerName, amount: money(i.grossCents, locale) })}</span>}
          </li>
        ))}
      </ul>
    ) : (
      <Issues issues={g.issues} />
    );

  const fix = (g: Group): ReactNode =>
    locked ? null : DOCUMENT_LEVEL.has(g.code) ? (
      <Link href={{ pathname: "/convert", query: { period: periodId, step: "upload" } }} className={buttonVariants({ size: "sm", variant: "outline" })}>
        {t("goToUpload")}
      </Link>
    ) : ENTRY_LEVEL.has(g.code) ? (
      <Link href={{ pathname: "/convert", query: { period: periodId, step: "hours" } }} className={buttonVariants({ size: "sm", variant: "outline" })}>
        {t("edit")}
      </Link>
    ) : TO_APPROVALS.has(g.code) ? (
      <Link href={{ pathname: "/approvals", query: { period: periodId, ...(g.code === "client_dispute_open" ? { status: "disputed" } : {}) } }} className={buttonVariants({ size: "sm", variant: "outline" })}>
        {t("openApprovals")}
      </Link>
    ) : g.code === "missing_payroll_id" || g.code === "no_payroll_target" ? (
      // Workyard maps missing ids inside the export; ClickTime names them: open the settings on them.
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Link href={{ pathname: "/settings/payroll", query: g.code === "missing_payroll_id" ? { tab: "workers", filter: "missing" } : {} }} className={buttonVariants({ size: "sm", variant: "outline" })} data-testid="open-payroll-settings">
          {t("openPayrollSettings")}
        </Link>
        {skippable(g.workerIds).length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setSkipping({ workerIds: skippable(g.workerIds) })} data-testid="skip-workers">
            {t("skipWorkers", { count: skippable(g.workerIds).length })}
          </Button>
        )}
      </div>
    ) : CLIENT_SETTINGS.has(g.code) && clientsOf(g).length > 0 ? (
      // An invoice the client's settings cannot make (slice g): open those settings.
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {clientsOf(g).map((c) => (
          <Link key={c.id} href={`/clients/${c.id}`} className={buttonVariants({ size: "sm", variant: "outline" })} data-testid="open-client-settings">
            {te("openClientSettings", { client: c.name })}
          </Link>
        ))}
        {skippable(g.workerIds).length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setSkipping({ workerIds: skippable(g.workerIds) })} data-testid="skip-workers">
            {t("skipWorkers", { count: skippable(g.workerIds).length })}
          </Button>
        )}
      </div>
    ) : g.code === "correction_no_differences" ? (
      correction && data.canApprove ? <DiscardCorrectionButton periodId={periodId} baseVersion={correction.baseVersion} /> : null
    ) : g.code === "correction_decision_needed" || (correction && g.code === "export_refused") ? null : skippable(g.workerIds).length > 0 ? (
      <Button size="sm" variant="outline" onClick={() => setSkipping({ workerIds: skippable(g.workerIds) })} data-testid="skip-workers">
        {t("skipWorkers", { count: skippable(g.workerIds).length })}
      </Button>
    ) : null;

  const rows = (groups: Group[], kind: "blocker" | "warning") => (
    <ul className="flex flex-col divide-y rounded-lg border">
      {groups.map((g) => (
        <li key={`${g.code}|${g.ruleCode ?? ""}|${g.jurisdiction ?? ""}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between" data-testid={kind}>
          <div className="flex min-w-0 flex-col gap-1 text-sm">
            <p className="font-medium">
              {t(`blockers.${g.code}` as "blockers.invalid_input")}
              {g.workerIds.length > 0 && <span className="font-normal text-muted-foreground"> · {t("blockerCount", { count: g.workerIds.length })}</span>}
            </p>
            <div className="text-muted-foreground">{description(g)}</div>
          </div>
          {kind === "blocker" && <div className="shrink-0">{fix(g)}</div>}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-6">
      {blocking > 0 ? (
        <Alert variant="destructive" data-testid="exceptions-summary">
          <CircleAlertIcon />
          <AlertTitle>{te("summaryBlocking", { count: blocking })}</AlertTitle>
          <AlertDescription>{te("summaryBlockingBody")}</AlertDescription>
        </Alert>
      ) : (
        <Alert data-testid="exceptions-summary">
          <CircleCheckIcon />
          <AlertTitle>{te("summaryNone")}</AlertTitle>
          <AlertDescription>{te("summaryNoneBody")}</AlertDescription>
        </Alert>
      )}

      {blocking > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="blocking-title">
          <h2 id="blocking-title" className="text-lg font-semibold">
            {te("blockingTitle")}
          </h2>
          {rows(data.blockers, "blocker")}
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="warnings-title">
        <div className="flex flex-col gap-1">
          <h2 id="warnings-title" className="text-lg font-semibold">
            {te("warningsTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{te("warningsHint")}</p>
        </div>
        {data.warnings.length > 0 ? rows(data.warnings, "warning") : <p className="text-sm text-muted-foreground">{te("noWarnings")}</p>}
      </section>

      {correction && correction.decisions.length > 0 && (
        <Alert data-testid="decisions">
          <InfoIcon />
          <AlertTitle>{tr("decisionsTitle")}</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {correction.decisions.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    <span className="text-foreground">{d.name}</span>: {money(Math.abs(d.differenceCents), locale)} ·{" "}
                    {tr("decisionOnFile", { decision: tr(`options.${d.decision}` as "options.paid_by_hand"), note: d.note, by: d.by })}
                    {!d.fits && <span className="text-destructive"> {tr("decisionStale")}</span>}
                  </span>
                  {!locked && data.canApprove && <RemoveDecisionButton periodId={periodId} decisionId={d.id} label={`${d.name}, ${tr(`options.${d.decision}` as "options.paid_by_hand")}`} />}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

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
                        {!locked && !correction?.noBringBack.includes(s.workerId) && (
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
                    {!locked && people.filter((p) => !correction?.noBringBack.includes(p.workerId)).length > 1 && (
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            await skipAction(periodId, people.filter((p) => !correction?.noBringBack.includes(p.workerId)).map((p) => p.workerId), false, "brought back");
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
