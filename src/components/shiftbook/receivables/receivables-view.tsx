"use client";

// Pattern: docs/patterns/receivables.md — FreshBooks Accounts Aging (one row per client across the
// columns; a client opens its page; any amount lists the invoices behind it; export); QuickBooks
// Online A/R aging (Current, 1–30, 31–60, 61–90, 91+; as of a date); TempWorks Short Pay Invoices.
import { DownloadIcon, ReceiptTextIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { ReceivablesView as View } from "@/server/receivables/queries";
import { longDate, money } from "../format";

const BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d91_plus"] as const;
type Bucket = (typeof BUCKETS)[number];

export function ReceivablesView({ view, tab, today }: { view: View; tab: "aging" | "short"; today: string }) {
  const t = useTranslations("receivables");
  const locale = useLocale();
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
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-2xl font-semibold">{t("title")}</h1>
        <div className="flex flex-col gap-1">
          <Label htmlFor="as-of" className="text-xs text-muted-foreground">
            {t("asOf")}
          </Label>
          <Input id="as-of" type="date" className="w-44" value={view.asOf} max={today} onChange={(e) => e.target.value && go({ asOf: e.target.value === today ? "" : e.target.value })} data-testid="as-of" />
        </div>
        <a href={`/api/files/receivables?asOf=${view.asOf}`} download className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="export-aging">
          <DownloadIcon />
          {t("export")}
        </a>
      </div>

      <Tabs value={tab} onValueChange={(v) => go({ tab: v === "aging" ? "" : String(v) })}>
        <TabsList>
          <TabsTrigger value="aging">{t("tabs.aging")}</TabsTrigger>
          <TabsTrigger value="short" data-testid="tab-short">
            {t("tabs.short")} <span className="text-muted-foreground tabular-nums">{view.shortPaid.length}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "aging" ? (
        view.clients.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground" data-testid="receivables-empty">
            <ReceiptTextIcon className="size-5" />
            <p>{t("empty", { date: longDate(view.asOf, locale) })}</p>
            <Link href="/invoices" className={buttonVariants({ variant: "link", size: "sm" })}>
              {t("emptyLink")}
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm" data-testid="aging-summary">
              {t("summary", { total: money(view.totalCents, locale), overdue: money(view.overdueCents, locale), credit: money(view.creditCents, locale), date: longDate(view.asOf, locale) })}
            </p>
            <div className="overflow-x-auto rounded-lg border">
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
                          <TableCell className="text-right tabular-nums" title={c.daysToPay.explain}>
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
                                          <TableCell>{longDate(i.issuedOn, locale)}</TableCell>
                                          <TableCell>{longDate(i.dueOn, locale)}</TableCell>
                                          <TableCell className="text-right tabular-nums">{i.daysLate}</TableCell>
                                          <TableCell className="text-right tabular-nums">{money(i.totalCents, locale)}</TableCell>
                                          <TableCell className="text-right tabular-nums">{money(i.balanceCents, locale)}</TableCell>
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
                    {BUCKETS.map((b) => (
                      <TableCell key={b} className="text-right font-semibold tabular-nums">
                        {money(view.totals[b], locale)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold tabular-nums">{money(view.totalCents, locale)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </>
        )
      ) : view.shortPaid.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground" data-testid="short-empty">
          {t("shortEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
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
                  <TableCell className="text-right tabular-nums">{money(r.balanceCents, locale)}</TableCell>
                  <TableCell>{r.reason ? t(`shortReasons.${r.reason}`) : <span className="text-muted-foreground">{t("noReason")}</span>}</TableCell>
                  <TableCell>{r.remindedAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(r.remindedAt)) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
