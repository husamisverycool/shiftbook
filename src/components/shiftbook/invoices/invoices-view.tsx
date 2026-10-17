"use client";

// Pattern: docs/patterns/invoices.md — Stripe invoices list (the statuses as boxes with their counts,
// the filters as pills under them, a status badge per row, a ⋯ menu, the row opens the invoice, the
// number of results under it); Bullhorn "# Selected" actions; Avionté Invoice Merge (one customer's
// invoices) for Make statement; a factor's schedule of accounts form for Schedule of accounts.
import { ListFilterIcon, ReceiptTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { InvoiceRow } from "@/server/invoices/queries";
import { useCan } from "../abilities";
import { EmptyState } from "../empty-state";
import { FilterPill, ListToolbar, PillChoices, ResultsCount, StatusTabs } from "../list-controls";
import { Page, PageHeader } from "../page";
import { Tip } from "../tip";
import { InvoicesTable } from "./invoices-table";

const STATUSES = ["issued", "paid", "void"] as const;

export function InvoicesView({ rows, today }: { rows: InvoiceRow[]; today: string }) {
  const t = useTranslations("invoices");
  const ts = useTranslations("scheduleOfAccounts");
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
  // A factor buys open receivables only (decision 0040): issued, owing, not a credit note.
  const can = useCan();
  const notOpen = chosen.find((r) => r.status !== "issued" || r.kind === "credit_note" || r.totalCents <= 0);
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
      {/* Stripe's invoices list: the title; the statuses as boxes with their counts; the filters as pills
          over a hairline that the table sits on. They stay in place when there is nothing yet
          (_components/empty-state.md). */}
      <PageHeader title={t("title")} />
      <StatusTabs
        label={t("filterStatus")}
        current={status || "all"}
        tabs={(["", ...STATUSES] as const).map((s) => ({
          key: s || "all",
          label: s === "" ? t("all") : t(`status.${s}`),
          count: rows.filter((r) => (s === "" || r.status === s) && (client === "" || r.clientId === client)).length,
          href: { pathname: "/invoices", query: { ...(s ? { status: s } : {}), ...(client ? { client } : {}) } },
          testId: `status-chip-${s || "all"}`,
        }))}
      />
      <div className="flex min-w-0 flex-col">
        <ListToolbar>
          <FilterPill label={t("filterClient")} value={clients.find(([id]) => id === client)?.[1]} onClear={() => setParam("client", "")} testId="client-filter">
            <PillChoices heading={t("filterClient")} value={client} options={clients.map(([id, name]) => ({ value: id, label: name }))} onChoose={(v) => setParam("client", v)} />
          </FilterPill>
        </ListToolbar>

        {chosen.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm" role="region" aria-label={t("selection")} data-testid="selection-bar">
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
            {can("cash") &&
              (!notOpen && !early ? (
                // A form, not a link: making a schedule records it, which a prefetch or a shared link must never do.
                <form method="post" action="/api/files/schedule-of-accounts" className="contents">
                  <input type="hidden" name="ids" value={chosen.map((r) => r.id).join(",")} />
                  <Tip label={ts("hint")}>
                    <Button type="submit" size="sm" variant="outline" data-testid="schedule-of-accounts">
                      {ts("action")}
                    </Button>
                  </Tip>
                </form>
              ) : (
                <Button size="sm" variant="outline" disabled data-testid="schedule-of-accounts">
                  {ts("action")}
                </Button>
              ))}
            {!oneClient && <span className="text-muted-foreground">{t("oneClientOnly")}</span>}
            {can("cash") && notOpen && <span className="text-muted-foreground">{ts("onlyOpen", { number: notOpen.number })}</span>}
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
          <div className="flex flex-col gap-4">
            <InvoicesTable rows={shown} selected={selected} onSelect={select} back={params.toString()} today={today} />
            <ResultsCount shown={shown.length} testId="invoice-count" />
          </div>
        )}
      </div>
    </Page>
  );
}
