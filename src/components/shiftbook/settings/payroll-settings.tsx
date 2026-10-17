"use client";

// Pattern: docs/patterns/settings/payroll.md — 7shifts payroll integration settings: the system
// chosen once with its own fields (Deputy shows a format's fields once chosen), an explicit Save,
// then tabs for the export codes, the employee ids and (Deputy's custom template) the spreadsheet. Laid
// out as Linear's settings (docs/patterns/_components/settings.md): the systems as rows in a panel, the
// chosen one's fields in a panel whose foot holds Save.
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveTargetAction, type SettingsActionResult } from "@/app/[locale]/(app)/settings/payroll/actions";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "@/i18n/navigation";
import { adpWfnFileName, DEFAULT_LAYOUT, EXPORT_FORMATS, SYSTEM_OF, type ExportFormat, type PayrollTarget, type SettingProblem } from "@/exports/targets";
import type { PayrollSettingsView } from "@/server/payroll/queries";
import { EarningCodes } from "./earning-codes";
import { PayrollSample } from "./payroll-sample";
import { problemFor } from "./problems";
import { SpreadsheetColumns } from "./spreadsheet-columns";
import { WorkerIds } from "./worker-ids";
import { useDateTime } from "../agency-zone";
import { SettingsField, SettingsFooter, SettingsPage, SettingsPanel, SettingsRow, SettingsRows, SettingsSection } from "../settings-panel";
import { ReadOnlyNote } from "../abilities";

export type PayrollTab = "codes" | "workers" | "columns";
export type WorkerFilter = "all" | "missing" | "set";

interface Fields {
  adpCompanyCode: string;
  runCompanyCode: string;
  version: "2022_or_later" | "2021_or_earlier";
  companyName: string;
  companyCreateTime: string;
  customer: string;
  clientId: string;
}

function fieldsOf(target: PayrollTarget | null): Fields {
  return {
    adpCompanyCode: target?.format === "adp_wfn_paydata" ? target.companyCode : "",
    runCompanyCode: target?.format === "adp_run_csv" ? target.companyCode : "",
    version: target?.format === "qbd_iif" ? target.version : "2022_or_later",
    companyName: target?.format === "qbd_iif" && target.version === "2021_or_earlier" ? target.companyName : "",
    companyCreateTime: target?.format === "qbd_iif" && target.version === "2021_or_earlier" ? target.companyCreateTime : "",
    customer: target?.format === "qbo_time_csv" ? target.customer : "",
    clientId: target?.format === "paychex_flex_csv" ? target.clientId : "",
  };
}

/** The file name each system expects, as far as it is known before a period is chosen. */
function fileNameOf(format: ExportFormat, f: Fields): string | null {
  switch (format) {
    case "gusto_hours_csv":
      return "gusto-hours-YYYY-MM-DD-to-YYYY-MM-DD.csv";
    case "qbd_iif":
      return "quickbooks-time-YYYY-MM-DD-to-YYYY-MM-DD.iif";
    case "qbo_time_csv":
      return "quickbooks-online-time-YYYY-MM-DD-to-YYYY-MM-DD.csv";
    case "adp_wfn_paydata":
      return /^[A-Z0-9]{2,3}$/.test(f.adpCompanyCode) ? adpWfnFileName(f.adpCompanyCode) : "PRcccEPI.csv";
    case "adp_run_csv":
      return "adp-run-YYYY-MM-DD-to-YYYY-MM-DD.csv";
    case "paychex_flex_csv":
      return "paychex-flex-YYYY-MM-DD-to-YYYY-MM-DD.csv";
    case "paylocity_time_csv":
      return "paylocity-time-import-YYYY-MM-DD-to-YYYY-MM-DD.csv";
    case "spreadsheet_csv":
      return null;
  }
}

/** A saved action's refusal, said in the person's language. */
export function useRefusal() {
  const t = useTranslations("settings.payroll");
  return (r: SettingsActionResult) => {
    if (r.ok) return;
    if (r.error === "invalid") toast.error(t("errors.invalid"));
    else if (r.error === "taken") return;
    else toast.error(t(`errors.${r.error}`));
    // Another tab saved first: show what is stored now, not this page's edits.
    if (r.error === "stale") window.setTimeout(() => window.location.reload(), 1500);
  };
}

/** The rule a field breaks, in the person's language. */
export function FieldProblem({ problem, id }: { problem: SettingProblem | undefined; id: string }) {
  const t = useTranslations("settings.payroll.rules");
  if (!problem) return null;
  return (
    <p id={id} className="text-sm text-destructive" data-testid="field-problem">
      {t.has(problem.rule) ? t(problem.rule as "choose_system") : problem.message}
    </p>
  );
}

