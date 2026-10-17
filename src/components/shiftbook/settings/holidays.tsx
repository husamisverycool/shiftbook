"use client";

// Holidays — docs/patterns/settings/holidays.md: Gusto's holiday pay policy (the days, what working
// them pays, what a holiday not worked pays), the agency's and each client's own, as Linear's settings.
import { CalendarDaysIcon, EllipsisIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteHolidayPolicyAction, saveHolidayPolicyAction } from "@/app/[locale]/(app)/settings/holidays/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { HolidayPolicyView, HolidayProblem } from "@/server/catalog/holidays";
import { SettingsEmpty, SettingsPage, SettingsRow, SettingsRows, SettingsSection, SettingsTile } from "../settings-panel";

/** "1.5" → 3/2; "" or nonsense → null. Whole numbers and halves, quarters, tenths (no floats stored). */
function multiplierOf(text: string): { num: number; den: number } | null {
  const m = /^\s*(\d)(?:\.(\d{1,2}))?\s*$/.exec(text);
  if (!m) return null;
  const den = m[2] ? 10 ** m[2].length : 1;
  return { num: Number(m[1]) * den + Number(m[2] ?? 0), den };
}
const multiplierText = (m: { num: number; den: number }) => String(m.num / m.den);

export function HolidaySettings({ view, canChange }: { view: { policies: HolidayPolicyView[]; clients: { id: string; name: string }[] }; canChange: boolean }) {
  const t = useTranslations("holidays");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<HolidayPolicyView | "new" | null>(null);
  const [deleting, setDeleting] = useState<HolidayPolicyView | null>(null);
  const [form, setForm] = useState({ clientId: "", name: "", dates: "", worked: "1.5", notWorked: "0", bill: "1.5", billPremium: true, billNotWorked: false });
  const [problems, setProblems] = useState<HolidayProblem[]>([]);

  const open = (p: HolidayPolicyView | "new") => {
    setProblems([]);
    setForm(
      p === "new"
        ? { clientId: "", name: "", dates: "", worked: "1.5", notWorked: "0", bill: "1.5", billPremium: true, billNotWorked: false }
        : {
            clientId: p.clientId ?? "",
            name: p.name,
            dates: p.dates.join("\n"),
            worked: multiplierText(p.workedMultiplier),
            notWorked: String(p.notWorkedMinutes / 60),
            bill: p.billWorkedMultiplier ? multiplierText(p.billWorkedMultiplier) : "1.5",
            billPremium: p.billWorkedMultiplier !== null,
            billNotWorked: p.billNotWorked,
          },
    );
    setEditing(p);
  };

  const save = () => {
    const worked = multiplierOf(form.worked);
    const bill = form.billPremium ? multiplierOf(form.bill) : null;
    const notWorkedHours = Number(form.notWorked || "0");
    const local: HolidayProblem[] = [];
    if (!worked) local.push("worked_multiplier");
    if (form.billPremium && !bill) local.push("bill_multiplier");
    if (!Number.isFinite(notWorkedHours) || notWorkedHours < 0 || notWorkedHours > 12 || Math.round(notWorkedHours * 60) !== notWorkedHours * 60) local.push("not_worked");
    if (local.length > 0) return setProblems(local);
    const dates = [...new Set(form.dates.split(/[\s,]+/).filter(Boolean))];
    start(async () => {
      const r = await saveHolidayPolicyAction(editing && editing !== "new" ? editing.id : null, {
        clientId: form.clientId || null,
        name: form.name,
        dates,
        workedMultiplier: worked!,
        notWorkedMinutes: Math.round(notWorkedHours * 60),
        billWorkedMultiplier: bill,
        billNotWorked: form.billNotWorked,
      });
      if (r.ok) {
        toast.success(t("saved"));
        setEditing(null);
      } else setProblems(r.problems);
      router.refresh();
    });
  };

  const remove = () =>
    start(async () => {
      if (!deleting) return;
      await deleteHolidayPolicyAction(deleting.id);
      toast.success(t("deleted"));
      setDeleting(null);
      router.refresh();
    });

  const problem = (key: HolidayProblem) => (problems.includes(key) ? <p className="text-sm text-destructive">{t(`errors.${key}`)}</p> : null);

  return (
    <SettingsPage context={t("context")} title={t("title")} description={t("description")}>
      <SettingsSection
        title={t("policies")}
        description={t("policiesHint")}
        action={
          canChange && (
            <Button size="sm" variant="outline" onClick={() => open("new")} data-testid="holiday-add">
              <PlusIcon />
              {t("add")}
            </Button>
          )
        }
      >
        <SettingsRows as="ul" testId="holiday-policies">
          {view.policies.length === 0 ? (
            <SettingsEmpty as="li">{t("empty")}</SettingsEmpty>
          ) : (
            view.policies.map((p) => (
              <SettingsRow
                as="li"
                key={p.id}
                testId="holiday-policy"
                leading={
                  <SettingsTile>
                    <CalendarDaysIcon />
                  </SettingsTile>
                }
                label={p.name}
                description={t("rowLine", { who: p.clientName ?? t("agencyDefault"), count: p.dates.length })}
                control={
                  <>
                    <span className="text-sm text-muted-foreground tabular-nums">{t("rowTerms", { worked: multiplierText(p.workedMultiplier), hours: String(p.notWorkedMinutes / 60) })}</span>
                    {canChange && (
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("actions")} />}>
                          <EllipsisIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => open(p)}>{t("edit")}</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(p)}>
                            {t("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </>
                }
              />
            ))
          )}
        </SettingsRows>
      </SettingsSection>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(editing === "new" ? "addTitle" : "editTitle")}</DialogTitle>
            <DialogDescription>{t("dialogHint")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hol-name">{t("name")}</Label>
              <Input id="hol-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="holiday-name" />
              {problem("name")}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hol-client">{t("appliesTo")}</Label>
              <NativeSelect id="hol-client" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} data-testid="holiday-client">
                <NativeSelectOption value="">{t("agencyDefault")}</NativeSelectOption>
                {view.clients.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {problem("client")}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hol-dates">{t("dates")}</Label>
              <Textarea id="hol-dates" placeholder="2026-11-26" value={form.dates} onChange={(e) => setForm({ ...form, dates: e.target.value })} data-testid="holiday-dates" />
              {problem("dates") ?? problem("overlap") ?? <p className="text-xs text-muted-foreground">{t("datesHint")}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hol-worked">{t("worked")}</Label>
                <Input id="hol-worked" inputMode="decimal" value={form.worked} onChange={(e) => setForm({ ...form, worked: e.target.value })} data-testid="holiday-worked" />
                {problem("worked_multiplier")}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hol-not-worked">{t("notWorked")}</Label>
                <Input id="hol-not-worked" inputMode="decimal" value={form.notWorked} onChange={(e) => setForm({ ...form, notWorked: e.target.value })} />
                {problem("not_worked")}
              </div>
            </div>
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox checked={form.billPremium} onCheckedChange={(v) => setForm({ ...form, billPremium: v === true })} />
              {t("billPremium")}
            </Label>
            {form.billPremium && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hol-bill">{t("bill")}</Label>
                <Input id="hol-bill" inputMode="decimal" value={form.bill} onChange={(e) => setForm({ ...form, bill: e.target.value })} />
                {problem("bill_multiplier")}
              </div>
            )}
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox checked={form.billNotWorked} onCheckedChange={(v) => setForm({ ...form, billNotWorked: v === true })} />
              {t("billNotWorked")}
            </Label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {t("cancel")}
            </Button>
            <Button onClick={save} loading={pending} disabled={pending} data-testid="holiday-save">
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle", { name: deleting?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("deleteHint")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={remove} loading={pending} disabled={pending}>
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}
