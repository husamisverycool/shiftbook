"use client";

// Pattern: docs/patterns/settings/payroll.md — 7shifts payroll integration settings: the system
// chosen once with its own fields (Deputy shows a format's fields once chosen), an explicit Save,
// then tabs for the export codes, the employee ids and (Deputy's custom template) the spreadsheet.
import { CircleAlertIcon, InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveTargetAction, type SettingsActionResult } from "@/app/[locale]/(app)/settings/payroll/actions";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "@/i18n/navigation";
import { adpWfnFileName, DEFAULT_LAYOUT, EXPORT_FORMATS, SYSTEM_OF, type ExportFormat, type PayrollTarget, type SettingProblem } from "@/exports/targets";
import type { PayrollSettingsView } from "@/server/payroll/queries";
import { EarningCodes } from "./earning-codes";
import { problemFor } from "./problems";
import { SpreadsheetColumns } from "./spreadsheet-columns";
import { WorkerIds } from "./worker-ids";
import { useDateTime } from "../agency-zone";

export type PayrollTab = "codes" | "workers" | "columns";
export type WorkerFilter = "all" | "missing" | "set";

interface Fields {
  adpCompanyCode: string;
  runCompanyCode: string;
  version: "2022_or_later" | "2021_or_earlier";
  companyName: string;
  companyCreateTime: string;
  customer: string;
}

function fieldsOf(target: PayrollTarget | null): Fields {
  return {
    adpCompanyCode: target?.format === "adp_wfn_paydata" ? target.companyCode : "",
    runCompanyCode: target?.format === "adp_run_csv" ? target.companyCode : "",
    version: target?.format === "qbd_iif" ? target.version : "2022_or_later",
    companyName: target?.format === "qbd_iif" && target.version === "2021_or_earlier" ? target.companyName : "",
    companyCreateTime: target?.format === "qbd_iif" && target.version === "2021_or_earlier" ? target.companyCreateTime : "",
    customer: target?.format === "qbo_time_csv" ? target.customer : "",
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
      <div className="flex max-w-md flex-col gap-1.5">
        <Label htmlFor={`f-${key}`}>{label}</Label>
        <Input
          id={`f-${key}`}
          value={fields[key]}
          disabled={!view.canEdit}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`f-${key}-help${problem ? ` f-${key}-problem` : ""}`}
          onChange={(e) => set(key, opts.uppercase ? e.target.value.toUpperCase() : e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <p id={`f-${key}-help`} className="text-sm text-muted-foreground">
          {help}
        </p>
        <FieldProblem problem={problem} id={`f-${key}-problem`} />
      </div>
    );
  };
  const fileName = format ? fileNameOf(format, fields) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{t("title")}</p>
        <h1 className="text-[28px] leading-9 font-bold tracking-tight">{tp("title")}</h1>
        <p className="text-sm text-muted-foreground">{tp("description")}</p>
      </header>

      {!view.canEdit && (
        <Alert>
          <InfoIcon />
          <AlertTitle>{tp("readOnly")}</AlertTitle>
        </Alert>
      )}
      {!inUse && (
        <Alert variant="destructive" data-testid="none-chosen">
          <CircleAlertIcon />
          <AlertTitle>{tp("noneChosen")}</AlertTitle>
        </Alert>
      )}

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4" aria-labelledby="system-title">
        <div className="flex flex-col gap-1">
          <h2 id="system-title" className="text-lg font-semibold">
            {tp("systemTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{tp("systemHint")}</p>
        </div>
        <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-labelledby="system-title">
          {EXPORT_FORMATS.map((f) => (
            <label
              key={f}
              className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 text-sm has-checked:border-primary has-checked:bg-muted/50 has-disabled:cursor-not-allowed has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
              data-testid={`system-${f}`}
            >
              <input
                type="radio"
                name="system"
                value={f}
                className="mt-0.5 size-4 accent-primary"
                checked={format === f}
                disabled={!view.canEdit}
                onChange={() => {
                  setFormat(f);
                  setProblems([]);
                  setSaved(false);
                }}
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {tp(`systems.${f}.name`)}
                  {inUse === f && <Badge variant="secondary">{tp("inUse")}</Badge>}
                </span>
                <span className="text-muted-foreground">{tp(`systems.${f}.carries`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <FieldProblem problem={problemFor(problems, "format")} id="f-format-problem" />

        {format === "adp_wfn_paydata" && field("adpCompanyCode", tp("fields.companyCode"), tp("help.adpCompanyCode"), "companyCode", { uppercase: true })}
        {format === "adp_run_csv" && field("runCompanyCode", tp("fields.companyCode"), tp("help.runCompanyCode"), "companyCode")}
        {format === "qbo_time_csv" && field("customer", tp("fields.customer"), tp("help.customer"), "customer")}
        {format === "qbd_iif" && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{tp("fields.version")}</legend>
            {(["2022_or_later", "2021_or_earlier"] as const).map((v) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <input type="radio" name="qbd-version" value={v} className="size-4 accent-primary" checked={fields.version === v} disabled={!view.canEdit} onChange={() => set("version", v)} />
                {tp(v === "2022_or_later" ? "fields.version2022" : "fields.version2021")}
              </label>
            ))}
          </fieldset>
        )}
        {format === "qbd_iif" && fields.version === "2021_or_earlier" && (
          <div className="flex flex-col gap-4">
            {field("companyName", tp("fields.companyName"), tp("help.companyName"), "companyName")}
            {field("companyCreateTime", tp("fields.companyCreateTime"), tp("help.companyCreateTime"), "companyCreateTime")}
          </div>
        )}
        {format && (
          <p className="text-sm text-muted-foreground" data-testid="file-name">
            {fileName ? tp("fields.fileName", { name: fileName }) : tp("help.spreadsheetFileName")}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {view.canEdit && (
            <Button onClick={save} disabled={pending || !format} data-testid="save-system">
              {pending ? tp("saving") : tp("save")}
            </Button>
          )}
          <span aria-live="polite" className="text-sm text-muted-foreground" data-testid="system-saved">
            {saved ? tp("saved") : ""}
          </span>
          <span className="text-sm text-muted-foreground">{view.changed ? tp("lastChanged", { date: changedOn!, who: view.changed.by }) : inUse ? tp("neverChanged") : ""}</span>
        </div>
      </section>

      {inUse && view.codes && view.system && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as PayrollTab)}>
          <TabsList>
            <TabsTrigger value="codes">{tp("tabs.codes")}</TabsTrigger>
            <TabsTrigger value="workers">{tp("tabs.workers")}</TabsTrigger>
            {inUse === "spreadsheet_csv" && <TabsTrigger value="columns">{tp("tabs.columns")}</TabsTrigger>}
          </TabsList>
          <TabsContent value="codes" className="pt-2">
            <EarningCodes key={view.codes.format} format={view.codes.format} codes={view.codes.codes} problems={view.codes.problems} id={view.codes.id} canEdit={view.canEdit} />
          </TabsContent>
          <TabsContent value="workers" className="pt-2">
            <WorkerIds key={inUse} system={SYSTEM_OF[inUse]} workers={view.workers} filter={filter} onFilter={setFilter} canEdit={view.canEdit} />
          </TabsContent>
          {view.target?.format === "spreadsheet_csv" && (
            <TabsContent value="columns" className="pt-2">
              <SpreadsheetColumns layout={view.target.layout} targetId={view.targetId} canEdit={view.canEdit} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
