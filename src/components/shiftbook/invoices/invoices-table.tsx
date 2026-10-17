"use client";

// Pattern: docs/patterns/invoices.md — Stripe invoices list (amount, status badge, number, customer,
// dates, a ⋯ menu with Download PDF; the row opens the invoice); Bullhorn "# Selected" actions.
import { EllipsisIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, useRouter } from "@/i18n/navigation";
import type { InvoiceRow } from "@/server/invoices/queries";
import { dateRange, money, tableDate } from "../format";
import { TableFrame } from "../page";
import { Status, type Tone } from "../status";

/** One status language (decision 0029): issued is waiting on the client, paid is done. */
const INVOICE_TONE: Record<InvoiceRow["status"], Tone> = { draft: "neutral", issued: "info", paid: "success", void: "neutral" };

export function InvoiceStatusBadge({ status, size }: { status: InvoiceRow["status"]; size?: "default" | "lg" }) {
  const t = useTranslations("invoices");
  return (
    <Status tone={INVOICE_TONE[status]} size={size} data-testid="invoice-status">
      {t(`status.${status}`)}
    </Status>
  );
}

/** The documents stored with an invoice (made with the run; never made again). */
export function downloadHref(id: string, file: "pdf" | "csv" | "vms") {
  return `/api/files/invoice/${id}${file === "pdf" ? "" : `?file=${file}`}`;
}

export function InvoiceMenu({ row }: { row: InvoiceRow }) {
  const t = useTranslations("invoices");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("rowMenu", { number: row.number })} data-testid="invoice-menu" onClick={(e) => e.stopPropagation()} />}>
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<a href={downloadHref(row.id, "pdf")} download />}>{t("downloadPdf")}</DropdownMenuItem>
        {row.hasCsv && <DropdownMenuItem render={<a href={downloadHref(row.id, "csv")} download />}>{t("downloadCsv")}</DropdownMenuItem>}
        {row.hasVms && <DropdownMenuItem render={<a href={downloadHref(row.id, "vms")} download data-testid="download-vms" />}>{t("downloadVms")}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InvoicesTable(props: { rows: InvoiceRow[]; selected?: Set<string>; onSelect?: (ids: string[], on: boolean) => void; back?: string; showClient?: boolean }) {
  const t = useTranslations("invoices");
  const locale = useLocale();
  const router = useRouter();
  const selectable = props.selected !== undefined && props.onSelect !== undefined;
  const all = selectable && props.rows.length > 0 && props.rows.every((r) => props.selected!.has(r.id));
  const some = selectable && props.rows.some((r) => props.selected!.has(r.id));
  const href = (r: InvoiceRow) => (props.back ? `/invoices/${r.id}?back=${encodeURIComponent(props.back)}` : `/invoices/${r.id}`);
  return (
    <TableFrame>
      <Table aria-label={t("title")} data-testid="invoices-list">
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-0">
                <Checkbox checked={all} indeterminate={some && !all} onCheckedChange={(on) => props.onSelect!(props.rows.map((r) => r.id), on === true)} aria-label={t("selectAll")} />
              </TableHead>
            )}
            <TableHead className="text-right">{t("col.amount")}</TableHead>
            <TableHead>{t("col.status")}</TableHead>
            <TableHead>{t("col.number")}</TableHead>
            {props.showClient !== false && <TableHead>{t("col.client")}</TableHead>}
            <TableHead>{t("col.period")}</TableHead>
            <TableHead>{t("col.issued")}</TableHead>
            <TableHead>{t("col.due")}</TableHead>
            <TableHead className="w-0">
              <span className="sr-only">{t("col.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.rows.map((r) => (
            <TableRow key={r.id} className="cursor-pointer" data-testid="invoice-list-row" data-state={selectable && props.selected!.has(r.id) ? "selected" : undefined} onClick={() => router.push(href(r))}>
              {selectable && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={props.selected!.has(r.id)} onCheckedChange={(on) => props.onSelect!([r.id], on === true)} aria-label={t("select", { number: r.number })} data-testid="invoice-select" />
                </TableCell>
              )}
              <TableCell className="text-right font-semibold tabular-nums">{money(r.totalCents, locale)}</TableCell>
              <TableCell>
                <InvoiceStatusBadge status={r.status} />
              </TableCell>
              <TableCell>
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Link href={href(r)} className="font-medium underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
                    {r.number}
                  </Link>
                  {r.kind !== "invoice" && <Badge variant="outline">{t(`kind.${r.kind}`)}</Badge>}
                </span>
              </TableCell>
              {props.showClient !== false && <TableCell>{r.clientName}</TableCell>}
              <TableCell className="whitespace-nowrap">{dateRange(r.period.startsOn, r.period.endsOn, locale)}</TableCell>
              <TableCell className="whitespace-nowrap">{tableDate(r.issuedOn, locale)}</TableCell>
              <TableCell className="whitespace-nowrap">{r.kind === "credit_note" ? "—" : tableDate(r.dueOn, locale)}</TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <InvoiceMenu row={r} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
