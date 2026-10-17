"use client";

/**
 * Additional pay — docs/patterns/convert.md step 4 (Gusto's run-payroll additional earnings and
 * custom earnings types; Rippling one-time payments): what a person entered for the period, each with
 * its reason, and Add pay for a missed meal or rest period, a short day, a holiday not worked or a
 * bonus. The engine computes the pay; the totals refresh.
 */
import { EllipsisIcon, PlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addPayEventAction, removePayEventAction, type PayEventError, type PayEventInput } from "@/app/[locale]/(app)/convert/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { PayEventsView } from "@/server/run/pay-events";
import { money } from "../format";

type Kind = "meal_period_missed" | "rest_period_missed" | "reported_short" | "holiday_not_worked" | "bonus";
const KINDS: Kind[] = ["meal_period_missed", "rest_period_missed", "reported_short", "holiday_not_worked", "bonus"];

/** "12.50" → 1250; anything else → null (dollars and cents, no floats). */
function centsOf(text: string): number | null {
  const m = /^\s*(\d{1,6})(?:\.(\d{1,2}))?\s*$/.exec(text.replace(/,/g, ""));
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export function PayEvents({ periodId, data, canEdit }: { periodId: string; data: PayEventsView; canEdit: boolean }) {
  const t = useTranslations("payEvents");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<PayEventsView["events"][number] | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [kind, setKind] = useState<Kind>("meal_period_missed");
  const [day, setDay] = useState(data.period.startsOn);
  const [week, setWeek] = useState(data.weeks[0] ?? "");
  const [scheduled, setScheduled] = useState("");
  const [reassigned, setReassigned] = useState(false);
  const [amount, setAmount] = useState("");
  const [bonusKind, setBonusKind] = useState<"nondiscretionary" | "flat_sum">("nondiscretionary");
  const [reason, setReason] = useState("");
  // The same bonus is already on file: the person ticks that they mean a second one.
  const [duplicate, setDuplicate] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const worker = data.options.find((w) => w.workerId === workerId);

  const refusal = (e: PayEventError) => toast.error(t(`errors.${e}` as "errors.generic"));
  const reset = () => {
    setWorkerId("");
    setAssignmentId("");
    setKind("meal_period_missed");
    setScheduled("");
    setReassigned(false);
    setAmount("");
    setReason("");
    setDuplicate(false);
    setConfirmDuplicate(false);
  };

  const submit = () => {
    if (!workerId || !assignmentId || reason.trim() === "") return toast.error(t("errors.incomplete"));
    let input: PayEventInput;
    if (kind === "bonus") {
      const cents = centsOf(amount);
      if (cents === null || cents <= 0) return toast.error(t("errors.bad_amount"));
      input = { type: "bonus", workerId, assignmentId, workweekStart: week, amountCents: cents, kind: bonusKind, reason, ...(confirmDuplicate ? { confirmDuplicate: true } : {}) };
    } else {
      const hours = scheduled.trim() === "" ? null : Number(scheduled);
      if (hours !== null && (!Number.isFinite(hours) || hours <= 0 || hours > 24 || Math.round(hours * 60) !== hours * 60)) return toast.error(t("errors.bad_schedule"));
      input = { type: "confirmation", workerId, assignmentId, workDate: day, kind, scheduledMinutes: kind === "reported_short" && hours !== null ? Math.round(hours * 60) : null, reassigned: kind === "reported_short" && reassigned, reason };
    }
    start(async () => {
      const r = await addPayEventAction(periodId, input);
      if ("error" in r && r.error === "duplicate_bonus") setDuplicate(true);
      if ("error" in r) refusal(r.error);
      else {
        toast.success(t("added"));
        setAdding(false);
        reset();
      }
      router.refresh();
    });
  };

  const remove = () => {
    if (!removing || removeReason.trim() === "") return;
    start(async () => {
      const r = await removePayEventAction(periodId, { kind: removing.kind, id: removing.id }, removeReason);
      if ("error" in r) refusal(r.error);
      else {
        toast.success(t("removed"));
        setRemoving(null);
        setRemoveReason("");
      }
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-3" data-testid="pay-events">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        {canEdit && data.options.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} data-testid="pay-event-add">
            <PlusIcon />
            {t("add")}
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("worker")}</TableHead>
            <TableHead>{t("what")}</TableHead>
            <TableHead>{t("when")}</TableHead>
            <TableHead className="text-right">{t("amount")}</TableHead>
            <TableHead>{t("reason")}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.events.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                {t("empty")}
              </TableCell>
            </TableRow>
          ) : (
            data.events.map((e) => (
              <TableRow key={`${e.kind}-${e.id}`} data-testid="pay-event-row">
                <TableCell>
                  <div className="font-medium">{e.workerName}</div>
                  <div className="text-xs text-muted-foreground">{e.assignmentLabel}</div>
                </TableCell>
                <TableCell>{e.kind === "bonus" ? t(`bonusKinds.${e.eventKind}` as "bonusKinds.nondiscretionary") : t(`kinds.${e.eventKind}` as "kinds.meal_period_missed")}</TableCell>
                <TableCell className="tabular-nums">{e.kind === "bonus" ? t("weekOf", { date: e.date }) : e.date}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{e.amountCents === null ? "—" : money(e.amountCents, locale)}</TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">{e.reason}</TableCell>
                <TableCell>
                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("actions")} />}>
                        <EllipsisIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem variant="destructive" onClick={() => setRemoving(e)} data-testid="pay-event-remove">
                          {t("remove")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addTitle")}</DialogTitle>
            <DialogDescription>{t("addBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pe-worker">{t("worker")}</Label>
              <NativeSelect
                id="pe-worker"
                value={workerId}
                onChange={(e) => {
                  setWorkerId(e.target.value);
                  const w = data.options.find((x) => x.workerId === e.target.value);
                  setAssignmentId(w?.assignments.length === 1 ? w.assignments[0]!.assignmentId : "");
                }}
                data-testid="pay-event-worker"
              >
                <NativeSelectOption value="">{t("choose")}</NativeSelectOption>
                {data.options.map((w) => (
                  <NativeSelectOption key={w.workerId} value={w.workerId}>
                    {w.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            {worker && worker.assignments.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pe-assignment">{t("assignment")}</Label>
                <NativeSelect id="pe-assignment" value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)} data-testid="pay-event-assignment">
                  <NativeSelectOption value="">{t("choose")}</NativeSelectOption>
                  {worker.assignments.map((a) => (
                    <NativeSelectOption key={a.assignmentId} value={a.assignmentId}>
                      {a.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pe-kind">{t("what")}</Label>
              <NativeSelect id="pe-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)} data-testid="pay-event-kind">
                {KINDS.map((k) => (
                  <NativeSelectOption key={k} value={k}>
                    {k === "bonus" ? t("kinds.bonus") : t(`kinds.${k}` as "kinds.meal_period_missed")}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="text-sm text-muted-foreground">{t(`hints.${kind}` as "hints.bonus")}</p>
            </div>
            {kind === "bonus" ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pe-week">{t("workweek")}</Label>
                  <NativeSelect id="pe-week" value={week} onChange={(e) => setWeek(e.target.value)} data-testid="pay-event-week">
                    {data.weeks.map((w) => (
                      <NativeSelectOption key={w} value={w}>
                        {t("weekOf", { date: w })}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pe-amount">{t("amount")}</Label>
                  <Input id="pe-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="pay-event-amount" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pe-bonus-kind">{t("bonusKind")}</Label>
                  <NativeSelect id="pe-bonus-kind" value={bonusKind} onChange={(e) => setBonusKind(e.target.value as "nondiscretionary" | "flat_sum")} data-testid="pay-event-bonus-kind">
                    <NativeSelectOption value="nondiscretionary">{t("bonusKinds.nondiscretionary")}</NativeSelectOption>
                    <NativeSelectOption value="flat_sum">{t("bonusKinds.flat_sum")}</NativeSelectOption>
                  </NativeSelect>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pe-day">{t("day")}</Label>
                  <Input id="pe-day" type="date" min={data.period.startsOn} max={data.period.endsOn} value={day} onChange={(e) => setDay(e.target.value)} data-testid="pay-event-day" />
                </div>
                {kind === "reported_short" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="pe-scheduled">{t("scheduled")}</Label>
                      <Input id="pe-scheduled" inputMode="decimal" placeholder="8" value={scheduled} onChange={(e) => setScheduled(e.target.value)} data-testid="pay-event-scheduled" />
                    </div>
                    <Label className="flex items-center gap-2 font-normal">
                      <Checkbox checked={reassigned} onCheckedChange={(v) => setReassigned(v === true)} data-testid="pay-event-reassigned" />
                      {t("reassigned")}
                    </Label>
                  </>
                )}
              </>
            )}
            {duplicate && kind === "bonus" && (
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={confirmDuplicate} onCheckedChange={(v) => setConfirmDuplicate(v === true)} data-testid="pay-event-confirm-duplicate" />
                {t("confirmDuplicate")}
              </Label>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pe-reason">{t("reason")}</Label>
              <Textarea id="pe-reason" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="pay-event-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={submit} loading={pending} disabled={pending} data-testid="pay-event-save">
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("removeTitle")}</DialogTitle>
            <DialogDescription>{t("removeBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pe-remove-reason">{t("reason")}</Label>
            <Textarea id="pe-remove-reason" value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} data-testid="pay-event-remove-reason" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={remove} loading={pending} disabled={pending || removeReason.trim() === ""} data-testid="pay-event-remove-confirm">
              {t("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
