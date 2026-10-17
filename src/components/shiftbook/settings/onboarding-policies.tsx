"use client";

// Pattern: docs/patterns/settings/onboarding.md — Linear's settings layout: a Policies section with Add
// policy at its heading, one row per policy in force (Edit, and Remove in its "…" menu), the changes
// scheduled for later; Rippling: an update asks everyone again. Decision 0043.
import { EllipsisIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { removePolicyAction, savePolicyAction } from "@/app/[locale]/(app)/settings/onboarding/actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { Policy, PolicyProblem } from "@/server/worker-app/policies";
import { longDate } from "../format";
import { SettingsEmpty, SettingsField, SettingsPage, SettingsRow, SettingsRows, SettingsSection } from "../settings-panel";

type View = { today: string; current: (Policy & { owing: number })[]; upcoming: (Policy & { active: boolean })[] };

export function OnboardingPoliciesView({ view, canChange }: { view: View; canChange: boolean }) {
  const t = useTranslations("onboardingPolicies");
  const tSettings = useTranslations("settings");
  const locale = useLocale();
  const [editing, setEditing] = useState<Policy | "new" | null>(null);
  const [removing, setRemoving] = useState<Policy | null>(null);
  const titleOf = (p: Policy) => (locale === "es" && p.titleEs) || p.titleEn;
  return (
    <SettingsPage context={tSettings("title")} title={t("title")}>
      <SettingsSection
        title={t("policies")}
        description={t("policiesHint")}
        action={
          canChange && (
            <Button size="sm" variant="outline" onClick={() => setEditing("new")} data-testid="add-policy">
              {t("add")}
            </Button>
          )
        }
      >
        <SettingsRows as="ul" testId="policies">
          {view.current.length === 0 ? (
            <SettingsEmpty as="li">{t("none")}</SettingsEmpty>
          ) : (
            view.current.map((p) => (
              <SettingsRow
                as="li"
                key={p.key}
                testId={`policy-${p.key}`}
                label={titleOf(p)}
                description={[
                  p.required ? t("required") : t("optional"),
                  p.builtIn ? t("builtIn") : t("version", { version: p.version }),
                  ...(p.builtIn ? [] : [t("since", { date: longDate(p.effectiveFrom, locale) })]),
                  ...(p.owing > 0 ? [t("owing", { count: p.owing })] : []),
                ].join(" · ")}
                control={
                  canChange && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditing(p)} data-testid={`edit-policy-${p.key}`}>
                        {t("edit")}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("menu", { title: titleOf(p) })} data-testid={`policy-menu-${p.key}`} />}>
                          <EllipsisIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem variant="destructive" onClick={() => setRemoving(p)} data-testid={`remove-policy-${p.key}`}>
                            {t("remove")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )
                }
              />
            ))
          )}
        </SettingsRows>
      </SettingsSection>
      {view.upcoming.length > 0 && (
        <SettingsSection title={t("scheduled")} description={t("scheduledHint")}>
          <SettingsRows as="ul" testId="policies-scheduled">
            {view.upcoming.map((p) => (
              <SettingsRow as="li" key={`${p.key}-${p.version}`} label={titleOf(p)} description={p.active ? t("from", { date: longDate(p.effectiveFrom, locale) }) : t("removedFrom", { date: longDate(p.effectiveFrom, locale) })} />
            ))}
          </SettingsRows>
        </SettingsSection>
      )}
      {editing && <PolicyDialog policy={editing === "new" ? null : editing} today={view.today} onClose={() => setEditing(null)} />}
      {removing && <RemoveDialog policy={removing} today={view.today} title={titleOf(removing)} onClose={() => setRemoving(null)} />}
    </SettingsPage>
  );
}

