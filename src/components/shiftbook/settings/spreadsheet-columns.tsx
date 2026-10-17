"use client";

// Pattern: docs/patterns/settings/payroll.md — Spreadsheet columns tab (Deputy custom payroll export:
// file settings, the included columns in file order with header, move and remove, then a searchable
// list of fields to add, fixed text included). Laid out as one Linear settings panel (Linear's SAML
// panel: its parts between hairlines, a list nested in a part; docs/patterns/_components/settings.md),
// Save in the panel's foot.
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveTargetAction } from "@/app/[locale]/(app)/settings/payroll/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import { DATE_FORMATS, DELIMITERS, SPREADSHEET_FIELDS, type Delimiter, type DateFormat, type SettingProblem, type SpreadsheetField, type SpreadsheetLayout } from "@/exports/targets";
import { FieldProblem, useRefusal } from "./payroll-settings";
import { problemFor } from "./problems";
import { SettingsField, SettingsFooter, SettingsRows, SettingsSection } from "../settings-panel";

export function SpreadsheetColumns({ layout: initial, targetId, canEdit }: { layout: SpreadsheetLayout; targetId: string | null; canEdit: boolean }) {
  const t = useTranslations("settings.payroll");
  const router = useRouter();
  const refuse = useRefusal();
  const [pending, start] = useTransition();
  const [layout, setLayout] = useState<SpreadsheetLayout>(initial);
  const [problems, setProblems] = useState<SettingProblem[]>([]);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const change = (next: Partial<SpreadsheetLayout>) => {
    setLayout((l) => ({ ...l, ...next }));
    setSaved(false);
  };
  const setColumn = (i: number, next: Partial<SpreadsheetLayout["columns"][number]>) => change({ columns: layout.columns.map((c, j) => (j === i ? { ...c, ...next } : c)) });
  const move = (i: number, by: -1 | 1) => {
    const columns = [...layout.columns];
    const [c] = columns.splice(i, 1);
    columns.splice(i + by, 0, c!);
    change({ columns });
  };
  const fieldName = (f: SpreadsheetField) => t(`columns.fields.${f}`);
  const add = (field: SpreadsheetField) => change({ columns: [...layout.columns, { field, header: fieldName(field), ...(field === "fixed" ? { value: "" } : {}) }] });
  const matches = SPREADSHEET_FIELDS.filter((f) => fieldName(f).toLowerCase().includes(search.trim().toLowerCase()));

  const save = () =>
    start(async () => {
      const r = await saveTargetAction({ format: "spreadsheet_csv", layout }, targetId);
      if (r.ok) {
        setProblems([]);
        setSaved(true);
      } else {
        setProblems(r.error === "invalid" ? r.problems : []);
        refuse(r);
      }
      router.refresh();
    });
  const fileProblem = problemFor(problems, "fileName");
  const listProblems = problems.filter((p) => p.field === "columns" || p.field === "layout");

  return (
    <SettingsSection id="columns-title" titleHidden title={t("tabs.columns")} description={t("columns.hint")}>
      <SettingsRows
        footer={
          canEdit && (
            <SettingsFooter>
              <span aria-live="polite" className="text-sm text-muted-foreground" data-testid="columns-saved">
                {saved ? t("saved") : ""}
              </span>
              <Button onClick={save} disabled={pending} data-testid="save-columns">
                {pending ? t("saving") : t("save")}
              </Button>
            </SettingsFooter>
          )
        }
      >
        {/* The file's options. */}
        <div className="grid gap-4 py-4 sm:grid-cols-2">
          <SettingsField
            id="sheet-file-name"
            label={t("columns.fileName")}
            hint={t("columns.fileNameHelp")}
            hintId="sheet-file-name-help"
            problem={<FieldProblem problem={fileProblem} id="sheet-file-name-problem" />}
            className="sm:col-span-2"
          >
            <Input
              id="sheet-file-name"
              value={layout.fileName}
              disabled={!canEdit}
              aria-invalid={fileProblem ? true : undefined}
              aria-describedby={`sheet-file-name-help${fileProblem ? " sheet-file-name-problem" : ""}`}
              onChange={(e) => change({ fileName: e.target.value })}
              data-testid="sheet-file-name"
            />
          </SettingsField>
          <SettingsField id="sheet-delimiter" label={t("columns.delimiter")}>
            <NativeSelect id="sheet-delimiter" value={layout.delimiter} disabled={!canEdit} onChange={(e) => change({ delimiter: e.target.value as Delimiter })} className="w-full">
              {(Object.keys(DELIMITERS) as Delimiter[]).map((d) => (
                <NativeSelectOption key={d} value={d}>
                  {t(`columns.delimiters.${d}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </SettingsField>
          <SettingsField id="sheet-date-format" label={t("columns.dateFormat")}>
            <NativeSelect id="sheet-date-format" value={layout.dateFormat} disabled={!canEdit} onChange={(e) => change({ dateFormat: e.target.value as DateFormat })} className="w-full">
              {DATE_FORMATS.map((d) => (
                <NativeSelectOption key={d} value={d}>
                  {d}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </SettingsField>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={layout.header} disabled={!canEdit} onCheckedChange={(v) => change({ header: v === true })} data-testid="sheet-header" />
            {t("columns.header")}
          </label>
        </div>

        {/* The included columns, in file order (Deputy), as a list nested in the panel. */}
        <div className="flex flex-col gap-3 py-4">
          <h3 className="text-sm font-medium">{t("columns.included")}</h3>
          {listProblems.map((p, i) => (
            <FieldProblem key={i} problem={p} id={`columns-problem-${i}`} />
          ))}
          <ol className="flex flex-col divide-y rounded-md border" data-testid="included-columns">
            {layout.columns.map((c, i) => {
              const name = fieldName(c.field);
              const headerProblem = problemFor(problems, `columns.${i}.header`);
              const valueProblem = problemFor(problems, `columns.${i}.value`);
              return (
                <li key={`${i}-${c.field}`} className="flex flex-wrap items-start gap-3 px-3 py-2" data-testid="column-row">
                  <span className="w-5 pt-1.5 text-right text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="w-32 pt-1.5 text-sm font-medium">{name}</span>
                  <div className="flex flex-col gap-1">
                    <Input
                      aria-label={t("columns.headerText", { field: name })}
                      value={c.header}
                      disabled={!canEdit}
                      aria-invalid={headerProblem ? true : undefined}
                      onChange={(e) => setColumn(i, { header: e.target.value })}
                      className="w-44"
                      data-testid="column-header"
                    />
                    <FieldProblem problem={headerProblem} id={`column-${i}-header-problem`} />
                  </div>
                  {c.field === "fixed" && (
                    <div className="flex flex-col gap-1">
                      <Input aria-label={t("columns.fixedValue", { field: name })} value={c.value ?? ""} disabled={!canEdit} aria-invalid={valueProblem ? true : undefined} onChange={(e) => setColumn(i, { value: e.target.value })} className="w-44" />
                      <FieldProblem problem={valueProblem} id={`column-${i}-value-problem`} />
                    </div>
                  )}
                  {canEdit && (
                    <div className="ml-auto flex gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={t("columns.moveUp", { field: name })} disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUpIcon />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={t("columns.moveDown", { field: name })} disabled={i === layout.columns.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDownIcon />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={t("columns.remove", { field: name })} onClick={() => change({ columns: layout.columns.filter((_, j) => j !== i) })}>
                        <XIcon />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* A field to add (Deputy's field picker, with search). */}
        {canEdit && (
          <div className="flex flex-col gap-3 py-4">
            <h3 className="text-sm font-medium">{t("columns.add")}</h3>
            <Input type="search" aria-label={t("columns.searchFields")} placeholder={t("columns.searchFields")} value={search} onChange={(e) => setSearch(e.target.value)} className="sm:w-72" />
            <ul className="flex flex-col divide-y overflow-hidden rounded-md border">
              {matches.length === 0 ? (
                <li className="px-3 py-2.5 text-sm text-muted-foreground">{t("columns.noFields")}</li>
              ) : (
                matches.map((f) => (
                  <li key={f}>
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("columns.addField", { field: fieldName(f) })} onClick={() => add(f)}>
                      <PlusIcon className="size-4 text-muted-foreground" />
                      {fieldName(f)}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </SettingsRows>
    </SettingsSection>
  );
}
