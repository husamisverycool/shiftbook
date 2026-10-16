"use client";

// Pattern: docs/patterns/bank.md — QuickBooks Online bank transactions "For review" (a suggested
// match with its confidence; Post; find another match; Posted with Undo; Excluded); Stripe's order
// of matching; Business Central confidence; Zoho Books choosing several invoices.
import { LandmarkIcon, UploadIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { excludeLineAction, includeLineAction, recordPaymentAction, undoLineAction } from "@/app/[locale]/(app)/payments/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { BankView as View, PaymentClients } from "@/server/receivables/queries";
import { longDate, money } from "../format";
import { PaymentDialog, type PaymentMode } from "./payment-dialog";

export type BankTab = "review" | "posted" | "excluded";
const REASONS = ["not_a_client_payment", "transfer", "duplicate", "other"] as const;
type ReviewLine = View["review"][number];

export function BankView({ view, tab, clients, today, canChange }: { view: View; tab: BankTab; clients: PaymentClients; today: string; canChange: boolean }) {
  const t = useTranslations("bank");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [matching, setMatching] = useState<PaymentMode | null>(null);
  const [excluding, setExcluding] = useState<ReviewLine | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(done);
      else toast.error(t(`errors.${r.error ?? "generic"}` as "errors.generic"));
      router.refresh();
    });
  const post = (l: ReviewLine) =>
    run(
      () =>
        recordPaymentAction(
          { clientId: l.suggestion!.clientId, receivedOn: l.postedOn, amountCents: l.amountCents, method: "bank_deposit", reference: l.description.slice(0, 100), memo: null, applications: l.suggestion!.applications.map((a) => ({ invoiceId: a.invoiceId, amountCents: a.amountCents })) },
          l.id,
        ),
      t("posted"),
    );
  const findMatch = (l: ReviewLine) =>
    setMatching({ kind: "bank", lineId: l.id, postedOn: l.postedOn, amountCents: l.amountCents, description: l.description, clientId: l.suggestion?.clientId, applications: l.suggestion?.applications.map((a) => ({ invoiceId: a.invoiceId, amountCents: a.amountCents })) });

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">{t("title")}</h1>
        {canChange && (
          <Link href="/bank/import" className={buttonVariants({ size: "sm" })} data-testid="import-bank">
            <UploadIcon />
            {t("import")}
          </Link>
        )}
      </div>
      {!canChange && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}
      <Tabs value={tab} onValueChange={(v) => router.replace(v === "review" ? pathname : `${pathname}?tab=${String(v)}`)}>
        <TabsList>
          {(["review", "posted", "excluded"] as const).map((k) => (
            <TabsTrigger key={k} value={k} data-testid={`tab-${k}`}>
              {t(`tabs.${k}`)} <span className="text-muted-foreground tabular-nums">{view[k].length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!view.imported ? (
        <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground" data-testid="bank-empty">
          <LandmarkIcon className="size-5" />
          <p>{t("empty")}</p>
          {canChange && (
            <Link href="/bank/import" className={buttonVariants({ variant: "link", size: "sm" })}>
              {t("import")}
            </Link>
          )}
        </div>
      ) : tab === "review" ? (
        view.review.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground" data-testid="review-empty">
            {t("reviewEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border" data-testid="review-list">
            {view.review.map((l) => (
              <li key={l.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start" data-testid="review-line">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-sm text-muted-foreground">{longDate(l.postedOn, locale)}</span>
                    <span className="font-medium break-all">{l.description}</span>
                    <span className="ml-auto font-semibold tabular-nums">{money(l.amountCents, locale)}</span>
                  </div>
                  {l.suggestion ? (
                    <div className="flex flex-col gap-1 text-sm" data-testid="suggestion">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant={l.suggestion.confidence === "high" ? "secondary" : "outline"} data-testid="confidence">
                          {t(`confidence.${l.suggestion.confidence}`)}
                        </Badge>
                        <span>
                          {l.suggestion.clientName} · {l.suggestion.applications.map((a) => `${a.number} (${money(a.amountCents, locale)})`).join(", ")}
                        </span>
                        {l.suggestion.shortCents > 0 && <span className="text-destructive">{t("short", { amount: money(l.suggestion.shortCents, locale) })}</span>}
                        {l.suggestion.creditCents > 0 && <span>{t("credit", { amount: money(l.suggestion.creditCents, locale) })}</span>}
                      </span>
                      <span className="text-muted-foreground">{l.suggestion.explain}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("noSuggestion")}</p>
                  )}
                </div>
                {canChange && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {l.suggestion && (
                      <Button size="sm" disabled={pending} onClick={() => post(l)} data-testid="post-line">
                        {t("post")}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => findMatch(l)} data-testid="find-match">
                      {t("findMatch")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setExcluding(l)} data-testid="exclude-line">
                      {t("exclude")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table aria-label={t(`tabs.${tab}`)} data-testid={`${tab}-table`}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("date")}</TableHead>
                <TableHead>{t("description")}</TableHead>
                <TableHead className="text-right">{t("amount")}</TableHead>
                <TableHead>{tab === "posted" ? t("payment") : t("why")}</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tab === "posted"
                ? view.posted.map((l) => (
                    <TableRow key={l.id} data-testid="posted-row">
                      <TableCell className="whitespace-nowrap">{longDate(l.postedOn, locale)}</TableCell>
                      <TableCell className="max-w-96 break-all">{l.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(l.amountCents, locale)}</TableCell>
                      <TableCell>
                        {l.payment ? (
                          <span>
                            {l.payment.clientName} · {l.payment.invoices.map((i) => `${i.number} (${money(i.amountCents, locale)})`).join(", ")}
                            {l.payment.creditCents > 0 && ` · ${t("credit", { amount: money(l.payment.creditCents, locale) })}`}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canChange && (
                          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => undoLineAction(l.id), t("undone"))} data-testid="undo-line">
                            {t("undo")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                : view.excluded.map((l) => (
                    <TableRow key={l.id} data-testid="excluded-row">
                      <TableCell className="whitespace-nowrap">{longDate(l.postedOn, locale)}</TableCell>
                      <TableCell className="max-w-96 break-all">{l.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(l.amountCents, locale)}</TableCell>
                      <TableCell>{t(`reasons.${l.reason}` as "reasons.other")}</TableCell>
                      <TableCell className="text-right">
                        {canChange && l.amountCents > 0 && (
                          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => includeLineAction(l.id), t("included"))}>
                            {t("include")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      )}
      {matching && <PaymentDialog clients={clients} mode={matching} today={today} onClose={() => setMatching(null)} />}
      {excluding && <ExcludeDialog line={excluding} onClose={() => setExcluding(null)} />}
    </div>
  );
}

function ExcludeDialog({ line, onClose }: { line: ReviewLine; onClose: () => void }) {
  const t = useTranslations("bank");
  const locale = useLocale();
  const router = useRouter();
  const [reason, setReason] = useState<(typeof REASONS)[number]>("not_a_client_payment");
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("excludeTitle")}</DialogTitle>
          <DialogDescription>{t("excludeBody", { description: line.description, amount: money(line.amountCents, locale) })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exclude-reason">{t("why")}</Label>
          <NativeSelect id="exclude-reason" className="w-full" value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}>
            {REASONS.map((r) => (
              <NativeSelectOption key={r} value={r}>
                {t(`reasons.${r}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await excludeLineAction(line.id, reason);
                if (r.ok) {
                  toast.success(t("excluded"));
                  onClose();
                  router.refresh();
                } else toast.error(t(`errors.${r.error}` as "errors.generic"));
              })
            }
            data-testid="confirm-exclude"
          >
            {t("exclude")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
