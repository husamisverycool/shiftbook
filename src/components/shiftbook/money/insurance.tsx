"use client";

// Pattern: docs/patterns/money/insurance.md — Patriot's Workers' Comp Wages report (pay by state and
// class for a range of dates, CSV) with the overtime premium apart (NCRB Rule 2-C-2-a), for the broker.
import { DownloadIcon, ShieldCheckIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import type { WcPacketView } from "@/server/compliance/documents";
import { recordInsuranceHandoffAction } from "@/app/[locale]/(app)/money/actions";
import { useCan } from "../abilities";
import { EmptyState } from "../empty-state";
import { dateRange, hoursMinutes, money } from "../format";
import { TableFrame } from "../page";

export function InsuranceView({ view }: { view: WcPacketView }) {
  const t = useTranslations("money.insurance");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const can = useCan();
  const [from, setFrom] = useState(view.from);
  const [to, setTo] = useState(view.to);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const has = view.classes.length > 0;
  const record = () =>
    start(async () => {
      const r = await recordInsuranceHandoffAction(view.from, view.to);
      setConfirming(false);
      if (r.ok) toast.success(t("done"));
      else toast.error(t(`errors.${r.error === "not_allowed" || r.error === "range" || r.error === "none" ? r.error : "generic"}`));
    });
  const cents = (c: number) => (c === 0 ? "—" : money(c, locale));
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to && to >= from) router.replace({ pathname: "/money/insurance", query: { from, to } });
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="ins-from" className="text-xs text-muted-foreground">
              {t("from")}
            </Label>
            <Input id="ins-from" type="date" className="w-40" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ins-to" className="text-xs text-muted-foreground">
              {t("to")}
            </Label>
            <Input id="ins-to" type="date" className="w-40" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={!from || !to || to < from} data-testid="insurance-show">
            {t("show")}
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          {has && (
            <a href={`/api/files/money?kind=insurance&from=${view.from}&to=${view.to}`} download className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="insurance-download">
              <DownloadIcon />
              {t("download")}
            </a>
          )}
          {has && can("money") && (
            <Button size="sm" onClick={() => setConfirming(true)} data-testid="insurance-record">
              {t("record")}
            </Button>
          )}
        </div>
      </div>
      {!has ? (
        <EmptyState icon={ShieldCheckIcon} title={t("emptyTitle")} description={t("emptyBody")} testId="insurance-empty" />
      ) : (
        <>
          <TableFrame>
            <Table aria-label={t("record")} data-testid="insurance-classes">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("cols.state")}</TableHead>
                  <TableHead>{t("cols.class")}</TableHead>
                  <TableHead>{t("cols.description")}</TableHead>
                  <TableHead className="text-right">{t("cols.hours")}</TableHead>
                  <TableHead className="text-right">{t("cols.straight")}</TableHead>
                  <TableHead className="text-right">{t("cols.otPremium")}</TableHead>
                  <TableHead className="text-right">{t("cols.dtPremium")}</TableHead>
                  <TableHead className="text-right">{t("cols.other")}</TableHead>
                  <TableHead className="text-right">{t("cols.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.classes.map((c) => (
                  <TableRow key={`${c.state}|${c.classCode}`} data-testid="insurance-class">
                    <TableCell>{c.state}</TableCell>
                    <TableCell className="tabular-nums">{c.classCode}</TableCell>
                    <TableCell className="text-muted-foreground">{c.description ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{hoursMinutes(c.minutes)}</TableCell>
                    <TableCell className="text-right tabular-nums">{cents(c.straightCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{cents(c.otPremiumCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{cents(c.dtPremiumCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{cents(c.otherCents)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{money(c.totalCents, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-medium">
                    {t("total")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{hoursMinutes(view.totals.minutes)}</TableCell>
                  <TableCell className="text-right tabular-nums">{cents(view.totals.straightCents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{cents(view.totals.otPremiumCents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{cents(view.totals.dtPremiumCents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{cents(view.totals.otherCents)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums" data-testid="insurance-total">
                    {money(view.totals.totalCents, locale)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </TableFrame>
          <p className="text-[13px] text-muted-foreground">{t("note")}</p>
        </>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("dialogBody", { range: dateRange(view.from, view.to, locale), total: money(view.totals.totalCents, locale) })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction loading={pending} loadingLabel={t("confirm")} onClick={record} data-testid="confirm-insurance">
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
