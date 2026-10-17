"use client";

// Pattern: docs/patterns/settings/connections.md — Edit columns (decision 0043): the placement
// import's mapping step (Attio import; docs/patterns/assignments/import.md) for a VMS time file —
// each Granite field beside the column name in the buyer's report, the statuses that count and the
// date format; Save, Cancel, and Restore the built-in names.
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { profileColumnsAction, saveProfileColumnsAction } from "@/app/[locale]/(app)/settings/connections/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import type { ColumnProblem, MappingProfile } from "@/server/intake/profiles";
import { SettingsField } from "../settings-panel";

const OPTIONAL = new Set(["site", "clientName", "externalId", "totalHours"]);

/** Opens Edit columns for a profile from a button or a row menu: loads the columns, then shows the dialog. */
export function useProfileColumns(profileKey: string, name: string) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ base: MappingProfile; current: MappingProfile } | null>(null);
  const [opened, setOpened] = useState(0);
  const [loading, load] = useTransition();
  const t = useTranslations("vmsColumns");
  const openDialog = () =>
    load(async () => {
      const found = await profileColumnsAction(profileKey);
      if (!found) {
        toast.error(t("stale"));
        return;
      }
      setLoaded(found);
      setOpened((n) => n + 1);
      setOpen(true);
    });
  // Kept mounted after closing so it can leave (decision 0037); a new opening starts from what is saved.
  const dialog = loaded ? <ColumnsDialog key={opened} open={open} onOpenChange={setOpen} name={name} profileKey={profileKey} base={loaded.base} current={loaded.current} /> : null;
  return { openDialog, loading, dialog };
}

export function ProfileColumnsButton({ profileKey, name, label }: { profileKey: string; name: string; label: string }) {
  const t = useTranslations("vmsColumns");
  const { openDialog, loading, dialog } = useProfileColumns(profileKey, name);
  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog} loading={loading} loadingLabel={t("loading")} data-testid={`edit-columns-${profileKey}`}>
        {label}
      </Button>
      {dialog}
    </>
  );
}

function ColumnsDialog({ open, onOpenChange, name, profileKey, base, current }: { open: boolean; onOpenChange: (o: boolean) => void; name: string; profileKey: string; base: MappingProfile; current: MappingProfile }) {
  const t = useTranslations("vmsColumns");
  const router = useRouter();
  const id = useId();
  const fields = Object.keys(base.columns);
  const [columns, setColumns] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f, (current.columns as Record<string, string | undefined>)[f] ?? ""])));
  const [statuses, setStatuses] = useState(current.kind === "vms" ? current.includeStatuses.join(", ") : "");
  const [dateFormat, setDateFormat] = useState(current.dateFormat);
  const [problems, setProblems] = useState<ColumnProblem[]>([]);
  const [saving, save] = useTransition();
  const [restoring, restore] = useTransition();
  const problemOf = (field: string) => problems.find((p) => p.field === field);
  const done = (result: Awaited<ReturnType<typeof saveProfileColumnsAction>>, message: string) => {
    if (result.ok) {
      toast.success(message);
      onOpenChange(false);
      router.refresh();
    } else if (result.error === "invalid") setProblems(result.problems);
    else toast.error(t("stale"));
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="columns-dialog">
        <DialogHeader>
          <DialogTitle>{t("title", { name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          className="flex max-h-[60svh] flex-col gap-4 overflow-y-auto pr-1"
          onSubmit={(e) => {
            e.preventDefault();
            setProblems([]);
            save(async () => {
              const input = { columns, dateFormat, ...(base.kind === "vms" ? { includeStatuses: statuses.split(",") } : {}) };
              done(await saveProfileColumnsAction(profileKey, input), t("saved", { name }));
            });
          }}
        >
          {fields.map((f) => {
            const problem = problemOf(f);
            return (
              <SettingsField
                key={f}
                id={`${id}-${f}`}
                label={OPTIONAL.has(f) ? t("optional", { field: t(`fields.${f}` as "fields.date") }) : t(`fields.${f}` as "fields.date")}
                hint={t("builtIn", { column: (base.columns as Record<string, string | undefined>)[f] ?? "" })}
                hintId={`${id}-${f}-hint`}
                problem={
                  problem && (
                    <p id={`${id}-${f}-problem`} className="text-[13px] text-destructive">
                      {t(`problems.${problem.rule}`)}
                    </p>
                  )
                }
              >
                <Input
                  id={`${id}-${f}`}
                  value={columns[f] ?? ""}
                  maxLength={80}
                  aria-invalid={problem ? true : undefined}
                  aria-describedby={problem ? `${id}-${f}-hint ${id}-${f}-problem` : `${id}-${f}-hint`}
                  onChange={(e) => setColumns((c) => ({ ...c, [f]: e.target.value }))}
                  data-testid={`column-${f}`}
                />
              </SettingsField>
            );
          })}
          {base.kind === "vms" && (
            <SettingsField id={`${id}-statuses`} label={t("statuses")} hint={t("statusesHint")} hintId={`${id}-statuses-hint`} problem={problemOf("includeStatuses") && <p className="text-[13px] text-destructive">{t(`problems.${problemOf("includeStatuses")!.rule}`)}</p>}>
              <Input id={`${id}-statuses`} value={statuses} aria-describedby={`${id}-statuses-hint`} onChange={(e) => setStatuses(e.target.value)} data-testid="column-statuses" />
            </SettingsField>
          )}
          <SettingsField id={`${id}-date`} label={t("dateFormat")}>
            <NativeSelect id={`${id}-date`} value={dateFormat} onChange={(e) => setDateFormat(e.target.value as typeof dateFormat)} data-testid="column-date-format">
              <NativeSelectOption value="MM/DD/YYYY">MM/DD/YYYY</NativeSelectOption>
              <NativeSelectOption value="YYYY-MM-DD">YYYY-MM-DD</NativeSelectOption>
            </NativeSelect>
          </SettingsField>
        </form>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" type="button" loading={restoring} loadingLabel={t("loading")} onClick={() => restore(async () => done(await saveProfileColumnsAction(profileKey, null, true), t("restored", { name })))} data-testid="columns-restore">
            {t("restore")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form={`${id}-form`} loading={saving} loadingLabel={t("saving")} data-testid="columns-save">
              {t("save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
