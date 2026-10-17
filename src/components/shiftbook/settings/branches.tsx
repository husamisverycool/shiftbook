"use client";

// Pattern: docs/patterns/settings/branches.md — Gusto's company locations (Add location; each one's
// menu with Edit and Deactivate) as Linear's settings list: the add action at the section heading's
// right, rows in a panel with a "…" menu.
import { ArchiveIcon, ArchiveRestoreIcon, Building2Icon, EllipsisIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveBranchAction, createBranchAction, renameBranchAction } from "@/app/[locale]/(app)/settings/branches/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import type { BranchRow } from "@/server/setup/agency";
import { ReadOnlyNote } from "../abilities";
import { SettingsEmpty, SettingsPage, SettingsRow, SettingsRows, SettingsSection, SettingsTile } from "../settings-panel";

export function BranchesSettings({ rows, canChange }: { rows: BranchRow[]; canChange: boolean }) {
  const t = useTranslations("branchSetup");
  const tc = useTranslations("agencySetup");
  const router = useRouter();
  const [dialog, setDialog] = useState<BranchRow | "new" | null>(null);
  const [, start] = useTransition();
  const archive = (row: BranchRow, to: boolean) =>
    start(async () => {
      const r = await archiveBranchAction(row.id, to);
      if (r.ok) {
        toast.success(to ? t("archivedDone") : t("restored"));
        router.refresh();
      } else toast.error(r.error === "name_taken" ? t("rules.name_taken") : t("generic"));
    });
  return (
    <SettingsPage context={tc("context")} title={t("title")} description={canChange ? undefined : <ReadOnlyNote text={t("readOnly")} />}>
      <SettingsSection
        title={t("listTitle")}
        description={t("intro")}
        testId="branches"
        action={
          canChange ? (
            <Button size="sm" variant="outline" onClick={() => setDialog("new")} data-testid="add-branch">
              <PlusIcon />
              {t("add")}
            </Button>
          ) : undefined
        }
      >
        <SettingsRows as="ul" testId="branch-list">
          {rows.length === 0 ? (
            <SettingsEmpty as="li">{t("none")}</SettingsEmpty>
          ) : (
            rows.map((b) => (
              <SettingsRow
                as="li"
                key={b.id}
                testId="branch-row"
                leading={
                  <SettingsTile>
                    <Building2Icon />
                  </SettingsTile>
                }
                label={
                  <span className="inline-flex items-center gap-2">
                    {b.name}
                    {b.archived && <Badge variant="secondary">{t("archived")}</Badge>}
                  </span>
                }
                description={t("jobOrders", { count: b.jobOrders })}
                control={
                  canChange ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("menu", { name: b.name })} data-testid="branch-menu" />}>
                        <EllipsisIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDialog(b)} data-testid="branch-rename">
                          <PencilIcon />
                          {t("rename")}
                        </DropdownMenuItem>
                        {b.archived ? (
                          <DropdownMenuItem onClick={() => archive(b, false)}>
                            <ArchiveRestoreIcon />
                            {t("restore")}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => archive(b, true)} data-testid="branch-archive">
                            <ArchiveIcon />
                            {t("archive")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : undefined
                }
              />
            ))
          )}
        </SettingsRows>
      </SettingsSection>
      {dialog && <BranchDialog row={dialog === "new" ? null : dialog} onClose={() => setDialog(null)} />}
    </SettingsPage>
  );
}

function BranchDialog({ row, onClose }: { row: BranchRow | null; onClose: () => void }) {
  const t = useTranslations("branchSetup");
  const tc = useTranslations("common");
  const router = useRouter();
  const [name, setName] = useState(row?.name ?? "");
  const [rule, setRule] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = row ? await renameBranchAction(row.id, name) : await createBranchAction(name);
      if (r.ok) {
        toast.success(row ? t("renamed") : t("added"));
        onClose();
        router.refresh();
      } else if (r.error === "invalid") setRule("required");
      else if (r.error === "name_taken") setRule("name_taken");
      else toast.error(t("generic"));
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm" data-testid="branch-dialog">
        <DialogHeader>
          <DialogTitle>{row ? t("renameTitle") : t("addTitle")}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="branch-name">{t("name")}</Label>
            <Input id="branch-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={100} aria-invalid={rule ? true : undefined} aria-describedby={rule ? "branch-name-error" : undefined} data-testid="branch-name" />
            {rule && (
              <p id="branch-name-error" className="text-xs text-destructive">
                {t(`rules.${rule}` as never)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending} loadingLabel={tc("loading")} data-testid="branch-save">
              {tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
