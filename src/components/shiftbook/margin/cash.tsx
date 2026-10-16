"use client";

// Pattern: docs/patterns/margin/cash.md — Xero short-term cash flow (money expected in by a date; a
// projected balance), QuickBooks Online cash flow planner (each projection says why).
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { CashView } from "@/server/margin/queries";
import { longDate, money } from "../format";

export function MarginCash({ view }: { view: CashView }) {
  const t = useTranslations("margin.cash");
  const tm = useTranslations("margin");
  const locale = useLocale();
  const [open, setOpen] = useState<string | null>(null);
  const n = view.next;
  const cards = [
    { key: "now", label: t("now"), value: money(view.floatingCents, locale), why: t("nowWhy", { date: longDate(view.asOf, locale) }) },
    { key: "payroll", label: t("payroll", { date: longDate(n.payDate, locale) }), value: money(n.payroll.cents, locale), why: n.payroll.estimate ? t("estimate") : t("fromRun"), badge: n.payroll.estimate ? t("estimateBadge") : null },
    {
      key: "expected",
      label: t("expected"),
      value: money(n.expectedCents, locale),
      why: [n.expected.map((e) => `${e.number} (${longDate(e.expectedOn, locale)})`).join(", ") || t("nothingExpected"), n.overdueCents > 0 ? t("overdue", { amount: money(n.overdueCents, locale) }) : null].filter(Boolean).join(" "),
    },
    {
      key: "after",
      label: t("after"),
      value: money(n.afterCents, locale),
      why: [
        t("afterWhy", { now: money(view.floatingCents, locale), payroll: money(n.payroll.cents, locale), back: money(n.backCents, locale), after: money(n.afterCents, locale) }),
        n.backCents < n.expectedCents ? t("marginKept") : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
  ];
  return (
    <>
      {view.payDayAfter === null && (
        <Alert data-testid="no-pay-day">
          <AlertDescription>
            <span>
              {t("noPayDay")}{" "}
              <Link href="/settings/margin" className="underline underline-offset-4">
                {tm("settings")}
              </Link>
            </span>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="cash-cards">
        {cards.map((c) => (
          <div key={c.key} className="flex flex-col gap-1 rounded-lg border p-3" data-testid={`cash-${c.key}`}>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {c.label}
              {"badge" in c && c.badge && <Badge variant="outline">{c.badge}</Badge>}
            </span>
            <span className="text-lg font-semibold tabular-nums">{c.value}</span>
            <span className="text-xs text-muted-foreground">{c.why}</span>
          </div>
        ))}
      </div>
      {view.clients.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground" data-testid="cash-none">
          {t("none")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table aria-label={t("byClient")} data-testid="cash-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t("client")}</TableHead>
                <TableHead className="text-right">{t("paid")}</TableHead>
                <TableHead className="text-right">{t("collected")}</TableHead>
                <TableHead className="text-right">{t("floating")}</TableHead>
                <TableHead className="text-right">{t("daysToPay")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.clients.map((c) => (
                <Fragment key={c.clientId}>
                  <TableRow data-testid="cash-row">
                    <TableCell className="font-medium">
                      <button type="button" className="flex items-center gap-1 text-left underline-offset-4 hover:underline" aria-expanded={open === c.clientId} onClick={() => setOpen(open === c.clientId ? null : c.clientId)}>
                        {open === c.clientId ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
                        {c.clientName ?? tm("none")}
                      </button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(c.paidCents, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(c.collectedCents, locale)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{money(c.floatingCents, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums" title={c.daysToPay?.explain}>
                      {c.daysToPay?.averageDays == null ? "—" : t("days", { days: c.daysToPay.averageDays, count: c.daysToPay.invoices })}
                    </TableCell>
                  </TableRow>
                  {open === c.clientId &&
                    c.weeks.map((w) => (
                      <TableRow key={w.periodId} className="bg-muted/30 hover:bg-muted/40" data-testid="cash-week">
                        <TableCell className="pl-8 text-sm">{t("week", { ends: longDate(w.periodEndsOn, locale), paid: longDate(w.payDate, locale) })}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(w.paidCents, locale)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(w.collectedCents, locale)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(w.floatingCents, locale)}</TableCell>
                        <TableCell />
                      </TableRow>
                    ))}
                </Fragment>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">{tm("total")}</TableCell>
                <TableCell className="text-right tabular-nums">{money(view.clients.reduce((s, c) => s + c.paidCents, 0), locale)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(view.clients.reduce((s, c) => s + c.collectedCents, 0), locale)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{money(view.floatingCents, locale)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </>
  );
}
