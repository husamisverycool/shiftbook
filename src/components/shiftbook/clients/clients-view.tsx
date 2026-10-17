"use client";

// Pattern: docs/patterns/clients.md — Stripe customers list (the name opens the customer's page), drawn
// as Stripe's current lists: the table under a hairline, sentence-case headings, the number of results under it.
import { Building2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { ClientRow } from "@/server/clients/queries";
import { EmptyState } from "../empty-state";
import { ResultsCount } from "../list-controls";
import { Page, PageHeader, TableFrame } from "../page";

export function ClientsView({ rows }: { rows: ClientRow[] }) {
  const t = useTranslations("clients");
  const ti = useTranslations("invoices");
  return (
    <Page>
      <PageHeader title={t("title")} />
      {rows.length === 0 ? (
        <EmptyState
          icon={Building2Icon}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Link href="/job-orders" className={buttonVariants({ size: "sm" })}>
              {t("emptyLink")}
            </Link>
          }
          testId="clients-empty"
        />
      ) : (
        <TableFrame className="flex flex-col gap-4 border-t">
          <Table aria-label={t("title")} data-testid="clients-list">
            <TableHeader>
              <TableRow>
                <TableHead>{t("col.name")}</TableHead>
                <TableHead>{t("col.code")}</TableHead>
                <TableHead>{t("col.template")}</TableHead>
                <TableHead>{t("col.separateBy")}</TableHead>
                <TableHead className="text-right">{t("col.terms")}</TableHead>
                <TableHead>{t("col.vms")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} data-testid="client-row">
                  <TableCell className="font-medium">
                    <Link href={`/clients/${c.id}`} className="underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{c.code}</TableCell>
                  {c.settings ? (
                    <>
                      <TableCell>{ti(`template.${c.settings.invoiceTemplate}`)}</TableCell>
                      <TableCell>{c.settings.separateBy.length === 0 ? t("notSeparated") : c.settings.separateBy.map((x) => t(`separate.${x}`)).join(", ")}</TableCell>
                      <TableCell className="text-right tabular-nums">{t("termsDays", { days: c.settings.paymentTermsDays })}</TableCell>
                      <TableCell>{c.settings.vmsFormat ? t(`vms.${c.settings.vmsFormat}`) : "—"}</TableCell>
                    </>
                  ) : (
                    <TableCell colSpan={4} className="text-muted-foreground">
                      {t("noSettings")}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ResultsCount shown={rows.length} testId="client-count" />
        </TableFrame>
      )}
    </Page>
  );
}
