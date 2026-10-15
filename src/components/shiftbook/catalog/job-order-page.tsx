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
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { JobOrderPage } from "@/server/catalog/queries";
import { inForce } from "@/server/catalog/versions";
import { longDate, money } from "../format";
import { ActivityList } from "./activity";
import { JobOrderForm, type CatalogOptions } from "./job-order-form";
import { RateCard } from "./rate-card";

const TABS = ["overview", "assignments", "rates", "activity"] as const;
type Tab = (typeof TABS)[number];

export function JobOrderPageView({ data, options, today }: { data: JobOrderPage; options: CatalogOptions; today: string }) {
  const t = useTranslations("jobOrder");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
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
    [t("payRange"), job.payMinCents !== null || job.payMaxCents !== null ? `${job.payMinCents !== null ? money(job.payMinCents, locale) : "—"} – ${job.payMaxCents !== null ? money(job.payMaxCents, locale) : "—"}` : "—"],
    [t("prevailingWage"), job.prevailingWage ? t("yes") : t("no")],
    [t("created"), longDate(job.createdAt.slice(0, 10), locale)],
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/job-orders" />}>{t("breadcrumb")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{job.position}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {job.position}
            {job.shift && <span className="text-muted-foreground"> · {job.shift}</span>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {job.clientName} · {job.worksite.name}, {job.worksite.city}, {job.worksite.state}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon />
            {t("edit")}
          </Button>
          <Button size="sm" onClick={() => setAssigning(true)}>
            <UserPlusIcon />
            {t("assign")}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside aria-label={t("details")} className="flex flex-col gap-3 rounded-lg border p-4 lg:self-start">
          <h2 className="text-sm font-semibold">{t("details")}</h2>
          <dl className="flex flex-col gap-2 text-sm">
            {details.map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </aside>

        <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="min-w-0">
          <TabsList>
            {TABS.map((k) => (
              <TabsTrigger key={k} value={k}>
                {t(`tabs.${k}`)}
                {k === "assignments" && <span className="ml-1 text-muted-foreground tabular-nums">{data.assignments.length}</span>}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="flex flex-col gap-4 pt-4">
            <section className="rounded-lg border p-4">
              <h2 className="text-sm font-semibold">{t("ratesNow")}</h2>
              {current ? (
                <p className="mt-1 text-sm">
                  {t("ratesLine", { pay: money(current.payRateCents, locale), bill: money(current.billRateCents, locale), from: longDate(current.effectiveFrom, locale) })}
                </p>
              ) : (
                <p className="mt-1 text-sm text-destructive">{t("noRateToday")}</p>
              )}
              {data.rates.versions.some((v) => v.effectiveFrom > today) && <p className="mt-1 text-sm text-muted-foreground">{t("changeScheduled")}</p>}
              <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setTab("rates")}>
                {t("openRates")}
              </Button>
            </section>
            <section className="rounded-lg border p-4">
              <h2 className="text-sm font-semibold">{t("assignmentsNow")}</h2>
              <p className="mt-1 text-sm">{t("assignmentsLine", { count: active.length, wanted: job.headcount })}</p>
              {nextEnd && <p className="mt-1 text-sm text-muted-foreground">{t("nextEnd", { date: longDate(nextEnd, locale) })}</p>}
              <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setTab("assignments")}>
                {t("openAssignments")}
              </Button>
            </section>
          </TabsContent>

          <TabsContent value="assignments" className="pt-4">
            <AssignmentsTab data={data} today={today} onAssign={() => setAssigning(true)} />
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
      </div>

      {editing && (
        <JobOrderForm
          onClose={() => setEditing(false)}
          options={options}
          initial={{ id: job.id, clientId: job.clientId, worksiteId: job.worksiteId, position: job.position, socCode: job.socCode, shift: job.shift, headcount: job.headcount, payMinCents: job.payMinCents, payMaxCents: job.payMaxCents, prevailingWage: job.prevailingWage }}
        />
      )}
      {assigning && <AssignForm jobOrderId={job.id} workers={options.workers} today={today} onClose={() => setAssigning(false)} />}
    </div>
  );
}

function AssignmentsTab({ data, today, onAssign }: { data: JobOrderPage; today: string; onAssign: () => void }) {
  const t = useTranslations("jobOrder");
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
        <Button variant="link" size="sm" className="h-auto px-0" onClick={onAssign}>
          {t("assign")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {selected.length > 0 && (
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
      <div className="rounded-lg border">
        <Table aria-label={t("tabs.assignments")}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  aria-label={ta("selectAll")}
                  checked={selected.length === data.assignments.length}
                  onCheckedChange={(on) => setSelected(on ? data.assignments.map((a) => a.id) : [])}
                />
              </TableHead>
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
                <TableCell>
                  <Checkbox aria-label={ta("select", { name: a.workerName })} checked={selected.includes(a.id)} onCheckedChange={(on) => setSelected((cur) => (on ? [...cur, a.id] : cur.filter((x) => x !== a.id)))} />
                </TableCell>
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
                    a.status !== "cancelled" && (
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
            <Button disabled={pending || endDate === ""} onClick={end}>
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
            <Button variant="destructive" disabled={pending || reason.trim() === ""} onClick={() => cancelling && cancel(cancelling)}>
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
            <Button type="submit" disabled={pending || workerId === "" || start === ""}>
              {t("assignSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
