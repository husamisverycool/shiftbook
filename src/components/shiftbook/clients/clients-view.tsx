"use client";

// Pattern: docs/patterns/clients.md — Stripe customers list (the name opens the customer's page), drawn
// as Stripe's current lists: the table under a hairline, sentence-case headings, the number of results under it.
import { ArchiveIcon, Building2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { ClientRow } from "@/server/clients/queries";
import { useCan } from "../abilities";
import { EmptyState } from "../empty-state";
import { AddClientButton } from "./client-setup";
import { ResultsCount } from "../list-controls";
import { Page, PageHeader, TableFrame } from "../page";

export function ClientsView({ rows, archivedCount, showArchived }: { rows: ClientRow[]; archivedCount: number; showArchived: boolean }) {
  const t = useTranslations("clients");
  const ts = useTranslations("clientSetup");
  const ti = useTranslations("invoices");
  const can = useCan();
  return (
    <Page>
      <PageHeader
        title={t("title")}
        actions={
          <>
            {archivedCount > 0 && (
              <Link href={showArchived ? "/clients" : { pathname: "/clients", query: { archived: "1" } }} className={buttonVariants({ size: "sm", variant: "outline" })} data-testid="toggle-archived">
                <ArchiveIcon />
                {showArchived ? ts("hideArchived") : ts("showArchived")}
              </Link>
            )}
            {can("clients") && <AddClientButton />}
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={Building2Icon} title={t("emptyTitle")} description={t("emptyBody")} action={can("clients") ? <AddClientButton shortcut={false} /> : undefined} testId="clients-empty" />
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
                    {c.archived && (
                      <Badge variant="secondary" className="ml-2">
                        {ts("archived")}
                      </Badge>
                    )}
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
