"use client";

// Pattern: docs/patterns/job-orders.md — Linear issue list grouped by client, Attio preview panel.
import { BriefcaseIcon, PlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { JobOrderRow } from "@/server/catalog/queries";
import { useCan } from "../abilities";
import { EmptyState } from "../empty-state";
import { money } from "../format";
import { ActivityList } from "./activity";
import { JobOrderForm, type CatalogOptions } from "./job-order-form";
import { RecordList, type Column } from "./record-list";

export function JobOrdersView({ rows, options }: { rows: JobOrderRow[]; options: CatalogOptions }) {
  const t = useTranslations("jobOrders");
  const locale = useLocale();
  // Decision 0026: job orders are changed by the Owner and coordinators (placements).
  const mayChange = useCan()("placements");
  const [creating, setCreating] = useState(false);
  const tl = useTranslations("list");
  const rate = (c: number | null) => (c === null ? "—" : money(c, locale));

  const columns: Column<JobOrderRow>[] = [
    { key: "worksite", label: t("col.worksite"), cell: (r) => `${r.city}, ${r.state}`, className: "w-36 truncate text-right", chip: true },
    { key: "headcount", label: t("col.headcount"), cell: (r) => t("assignedOf", { assigned: r.assigned, wanted: r.headcount }), className: "w-24 text-right tabular-nums", chip: true },
    // Two amounts side by side say which is which (the pattern's "pay rate" and "bill rate").
    { key: "pay", label: t("col.pay"), cell: (r) => tl("payRate", { rate: rate(r.payRateCents) }), className: "w-28 text-right tabular-nums", chip: true },
    { key: "bill", label: t("col.bill"), cell: (r) => tl("billRate", { rate: rate(r.billRateCents) }), className: "w-28 text-right tabular-nums", chip: true },
    { key: "shift", label: t("col.shift"), cell: (r) => r.shift ?? "—", className: "w-24 truncate text-right", chip: true },
    { key: "soc", label: t("col.soc"), cell: (r) => r.socCode ?? "—", className: "w-20 tabular-nums" },
    { key: "prevailing", label: t("col.prevailing"), cell: (r) => (r.prevailingWage ? <Badge variant="outline">{t("prevailing")}</Badge> : null), className: "w-28" },
  ];

  return (
    <>
      <RecordList
        storageKey="shiftbook.display.job-orders"
        title={t("title")}
        rows={rows}
        primary={(r) => (r.shift ? `${r.position} · ${r.shift}` : r.position)}
        secondary={(r, grouping) => (grouping === "client" ? r.worksiteName : `${r.clientName} · ${r.worksiteName}`)}
        hrefFor={(r) => `/job-orders/${r.id}`}
        columns={columns}
        defaultColumns={["worksite", "headcount", "pay", "bill"]}
        groupings={[
          { key: "client", label: t("group.client"), value: (r) => r.clientName },
          { key: "state", label: t("group.state"), value: (r) => r.state },
          { key: "none", label: t("group.none"), value: null },
        ]}
        defaultGrouping="client"
        orderings={[
          { key: "position", label: t("order.position"), value: (r) => r.position },
          { key: "client", label: t("order.client"), value: (r) => r.clientName },
          { key: "created", label: t("order.created"), value: (r) => r.createdAt },
        ]}
        defaultOrdering="position"
        filters={[
          { key: "client", label: t("filter.client"), options: options.clients.map((c) => ({ value: c.id, label: c.name })), test: (r, v) => r.clientId === v },
          {
            key: "state",
            label: t("filter.state"),
            options: [...new Set(rows.map((r) => r.state))].sort().map((s) => ({ value: s, label: s })),
            test: (r, v) => r.state === v,
          },
          { key: "prevailing", label: t("filter.prevailing"), options: [{ value: "yes", label: t("yes") }, { value: "no", label: t("no") }], test: (r, v) => r.prevailingWage === (v === "yes") },
          { key: "open", label: t("filter.open"), options: [{ value: "yes", label: t("yes") }, { value: "no", label: t("no") }], test: (r, v) => r.assigned < r.headcount === (v === "yes") },
        ]}
        panel={(r) => (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("col.client")}</dt>
              <dd>{r.clientName}</dd>
              <dt className="text-muted-foreground">{t("col.worksite")}</dt>
              <dd>{`${r.worksiteName}, ${r.city}, ${r.state}`}</dd>
              <dt className="text-muted-foreground">{t("col.shift")}</dt>
              <dd>{r.shift ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("col.headcount")}</dt>
              <dd className="tabular-nums">{t("assignedOf", { assigned: r.assigned, wanted: r.headcount })}</dd>
              <dt className="text-muted-foreground">{t("col.pay")}</dt>
              <dd className="tabular-nums">{rate(r.payRateCents)}</dd>
              <dt className="text-muted-foreground">{t("col.bill")}</dt>
              <dd className="tabular-nums">{rate(r.billRateCents)}</dd>
              <dt className="text-muted-foreground">{t("col.prevailing")}</dt>
              <dd>{r.prevailingWage ? t("yes") : t("no")}</dd>
            </dl>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{t("recentActivity")}</h3>
              <ActivityList items={r.recent} compact />
              <Link href={`/job-orders/${r.id}?tab=activity`} className="text-sm underline-offset-4 hover:underline">
                {t("viewAllActivity")}
              </Link>
            </section>
          </>
        )}
        onCreate={mayChange ? () => setCreating(true) : undefined}
        actions={
          mayChange ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <PlusIcon />
              {t("create")}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
          )
        }
        empty={
          <EmptyState
            icon={BriefcaseIcon}
            title={t("empty")}
            description={t("emptyBody")}
            action={
              mayChange && (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <PlusIcon />
                  {t("create")}
                </Button>
              )
            }
          />
        }
      />
      {creating && <JobOrderForm onClose={() => setCreating(false)} options={options} />}
    </>
  );
}
