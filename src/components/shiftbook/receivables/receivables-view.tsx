"use client";

// Pattern: docs/patterns/receivables.md — FreshBooks Accounts Aging (one row per client across the
// columns; a client opens its page; any amount lists the invoices behind it; export); QuickBooks
// Online A/R aging (Current, 1–30, 31–60, 61–90, 91+; as of a date); TempWorks Short Pay Invoices.
import { DownloadIcon, ReceiptTextIcon, WalletIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { ReceivablesView as View } from "@/server/receivables/queries";
import { EmptyState } from "../empty-state";
import { useEngineSay } from "../engine-say";
import { longDate, money, tableDate } from "../format";
import { KeyFigure } from "../key-figures";
import { Page, PageHeader, PageTabs, TableFrame } from "../page";
import { useDateTime } from "../agency-zone";

const BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d91_plus"] as const;
type Bucket = (typeof BUCKETS)[number];

export function ReceivablesView({ view, tab, today }: { view: View; tab: "aging" | "short"; today: string }) {
  const t = useTranslations("receivables");
  // Days to pay's working in the reader's language (decision 0030).
  const say = useEngineSay();
  const locale = useLocale();
  const when = useDateTime();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState<{ clientId: string; bucket: Bucket | "total" } | null>(null);
  const go = (next: Record<string, string>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  };
  const amount = (clientId: string, bucket: Bucket | "total", cents: number) =>
    cents === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <button
        type="button"
        className="tabular-nums underline-offset-4 hover:underline aria-expanded:font-semibold"
        aria-expanded={open?.clientId === clientId && open.bucket === bucket}
        onClick={() => setOpen((cur) => (cur?.clientId === clientId && cur.bucket === bucket ? null : { clientId, bucket }))}
        data-testid={`amount-${bucket}`}
      >
        {money(cents, locale)}
      </button>
    );

  return (
    <Page>
      <PageHeader
        title={t("title")}
        actions={
          <>
            <div className="flex items-center gap-2">
              <Label htmlFor="as-of" className="text-sm text-muted-foreground">
                {t("asOf")}
              </Label>
              <Input id="as-of" type="date" className="h-8 w-40" value={view.asOf} max={today} onChange={(e) => e.target.value && go({ asOf: e.target.value === today ? "" : e.target.value })} data-testid="as-of" />
            </div>
            <a href={`/api/files/receivables?asOf=${view.asOf}`} download className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="export-aging">
              <DownloadIcon />
              {t("export")}
            </a>
          </>
        }
        tabs={
          <PageTabs
            label={t("tabsLabel")}
            current={tab}
            tabs={[
              { key: "aging", label: t("tabs.aging"), href: { pathname: "/receivables", query: params.get("asOf") ? { asOf: params.get("asOf")! } : {} } },
              { key: "short", label: t("tabs.short"), count: view.shortPaid.length, href: { pathname: "/receivables", query: { ...(params.get("asOf") ? { asOf: params.get("asOf")! } : {}), tab: "short" } }, testId: "tab-short" },
            ]}
          />
        }
      />
      {/* Figures as Mercury's Transactions page sets them (https://mercury.com/blog/updated-transactions-page):
          the headline owed with its date, then what is overdue and the credit not yet applied as rows under
          it, each label on the left and its amount on the right. What each means is on its label. */}
      <div className="flex w-full max-w-xs flex-col gap-4" data-testid="figures">
        <KeyFigure size="lg" label={t("figures.owed")} value={money(view.totalCents, locale)} note={t("figures.owedNote", { date: longDate(view.asOf, locale) })} testId="figure-owed" />
        <dl className="flex flex-col gap-2 text-sm">
          {(
            [
              ["overdue", t("figures.overdue"), t("figures.overdueNote"), view.overdueCents],
              ["credit", t("figures.credit"), t("figures.creditNote"), view.creditCents],
            ] as const
          ).map(([key, label, means, cents]) => (
            <div key={key} className="flex items-baseline justify-between gap-6" data-testid={`figure-${key}`}>
              <dt className="text-muted-foreground" title={means}>
                {label}
              </dt>
              <dd className="font-medium tabular-nums" data-testid={`figure-${key}-value`}>
                {money(cents, locale)}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {tab === "aging" ? (
        view.clients.length === 0 ? (
          <EmptyState
            icon={WalletIcon}
            title={t("emptyTitle")}
            description={t("emptyBody", { date: longDate(view.asOf, locale) })}
            action={
              <Link href="/invoices" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ReceiptTextIcon />
                {t("emptyLink")}
              </Link>
            }
            testId="receivables-empty"
          />
        ) : (
          <>
            <TableFrame>
              <Table aria-label={t("tabs.aging")} data-testid="aging-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("client")}</TableHead>
                    {BUCKETS.map((b) => (
                      <TableHead key={b} className="text-right">
                        {t(`buckets.${b}`)}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">{t("total")}</TableHead>
                    <TableHead className="text-right">{t("daysToPay")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.clients.map((c) => {
                    const shown = open?.clientId === c.clientId ? (open.bucket === "total" ? BUCKETS.flatMap((b) => c.invoices[b]) : c.invoices[open.bucket]) : null;
                    return (
                      <Fragment key={c.clientId}>
                        <TableRow data-testid="aging-row">
                          <TableCell className="font-medium">
                            <Link href={`/clients/${c.clientId}`} className="underline-offset-4 hover:underline">
                              {c.clientName}
                            </Link>
                          </TableCell>
                          {BUCKETS.map((b) => (
                            <TableCell key={b} className="text-right">
                              {amount(c.clientId, b, c.buckets[b])}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-semibold">{amount(c.clientId, "total", c.totalCents)}</TableCell>
                          <TableCell className="text-right tabular-nums" title={say(c.daysToPay)}>
                            {c.daysToPay.averageDays === null ? "—" : t("days", { days: c.daysToPay.averageDays, count: c.daysToPay.invoices })}
                          </TableCell>
                        </TableRow>
                        {shown && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={8} className="p-0">
                              <div className="px-4 py-3">
                                {shown.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">{t("onlyCredit")}</p>
                                ) : (
                                  <Table aria-label={t("invoicesOf", { client: c.clientName })} data-testid="aging-invoices">
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>{t("invoice")}</TableHead>
                                        <TableHead>{t("issued")}</TableHead>
                                        <TableHead>{t("due")}</TableHead>
                                        <TableHead className="text-right">{t("daysLate")}</TableHead>
                                        <TableHead className="text-right">{t("invoiceTotal")}</TableHead>
                                        <TableHead className="text-right">{t("balance")}</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {shown.map((i) => (
                                        <TableRow key={i.id}>
                                          <TableCell>
                                            <Link href={`/invoices/${i.id}`} className="font-medium underline-offset-4 hover:underline">
                                              {i.number}
                                            </Link>
                                          </TableCell>
                                          <TableCell>{tableDate(i.issuedOn, locale)}</TableCell>
                                          <TableCell>{tableDate(i.dueOn, locale)}</TableCell>
                                          <TableCell className="text-right tabular-nums">{i.daysLate}</TableCell>
                                          <TableCell className="text-right tabular-nums">{money(i.totalCents, locale)}</TableCell>
                                          <TableCell className="text-right font-semibold tabular-nums">{money(i.balanceCents, locale)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                )}
                                {c.creditCents > 0 && <p className="mt-2 text-sm text-muted-foreground">{t("creditLine", { amount: money(c.creditCents, locale) })}</p>}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">{t("total")}</TableCell>
                    {/* An empty bucket reads "—" here as in the clients' rows (_components/table.md). */}
                    {BUCKETS.map((b) => (
                      <TableCell key={b} className="text-right font-semibold tabular-nums" data-testid={`total-${b}`}>
                        {view.totals[b] === 0 ? <span className="font-normal text-muted-foreground">—</span> : money(view.totals[b], locale)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold tabular-nums">{money(view.totalCents, locale)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </TableFrame>
          </>
        )
      ) : view.shortPaid.length === 0 ? (
        <EmptyState icon={WalletIcon} title={t("shortEmptyTitle")} description={t("shortEmpty")} testId="short-empty" />
      ) : (
        <TableFrame>
          <Table aria-label={t("tabs.short")} data-testid="short-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t("client")}</TableHead>
                <TableHead>{t("invoice")}</TableHead>
                <TableHead className="text-right">{t("paid")}</TableHead>
                <TableHead className="text-right">{t("balance")}</TableHead>
                <TableHead>{t("reason")}</TableHead>
                <TableHead>{t("lastReminder")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.shortPaid.map((r) => (
                <TableRow key={r.invoiceId} className="cursor-pointer" onClick={() => router.push(`/invoices/${r.invoiceId}`)} data-testid="short-row">
                  <TableCell>{r.clientName}</TableCell>
                  <TableCell>
                    <Link href={`/invoices/${r.invoiceId}`} className="font-medium underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {r.number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.paidCents, locale)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{money(r.balanceCents, locale)}</TableCell>
                  <TableCell>{r.reason ? t(`shortReasons.${r.reason}`) : <span className="text-muted-foreground">{t("noReason")}</span>}</TableCell>
                  <TableCell>{r.remindedAt ? when(r.remindedAt, { time: false }) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </Page>
  );
}
