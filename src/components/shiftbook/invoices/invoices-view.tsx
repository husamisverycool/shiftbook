"use client";

// Pattern: docs/patterns/invoices.md — Stripe invoices list (status chips in the address, a status
// badge per row, a ⋯ menu, the row opens the invoice); Bullhorn "# Selected" actions; Avionté
// Invoice Merge (one customer's invoices) for Make statement.
import { ListFilterIcon, ReceiptTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { InvoiceRow } from "@/server/invoices/queries";
import { EmptyState } from "../empty-state";
import { Page, PageHeader, PageTabs } from "../page";
import { InvoicesTable } from "./invoices-table";

const STATUSES = ["issued", "paid", "void"] as const;

export function InvoicesView({ rows }: { rows: InvoiceRow[] }) {
  const t = useTranslations("invoices");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = STATUSES.find((s) => s === params.get("status")) ?? "";
  const client = params.get("client") ?? "";
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
  const clear = () => router.replace(pathname);
  const clients = [...new Map(rows.map((r) => [r.clientId, r.clientName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const shown = rows.filter((r) => (status === "" || r.status === status) && (client === "" || r.clientId === client));
  const chosen = rows.filter((r) => selected.has(r.id));
  const oneClient = new Set(chosen.map((r) => r.clientId)).size === 1;
  const early = chosen.find((r) => !r.hasDocument);
  const select = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  return (
    <Page>
      {/* Stripe's invoices list: the title, then the statuses as underline tabs with their counts and the
          client filter beside them; they stay in place when there is nothing yet (_components/empty-state.md). */}
      <PageHeader
        title={t("title")}
        tabs={
          <PageTabs
            label={t("filterStatus")}
            current={status || "all"}
            tabs={(["", ...STATUSES] as const).map((s) => ({
              key: s || "all",
              label: s === "" ? t("all") : t(`status.${s}`),
              count: rows.filter((r) => (s === "" || r.status === s) && (client === "" || r.clientId === client)).length,
              href: { pathname: "/invoices", query: { ...(s ? { status: s } : {}), ...(client ? { client } : {}) } },
              testId: `status-chip-${s || "all"}`,
            }))}
            end={
              <>
                {(status || client) && (
                  <Button size="sm" variant="ghost" onClick={clear}>
                    {t("clearFilters")}
                  </Button>
                )}
                <NativeSelect aria-label={t("filterClient")} value={client} onChange={(e) => setParam("client", e.target.value)} className="w-64">
                  <NativeSelectOption value="">
                    {t("filterClient")}: {t("any")}
                  </NativeSelectOption>
                  {clients.map(([id, name]) => (
                    <NativeSelectOption key={id} value={id}>
                      {name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </>
            }
          />
        }
      />

      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm" role="region" aria-label={t("selection")} data-testid="selection-bar">
          <span className="font-medium">{t("selectedCount", { count: chosen.length })}</span>
          {oneClient && !early ? (
            <a href={`/api/files/statement?ids=${chosen.map((r) => r.id).join(",")}`} download className={buttonVariants({ size: "sm" })} data-testid="make-statement">
              {t("makeStatement")}
            </a>
          ) : (
            <Button size="sm" disabled data-testid="make-statement">
              {t("makeStatement")}
            </Button>
          )}
          {!oneClient && <span className="text-muted-foreground">{t("oneClientOnly")}</span>}
          {oneClient && early && <span className="text-muted-foreground">{t("beforeStatements", { number: early.number })}</span>}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {t("clearSelection")}
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={ReceiptTextIcon}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Link href="/convert" className={buttonVariants({ size: "sm" })}>
              {t("emptyLink")}
            </Link>
          }
          testId="invoices-empty"
        />
      ) : shown.length === 0 ? (
        <EmptyState
          kind="filtered"
          icon={ListFilterIcon}
          title={t("noResults")}
          action={
            <Button variant="outline" size="sm" onClick={clear}>
              {t("clearFilters")}
            </Button>
          }
        />
      ) : (
        <InvoicesTable rows={shown} selected={selected} onSelect={select} back={params.toString()} />
      )}
    </Page>
  );
}
