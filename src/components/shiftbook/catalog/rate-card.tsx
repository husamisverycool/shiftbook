"use client";

// Pattern: docs/patterns/job-orders/[id].md — Rate card: Bullhorn One versions ("Effective on"
// selector, New version copying the shown one, Edit and Delete only on a version no paid week used,
// the earliest kept while later ones exist); Gusto compensation card (values in force, a notice for a
// scheduled change with cancel, one summary notice with Review for several, history newest first);
// Stripe (a used price is replaced, never edited; editing asks for a reason, "Other" needs a note).
import { CalendarClockIcon, PlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addRateAction, deleteRateAction, editRateAction } from "@/app/[locale]/(app)/job-orders/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { RateVersionView } from "@/server/catalog/queries";
import { billFromMarkup, inForce, type RateInput } from "@/server/catalog/versions";
import { bpToInput, centsToInput, multiplierToInput, parseDollars, parseMultiplier, parsePercentBp } from "@/lib/amounts";
import { useCan } from "../abilities";
import { longDate, money } from "../format";

const REASONS = ["wrong_from_start", "client_agreed", "data_entry", "other"] as const;
type Ref = { jobOrderId: string } | { assignmentId: string };

function multiplierText(m: { num: number; den: number }) {
  return `${multiplierToInput(m)}×`;
}

