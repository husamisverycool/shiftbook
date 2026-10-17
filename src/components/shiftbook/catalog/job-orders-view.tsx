"use client";

// Pattern: docs/patterns/job-orders.md — Linear issue list grouped by client, Attio preview panel. Each
// row's status icon says how filled the order is, as Linear's circle says how far an issue is: empty
// (no one placed), half (some places open), checked (filled). Lucide's icons, not Linear's.
import { BriefcaseIcon, Building2Icon, CircleCheckIcon, CircleIcon, ClockIcon, ContrastIcon, LandmarkIcon, MapPinIcon, PlusIcon, ReceiptTextIcon, UsersIcon, WalletIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { JobOrderRow } from "@/server/catalog/queries";
import { ReadOnlyNote, useCan } from "../abilities";
import { EmptyState } from "../empty-state";
import { money } from "../format";
import { ActivityList } from "./activity";
import { JobOrderForm, type CatalogOptions } from "./job-order-form";
import { RecordList, type Column, type RowIcon } from "./record-list";
import { StaffRequests } from "./staff-requests";
import type { StaffRequestView } from "@/server/portal/service";

export function JobOrdersView({ rows, options, requests = [] }: { rows: JobOrderRow[]; options: CatalogOptions; requests?: StaffRequestView[] }) {
  const ts = useTranslations("staffRequests");
  const t = useTranslations("jobOrders");
  const locale = useLocale();
  // Decision 0026: job orders are changed by the Owner and coordinators (placements).
  const mayChange = useCan()("placements");
  const [creating, setCreating] = useState(false);
  // The command menu's "Create a job order…" arrives with ?new=1 and opens the form once (decision 0038).
  const askedToCreate = useSearchParams().get("new") === "1";
  const [answered, setAnswered] = useState(false);
  if (askedToCreate && !answered) {
    setAnswered(true);
    if (mayChange) setCreating(true);
  }
  if (!askedToCreate && answered) setAnswered(false);
  const tl = useTranslations("list");
  const rate = (c: number | null) => (c === null ? "—" : money(c, locale));

  const fill = (r: JobOrderRow): RowIcon =>
    r.assigned >= r.headcount ? { icon: CircleCheckIcon, tone: "success", label: t("fill.full") } : r.assigned > 0 ? { icon: ContrastIcon, tone: "warning", label: t("fill.partly") } : { icon: CircleIcon, tone: "neutral", label: t("fill.none") };
  const columns: Column<JobOrderRow>[] = [
    { key: "worksite", label: t("col.worksite"), cell: (r) => `${r.city}, ${r.state}`, className: "w-36 truncate text-right", chip: true, icon: MapPinIcon },
    { key: "headcount", label: t("col.headcount"), cell: (r) => t("assignedOf", { assigned: r.assigned, wanted: r.headcount }), className: "w-24 text-right tabular-nums", chip: true, icon: UsersIcon },
    // Two amounts side by side say which is which (the pattern's "pay rate" and "bill rate").
    { key: "pay", label: t("col.pay"), cell: (r) => tl("payRate", { rate: rate(r.payRateCents) }), className: "w-32 text-right tabular-nums", chip: true, icon: WalletIcon },
    { key: "bill", label: t("col.bill"), cell: (r) => tl("billRate", { rate: rate(r.billRateCents) }), className: "w-32 text-right tabular-nums", chip: true, icon: ReceiptTextIcon },
    { key: "shift", label: t("col.shift"), cell: (r) => r.shift ?? "—", className: "w-28 truncate text-right", chip: true, icon: ClockIcon },
    { key: "soc", label: t("col.soc"), cell: (r) => r.socCode ?? "—", className: "w-20 tabular-nums" },
    { key: "prevailing", label: t("col.prevailing"), cell: (r) => (r.prevailingWage ? <Badge variant="outline">{t("prevailing")}</Badge> : null), className: "w-28" },
    { key: "requested", label: ts("marker"), cell: (r) => (r.requestedByClient ? <Badge variant="outline" data-testid="requested-by-client">{ts("marker")}</Badge> : null), className: "w-40" },
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
        defaultColumns={["worksite", "headcount", "pay", "bill", "requested"]}
        above={<StaffRequests requests={requests} mayDecide={mayChange} />}
        status={fill}
        groupings={[
          { key: "client", label: t("group.client"), value: (r) => r.clientName, icon: () => ({ icon: Building2Icon, tone: "neutral", label: t("group.client") }) },
          { key: "state", label: t("group.state"), value: (r) => r.state, icon: () => ({ icon: MapPinIcon, tone: "neutral", label: t("group.state") }) },
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
          { key: "client", label: t("filter.client"), icon: Building2Icon, options: options.clients.map((c) => ({ value: c.id, label: c.name })), test: (r, v) => r.clientId === v },
          {
            key: "state",
            label: t("filter.state"),
            icon: MapPinIcon,
            options: [...new Set(rows.map((r) => r.state))].sort().map((s) => ({ value: s, label: s })),
            test: (r, v) => r.state === v,
          },
          { key: "prevailing", label: t("filter.prevailing"), icon: LandmarkIcon, options: [{ value: "yes", label: t("yes") }, { value: "no", label: t("no") }], test: (r, v) => r.prevailingWage === (v === "yes") },
          { key: "open", label: t("filter.open"), icon: UsersIcon, options: [{ value: "yes", label: t("yes") }, { value: "no", label: t("no") }], test: (r, v) => r.assigned < r.headcount === (v === "yes") },
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
              <Link href={`/job-orders/${r.id}?tab=activity`} className="text-sm underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
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
            <p className="text-sm text-muted-foreground">{<ReadOnlyNote text={t("readOnly")} />}</p>
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
