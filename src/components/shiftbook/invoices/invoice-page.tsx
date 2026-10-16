"use client";

// Pattern: docs/patterns/invoices/[id].md — Stripe invoice details (header with the number, status
// and actions; amount and dates; line items; history with related documents); TempWorks "Preview
// Invoice w/ Timecards" and SAP Fieldglass "Related" for the backup; Bullhorn One credit links.
import { ArrowLeftIcon, EllipsisIcon, FileImageIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { InvoiceDetail } from "@/server/invoices/queries";
import type { InvoiceReceivables, PaymentClients } from "@/server/receivables/queries";
import { dateRange, longDate, money } from "../format";
import { InvoicePayments } from "../receivables/invoice-payments";
import { downloadHref, InvoiceStatusBadge } from "./invoices-table";

type Line = NonNullable<InvoiceDetail["printed"]>["lines"][number];

export function InvoicePage({ detail, back, ar, clients, today, canCollect }: { detail: InvoiceDetail; back: string; ar: InvoiceReceivables | null; clients: PaymentClients; today: string; canCollect: boolean }) {
  const t = useTranslations("invoices");
  const td = useTranslations("invoices.detail");
  const locale = useLocale();
  const r = detail.row;
  const credit = r.kind === "credit_note";
  const line = (l: Line, key: string) => (
    <TableRow key={key} data-testid="line-item">
      <TableCell>
        <span className="flex flex-col">
          <span>{l.description}</span>
          <span className="text-xs text-muted-foreground">{l.detail}</span>
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">{l.hours}</TableCell>
      <TableCell className="text-right tabular-nums">{l.rate}</TableCell>
      <TableCell className="text-right tabular-nums">{l.amount}</TableCell>
    </TableRow>
  );
  const summary: { label: string; value: string }[] = [
    { label: credit ? td("credited") : td("amountDue"), value: money(credit ? -r.totalCents : r.totalCents, locale) },
    { label: td("issued"), value: longDate(r.issuedOn, locale) },
    ...(credit ? [] : [{ label: td("due"), value: longDate(r.dueOn, locale) }]),
    { label: td("period"), value: dateRange(r.period.startsOn, r.period.endsOn, locale) },
    { label: td("po"), value: detail.poNumber ?? "—" },
    ...(detail.worksite ? [{ label: td("worksite"), value: detail.worksite }] : []),
    { label: td("template"), value: t(`template.${detail.template}`) },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-3">
        <Link href={back ? `/invoices?${back}` : "/invoices"} className={buttonVariants({ variant: "link", size: "sm", className: "w-fit px-0" })} data-testid="back-to-invoices">
          <ArrowLeftIcon />
          {td("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] leading-9 font-bold tracking-tight">
            {t(`kindTitle.${r.kind}`)} {r.number}
          </h1>
          <InvoiceStatusBadge status={r.status} />
          <div className="ml-auto flex items-center gap-2">
            <a href={downloadHref(r.id, "pdf")} download className={buttonVariants({ size: "sm" })} data-testid="download-pdf">
              {t("downloadPdf")}
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="icon-sm" variant="outline" aria-label={t("rowMenu", { number: r.number })} data-testid="invoice-menu" />}>
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {r.hasCsv && <DropdownMenuItem render={<a href={downloadHref(r.id, "csv")} download data-testid="download-csv" />}>{t("downloadCsv")}</DropdownMenuItem>}
                {r.hasVms && <DropdownMenuItem render={<a href={downloadHref(r.id, "vms")} download data-testid="download-vms" />}>{t("downloadVms")}</DropdownMenuItem>}
                {!r.hasCsv && !r.hasVms && <DropdownMenuItem disabled>{td("noOtherFiles")}</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-sm">
          <Link href={`/clients/${detail.client.id}`} className="font-medium underline-offset-4 hover:underline">
            {detail.client.name}
          </Link>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3 lg:grid-cols-7" data-testid="invoice-summary">
        {summary.map((f) => (
          <div key={f.label} className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd className="font-medium tabular-nums">{f.value}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3" aria-labelledby="lines-title">
        <h2 id="lines-title" className="text-lg font-semibold">
          {td("lines")}
        </h2>
        {detail.printed ? (
          <div className="min-w-0">
            <Table aria-labelledby="lines-title">
              <TableHeader>
                <TableRow>
                  <TableHead>{td("description")}</TableHead>
                  <TableHead className="text-right">{td("hours")}</TableHead>
                  <TableHead className="text-right">{td("rate")}</TableHead>
                  <TableHead className="text-right">{td("amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.printed.groups
                  ? detail.printed.groups.map((g, gi) => (
                      <Fragment key={gi}>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableCell colSpan={4} className="font-medium">
                            {g.title}
                          </TableCell>
                        </TableRow>
                        {g.lines.map((l, i) => line(l, `${gi}-${i}`))}
                        <TableRow>
                          <TableCell colSpan={3} className="text-right text-muted-foreground">
                            {td("workerSubtotal", { worker: g.title })}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{g.subtotal}</TableCell>
                        </TableRow>
                      </Fragment>
                    ))
                  : detail.printed.lines.map((l, i) => line(l, String(i)))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right">
                    {td("subtotal")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{detail.printed.subtotal}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">
                    {credit ? td("totalCredited") : td("total")}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{detail.printed.total}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="lines-in-pdf">
            {td("linesInPdf")}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="backup-title">
        <h2 id="backup-title" className="text-lg font-semibold">
          {td("backup")}
        </h2>
        {!detail.backup || (!detail.backup.detail && detail.backup.images.length === 0) ? (
          <p className="text-sm text-muted-foreground" data-testid="no-backup">
            {detail.backup ? td("noBackup") : td("linesInPdf")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y border-y text-sm" data-testid="backup-list">
            <li className="flex items-center justify-between gap-3 p-3">
              <span>{td("hoursDetail")}</span>
              <Badge variant="outline">{detail.backup.detail ? td("included") : td("notIncluded")}</Badge>
            </li>
            {detail.backup.images.map((img) => (
              <li key={img.documentId} className="flex flex-wrap items-center justify-between gap-3 p-3" data-testid="backup-timesheet">
                <span className="inline-flex items-center gap-2">
                  <FileImageIcon className="size-4 text-muted-foreground" />
                  {img.filename}
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  {img.pages.map((p) => (
                    <a key={p} href={`/api/documents/${img.documentId}/pages/${p}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                      {td("page", { page: p })}
                    </a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ar && !credit && <InvoicePayments invoiceId={r.id} number={r.number} clientId={detail.client.id} ar={ar} clients={clients} today={today} canChange={canCollect} />}

      <section className="flex flex-col gap-3" aria-labelledby="related-title">
        <h2 id="related-title" className="text-lg font-semibold">
          {td("related")}
        </h2>
        <ul className="flex flex-col divide-y border-y text-sm" data-testid="related-list">
          {detail.original && (
            <li className="flex flex-wrap items-center justify-between gap-3 p-3">
              <span className="text-muted-foreground">{credit ? td("credits") : td("addsTo")}</span>
              <Link href={`/invoices/${detail.original.id}`} className="font-medium underline-offset-4 hover:underline">
                {detail.original.number}
              </Link>
            </li>
          )}
          {detail.corrections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3" data-testid="related-correction">
              <span className="inline-flex items-center gap-2">
                <Link href={`/invoices/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                  {c.number}
                </Link>
                <Badge variant="outline">{t(`kind.${c.kind}`)}</Badge>
              </span>
              <span className="tabular-nums">
                {money(c.totalCents, locale)} · {longDate(c.issuedOn, locale)}
              </span>
            </li>
          ))}
          <li className="flex flex-wrap items-center justify-between gap-3 p-3">
            <span className="text-muted-foreground">{td("run", { version: detail.run.version })}</span>
            <Link href={{ pathname: "/convert", query: { period: r.period.id, step: "files" } }} className="font-medium underline-offset-4 hover:underline">
              {td("openFiles")}
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