function PolicyDialog({ policy, today, onClose }: { policy: Policy | null; today: string; onClose: () => void }) {
  const t = useTranslations("onboardingPolicies");
  const router = useRouter();
  const id = useId();
  const [form, setForm] = useState({ titleEn: policy?.titleEn ?? "", bodyEn: policy?.bodyEn ?? "", titleEs: policy?.titleEs ?? "", bodyEs: policy?.bodyEs ?? "", required: policy?.required ?? true, effectiveFrom: today });
  const [problems, setProblems] = useState<PolicyProblem[]>([]);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const problem = (p: PolicyProblem) =>
    problems.includes(p) && (
      <p id={`${id}-${p}-problem`} className="text-[13px] text-destructive">
        {t(`problems.${p}`)}
      </p>
    );
  const save = () =>
    start(async () => {
      const r = await savePolicyAction({ key: policy?.key ?? null, ...form });
      if (r.ok) {
        toast.success(t("saved"));
        onClose();
        router.refresh();
      } else if (r.error === "invalid") setProblems(r.problems);
      else toast.error(t(`errors.${r.error}`));
    });
  const field = (k: "titleEn" | "titleEs", p: PolicyProblem, label: string) => (
    <SettingsField id={`${id}-${k}`} label={label} problem={problem(p)}>
      <Input id={`${id}-${k}`} value={form[k]} maxLength={120} aria-invalid={problems.includes(p) || undefined} onChange={(e) => set(k, e.target.value)} data-testid={`policy-${k}`} />
    </SettingsField>
  );
  const area = (k: "bodyEn" | "bodyEs", p: PolicyProblem, label: string) => (
    <SettingsField id={`${id}-${k}`} label={label} problem={problem(p)}>
      <Textarea id={`${id}-${k}`} value={form[k]} maxLength={4000} rows={4} aria-invalid={problems.includes(p) || undefined} onChange={(e) => set(k, e.target.value)} data-testid={`policy-${k}`} />
    </SettingsField>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="policy-dialog">
        <DialogHeader>
          <DialogTitle>{policy ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>{policy ? t("editHint") : t("addHint")}</DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          className="flex max-h-[60svh] flex-col gap-4 overflow-y-auto pr-1"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {field("titleEn", "title_en", t("titleEn"))}
          {area("bodyEn", "body_en", t("bodyEn"))}
          {field("titleEs", "title_es", t("titleEs"))}
          {area("bodyEs", "body_es", t("bodyEs"))}
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor={`${id}-required`} className="flex flex-col items-start gap-0.5">
              <span>{t("requiredLabel")}</span>
              <span className="text-[13px] font-normal text-muted-foreground">{t("requiredHint")}</span>
            </Label>
            <Switch id={`${id}-required`} checked={form.required} onCheckedChange={(v) => set("required", v)} data-testid="policy-required" />
          </div>
          <SettingsField id={`${id}-from`} label={t("effectiveFrom")} hint={t("effectiveHint")} problem={problem("effective_from")}>
            <Input id={`${id}-from`} type="date" min={today} value={form.effectiveFrom} className="w-44" onChange={(e) => set("effectiveFrom", e.target.value)} data-testid="policy-from" />
          </SettingsField>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" form={`${id}-form`} loading={pending} loadingLabel={t("saving")} data-testid="save-policy">
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({ policy, today, title, onClose }: { policy: Policy; today: string; title: string; onClose: () => void }) {
  const t = useTranslations("onboardingPolicies");
  const router = useRouter();
  const [from, setFrom] = useState(today);
  const [pending, start] = useTransition();
  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("removeTitle", { title })}</AlertDialogTitle>
          <AlertDialogDescription>{t("removeBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="remove-from">{t("removeFrom")}</Label>
          <Input id="remove-from" type="date" min={today} value={from} className="w-44" onChange={(e) => setFrom(e.target.value)} data-testid="remove-policy-from" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            data-testid="confirm-remove-policy"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await removePolicyAction(policy.key, from);
                if (r.ok) {
                  toast.success(t("removed", { title }));
                  onClose();
                  router.refresh();
                } else toast.error(r.error === "invalid" ? t("problems.effective_from") : t(`errors.${r.error}`));
              });
            }}
          >
            {t("remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
