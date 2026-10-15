"use client";

// Pattern: docs/patterns/job-orders.md — Linear create modal (C): the fields in one dialog; closing
// with changes asks whether to keep a draft (Linear drafts; Shiftbook keeps it in this browser).
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createJobOrderAction, updateJobOrderAction } from "@/app/[locale]/(app)/job-orders/actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import { centsToInput, parseDollars } from "@/lib/amounts";

export interface CatalogOptions {
  clients: { id: string; name: string }[];
  worksites: { id: string; clientId: string; name: string; city: string; state: string }[];
  workers: { id: string; name: string }[];
  jobOrders: { id: string; clientId: string; label: string }[];
}

interface Values {
  clientId: string;
  worksiteId: string;
  position: string;
  socCode: string;
  shift: string;
  headcount: string;
  payMin: string;
  payMax: string;
  prevailingWage: boolean;
}

export interface JobOrderInitial {
  id: string;
  clientId: string;
  worksiteId: string;
  position: string;
  socCode: string | null;
  shift: string | null;
  headcount: number;
  payMinCents: number | null;
  payMaxCents: number | null;
  prevailingWage: boolean;
}

const DRAFT_KEY = "shiftbook.draft.job-order";
const EMPTY: Values = { clientId: "", worksiteId: "", position: "", socCode: "", shift: "", headcount: "1", payMin: "", payMax: "", prevailingWage: false };
const FIELD_OF = { client: "clientId", worksite: "worksiteId", position: "position", soc_code: "socCode", shift: "shift", headcount: "headcount", pay_range: "payMin" } as const;

function readDraft(): Values | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Values>) } : null;
  } catch {
    return null;
  }
}
function writeDraft(v: Values | null) {
  try {
    if (v) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // No storage (private window): the draft is not kept.
  }
}

