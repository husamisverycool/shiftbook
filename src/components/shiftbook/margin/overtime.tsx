"use client";

// Pattern: docs/patterns/margin/overtime.md — Bullhorn Gross Margin Report (overtime hours paid beside
// hours billed), TempWorks Gross Profit Detail (rows by employee; a row opens its detail).
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OvertimeView } from "@/server/margin/queries";
import { hoursMinutes, longDate, money } from "../format";

export function MarginOvertime({ view }: { view: OvertimeView }) {
  const t = useTranslations("margin.overtime");
  const tm = useTranslations("margin");
  const locale = useLocale();
  const [open, setOpen] = useState<string | null>(null);
  if (view.rows.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground" data-testid="overtime-none">
        {t("none")}
      </p>
    );
  }
  const T = view.totals;
  const hours = (m: number) => (m === 0 ? "—" : hoursMinutes(m));
  return (
    <>
      <p className="text-sm" data-testid="overtime-summary">
        {T.leakedMinutes === 0 ? t("allBilled", { hours: hoursMinutes(T.paidMinutes) }) : t("summary", { paid: hoursMinutes(T.paidMinutes), leaked: hoursMinutes(T.leakedMinutes), premium: money(T.premiumNotBilledCents, locale) })}
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <Table aria-label={tm("tabs.overtime")} data-testid="overtime-table">
          <TableHeader>
            <TableRow>
              <TableHead>{t("client")}</TableHead>
              <TableHead>{t("worker")}</TableHead>
              <TableHead>{t("week")}</TableHead>
              <TableHead className="text-right">{t("paid")}</TableHead>
              <TableHead className="text-right">{t("atMultiplier")}</TableHead>
              <TableHead className="text-right">{t("atStraight")}</TableHead>
              <TableHead className="text-right">{t("notBilled")}</TableHead>
              <TableHead className="text-right">{t("premium")}</TableHead>
              <TableHead>{t("terms")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.rows.map((r) => {
              const key = `${r.clientId}|${r.workerId}|${r.week}`;
              return (
                <Fragment key={key}>
                  <TableRow data-testid="overtime-row">
                    <TableCell>
                      <button type="button" className="flex items-center gap-1 text-left underline-offset-4 hover:underline" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
                        {open === key ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
                        {r.clientName}
                      </button>
                    </TableCell>
                    <TableCell>{r.workerName}</TableCell>
                    <TableCell className="whitespace-nowrap">{longDate(r.week, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{hours(r.paidMinutes)}</TableCell>
                    <TableCell className="text-right tabular-nums">{hours(r.multiplierMinutes)}</TableCell>
                    <TableCell className="text-right tabular-nums">{hours(r.straightMinutes)}</TableCell>
                    <TableCell className="text-right tabular-nums">{hours(r.notBilledMinutes)}</TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${r.premiumNotBilledCents > 0 ? "text-destructive" : ""}`}>{money(r.premiumNotBilledCents, locale)}</TableCell>
                    <TableCell>{r.reasons.length === 0 ? <span className="text-muted-foreground">{t("reasons.multiplier")}</span> : r.reasons.map((x) => t(`reasons.${x}` as "reasons.bill_overtime_straight")).join(", ")}</TableCell>
                  </TableRow>
                  {open === key && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={9} className="text-xs whitespace-normal text-muted-foreground" data-testid="overtime-explain">
                        {r.explain}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-semibold">
                {tm("total")}
              </TableCell>
              <TableCell className="text-right tabular-nums">{hoursMinutes(T.paidMinutes)}</TableCell>
              <TableCell />
              <TableCell colSpan={2} className="text-right tabular-nums">
                {hoursMinutes(T.leakedMinutes)}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{money(T.premiumNotBilledCents, locale)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </>
  );
}
