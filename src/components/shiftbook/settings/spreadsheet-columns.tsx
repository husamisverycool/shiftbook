"use client";

// Pattern: docs/patterns/settings/payroll.md — Spreadsheet columns tab (Deputy custom payroll export:
// file settings, the included columns in file order with header, move and remove, then a searchable
// list of fields to add, fixed text included).
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveTargetAction } from "@/app/[locale]/(app)/settings/payroll/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import { DATE_FORMATS, DELIMITERS, SPREADSHEET_FIELDS, type Delimiter, type DateFormat, type SettingProblem, type SpreadsheetField, type SpreadsheetLayout } from "@/exports/targets";
import { FieldProblem, useRefusal } from "./payroll-settings";
import { problemFor } from "./problems";

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
    <section className="flex flex-col gap-6" aria-labelledby="columns-title">
      <div className="flex flex-col gap-1">
        <h2 id="columns-title" className="text-lg font-semibold">
          {t("tabs.columns")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("columns.hint")}</p>
      </div>

      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="sheet-file-name">{t("columns.fileName")}</Label>
          <Input
            id="sheet-file-name"
            value={layout.fileName}
            disabled={!canEdit}
            aria-invalid={fileProblem ? true : undefined}
            aria-describedby={`sheet-file-name-help${fileProblem ? " sheet-file-name-problem" : ""}`}
            onChange={(e) => change({ fileName: e.target.value })}
            data-testid="sheet-file-name"
          />
          <p id="sheet-file-name-help" className="text-sm text-muted-foreground">
            {t("columns.fileNameHelp")}
          </p>
          <FieldProblem problem={fileProblem} id="sheet-file-name-problem" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sheet-delimiter">{t("columns.delimiter")}</Label>
          <NativeSelect id="sheet-delimiter" value={layout.delimiter} disabled={!canEdit} onChange={(e) => change({ delimiter: e.target.value as Delimiter })} className="w-full">
            {(Object.keys(DELIMITERS) as Delimiter[]).map((d) => (
              <NativeSelectOption key={d} value={d}>
                {t(`columns.delimiters.${d}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sheet-date-format">{t("columns.dateFormat")}</Label>
          <NativeSelect id="sheet-date-format" value={layout.dateFormat} disabled={!canEdit} onChange={(e) => change({ dateFormat: e.target.value as DateFormat })} className="w-full">
            {DATE_FORMATS.map((d) => (
              <NativeSelectOption key={d} value={d}>
                {d}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox checked={layout.header} disabled={!canEdit} onCheckedChange={(v) => change({ header: v === true })} data-testid="sheet-header" />
          {t("columns.header")}
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">{t("columns.included")}</h3>
        {listProblems.map((p, i) => (
          <FieldProblem key={i} problem={p} id={`columns-problem-${i}`} />
        ))}
        <ol className="flex flex-col divide-y rounded-lg border" data-testid="included-columns">
          {layout.columns.map((c, i) => {
            const name = fieldName(c.field);
            const headerProblem = problemFor(problems, `columns.${i}.header`);
            const valueProblem = problemFor(problems, `columns.${i}.value`);
            return (
              <li key={`${i}-${c.field}`} className="flex flex-wrap items-start gap-3 p-3" data-testid="column-row">
                <span className="w-6 pt-1.5 text-right text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="w-36 pt-1.5 text-sm font-medium">{name}</span>
                <div className="flex flex-col gap-1">
                  <Input
                    aria-label={t("columns.headerText", { field: name })}
                    value={c.header}
                    disabled={!canEdit}
                    aria-invalid={headerProblem ? true : undefined}
                    onChange={(e) => setColumn(i, { header: e.target.value })}
                    className="w-56"
                    data-testid="column-header"
                  />
                  <FieldProblem problem={headerProblem} id={`column-${i}-header-problem`} />
                </div>
                {c.field === "fixed" && (
                  <div className="flex flex-col gap-1">
                    <Input aria-label={t("columns.fixedValue", { field: name })} value={c.value ?? ""} disabled={!canEdit} aria-invalid={valueProblem ? true : undefined} onChange={(e) => setColumn(i, { value: e.target.value })} className="w-56" />
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

      {canEdit && (
        <div className="flex max-w-md flex-col gap-2">
          <h3 className="text-base font-semibold">{t("columns.add")}</h3>
          <Input type="search" aria-label={t("columns.searchFields")} placeholder={t("columns.searchFields")} value={search} onChange={(e) => setSearch(e.target.value)} />
          <ul className="flex flex-col divide-y rounded-lg border">
            {matches.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">{t("columns.noFields")}</li>
            ) : (
              matches.map((f) => (
                <li key={f}>
                  <button type="button" className="flex w-full items-center gap-2 p-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("columns.addField", { field: fieldName(f) })} onClick={() => add(f)}>
                    <PlusIcon className="size-4 text-muted-foreground" />
                    {fieldName(f)}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending} data-testid="save-columns">
            {pending ? t("saving") : t("save")}
          </Button>
          <span aria-live="polite" className="text-sm text-muted-foreground" data-testid="columns-saved">
            {saved ? t("saved") : ""}
          </span>
        </div>
      )}
    </section>
  );
}