/** Mounted only while open (so a draft is read on the client when the form opens). */
export function JobOrderForm({ onClose, options, initial }: { onClose: () => void; options: CatalogOptions; initial?: JobOrderInitial }) {
  const t = useTranslations("jobOrders.form");
  const te = useTranslations("convert.errors");
  const router = useRouter();
  const start: Values = initial
    ? {
        clientId: initial.clientId,
        worksiteId: initial.worksiteId,
        position: initial.position,
        socCode: initial.socCode ?? "",
        shift: initial.shift ?? "",
        headcount: String(initial.headcount),
        payMin: centsToInput(initial.payMinCents),
        payMax: centsToInput(initial.payMaxCents),
        prevailingWage: initial.prevailingWage,
      }
    : EMPTY;
  const [draft] = useState(() => (initial ? null : readDraft()));
  const [values, setValues] = useState<Values>(draft ?? start);
  const restored = draft !== null;
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [askDraft, setAskDraft] = useState(false);
  const [pending, run] = useTransition();
  const changed = JSON.stringify(values) !== JSON.stringify(start);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value, ...(key === "clientId" ? { worksiteId: "" } : {}) }));
  const sites = options.worksites.filter((w) => w.clientId === values.clientId);

  const close = () => {
    if (changed && !initial) setAskDraft(true);
    else onClose();
  };

  const submit = () => {
    const payMinCents = values.payMin.trim() === "" ? null : parseDollars(values.payMin);
    const payMaxCents = values.payMax.trim() === "" ? null : parseDollars(values.payMax);
    const local: Partial<Record<keyof Values, string>> = {};
    if (payMinCents === null && values.payMin.trim() !== "") local.payMin = t("errors.amount");
    if (payMaxCents === null && values.payMax.trim() !== "") local.payMax = t("errors.amount");
    if (!/^\d+$/.test(values.headcount.trim())) local.headcount = t("errors.headcount");
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }
    const input = {
      clientId: values.clientId,
      worksiteId: values.worksiteId,
      position: values.position,
      socCode: values.socCode.trim() || null,
      shift: values.shift.trim() || null,
      headcount: Number(values.headcount.trim()),
      payMinCents,
      payMaxCents,
      prevailingWage: values.prevailingWage,
    };
    run(async () => {
      const r = initial ? await updateJobOrderAction(initial.id, input) : await createJobOrderAction(input);
      if (r.ok) {
        writeDraft(null);
        toast.success(t(initial ? "saved" : "created"));
        onClose();
        router.refresh();
        if (!initial) router.push(`/job-orders/${r.id}`);
        return;
      }
      if (r.error === "invalid" && "fields" in r) {
        setErrors(Object.fromEntries(r.fields.map((f) => [FIELD_OF[f], t(`errors.${f}`)])));
      } else if (r.error === "busy") toast.error(te("busy"));
      else if (r.error === "client_has_assignments") setErrors({ clientId: t("errors.client_has_assignments") });
      else toast.error(te("stale"));
    });
  };

  const field = (key: keyof Values, label: string, input: React.ReactNode, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`jo-${key}`}>{label}</Label>
      {input}
      {errors[key] ? (
        <p id={`jo-${key}-error`} className="text-sm text-destructive">
          {errors[key]}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
  const invalid = (key: keyof Values) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `jo-${key}-error` } : {});

  return (
    <>
      <Dialog open onOpenChange={(next) => !next && close()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t(initial ? "editTitle" : "createTitle")}</DialogTitle>
            {restored && <DialogDescription>{t("draftRestored")}</DialogDescription>}
          </DialogHeader>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {field(
              "clientId",
              t("client"),
              <NativeSelect className="w-full" id="jo-clientId" value={values.clientId} onChange={(e) => set("clientId", e.target.value)} {...invalid("clientId")}>
                <NativeSelectOption value="">{t("choose")}</NativeSelectOption>
                {options.clients.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>,
            )}
            {field(
              "worksiteId",
              t("worksite"),
              <NativeSelect className="w-full" id="jo-worksiteId" value={values.worksiteId} disabled={!values.clientId} onChange={(e) => set("worksiteId", e.target.value)} {...invalid("worksiteId")}>
                <NativeSelectOption value="">{t("choose")}</NativeSelectOption>
                {sites.map((w) => (
                  <NativeSelectOption key={w.id} value={w.id}>
                    {`${w.name} — ${w.city}, ${w.state}`}
                  </NativeSelectOption>
                ))}
              </NativeSelect>,
            )}
            {field("position", t("position"), <Input id="jo-position" value={values.position} onChange={(e) => set("position", e.target.value)} autoFocus {...invalid("position")} />)}
            {field("shift", t("shift"), <Input id="jo-shift" value={values.shift} onChange={(e) => set("shift", e.target.value)} {...invalid("shift")} />)}
            {field("socCode", t("socCode"), <Input id="jo-socCode" value={values.socCode} placeholder="53-7062" onChange={(e) => set("socCode", e.target.value)} {...invalid("socCode")} />, t("socHint"))}
            {field("headcount", t("headcount"), <Input id="jo-headcount" inputMode="numeric" value={values.headcount} onChange={(e) => set("headcount", e.target.value)} {...invalid("headcount")} />)}
            {field("payMin", t("payMin"), <Input id="jo-payMin" inputMode="decimal" value={values.payMin} placeholder="18.00" onChange={(e) => set("payMin", e.target.value)} {...invalid("payMin")} />)}
            {field("payMax", t("payMax"), <Input id="jo-payMax" inputMode="decimal" value={values.payMax} placeholder="22.00" onChange={(e) => set("payMax", e.target.value)} {...invalid("payMax")} />)}
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="jo-prevailingWage" checked={values.prevailingWage} onCheckedChange={(on) => set("prevailingWage", on === true)} />
              <Label htmlFor="jo-prevailingWage">{t("prevailingWage")}</Label>
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={close}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {t(initial ? "save" : "create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={askDraft} onOpenChange={setAskDraft}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("draftTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("draftBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                writeDraft(null);
                setAskDraft(false);
                onClose();
              }}
            >
              {t("discard")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                writeDraft(values);
                setAskDraft(false);
                onClose();
              }}
            >
              {t("saveDraft")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
