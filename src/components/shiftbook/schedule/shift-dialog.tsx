"use client";

// Pattern: docs/patterns/schedule.md §4 — When I Work shift details (job order, times, assign to a
// worker or Open, how many, the eligible list, scheduling concerns, the requests list); Deputy (delete;
// no-show with a replacement).
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import type { EligibleWorker } from "@/server/schedule/service";
import type { GridShift, WeekView } from "@/server/schedule/queries";
import { createShiftsAction, deleteShiftAction, eligibleAction, markNoShowAction, updateShiftAction } from "@/app/[locale]/(app)/schedule/actions";

export interface ShiftDraft {
  jobOrderId: string;
  workDate: string;
  start: string;
  end: string;
  breakMinutes: number;
  workerId: string | null;
  copies: number;
  requireConfirmation: boolean;
}

const hhmm = (minute: number) => `${String(Math.trunc((minute % 1440) / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const minutesOf = (v: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** An end at or before the start finishes the next day. */
const span = (start: string, end: string) => {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === null || e === null) return null;
  return { startMinute: s, endMinute: e <= s ? e + 1440 : e };
};

export function ShiftDialog({ view, shift, draft, today, may, onClose }: { view: WeekView; shift: GridShift | null; draft: Partial<ShiftDraft>; today: string; may: boolean; onClose: () => void }) {
  const t = useTranslations("schedule.dialog");
  const te = useTranslations("schedule.errors");
  const tc = useTranslations("common");
  const ts = useTranslations("schedule");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState<ShiftDraft>(() =>
    shift
      ? { jobOrderId: shift.jobOrderId, workDate: shift.workDate, start: hhmm(shift.startMinute), end: hhmm(shift.endMinute), breakMinutes: shift.breakMinutes, workerId: shift.workerId, copies: 1, requireConfirmation: shift.requireConfirmation }
      : { jobOrderId: draft.jobOrderId ?? "", workDate: draft.workDate ?? today, start: "07:00", end: "15:30", breakMinutes: 30, workerId: draft.workerId ?? null, copies: 1, requireConfirmation: true },
  );
  const [error, setError] = useState<string | null>(null);
  const [eligible, setEligible] = useState<EligibleWorker[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [noShow, setNoShow] = useState(false);
  const [replace, setReplace] = useState(true);
  const set = <K extends keyof ShiftDraft>(k: K, value: ShiftDraft[K]) => setV((x) => ({ ...x, [k]: value }));
  const times = span(v.start, v.end);

  // Who may take it, as the job order, day or time changes (When I Work "view who's eligible").
  useEffect(() => {
    if (!may || !v.jobOrderId || !times) return;
    let live = true;
    void eligibleAction({ jobOrderId: v.jobOrderId, workDate: v.workDate, ...times, breakMinutes: v.breakMinutes }, shift?.id ?? null).then((list) => live && setEligible(list));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- times is derived from start and end
  }, [may, v.jobOrderId, v.workDate, v.start, v.end, v.breakMinutes, shift?.id]);

  const listed = useMemo(() => new Set(eligible.map((e) => e.workerId)), [eligible]);
  const conflict = eligible.find((e) => e.workerId === v.workerId && e.conflict);
  const errorText = (code: string) => (te.has(code as never) ? te(code as never) : te("generic"));

  const save = () =>
    startTransition(async () => {
      if (!times) return setError(te("invalid_time"));
      const input = { jobOrderId: v.jobOrderId, workDate: v.workDate, ...times, breakMinutes: Number(v.breakMinutes) || 0, workerId: v.workerId, requireConfirmation: v.requireConfirmation };
      const result = shift ? await updateShiftAction(shift.id, input) : await createShiftsAction(input, v.workerId ? 1 : Number(v.copies) || 1);
      if (!result.ok) return setError(errorText(result.error));
      toast.success(ts("saved"));
      router.refresh();
      onClose();
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteShiftAction(shift!.id);
      if (!result.ok) return setError(errorText(result.error));
      router.refresh();
      onClose();
    });

  const markAbsent = () =>
    startTransition(async () => {
      const result = await markNoShowAction(shift!.id, replace);
      if (!result.ok) {
        setNoShow(false);
        return setError(errorText(result.error));
      }
      router.refresh();
      onClose();
    });

  const job = view.jobOrders.find((j) => j.id === v.jobOrderId);
  const fieldsLocked = !may;
  return (
    <>
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="sm:max-w-lg" data-testid="shift-dialog">
          <DialogHeader>
            <DialogTitle>{shift ? t("editTitle") : t("createTitle")}</DialogTitle>
            {job && <DialogDescription>{`${job.clientName} · ${job.worksiteName}`}</DialogDescription>}
          </DialogHeader>
          <div className="grid gap-4">
            {shift?.warning && (
              <p className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive" data-testid="shift-warning">
                {shift.warning === "declined" ? t("warningDeclined", { name: shift.warningWorkerName ?? "—", reason: shift.warningReason ?? "" }) : t("warningExpired", { name: shift.warningWorkerName ?? "—" })}
              </p>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="shift-job">{t("jobOrder")}</Label>
              <NativeSelect id="shift-job" className="w-full" value={v.jobOrderId} disabled={fieldsLocked} onChange={(e) => set("jobOrderId", e.target.value)} data-testid="shift-job">
                <NativeSelectOption value="">{t("choose")}</NativeSelectOption>
                {view.jobOrders.map((j) => (
                  <NativeSelectOption key={j.id} value={j.id}>
                    {`${j.position} — ${j.clientName}`}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2 grid gap-1.5 sm:col-span-1">
                <Label htmlFor="shift-date">{t("date")}</Label>
                <Input id="shift-date" type="date" value={v.workDate} disabled={fieldsLocked} onChange={(e) => e.target.value && set("workDate", e.target.value)} data-testid="shift-date" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="shift-start">{t("start")}</Label>
                <Input id="shift-start" type="time" value={v.start} disabled={fieldsLocked} onChange={(e) => set("start", e.target.value)} data-testid="shift-start" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="shift-end">{t("end")}</Label>
                <Input id="shift-end" type="time" value={v.end} disabled={fieldsLocked} aria-describedby="shift-end-hint" onChange={(e) => set("end", e.target.value)} data-testid="shift-end" />
              </div>
              <div className="col-span-2 grid gap-1.5 sm:col-span-1">
                <Label htmlFor="shift-break">{t("break")}</Label>
                <Input id="shift-break" type="number" min={0} step={5} value={v.breakMinutes} disabled={fieldsLocked} onChange={(e) => set("breakMinutes", Number(e.target.value))} data-testid="shift-break" />
              </div>
            </div>
            <p id="shift-end-hint" className="-mt-2 text-xs text-muted-foreground">
              {t("endHint")}
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="shift-worker">{t("assignTo")}</Label>
              <NativeSelect id="shift-worker" className="w-full" value={v.workerId ?? ""} disabled={fieldsLocked} onChange={(e) => set("workerId", e.target.value || null)} data-testid="shift-worker">
                <NativeSelectOption value="">{t("open")}</NativeSelectOption>
                {eligible.some((e) => e.tier === 1) && (
                  <NativeSelectOptGroup label={t("eligible")}>
                    {eligible.filter((e) => e.tier === 1).map((e) => (
                      <NativeSelectOption key={e.workerId} value={e.workerId}>
                        {e.conflict ? `${e.name} (${ts("states.overlap")})` : e.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelectOptGroup>
                )}
                {eligible.some((e) => e.tier === 2) && (
                  <NativeSelectOptGroup label={t("samePosition")}>
                    {eligible.filter((e) => e.tier === 2).map((e) => (
                      <NativeSelectOption key={e.workerId} value={e.workerId}>
                        {e.conflict ? `${e.name} (${ts("states.overlap")})` : e.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelectOptGroup>
                )}
                <NativeSelectOptGroup label={t("others")}>
                  {view.workers
                    .filter((w) => !listed.has(w.id))
                    .map((w) => (
                      <NativeSelectOption key={w.id} value={w.id}>
                        {w.name}
                      </NativeSelectOption>
                    ))}
                </NativeSelectOptGroup>
              </NativeSelect>
              {conflict && (
                <p className="text-sm text-destructive" role="status" data-testid="shift-conflict">
                  {t("conflict", { name: conflict.name })}
                </p>
              )}
            </div>
            {!shift && v.workerId === null && (
              <div className="grid w-32 gap-1.5">
                <Label htmlFor="shift-copies">{t("copies")}</Label>
                <Input id="shift-copies" type="number" min={1} max={50} value={v.copies} onChange={(e) => set("copies", Number(e.target.value))} data-testid="shift-copies" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox id="shift-confirm" checked={v.requireConfirmation} disabled={fieldsLocked} onCheckedChange={(on) => set("requireConfirmation", on === true)} />
              <Label htmlFor="shift-confirm">{t("requireConfirmation")}</Label>
            </div>
            {shift?.state === "open" && shift.published && (
              <div className="grid gap-1.5" data-testid="shift-offers">
                <div className="text-sm font-medium">{t("offers")}</div>
                {shift.offers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noOffers")}</p>
                ) : (
                  <ul className="divide-y rounded-md border text-sm">
                    {shift.offers.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="truncate">{o.workerName}</span>
                        <span className="text-muted-foreground">{t(`offerStatus.${o.status as "offered"}`)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert" data-testid="shift-error">
                {error}
              </p>
            )}
          </div>
          {may && (
            <DialogFooter className="sm:justify-between">
              <div className="flex gap-2">
                {shift && (
                  <Button variant="outline" onClick={() => setConfirmDelete(true)} disabled={pending} data-testid="shift-delete">
                    {t("delete")}
                  </Button>
                )}
                {shift?.workerId && !shift.noShow && shift.workDate <= today && (
                  <Button variant="outline" onClick={() => setNoShow(true)} disabled={pending} data-testid="shift-no-show">
                    {t("noShow")}
                  </Button>
                )}
              </div>
              <Button onClick={save} disabled={pending || !v.jobOrderId} loading={pending} loadingLabel={tc("loading")} data-testid="shift-save">
                {shift ? t("save") : t("create")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{shift?.published ? t("deletePublished") : t("deleteDraft")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove} data-testid="shift-delete-confirm">
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={noShow} onOpenChange={setNoShow}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("noShowTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("noShowBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Checkbox id="no-show-replace" checked={replace} onCheckedChange={(on) => setReplace(on === true)} />
            <Label htmlFor="no-show-replace">{t("noShowReplace")}</Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={markAbsent} data-testid="shift-no-show-confirm">
              {t("noShow")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
