"use client";

// Pattern: docs/patterns/job-orders/[id].md — Attio record page: title with action buttons under it,
// the record's details on the left, tabs on the right (Overview · Assignments · Rate card ·
// Activity); assignments as a relationship tab with "Assign worker" (Airtable/Attio picker; never
// creates a worker) that reopens for the next worker (Linear sub-issue editor), and a toolbar on
// selection; the tab is in the URL.
import { PencilIcon, UserPlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelAssignmentAction, createAssignmentAction, endAssignmentsAction } from "@/app/[locale]/(app)/job-orders/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { JobOrderPage } from "@/server/catalog/queries";
import { inForce } from "@/server/catalog/versions";
import { ReadOnlyNote, useCan } from "../abilities";
import { longDate, money } from "../format";
import { KeyFigure, KeyFigures } from "../key-figures";
import { Crumbs, Facts, Page, PageHeader, RecordLayout, Section } from "../page";
import { Status } from "../status";
import { ActivityList } from "./activity";
import { JobOrderForm, type CatalogOptions } from "./job-order-form";
import { RateCard } from "./rate-card";
import { useDateTime } from "../agency-zone";

const TABS = ["overview", "assignments", "rates", "activity"] as const;
type Tab = (typeof TABS)[number];

export function JobOrderPageView({ data, options, today }: { data: JobOrderPage; options: CatalogOptions; today: string }) {
  const t = useTranslations("jobOrder");
  const tr = useTranslations("rates");
  const tc = useTranslations("common");
  const locale = useLocale();
  const when = useDateTime();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Decision 0026: the job order, its rates and its placements are changed by the Owner and coordinators.
  const mayChange = useCan()("placements");
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "overview";
  const setTab = (next: string) => router.replace(`${pathname}?tab=${next}`, { scroll: false });
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const { job } = data;
  const current = inForce(data.rates.versions, today);
  const active = data.assignments.filter((a) => a.status !== "cancelled" && (a.endDate === null || a.endDate >= today));
  const nextEnd = active.map((a) => a.endDate).filter((d): d is string => d !== null).sort()[0] ?? null;

  const details: [string, string][] = [
    [t("client"), job.clientName],
    [t("worksite"), `${job.worksite.name}, ${job.worksite.addressLine}, ${job.worksite.city}, ${job.worksite.state} ${job.worksite.postalCode}`],
    [t("county"), job.worksite.county],
    [t("shift"), job.shift ?? "—"],
    [t("socCode"), job.socCode ?? "—"],
    [t("headcount"), t("assignedOf", { assigned: active.length, wanted: job.headcount })],
    // One figure when the range is one amount.
    [
      t("payRange"),
      job.payMinCents === null && job.payMaxCents === null
        ? "—"
        : job.payMinCents === job.payMaxCents
          ? money(job.payMinCents!, locale)
          : `${job.payMinCents !== null ? money(job.payMinCents, locale) : "—"} – ${job.payMaxCents !== null ? money(job.payMaxCents, locale) : "—"}`,
    ],
    [t("prevailingWage"), job.prevailingWage ? t("yes") : t("no")],
    [t("branch"), job.branchName ?? "—"],
    [t("created"), when(job.createdAt, { date: "long", time: false })],
  ];

  return (
    <Page>
      <PageHeader
        context={
<Crumbs label={tc("breadcrumb")} items={[{ label: t("breadcrumb"), href: "/job-orders" }]} />
        }
        title={
          <>
            {job.position}
            {job.shift && <span className="text-muted-foreground"> · {job.shift}</span>}
          </>
        }
        status={
          <Status tone={active.length >= job.headcount ? "success" : "info"} size="lg" data-testid="job-order-status">
            {active.length >= job.headcount ? t("filled") : t("open")}
          </Status>
        }
        description={mayChange ? `${job.clientName} · ${job.worksite.name}, ${job.worksite.city}, ${job.worksite.state}` : <ReadOnlyNote text={t("readOnly")} />}
        actions={
          mayChange && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <PencilIcon />
                {t("edit")}
              </Button>
              <Button size="sm" onClick={() => setAssigning(true)}>
                <UserPlusIcon />
                {t("assign")}
              </Button>
            </>
          )
        }
      />

      <RecordLayout
        aside={
          <Section id="job-order-details" title={t("details")}>
            <Facts items={details.map(([label, value]) => ({ label, value }))} />
          </Section>
        }
      >
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="min-w-0">
          <TabsList variant="line" className="h-10! w-full justify-start border-b">
            {TABS.map((k) => (
              <TabsTrigger key={k} value={k}>
                {t(`tabs.${k}`)}
                {k === "assignments" && <span className="ml-1 text-muted-foreground tabular-nums">{data.assignments.length}</span>}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="flex flex-col gap-10 pt-6">
            <Section
              id="rates-now"
              title={t("ratesNow")}
              actions={
                <Button variant="outline" size="sm" onClick={() => setTab("rates")}>
                  {t("openRates")}
                </Button>
              }
            >
              {current ? (
                <KeyFigures className="pt-1">
                  <KeyFigure label={tr("pay")} value={t("perHour", { amount: money(current.payRateCents, locale) })} note={t("since", { date: longDate(current.effectiveFrom, locale) })} />
                  <KeyFigure label={tr("bill")} value={t("perHour", { amount: money(current.billRateCents, locale) })} note={t("since", { date: longDate(current.effectiveFrom, locale) })} />
                </KeyFigures>
              ) : (
                <p className="text-sm text-destructive">{t("noRateToday")}</p>
              )}
              {data.rates.versions.some((v) => v.effectiveFrom > today) && <p className="text-sm text-muted-foreground">{t("changeScheduled")}</p>}
            </Section>
            <Section
              id="assignments-now"
              title={t("assignmentsNow")}
              actions={
                <Button variant="outline" size="sm" onClick={() => setTab("assignments")}>
                  {t("openAssignments")}
                </Button>
              }
            >
              <KeyFigures className="pt-1">
                <KeyFigure label={t("onItNow")} value={t("assignedOf", { assigned: active.length, wanted: job.headcount })} note={nextEnd ? t("nextEnd", { date: longDate(nextEnd, locale) }) : undefined} />
              </KeyFigures>
            </Section>
          </TabsContent>

          <TabsContent value="assignments" className="pt-4">
            <AssignmentsTab data={data} today={today} mayChange={mayChange} onAssign={() => setAssigning(true)} />
          </TabsContent>

          <TabsContent value="rates" className="flex flex-col gap-8 pt-4">
            <RateCard cardRef={{ jobOrderId: job.id }} versions={data.rates.versions} paidThrough={data.rates.paidThrough} today={today} />
            {data.ownCards.map((c) => (
              <RateCard key={c.assignmentId} cardRef={{ assignmentId: c.assignmentId }} versions={c.versions} paidThrough={c.paidThrough} today={today} title={t("ownRatesOf", { name: c.workerName })} />
            ))}
          </TabsContent>

          <TabsContent value="activity" className="pt-4">
            <ActivityList items={data.activity} />
          </TabsContent>
        </Tabs>
      </RecordLayout>

      {editing && (
        <JobOrderForm
          onClose={() => setEditing(false)}
          options={options}
          initial={{ id: job.id, clientId: job.clientId, worksiteId: job.worksiteId, position: job.position, socCode: job.socCode, shift: job.shift, headcount: job.headcount, payMinCents: job.payMinCents, payMaxCents: job.payMaxCents, prevailingWage: job.prevailingWage, branchId: job.branchId }}
        />
      )}
      {assigning && <AssignForm jobOrderId={job.id} workers={options.workers} today={today} onClose={() => setAssigning(false)} />}
    </Page>
  );
}

function AssignmentsTab({ data, today, mayChange, onAssign }: { data: JobOrderPage; today: string; mayChange: boolean; onAssign: () => void }) {
  const t = useTranslations("jobOrder");
  const tc = useTranslations("common");
  const ta = useTranslations("assignments");
  const te = useTranslations("convert.errors");
  const locale = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [ending, setEnding] = useState(false);
  const [endDate, setEndDate] = useState(today);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [ownFor, setOwnFor] = useState<string | null>(null);
  const [pending, run] = useTransition();

  const end = () =>
    run(async () => {
      const r = await endAssignmentsAction(selected, endDate);
      if ("ok" in r) toast.error(te("busy"));
      else {
        if (r.ended.length > 0) toast.success(ta("ended", { count: r.ended.length }));
        for (const x of r.refused) toast.error(ta(`errors.${x.error}`, { name: data.assignments.find((a) => a.id === x.id)?.workerName ?? "" }));
        setSelected([]);
        setEnding(false);
      }
      router.refresh();
    });
  const cancel = (id: string) =>
    run(async () => {
      const r = await cancelAssignmentAction(id, reason);
      if (r.ok) toast.success(ta("cancelled"));
      else toast.error(r.error === "busy" ? te("busy") : ta(`errors.${r.error}`, { name: data.assignments.find((a) => a.id === id)?.workerName ?? "" }));
      setCancelling(null);
      setReason("");
      router.refresh();
    });

  if (data.assignments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
        <UserPlusIcon className="size-5" />
        <p>{t("noAssignments")}</p>
        {mayChange && (
          <Button variant="link" size="sm" className="h-auto px-0" onClick={onAssign}>
            {t("assign")}
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {mayChange && selected.length > 0 && (
        <div role="toolbar" aria-label={ta("selection")} className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <span className="mr-auto tabular-nums">{ta("selectedCount", { count: selected.length })}</span>
          <Button size="sm" variant="outline" onClick={() => setEnding(true)}>
            {ta("end")}
          </Button>
          <Button size="sm" variant="outline" disabled={selected.length !== 1} onClick={() => setCancelling(selected[0]!)}>
            {ta("cancel")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            {ta("clearSelection")}
          </Button>
        </div>
      )}
      <div className="min-w-0">
        <Table aria-label={t("tabs.assignments")}>
          <TableHeader>
            <TableRow>
              {mayChange && (
                <TableHead className="w-8">
                  <Checkbox
                    aria-label={ta("selectAll")}
                    checked={selected.length === data.assignments.length}
                    onCheckedChange={(on) => setSelected(on ? data.assignments.map((a) => a.id) : [])}
                  />
                </TableHead>
              )}
              <TableHead>{ta("col.worker")}</TableHead>
              <TableHead>{ta("col.start")}</TableHead>
              <TableHead>{ta("col.end")}</TableHead>
              <TableHead>{ta("col.status")}</TableHead>
              <TableHead className="text-right">{ta("col.pay")}</TableHead>
              <TableHead className="text-right">{ta("col.bill")}</TableHead>
              <TableHead>
                <span className="sr-only">{ta("col.rates")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.assignments.map((a) => (
              <TableRow key={a.id} data-state={selected.includes(a.id) ? "selected" : undefined} data-testid="assignment-row">
                {mayChange && (
                  <TableCell>
                    <Checkbox aria-label={ta("select", { name: a.workerName })} checked={selected.includes(a.id)} onCheckedChange={(on) => setSelected((cur) => (on ? [...cur, a.id] : cur.filter((x) => x !== a.id)))} />
                  </TableCell>
                )}
                <TableCell className="font-medium">{a.workerName}</TableCell>
                <TableCell>{longDate(a.startDate, locale)}</TableCell>
                <TableCell>{a.endDate ? longDate(a.endDate, locale) : "—"}</TableCell>
                <TableCell>
                  <Badge variant={a.status === "active" ? "secondary" : "outline"}>{ta(`status.${a.status}`)}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{a.payRateCents !== null ? money(a.payRateCents, locale) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{a.billRateCents !== null ? money(a.billRateCents, locale) : "—"}</TableCell>
                <TableCell className="text-right">
                  {a.ownRates ? (
                    <Badge variant="outline">{ta("ownRates")}</Badge>
                  ) : (
                    a.status !== "cancelled" &&
                    mayChange && (
                      <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setOwnFor(a.id)}>
                        {ta("setOwnRates")}
                      </Button>
                    )
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={ending} onOpenChange={setEnding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ta("endTitle", { count: selected.length })}</DialogTitle>
            <DialogDescription>{ta("endBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="end-date">{ta("col.end")}</Label>
            <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnding(false)}>
              {ta("keepOpen")}
            </Button>
            <Button disabled={pending || endDate === ""} onClick={end} loading={pending} loadingLabel={tc("loading")}>
              {ta("end")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelling !== null} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ta("cancelTitle")}</DialogTitle>
            <DialogDescription>{ta("cancelBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cancel-reason">{ta("reason")}</Label>
            <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>
              {ta("keepOpen")}
            </Button>
            <Button variant="destructive" disabled={pending || reason.trim() === ""} onClick={() => cancelling && cancel(cancelling)} loading={pending} loadingLabel={tc("loading")}>
              {ta("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ownFor && (
        <Dialog open onOpenChange={(open) => !open && setOwnFor(null)}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t("ownRatesOf", { name: data.assignments.find((a) => a.id === ownFor)?.workerName ?? "" })}</DialogTitle>
              <DialogDescription>{t("ownRatesBody")}</DialogDescription>
            </DialogHeader>
            <RateCard cardRef={{ assignmentId: ownFor }} versions={[]} paidThrough={null} today={today} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function AssignForm({ jobOrderId, workers, today, onClose }: { jobOrderId: string; workers: { id: string; name: string }[]; today: string; onClose: () => void }) {
  const t = useTranslations("assignments");
  const tc = useTranslations("common");
  const te = useTranslations("convert.errors");
  const router = useRouter();
  const [workerId, setWorkerId] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [pending, run] = useTransition();
  const name = workers.find((w) => w.id === workerId)?.name ?? "";
  const submit = () =>
    run(async () => {
      const r = await createAssignmentAction({ workerId, jobOrderId, startDate: start, endDate: end || null });
      if (r.ok) {
        // Reopens for the next worker (Linear sub-issue editor); Esc or Done leaves.
        setAdded((cur) => [...cur, name]);
        setWorkerId("");
        setError(null);
        router.refresh();
      } else setError(r.error === "busy" ? te("busy") : t(`errors.${r.error}`, { name }));
    });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("assignTitle")}</DialogTitle>
          <DialogDescription>{added.length > 0 ? t("assignedSoFar", { names: added.join(", ") }) : t("assignBody")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assign-worker">{t("col.worker")}</Label>
            <NativeSelect className="w-full" id="assign-worker" value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <NativeSelectOption value="">{t("chooseWorker")}</NativeSelectOption>
              {workers.map((w) => (
                <NativeSelectOption key={w.id} value={w.id}>
                  {w.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assign-start">{t("col.start")}</Label>
              <Input id="assign-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assign-end">{t("endOptional")}</Label>
              <Input id="assign-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("done")}
            </Button>
            <Button type="submit" disabled={pending || workerId === "" || start === ""} loading={pending} loadingLabel={tc("loading")}>
              {t("assignSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