/** The tab and filter live in the address (so the run's fix can open them) without a round trip to the server. */
function setQuery(change: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(change)) {
    if (v === null) params.delete(k);
    else params.set(k, v);
  }
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

export function PayrollSettings({ view, tab: initialTab, filter: initialFilter }: { view: PayrollSettingsView; tab: PayrollTab; filter: WorkerFilter }) {
  const t = useTranslations("settings");
  const tp = useTranslations("settings.payroll");
  const when = useDateTime();
  const router = useRouter();
  const refuse = useRefusal();
  const [chosenTab, setChosenTab] = useState<PayrollTab>(initialTab);
  const [filter, setFilterState] = useState<WorkerFilter>(initialFilter);
  const [pending, start] = useTransition();
  const inUse = view.target?.format ?? null;
  const [format, setFormat] = useState<ExportFormat | null>(inUse);
  const [fields, setFields] = useState<Fields>(fieldsOf(view.target));
  const [problems, setProblems] = useState<SettingProblem[]>([]);
  const [saved, setSaved] = useState(false);
  const set = (key: keyof Fields, value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };
  const changedOn = view.changed ? when(view.changed.at) : null;

  const targetFor = (f: ExportFormat): PayrollTarget => {
    switch (f) {
      case "gusto_hours_csv":
        return { format: f };
      case "qbd_iif":
        return fields.version === "2022_or_later" ? { format: f, version: "2022_or_later" } : { format: f, version: "2021_or_earlier", companyName: fields.companyName, companyCreateTime: fields.companyCreateTime };
      case "qbo_time_csv":
        return { format: f, customer: fields.customer };
      case "adp_wfn_paydata":
        return { format: f, companyCode: fields.adpCompanyCode };
      case "adp_run_csv":
        return { format: f, companyCode: fields.runCompanyCode };
      case "paychex_flex_csv":
        return { format: f, clientId: fields.clientId };
      case "paylocity_time_csv":
        return { format: f };
      case "spreadsheet_csv":
        return { format: f, layout: view.target?.format === "spreadsheet_csv" ? view.target.layout : DEFAULT_LAYOUT };
    }
  };
  const save = () =>
    format &&
    start(async () => {
      const r = await saveTargetAction(targetFor(format), view.targetId);
      if (r.ok) {
        setProblems([]);
        setSaved(true);
      } else {
        setProblems(r.error === "invalid" ? r.problems : []);
        refuse(r);
      }
      router.refresh();
    });
  const setTab = (next: PayrollTab) => {
    setChosenTab(next);
    setFilterState("all");
    setQuery({ tab: next, filter: null });
  };
  const setFilter = (next: WorkerFilter) => {
    setFilterState(next);
    setQuery({ tab: "workers", filter: next === "all" ? null : next });
  };
  // Spreadsheet columns exist only while the spreadsheet is in use.
  const tab = chosenTab === "columns" && inUse !== "spreadsheet_csv" ? "codes" : chosenTab;

  const field = (key: keyof Fields, label: string, help: string, problemKey: string, opts: { uppercase?: boolean } = {}) => {
    const problem = problemFor(problems, problemKey);
    return (
      <SettingsField id={`f-${key}`} label={label} hint={help} hintId={`f-${key}-help`} problem={<FieldProblem problem={problem} id={`f-${key}-problem`} />} className="max-w-md">
        <Input
          id={`f-${key}`}
          value={fields[key]}
          disabled={!view.canEdit}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`f-${key}-help${problem ? ` f-${key}-problem` : ""}`}
          onChange={(e) => set(key, opts.uppercase ? e.target.value.toUpperCase() : e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </SettingsField>
    );
  };
  const fileName = format ? fileNameOf(format, fields) : null;

  return (
    <SettingsPage context={t("title")} title={tp("title")} description={view.canEdit ? undefined : <ReadOnlyNote text={tp("readOnly")} />}>
      {/* Linear's rows: each system a row, its hint under its name, the choice at the right (Deputy's format list). */}
      <SettingsSection id="system-title" title={tp("systemTitle")} description={tp("systemHint")}>
        {!inUse && (
          <Alert variant="destructive" data-testid="none-chosen">
            <CircleAlertIcon />
            <AlertTitle>{tp("noneChosen")}</AlertTitle>
          </Alert>
        )}
        <SettingsRows role="radiogroup" aria-labelledby="system-title">
          {EXPORT_FORMATS.map((f) => (
            <SettingsRow
              key={f}
              as="label"
              className="cursor-pointer has-disabled:cursor-default"
              testId={`system-${f}`}
              label={
                <span className="flex flex-wrap items-center gap-2">
                  {tp(`systems.${f}.name`)}
                  {inUse === f && <Badge variant="secondary">{tp("inUse")}</Badge>}
                </span>
              }
              description={tp(`systems.${f}.carries`)}
              control={
                <input
                  type="radio"
                  name="system"
                  value={f}
                  className="size-4 accent-primary"
                  checked={format === f}
                  disabled={!view.canEdit}
                  onChange={() => {
                    setFormat(f);
                    setProblems([]);
                    setSaved(false);
                  }}
                />
              }
            />
          ))}
        </SettingsRows>
        <FieldProblem problem={problemFor(problems, "format")} id="f-format-problem" />

        {/* The chosen system's own fields (Deputy), then Save in the panel's foot (7shifts saves explicitly). */}
        {format && (
          <SettingsPanel
            footer={
              <SettingsFooter note={view.changed ? tp("lastChanged", { date: changedOn!, who: view.changed.by }) : inUse ? tp("neverChanged") : undefined}>
                <span aria-live="polite" className="text-sm text-muted-foreground" data-testid="system-saved">
                  {saved ? tp("saved") : ""}
                </span>
                {view.canEdit && (
                  <Button onClick={save} disabled={pending || !format} data-testid="save-system" loading={pending} loadingLabel={tp("saving")}>
                    {tp("save")}
                  </Button>
                )}
              </SettingsFooter>
            }
          >
            {format === "adp_wfn_paydata" && field("adpCompanyCode", tp("fields.companyCode"), tp("help.adpCompanyCode"), "companyCode", { uppercase: true })}
            {format === "adp_run_csv" && field("runCompanyCode", tp("fields.companyCode"), tp("help.runCompanyCode"), "companyCode")}
            {format === "qbo_time_csv" && field("customer", tp("fields.customer"), tp("help.customer"), "customer")}
            {format === "paychex_flex_csv" && field("clientId", tp("fields.clientId"), tp("help.clientId"), "clientId")}
            {(format === "paychex_flex_csv" || format === "paylocity_time_csv") && <PayrollSample format={format} disabled={!view.canEdit} onClientId={format === "paychex_flex_csv" ? (id) => set("clientId", id) : undefined} />}
            {format === "qbd_iif" && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">{tp("fields.version")}</legend>
                {(["2022_or_later", "2021_or_earlier"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="qbd-version" value={v} className="size-4 accent-primary" checked={fields.version === v} disabled={!view.canEdit} onChange={() => set("version", v)} />
                    {tp(v === "2022_or_later" ? "fields.version2022" : "fields.version2021")}
                  </label>
                ))}
              </fieldset>
            )}
            {format === "qbd_iif" && fields.version === "2021_or_earlier" && (
              <>
                {field("companyName", tp("fields.companyName"), tp("help.companyName"), "companyName")}
                {field("companyCreateTime", tp("fields.companyCreateTime"), tp("help.companyCreateTime"), "companyCreateTime")}
              </>
            )}
            <p className="text-sm text-muted-foreground" data-testid="file-name">
              {fileName ? tp("fields.fileName", { name: fileName }) : tp("help.spreadsheetFileName")}
            </p>
          </SettingsPanel>
        )}
      </SettingsSection>

      {inUse && view.codes && view.system && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as PayrollTab)} className="gap-6">
          <TabsList variant="line" className="h-10! w-full justify-start border-b">
            <TabsTrigger value="codes">{tp("tabs.codes")}</TabsTrigger>
            <TabsTrigger value="workers">{tp("tabs.workers")}</TabsTrigger>
            {inUse === "spreadsheet_csv" && <TabsTrigger value="columns">{tp("tabs.columns")}</TabsTrigger>}
          </TabsList>
          <TabsContent value="codes">
            <EarningCodes key={view.codes.format} format={view.codes.format} codes={view.codes.codes} problems={view.codes.problems} id={view.codes.id} canEdit={view.canEdit} />
          </TabsContent>
          <TabsContent value="workers">
            <WorkerIds key={inUse} system={SYSTEM_OF[inUse]} workers={view.workers} filter={filter} onFilter={setFilter} canEdit={view.canEdit} />
          </TabsContent>
          {view.target?.format === "spreadsheet_csv" && (
            <TabsContent value="columns">
              <SpreadsheetColumns layout={view.target.layout} targetId={view.targetId} canEdit={view.canEdit} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </SettingsPage>
  );
}