export function RateCard({ cardRef, versions, paidThrough, today, title }: { cardRef: Ref; versions: RateVersionView[]; paidThrough: string | null; today: string; title?: string }) {
  const t = useTranslations("rates");
  const locale = useLocale();
  const router = useRouter();
  // Decision 0026: rates are changed by the Owner and coordinators (placements).
  const mayChange = useCan()("placements");
  const current = inForce(versions, today);
  const [shownId, setShownId] = useState<string | null>(null);
  const shown = versions.find((v) => v.id === shownId) ?? current ?? versions.at(-1) ?? null;
  const scheduled = versions.filter((v) => v.effectiveFrom > today);
  const [form, setForm] = useState<{ mode: "add" | "edit"; base: RateVersionView | null } | null>(null);
  const [deleting, setDeleting] = useState<RateVersionView | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [pending, run] = useTransition();
  const earliest = versions[0];

  const remove = (v: RateVersionView) =>
    run(async () => {
      const r = await deleteRateAction(v.id);
      if (r.ok) toast.success(t("deleted"));
      else toast.error(t(`errors.${r.error}`, { date: r.error === "paid" && "paidThrough" in r && r.paidThrough ? longDate(r.paidThrough, locale) : "" }));
      setDeleting(null);
      router.refresh();
    });

  const changesFrom = (from: RateVersionView | null, to: RateVersionView) => {
    const out: string[] = [];
    if (!from || from.payRateCents !== to.payRateCents) out.push(t("changePay", { amount: money(to.payRateCents, locale) }));
    if (!from || from.billRateCents !== to.billRateCents) out.push(t("changeBill", { amount: money(to.billRateCents, locale) }));
    if (from && multiplierText(from.otMultiplier) !== multiplierText(to.otMultiplier)) out.push(t("changeOt", { m: multiplierText(to.otMultiplier) }));
    if (from && multiplierText(from.dtMultiplier) !== multiplierText(to.dtMultiplier)) out.push(t("changeDt", { m: multiplierText(to.dtMultiplier) }));
    return out;
  };

  return (
    <section className="flex flex-col gap-4" aria-label={title ?? t("title")}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">{title ?? t("title")}</h2>
        {versions.length > 0 && (
          <div className="flex items-center gap-2">
            <Label htmlFor={`effective-on-${"jobOrderId" in cardRef ? cardRef.jobOrderId : cardRef.assignmentId}`} className="text-sm text-muted-foreground">
              {t("effectiveOn")}
            </Label>
            <NativeSelect
              id={`effective-on-${"jobOrderId" in cardRef ? cardRef.jobOrderId : cardRef.assignmentId}`}
              size="sm"
              value={shown?.id ?? ""}
              onChange={(e) => setShownId(e.target.value)}
            >
              {[...versions].reverse().map((v) => (
                <NativeSelectOption key={v.id} value={v.id}>
                  {longDate(v.effectiveFrom, locale)}
                  {v.id === current?.id ? ` (${t("current")})` : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
        {mayChange && (
          <Button size="sm" onClick={() => setForm({ mode: "add", base: shown })} data-testid="new-version">
            <PlusIcon />
            {versions.length === 0 ? t("add") : t("newVersion")}
          </Button>
        )}
      </div>

      {/* Scheduled change (Gusto): one notice, or one summary with Review for several */}
      {scheduled.length === 1 && (
        <Alert data-testid="scheduled-change">
          <CalendarClockIcon />
          <AlertTitle>{t("scheduledOne", { date: longDate(scheduled[0]!.effectiveFrom, locale) })}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {changesFrom(current, scheduled[0]!).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {mayChange && !scheduled[0]!.frozen && (
              <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setDeleting(scheduled[0]!)}>
                {t("cancelScheduled")}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {scheduled.length > 1 && (
        <Alert data-testid="scheduled-change">
          <CalendarClockIcon />
          <AlertTitle>{t("scheduledMany", { count: scheduled.length })}</AlertTitle>
          <AlertDescription>
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setReviewing(true)}>
              {t("review")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {shown ? (
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm text-muted-foreground">
              {shown.effectiveTo ? t("between", { from: longDate(shown.effectiveFrom, locale), to: longDate(shown.effectiveTo, locale) }) : t("from", { from: longDate(shown.effectiveFrom, locale) })}
            </p>
            {shown.frozen ? (
              <Badge variant="secondary">{t("usedByPaid")}</Badge>
            ) : (
              mayChange && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setForm({ mode: "edit", base: shown })}>
                    {t("edit")}
                  </Button>
                  <Button variant="outline" size="sm" disabled={shown.id === earliest?.id && versions.length > 1} onClick={() => setDeleting(shown)}>
                    {t("delete")}
                  </Button>
                </>
              )
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">{t("pay")}</dt>
              <dd className="text-base font-medium tabular-nums">{money(shown.payRateCents, locale)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("bill")}</dt>
              <dd className="text-base font-medium tabular-nums">
                {money(shown.billRateCents, locale)}
                {shown.markupBp !== null && <span className="ml-1 text-xs text-muted-foreground">{t("markupOf", { percent: bpToInput(shown.markupBp) })}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("wc")}</dt>
              <dd className="tabular-nums">{shown.wcClassCode ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("ot")}</dt>
              <dd className="tabular-nums">{multiplierText(shown.otMultiplier)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("dt")}</dt>
              <dd className="tabular-nums">{multiplierText(shown.dtMultiplier)}</dd>
            </div>
          </dl>
          {shown.frozen && paidThrough && <p className="mt-3 text-xs text-muted-foreground">{t("frozenWhy", { date: longDate(paidThrough, locale) })}</p>}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border py-10 text-sm text-muted-foreground" data-testid="no-rates">
          <CalendarClockIcon className="size-5" />
          <p>{t("none")}</p>
          {mayChange && (
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setForm({ mode: "add", base: null })}>
              {t("add")}
            </Button>
          )}
        </div>
      )}

      {/* History, newest first (Gusto) */}
      {versions.length > 0 && (
        <div className="rounded-lg border">
          <Table aria-label={t("history")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colFrom")}</TableHead>
                <TableHead>{t("colTo")}</TableHead>
                <TableHead className="text-right">{t("pay")}</TableHead>
                <TableHead className="text-right">{t("bill")}</TableHead>
                <TableHead className="text-right">{t("ot")}</TableHead>
                <TableHead className="text-right">{t("dt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...versions].reverse().map((v) => (
                <TableRow key={v.id} data-state={v.id === shown?.id ? "selected" : undefined}>
                  <TableCell>{longDate(v.effectiveFrom, locale)}</TableCell>
                  <TableCell>{v.effectiveTo ? longDate(v.effectiveTo, locale) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(v.payRateCents, locale)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(v.billRateCents, locale)}</TableCell>
                  <TableCell className="text-right tabular-nums">{multiplierText(v.otMultiplier)}</TableCell>
                  <TableCell className="text-right tabular-nums">{multiplierText(v.dtMultiplier)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {form && <RateForm cardRef={cardRef} mode={form.mode} base={form.base} paidThrough={paidThrough} today={today} onClose={() => setForm(null)} />}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{deleting ? t("deleteBody", { date: longDate(deleting.effectiveFrom, locale) }) : null}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => deleting && remove(deleting)}>
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={reviewing} onOpenChange={setReviewing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("scheduledMany", { count: scheduled.length })}</DialogTitle>
          </DialogHeader>
          <ul className="flex flex-col gap-3">
            {scheduled.map((v, i) => (
              <li key={v.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{longDate(v.effectiveFrom, locale)}</p>
                <ul className="list-disc pl-4">
                  {changesFrom(i === 0 ? current : scheduled[i - 1]!, v).map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                {mayChange && !v.frozen && (
                  <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setDeleting(v)}>
                    {t("cancelScheduled")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RateForm({ cardRef, mode, base, paidThrough, today, onClose }: { cardRef: Ref; mode: "add" | "edit"; base: RateVersionView | null; paidThrough: string | null; today: string; onClose: () => void }) {
  const t = useTranslations("rates");
  const te = useTranslations("convert.errors");
  const locale = useLocale();
  const router = useRouter();
  const [pending, run] = useTransition();
  // New version: filled from the shown version except the date, which is blank on purpose (Gusto).
  const [from, setFrom] = useState(mode === "edit" && base ? base.effectiveFrom : "");
  const [pay, setPay] = useState(centsToInput(base?.payRateCents ?? null));
  const [billMode, setBillMode] = useState<"rate" | "markup">(base?.markupBp != null ? "markup" : "rate");
  const [bill, setBill] = useState(centsToInput(base?.billRateCents ?? null));
  const [markup, setMarkup] = useState(bpToInput(base?.markupBp ?? null));
  const [ot, setOt] = useState(base ? multiplierToInput(base.otMultiplier) : "1.5");
  const [dt, setDt] = useState(base ? multiplierToInput(base.dtMultiplier) : "2");
  const [wc, setWc] = useState(base?.wcClassCode ?? "");
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const payCents = parseDollars(pay);
  const markupBp = parsePercentBp(markup);
  // Only within the limits the server accepts (a huge typed number never reaches the arithmetic).
  const preview = billMode === "markup" && payCents !== null && markupBp !== null && payCents <= 10_000_000 && markupBp <= 100_000 ? billFromMarkup(payCents, markupBp) : null;

  const submit = () => {
    const local: Record<string, string> = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) local.effective_from = t("errors.effective_from");
    if (payCents === null) local.pay_rate = t("errors.pay_rate");
    const billCents = parseDollars(bill);
    if (billMode === "rate" && billCents === null) local.bill_rate = t("errors.bill_rate");
    if (billMode === "markup" && markupBp === null) local.markup = t("errors.markup");
    const otM = parseMultiplier(ot);
    const dtM = parseMultiplier(dt);
    if (!otM) local.ot_multiplier = t("errors.ot_multiplier");
    if (!dtM) local.dt_multiplier = t("errors.dt_multiplier");
    if (mode === "edit" && reasons.length === 0) local.reason = t("errors.reason_required");
    if (mode === "edit" && reasons.includes("other") && note.trim() === "") local.reason = t("errors.note_required");
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    const input: RateInput = {
      effectiveFrom: from,
      payRateCents: payCents!,
      bill: billMode === "markup" ? { markupBp: markupBp! } : { rateCents: billCents! },
      otMultiplier: otM!,
      dtMultiplier: dtM!,
      wcClassCode: wc.trim() || null,
    };
    run(async () => {
      const r = mode === "edit" && base ? await editRateAction(base.id, input, reasons, note) : await addRateAction(cardRef, input);
      if (r.ok) {
        toast.success(t(mode === "edit" ? "saved" : "added"));
        onClose();
        router.refresh();
        return;
      }
      if (r.error === "busy") toast.error(te("busy"));
      else if (r.error === "invalid" && "problems" in r && r.problems) setErrors(Object.fromEntries(r.problems.map((p) => [p, t(`errors.${p}`)])));
      else if (r.error === "paid" || r.error === "same_start" || r.error === "earliest") {
        setErrors({ effective_from: t(`errors.${r.error}`, { date: "paidThrough" in r && r.paidThrough ? longDate(r.paidThrough, locale) : "" }) });
      } else if (r.error === "reason_required" || r.error === "note_required") setErrors({ reason: t(`errors.${r.error}`) });
      else toast.error(te("stale"));
    });
  };

  const err = (key: string) => (errors[key] ? <p id={`rate-${key}-error`} className="text-sm text-destructive">{errors[key]}</p> : null);
  const aria = (key: string) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `rate-${key}-error` } : {});

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(mode === "edit" ? "editTitle" : base ? "newVersionTitle" : "addTitle")}</DialogTitle>
          <DialogDescription>{paidThrough ? t("startsAfter", { date: longDate(paidThrough, locale) }) : t("anyDate")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="rate-from">{t("effectiveFrom")}</Label>
            <Input id="rate-from" type="date" value={from} min={paidThrough ?? undefined} onChange={(e) => setFrom(e.target.value)} {...aria("effective_from")} />
            {err("effective_from") ?? (from > today ? <p className="text-xs text-muted-foreground">{t("willSchedule")}</p> : null)}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rate-pay">{t("payPerHour")}</Label>
            <Input id="rate-pay" inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} {...aria("pay_rate")} />
            {err("pay_rate")}
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">{t("billAs")}</legend>
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="bill-mode" checked={billMode === "rate"} onChange={() => setBillMode("rate")} />
                {t("billRate")}
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="bill-mode" checked={billMode === "markup"} onChange={() => setBillMode("markup")} />
                {t("markup")}
              </label>
            </div>
            {billMode === "rate" ? (
              <Input aria-label={t("billPerHour")} inputMode="decimal" value={bill} onChange={(e) => setBill(e.target.value)} {...aria("bill_rate")} />
            ) : (
              <Input aria-label={t("markupPercent")} inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} {...aria("markup")} />
            )}
            {err("bill_rate") ?? err("markup") ?? (preview ? <p className="text-xs text-muted-foreground" data-testid="markup-preview">{t("markupPreview", { working: preview.explain })}</p> : null)}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rate-ot">{t("ot")}</Label>
            <Input id="rate-ot" inputMode="decimal" value={ot} onChange={(e) => setOt(e.target.value)} {...aria("ot_multiplier")} />
            {err("ot_multiplier")}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rate-dt">{t("dt")}</Label>
            <Input id="rate-dt" inputMode="decimal" value={dt} onChange={(e) => setDt(e.target.value)} {...aria("dt_multiplier")} />
            {err("dt_multiplier")}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rate-wc">{t("wc")}</Label>
            <Input id="rate-wc" value={wc} onChange={(e) => setWc(e.target.value)} {...aria("wc_class_code")} />
            {err("wc_class_code")}
          </div>
          {mode === "edit" && (
            <fieldset className="flex flex-col gap-2 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">{t("reasonLabel")}</legend>
              {REASONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={reasons.includes(r)} onCheckedChange={(on) => setReasons((cur) => (on ? [...cur, r] : cur.filter((x) => x !== r)))} />
                  {t(`reasons.${r}`)}
                </label>
              ))}
              <Textarea aria-label={t("note")} placeholder={t("note")} value={note} onChange={(e) => setNote(e.target.value)} />
              {err("reason")}
            </fieldset>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t(mode === "edit" ? "save" : "addVersion")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
