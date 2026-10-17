"use client";

// Patterns: docs/patterns/money.md (the handoffs, a Stripe list) and docs/patterns/money/payroll.md
// (the runs to hand off, Check's payroll by period and pay date).
import { BanknoteIcon, FileSpreadsheetIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, useRouter } from "@/i18n/navigation";
import type { HandoffRow, PayrollRunRow } from "@/server/money/queries";
import { useDateTime } from "../agency-zone";
import { EmptyState } from "../empty-state";
import { dateRange, listDate, money } from "../format";
import { ListAmount } from "../list-controls";
import { TableFrame } from "../page";
import { Status } from "../status";

const str = (v: unknown) => (typeof v === "string" ? v : "");

function about(h: HandoffRow): { href: string | { pathname: string; query: Record<string, string> }; label: (t: ReturnType<typeof useTranslations>, locale: string) => string } {
  const s = h.summary;
  switch (h.kind) {
    case "payroll":
      return { href: `/money/payroll/${h.subjectId}`, label: (t, locale) => t("handoffs.aboutRun", { period: dateRange(str(s.periodStart), str(s.periodEnd), locale) }) };
    case "wage_access":
      return { href: `/workers/${h.subjectId}`, label: () => str(s.workerName) };
    case "funding":
      return { href: `/money/funding/${h.subjectId}`, label: () => `${str(s.invoiceNumber)} · ${str(s.clientName)}` };
    case "insurance":
      return { href: { pathname: "/money/insurance", query: { from: str(s.from), to: str(s.to) } }, label: (t, locale) => t("handoffs.aboutDates", { range: dateRange(str(s.from), str(s.to), locale) }) };
  }
}

export function HandoffsTable({ rows }: { rows: HandoffRow[] }) {
  const t = useTranslations("money");
  const locale = useLocale();
  const at = useDateTime();
  if (rows.length === 0)
    return (
      <EmptyState
        icon={BanknoteIcon}
        title={t("handoffs.emptyTitle")}
        description={t("handoffs.emptyBody")}
        testId="handoffs-empty"
        action={
          <Link href="/money/payroll" className={buttonVariants({ variant: "outline" })}>
            {t("handoffs.emptyAction")}
          </Link>
        }
      />
    );
  return (
    <TableFrame>
      <Table aria-label={t("tabs.handoffs")} data-testid="handoffs">
        <TableHeader>
          <TableRow>
            <TableHead>{t("handoffs.cols.when")}</TableHead>
            <TableHead>{t("handoffs.cols.what")}</TableHead>
            <TableHead>{t("handoffs.cols.about")}</TableHead>
            <TableHead>{t("handoffs.cols.partner")}</TableHead>
            <TableHead className="text-right">{t("handoffs.cols.amount")}</TableHead>
            <TableHead>{t("handoffs.cols.status")}</TableHead>
            <TableHead>{t("handoffs.cols.by")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((h) => {
            const a = about(h);
            return (
              <TableRow key={h.id} data-testid="handoff-row" data-kind={h.kind}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{at(h.createdAt)}</TableCell>
                <TableCell className="whitespace-nowrap">{t(`kinds.${h.kind}`)}</TableCell>
                <TableCell>
                  <Link href={a.href} className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">
                    {a.label(t, locale)}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">{t(`partners.${h.partner}`)}</TableCell>
                <TableCell className="text-right">{h.amountCents === null ? "—" : <ListAmount text={money(h.amountCents, locale)} />}</TableCell>
                <TableCell>
                  <Status tone="neutral">{t("recorded")}</Status>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{h.createdByLabel}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableFrame>
  );
}

export function PayrollRunsTable({ rows, today }: { rows: PayrollRunRow[]; today: string }) {
  const t = useTranslations("money");
  const locale = useLocale();
  const router = useRouter();
  if (rows.length === 0)
    return (
      <EmptyState
        icon={FileSpreadsheetIcon}
        title={t("payroll.emptyTitle")}
        description={t("payroll.emptyBody")}
        testId="payroll-runs-empty"
        action={
          <Link href="/convert" className={buttonVariants({ variant: "outline" })}>
            {t("payroll.emptyAction")}
          </Link>
        }
      />
    );
  return (
    <TableFrame>
      <Table aria-label={t("tabs.payroll")} data-testid="payroll-runs">
        <TableHeader>
          <TableRow>
            <TableHead>{t("payroll.cols.period")}</TableHead>
            <TableHead>{t("payroll.cols.payday")}</TableHead>
            <TableHead className="text-right">{t("payroll.cols.workers")}</TableHead>
            <TableHead className="text-right">{t("payroll.cols.gross")}</TableHead>
            <TableHead>{t("payroll.cols.handoff")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const href = `/money/payroll/${r.id}`;
            const regular = r.kind === "regular";
            return (
              <TableRow key={r.id} className={regular ? "cursor-pointer" : undefined} data-testid="payroll-run-row" onClick={regular ? () => router.push(href) : undefined}>
                <TableCell>
                  {regular ? (
                    <Link href={href} className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50" onClick={(e) => e.stopPropagation()}>
                      {dateRange(r.periodStart, r.periodEnd, locale, today)}
                    </Link>
                  ) : (
                    <span className="font-medium">{dateRange(r.periodStart, r.periodEnd, locale, today)}</span>
                  )}
                  {r.version > 1 && <span className="ml-2 text-muted-foreground">{t("payroll.version", { version: r.version })}</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap">{listDate(r.payday, locale, today)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.workers}</TableCell>
                <TableCell className="text-right">
                  <ListAmount text={money(r.grossCents, locale)} />
                </TableCell>
                <TableCell>
                  {!regular ? (
                    <Status tone="neutral">{t("payroll.correction")}</Status>
                  ) : r.handoff ? (
                    <Status tone="neutral" data-testid="run-handoff-status">
                      {t("payroll.recordedOn", { date: listDate(r.handoff.createdAt.slice(0, 10), locale, today) })}
                    </Status>
                  ) : (
                    <Status tone="info" data-testid="run-handoff-status">
                      {t("payroll.ready")}
                    </Status>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
