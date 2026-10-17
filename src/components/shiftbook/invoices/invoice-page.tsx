"use client";

// Pattern: docs/patterns/invoices/[id].md — Stripe invoice details (header with the number, status
// and actions; amount and dates; line items; history with related documents); TempWorks "Preview
// Invoice w/ Timecards" and SAP Fieldglass "Related" for the backup; Bullhorn One credit links.
import { EllipsisIcon, FileImageIcon, SendIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { InvoiceDetail } from "@/server/invoices/queries";
import type { InvoiceReceivables, PaymentClients } from "@/server/receivables/queries";
import { dateRange, longDate, money } from "../format";
import { Crumbs, Facts, Page, PageHeader, RECORD_LINK, RecordLayout, Section } from "../page";
import { InvoicePayments } from "../receivables/invoice-payments";
import { downloadHref, InvoiceStatusBadge } from "./invoices-table";
import { CreditNoteDialog, PromiseDialog, SendInvoiceDialog, VoidCreditDialog } from "./collect-dialogs";
import { useDateTime } from "../agency-zone";

/** Slice r: when it was last emailed, what may still be credited, the promises to pay (invoices/[id].md). */
export interface InvoiceCollect {
  lastSent: { to: string; at: string } | null;
  reminders: number;
  billingEmail: string | null;
  roomCents: number;
  promises: { promisedOn: string; amountCents: number | null; note: string | null; by: string; at: string }[];
}

type Line = NonNullable<InvoiceDetail["printed"]>["lines"][number];

export function InvoicePage({ detail, back, ar, clients, today, canCollect, collect }: { detail: InvoiceDetail; back: string; ar: InvoiceReceivables | null; clients: PaymentClients; today: string; canCollect: boolean; collect: InvoiceCollect }) {
  const t = useTranslations("invoices");
  const td = useTranslations("invoices.detail");
  const tc = useTranslations("common");
  const tl = useTranslations("invoice");
  const tp = useTranslations("invoicePayments");
  const locale = useLocale();
  const r = detail.row;
  const credit = r.kind === "credit_note";
  const tk = useTranslations("collect");
  const when = useDateTime();
  const [dialog, setDialog] = useState<"send" | "credit" | "promise" | "void" | null>(null);
  const tv = useTranslations("voidCredit");
  const live = r.status !== "void";
  // Each line's detail in the reader's language when its parts say exactly what was printed; else as printed.
  const detailOf = (l: Line) =>
    l.parts
      ? [
          `${tl(`earning.${l.parts.type}`)}${l.parts.notBillable ? ` (${tl("notBillable")})` : ""}`,
          tl("weekOf", { date: longDate(l.parts.week, locale) }),
          ...(l.parts.po === "none" ? [tl("noPo")] : l.parts.po ? [tl("poLine", { po: l.parts.po.po })] : []),
          ...(l.parts.wasNow ? [tl("wasNow", l.parts.wasNow)] : []),
        ].join(" · ")
      : l.detail;
  const line = (l: Line, key: string) => (
    <TableRow key={key} data-testid="line-item">
      <TableCell>
        <span className="flex flex-col">
          <span>{l.description}</span>
          <span className="text-xs text-muted-foreground" data-testid="line-detail">
            {detailOf(l)}
          </span>
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">{l.hours}</TableCell>
      <TableCell className="text-right tabular-nums">{l.rate}</TableCell>
      <TableCell className="text-right tabular-nums">{l.amount}</TableCell>
    </TableRow>
  );
  const clientLink = (
    <Link href={`/clients/${detail.client.id}`} className={RECORD_LINK} data-testid="invoice-client">
      {detail.client.name}
    </Link>
  );
  // Once money came in, what was paid and what is left, as the Payments module says it (Stripe's
  // amount paid and amount remaining); before that, the amount due.
  const amounts: { label: string; value: ReactNode; testId?: string }[] = credit
    ? [{ label: td("credited"), value: money(-r.totalCents, locale) }]
    : ar && ar.paidCents > 0
      ? [
          { label: td("amountPaid"), value: money(ar.paidCents, locale), testId: "summary-paid" },
          { label: ar.balanceCents < 0 ? tp("creditForClient") : tp("balance"), value: ar.balanceCents === 0 ? tp("paidInFull") : money(Math.abs(ar.balanceCents), locale), testId: "summary-balance" },
        ]
      : [{ label: td("amountDue"), value: money(r.totalCents, locale), testId: "summary-due" }];
  const summary: { label: string; value: ReactNode; testId?: string }[] = [
    ...amounts,
    ...(detail.voided ? [{ label: tv("voided"), value: tv("voidedLine", { date: when(detail.voided.at, { time: false }), by: detail.voided.by, reason: detail.voided.reason }), testId: "summary-voided" }] : []),
    { label: td("issued"), value: longDate(r.issuedOn, locale) },
    // Stripe shows when an invoice was sent; Granite says to whom too.
    { label: tk("send.action"), value: collect.lastSent ? tk("send.lastSent", { date: when(collect.lastSent.at, { time: false }), email: collect.lastSent.to }) : tk("send.never"), testId: "summary-sent" },
    ...(credit ? [] : [{ label: td("due"), value: longDate(r.dueOn, locale) }]),
    { label: td("period"), value: dateRange(r.period.startsOn, r.period.endsOn, locale) },
    { label: td("po"), value: detail.poNumber ?? "—" },
    { label: td("worksite"), value: detail.worksite ?? "—", testId: "summary-worksite" },
    { label: td("template"), value: t(`template.${detail.template}`) },
    { label: td("client"), value: clientLink },
  ];

  return (
    <Page>
      <PageHeader
        context={<Crumbs label={tc("breadcrumb")} items={[{ label: td("back"), href: back ? `/invoices?${back}` : "/invoices", testId: "back-to-invoices" }]} />}
        title={`${t(`kindTitle.${r.kind}`)} ${r.number}`}
        status={<InvoiceStatusBadge status={r.status} />}
        description={
          <span className="tabular-nums">
            {money(credit ? -r.totalCents : r.totalCents, locale)} · {clientLink}
          </span>
        }
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="icon-sm" variant="outline" aria-label={t("rowMenu", { number: r.number })} data-testid="invoice-menu" />}>
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canCollect && live && !credit && (
                  <DropdownMenuItem onClick={() => setDialog("credit")} data-testid="issue-credit-note">
                    {tk("credit.action")}
                  </DropdownMenuItem>
                )}
                {canCollect && live && credit && detail.manualCredit && (
                  <DropdownMenuItem variant="destructive" onClick={() => setDialog("void")} data-testid="void-credit-note">
                    {tv("action")}
                  </DropdownMenuItem>
                )}
                {canCollect && live && !credit && ar && ar.balanceCents > 0 && (
                  <DropdownMenuItem onClick={() => setDialog("promise")} data-testid="record-promise">
                    {tk("promise.action")}
                  </DropdownMenuItem>
                )}
                {r.hasCsv && <DropdownMenuItem render={<a href={downloadHref(r.id, "csv")} download data-testid="download-csv" />}>{t("downloadCsv")}</DropdownMenuItem>}
                {r.hasVms && <DropdownMenuItem render={<a href={downloadHref(r.id, "vms")} download data-testid="download-vms" />}>{t("downloadVms")}</DropdownMenuItem>}
                {!r.hasCsv && !r.hasVms && <DropdownMenuItem disabled>{td("noOtherFiles")}</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
            {canCollect && live && (
              <Button size="sm" variant="outline" onClick={() => setDialog("send")} data-testid="send-invoice">
                <SendIcon />
                {credit ? tk("send.creditAction") : collect.lastSent ? tk("send.resend") : tk("send.action")}
              </Button>
            )}
            <a href={downloadHref(r.id, "pdf")} download className={buttonVariants({ size: "sm" })} data-testid="download-pdf">
              {t("downloadPdf")}
            </a>
          </>
        }
      />

      <RecordLayout
        aside={
          <Section id="summary-title" title={td("summary")} testId="invoice-summary">
            <Facts items={summary} />
          </Section>
        }
      >
      <Section id="lines-title" title={td("lines")}>
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
      </Section>

      <Section id="backup-title" title={td("backup")}>
        {!detail.backup || (!detail.backup.detail && detail.backup.images.length === 0) ? (
          <p className="text-sm text-muted-foreground" data-testid="no-backup">
            {detail.backup ? td("noBackup") : td("linesInPdf")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y text-sm" data-testid="backup-list">
            <li className="flex items-center justify-between gap-3 py-3">
              <span>{td("hoursDetail")}</span>
              <Badge variant="outline">{detail.backup.detail ? td("included") : td("notIncluded")}</Badge>
            </li>
            {detail.backup.images.map((img) => (
              <li key={img.documentId} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="backup-timesheet">
                <span className="inline-flex items-center gap-2">
                  <FileImageIcon className="size-4 text-muted-foreground" />
                  {img.filename}
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  {img.pages.map((p) => (
                    <a key={p} href={`/api/documents/${img.documentId}/pages/${p}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      {td("page", { page: p })}
                    </a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {ar && !credit && <InvoicePayments invoiceId={r.id} number={r.number} clientId={detail.client.id} ar={ar} clients={clients} today={today} canChange={canCollect} promises={collect.promises} onPromise={() => setDialog("promise")} />}
      {dialog === "send" && <SendInvoiceDialog invoiceId={r.id} number={r.number} kind={r.kind} billingEmail={collect.billingEmail} onClose={() => setDialog(null)} />}
      {dialog === "credit" && <CreditNoteDialog invoiceId={r.id} number={r.number} roomCents={collect.roomCents} balanceCents={ar?.balanceCents ?? r.totalCents} onClose={() => setDialog(null)} />}
      {dialog === "promise" && <PromiseDialog invoiceId={r.id} number={r.number} today={today} onClose={() => setDialog(null)} />}
      {dialog === "void" && <VoidCreditDialog creditNoteId={r.id} number={r.number} amountCents={-r.totalCents} onClose={() => setDialog(null)} />}

      <Section id="related-title" title={td("related")}>
        <ul className="flex flex-col divide-y text-sm" data-testid="related-list">
          {detail.original && (
            <li className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-muted-foreground">{credit ? td("credits") : td("addsTo")}</span>
              <Link href={`/invoices/${detail.original.id}`} className="font-medium underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                {detail.original.number}
              </Link>
            </li>
          )}
          {detail.corrections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="related-correction">
              <span className="inline-flex items-center gap-2">
                <Link href={`/invoices/${c.id}`} className="font-medium underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                  {c.number}
                </Link>
                <Badge variant="outline">{t(`kind.${c.kind}`)}</Badge>
              </span>
              <span className="tabular-nums">
                {money(c.totalCents, locale)} · {longDate(c.issuedOn, locale)}
              </span>
            </li>
          ))}
          <li className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="text-muted-foreground">{td("run", { version: detail.run.version })}</span>
            <Link href={{ pathname: "/convert", query: { period: r.period.id, step: "files" } }} className="font-medium underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              {td("openFiles")}
            </Link>
          </li>
        </ul>
      </Section>
      </RecordLayout>
    </Page>
  );
}
