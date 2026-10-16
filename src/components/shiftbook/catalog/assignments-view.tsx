"use client";

// Pattern: docs/patterns/assignments.md — Linear issue list grouped by status; rows show fields of
// the linked job order (Attio); Attio preview as the side panel; bulk bar ends assignments.
import { UploadIcon, UsersIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createAssignmentAction, endAssignmentsAction, setAssignmentPoAction } from "@/app/[locale]/(app)/job-orders/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Link, useRouter } from "@/i18n/navigation";
import type { AssignmentRow } from "@/server/catalog/queries";
import { longDate, money } from "../format";
import type { CatalogOptions } from "./job-order-form";
import { RecordList, type Column } from "./record-list";

export function AssignmentsView({ rows, options, today }: { rows: AssignmentRow[]; options: CatalogOptions; today: string }) {
  const t = useTranslations("assignments");
  const te = useTranslations("convert.errors");
  const locale = useLocale();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState<{ rows: AssignmentRow[]; clear: () => void } | null>(null);
  const [endDate, setEndDate] = useState(today);
  const [pending, run] = useTransition();
  const date = (d: string | null) => (d ? longDate(d, locale) : "—");
  const rate = (c: number | null) => (c === null ? "—" : money(c, locale));

  const columns: Column<AssignmentRow>[] = [
    { key: "start", label: t("col.start"), cell: (r) => date(r.startDate), className: "w-36" },
    { key: "end", label: t("col.end"), cell: (r) => date(r.endDate), className: "w-36" },
    { key: "pay", label: t("col.pay"), cell: (r) => rate(r.payRateCents), className: "w-20 text-right tabular-nums" },
    { key: "bill", label: t("col.bill"), cell: (r) => rate(r.billRateCents), className: "w-20 text-right tabular-nums" },
    { key: "rates", label: t("col.rates"), cell: (r) => (r.ownRates ? <Badge variant="outline">{t("ownRates")}</Badge> : null), className: "w-24" },
    { key: "source", label: t("col.source"), cell: (r) => r.source ?? "—", className: "w-24" },
  ];

  const end = () =>
    run(async () => {
      if (!ending) return;
      const r = await endAssignmentsAction(
        ending.rows.map((x) => x.id),
        endDate,
      );
      if ("ok" in r) toast.error(te("busy"));
      else {
        if (r.ended.length > 0) toast.success(t("ended", { count: r.ended.length }));
        for (const x of r.refused) toast.error(t(`errors.${x.error}`, { name: rows.find((a) => a.id === x.id)?.workerName ?? "" }));
        ending.clear();
        setEnding(null);
      }
      router.refresh();
    });

  return (
    <>
      <RecordList
        storageKey="shiftbook.display.assignments"
        title={t("title")}
        rows={rows}
        primary={(r) => r.workerName}
        secondary={(r) => `${r.position}${r.shift ? ` · ${r.shift}` : ""} · ${r.clientName}`}
        hrefFor={(r) => `/job-orders/${r.jobOrderId}?tab=assignments`}
        columns={columns}
        defaultColumns={["start", "end", "pay", "bill", "rates"]}
        groupings={[
          { key: "status", label: t("group.status"), value: (r) => t(`status.${r.status}`) },
          { key: "client", label: t("group.client"), value: (r) => r.clientName },
          { key: "jobOrder", label: t("group.jobOrder"), value: (r) => `${r.position}${r.shift ? ` · ${r.shift}` : ""} — ${r.clientName}` },
          { key: "none", label: t("group.none"), value: null },
        ]}
        defaultGrouping="status"
        orderings={[
          { key: "worker", label: t("order.worker"), value: (r) => r.workerName },
          { key: "start", label: t("order.start"), value: (r) => r.startDate },
          { key: "end", label: t("order.end"), value: (r) => r.endDate ?? "9999-12-31" },
        ]}
        defaultOrdering="worker"
        filters={[
          { key: "client", label: t("filter.client"), options: options.clients.map((c) => ({ value: c.name, label: c.name })), test: (r, v) => r.clientName === v },
          { key: "worker", label: t("filter.worker"), options: options.workers.map((w) => ({ value: w.id, label: w.name })), test: (r, v) => r.workerId === v },
          { key: "status", label: t("filter.status"), options: (["active", "ended", "cancelled"] as const).map((s) => ({ value: s, label: t(`status.${s}`) })), test: (r, v) => r.status === v },
          { key: "rates", label: t("filter.rates"), options: [{ value: "own", label: t("ratesKind.own") }, { value: "job", label: t("ratesKind.job") }], test: (r, v) => r.ownRates === (v === "own") },
        ]}
        panel={(r) => (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t("col.jobOrder")}</dt>
            <dd>
              <Link href={`/job-orders/${r.jobOrderId}`} className="underline-offset-4 hover:underline">{`${r.position}${r.shift ? ` · ${r.shift}` : ""}`}</Link>
            </dd>
            <dt className="text-muted-foreground">{t("col.client")}</dt>
            <dd>{r.clientName}</dd>
            <dt className="text-muted-foreground">{t("col.start")}</dt>
            <dd>{date(r.startDate)}</dd>
            <dt className="text-muted-foreground">{t("col.end")}</dt>
            <dd>{date(r.endDate)}</dd>
            <dt className="text-muted-foreground">{t("col.status")}</dt>
            <dd>{t(`status.${r.status}`)}</dd>
            <dt className="text-muted-foreground">{t("col.pay")}</dt>
            <dd className="tabular-nums">{rate(r.payRateCents)}</dd>
            <dt className="text-muted-foreground">{t("col.bill")}</dt>
            <dd className="tabular-nums">{rate(r.billRateCents)}</dd>
            <dt className="text-muted-foreground">{t("col.rates")}</dt>
            <dd>{t(r.ownRates ? "ratesKind.own" : "ratesKind.job")}</dd>
            <dt className="pt-2 text-muted-foreground">
              <label htmlFor={`po-${r.id}`}>{t("col.po")}</label>
            </dt>
            <dd>
              <PoField key={r.id} row={r} />
            </dd>
          </dl>
        )}
        onCreate={() => setCreating(true)}
        actions={
          <>
            <Link href="/assignments/import" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <UploadIcon />
              {t("import")}
            </Link>
            <Button size="sm" onClick={() => setCreating(true)}>
              {t("create")}
            </Button>
          </>
        }
        bulk={(selected, clear) => (
          <Button size="sm" variant="outline" onClick={() => setEnding({ rows: selected, clear })}>
            {t("end")}
          </Button>
        )}
        empty={
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <UsersIcon className="size-5" />
            <p>{t("empty")}</p>
            <div className="flex gap-4">
              <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setCreating(true)}>
                {t("create")}
              </Button>
              <Link href="/assignments/import" className="text-sm underline-offset-4 hover:underline">
                {t("import")}
              </Link>
            </div>
          </div>
        }
      />
      {creating && <CreateAssignment options={options} today={today} onClose={() => setCreating(false)} />}
      <Dialog open={ending !== null} onOpenChange={(open) => !open && setEnding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("endTitle", { count: ending?.rows.length ?? 0 })}</DialogTitle>
            <DialogDescription>{t("endBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-end-date">{t("col.end")}</Label>
            <Input id="bulk-end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnding(null)}>
              {t("keepOpen")}
            </Button>
            <Button disabled={pending || endDate === ""} onClick={end}>
              {t("end")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateAssignment({ options, today, onClose }: { options: CatalogOptions; today: string; onClose: () => void }) {
  const t = useTranslations("assignments");
  const te = useTranslations("convert.errors");
  const router = useRouter();
  const [workerId, setWorkerId] = useState("");
  const [jobOrderId, setJobOrderId] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const name = options.workers.find((w) => w.id === workerId)?.name ?? "";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("create")}</DialogTitle>
          <DialogDescription>{t("assignBody")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await createAssignmentAction({ workerId, jobOrderId, startDate: start, endDate: end || null });
              if (r.ok) {
                toast.success(t("createdOne", { name }));
                onClose();
                router.refresh();
              } else setError(r.error === "busy" ? te("busy") : t(`errors.${r.error}`, { name }));
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-worker">{t("col.worker")}</Label>
            <NativeSelect className="w-full" id="new-worker" value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <NativeSelectOption value="">{t("chooseWorker")}</NativeSelectOption>
              {options.workers.map((w) => (
                <NativeSelectOption key={w.id} value={w.id}>
                  {w.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-job">{t("col.jobOrder")}</Label>
            <NativeSelect className="w-full" id="new-job" value={jobOrderId} onChange={(e) => setJobOrderId(e.target.value)}>
              <NativeSelectOption value="">{t("chooseJobOrder")}</NativeSelectOption>
              {options.jobOrders.map((j) => (
                <NativeSelectOption key={j.id} value={j.id}>
                  {j.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-start">{t("col.start")}</Label>
              <Input id="new-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-end">{t("endOptional")}</Label>
              <Input id="new-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("keepOpen")}
            </Button>
            <Button type="submit" disabled={pending || !workerId || !jobOrderId || !start}>
              {t("assignSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The client's PO for this placement (decision G4; Bullhorn placement PO): saves when the field is
 * left or Enter is pressed, as the payroll worker ids do; empty means the client's own PO.
 */
function PoField({ row }: { row: AssignmentRow }) {
  const t = useTranslations("assignments");
  const te = useTranslations("convert.errors");
  const router = useRouter();
  const [value, setValue] = useState(row.poNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, run] = useTransition();
  const save = () => {
    if (value.trim() === (row.poNumber ?? "")) return;
    run(async () => {
      const r = await setAssignmentPoAction(row.id, value.trim());
      if (r.ok) {
        setError(null);
        setSaved(true);
        router.refresh();
      } else setError(r.error === "busy" ? te("busy") : t(`poErrors.${r.error}`));
    });
  };
  return (
    <div className="flex flex-col gap-1">
      <Input
        id={`po-${row.id}`}
        value={value}
        maxLength={64}
        placeholder={row.clientPo ?? ""}
        disabled={pending}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={`po-${row.id}-hint`}
        data-testid="assignment-po"
      />
      <p id={`po-${row.id}-hint`} className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {error ?? (saved ? t("poSaved") : row.clientPo ? t("poHint", { po: row.clientPo }) : t("poHintNone"))}
      </p>
    </div>
  );
}
