"use client";

// Pattern: docs/patterns/compliance/aca.md — TempWorks ACA Employee Cycles (parameters, Show; one row
// per employee cycle: hire date, cycle, result, measurement hours, weeks, average and dates,
// administrative, stability and break-in-service dates); 26 C.F.R. § 54.4980H-3's periods.
import { SearchIcon, UploadIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { importAcaHoursAction } from "@/app/[locale]/(app)/compliance/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { ACA_SHOWS } from "@/server/compliance/aca";
import type { AcaView } from "@/server/compliance/aca-data";
import type { ImportProblem } from "@/server/compliance/aca-service";
import { dateRange, hoursMinutes, longDate } from "../format";
import { useDateTime } from "../agency-zone";

type Row = AcaView["rows"][number];

export function Aca({ view, canChange }: { view: AcaView; canChange: boolean }) {
  const t = useTranslations("compliance.aca");
  const locale = useLocale();
  const when = useDateTime();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [importing, setImporting] = useState(false);
  const go = (next: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  };
  const filtered = params.has("show") || params.has("q");
  const medium = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  /** A period's first and last day, one above the other, so the table fits the page. */
  const range = (a: string | null, b: string | null) =>
    a && b ? (
      <span className="flex flex-col">
        <span>{medium(a)} –</span>
        <span>{medium(b)}</span>
      </span>
    ) : (
      "—"
    );
  const month = (m: number) => new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, m - 1, 1)));

  if (view.state === "no_rule") return <p className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">{t("noRule")}</p>;
  const importButton = canChange && (
    <Button size="sm" variant="outline" onClick={() => setImporting(true)} data-testid="aca-import">
      <UploadIcon />
      {t("import.open")}
    </Button>
  );

  const result = (r: Row) => {
    switch (r.result) {
      case "full_time":
        return (
          <span className="flex flex-col">
            <span className="font-medium">{t("results.full_time")}</span>
            {r.duty && (
              <Link href={`/compliance/${r.duty.id}`} className="text-xs underline underline-offset-4" data-testid="aca-duty">
                {t("offerBy", { date: medium(r.stabilityStart!) })}
              </Link>
            )}
          </span>
        );
      case "measuring":
        return (
          <span className="flex flex-col">
            <span>{t("results.measuring")}</span>
            <span className="text-xs text-muted-foreground">{r.countedThrough ? t("countedThrough", { date: medium(r.countedThrough) }) : t("nothingCounted")}</span>
            {r.missingFrom && <span className="text-xs text-destructive">{t("missingFrom", { date: medium(r.missingFrom) })}</span>}
          </span>
        );
      case "missing_hours":
        return <span className="text-destructive">{t("missingFrom", { date: medium(r.missingFrom!) })}</span>;
      case "on_break":
        return <span>{t("onBreakSince", { date: medium(r.breakStart!) })}</span>;
      default:
        return <span className="text-muted-foreground">{t("results.not_full_time")}</span>;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <section className="grid gap-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-2" aria-label={t("parameters")} data-testid="aca-parameters">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">{t("settingsTitle")}</h2>
          {view.settings ? (
            <p data-testid="aca-settings">
              {t("settingsLine", { months: view.settings.measurementMonths, month: month(view.settings.firstMonth), admin: view.settings.adminDays, stability: view.settings.stabilityMonths, date: longDate(view.settingsFrom!, locale) })}
            </p>
          ) : (
            <p className="text-muted-foreground" data-testid="aca-no-settings">
              {canChange ? t("noSettings") : t("noSettingsReadOnly")}
            </p>
          )}
          {canChange && (
            <Link href="/settings/compliance#aca-title" className="w-fit underline underline-offset-4" data-testid="aca-settings-link">
              {view.settings ? t("changeSettings") : t("setSettings")}
            </Link>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">{t("hoursTitle")}</h2>
          <p>{view.paid ? t("paidLine", { range: dateRange(view.paid.from, view.paid.through, locale) }) : t("noPaid")}</p>
          <p data-testid="aca-imports">
            {view.imports
              ? t("importsLine", { rows: view.imports.rows, workers: view.imports.workers, range: dateRange(view.imports.from, view.imports.through, locale), source: view.imports.source, by: view.imports.by, date: when(view.imports.at, { time: false }) })
              : t("noImports")}
          </p>
        </div>
      </section>

      {view.state === "no_settings" ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground" data-testid="aca-needs-settings">
          {t("needsSettings")}
          {canChange && (
            <Link href="/settings/compliance#aca-title" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("setSettings")}
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <form
              role="search"
              className="flex flex-col gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                go({ q: q.trim() });
              }}
            >
              <Label htmlFor="aca-search" className="text-xs text-muted-foreground">
                {t("search")}
              </Label>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="aca-search" className="w-56 pl-8" value={q} placeholder={t("searchPlaceholder")} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== (params.get("q") ?? "") && go({ q: q.trim() })} data-testid="aca-search" />
              </div>
            </form>
            <div className="flex flex-col gap-1">
              <Label htmlFor="aca-show" className="text-xs text-muted-foreground">
                {t("show")}
              </Label>
              <NativeSelect id="aca-show" className="w-48" value={params.get("show") ?? "all"} onChange={(e) => go({ show: e.target.value === "all" ? "" : e.target.value })} data-testid="aca-show">
                {ACA_SHOWS.map((o) => (
                  <NativeSelectOption key={o} value={o}>
                    {t(`shows.${o}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <span className="mr-auto" />
            {importButton}
          </div>
          {view.total === 0 ? (
            <p className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground" data-testid="aca-nothing">
              {t("nothing")}
            </p>
          ) : view.rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-14 text-sm text-muted-foreground" data-testid="aca-no-match">
              {t("noMatch")}
              {filtered && (
                <button type="button" className={buttonVariants({ variant: "outline", size: "sm" })} onClick={() => go({ show: "", q: "" })}>
                  {t("clear")}
                </button>
              )}
            </div>
          ) : (
            <div className="min-w-0">
              <Table aria-label={t("tableLabel")} data-testid="aca-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("cols.worker")}</TableHead>
                    <TableHead>{t("cols.hired")}</TableHead>
                    <TableHead>{t("cols.cycle")}</TableHead>
                    <TableHead>{t("cols.result")}</TableHead>
                    <TableHead className="whitespace-normal">{t("cols.measurement")}</TableHead>
                    <TableHead className="text-right">{t("cols.hours")}</TableHead>
                    <TableHead className="text-right">{t("cols.weeks")}</TableHead>
                    <TableHead className="text-right whitespace-normal">{t("cols.average")}</TableHead>
                    <TableHead className="whitespace-normal">{t("cols.admin")}</TableHead>
                    <TableHead className="whitespace-normal">{t("cols.stability")}</TableHead>
                    <TableHead className="whitespace-normal">{t("cols.break")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.rows.map((r) => (
                    <TableRow key={`${r.workerId}|${r.cycle}|${r.measurementStart}`} className="text-xs" data-testid="aca-row" data-result={r.result}>
                      <TableCell className="text-sm font-medium">{r.workerName}</TableCell>
                      <TableCell>{r.hireDate ? medium(r.hireDate) : "—"}</TableCell>
                      <TableCell>{r.result === "on_break" ? "—" : t(`cycles.${r.cycle}`)}</TableCell>
                      <TableCell className="min-w-40 text-sm whitespace-normal">{result(r)}</TableCell>
                      <TableCell>{r.result === "on_break" ? "—" : range(r.measurementStart, r.measurementEnd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.result === "on_break" ? "—" : hoursMinutes(r.minutes)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.result === "on_break" ? "—" : r.weeks}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.days > 0 && r.missingFrom === null ? hoursMinutes(r.averageMinutesPerWeek) : "—"}</TableCell>
                      <TableCell>{range(r.adminStart, r.adminEnd)}</TableCell>
                      <TableCell>{range(r.stabilityStart, r.stabilityEnd)}</TableCell>
                      <TableCell>{r.breakStart ? (r.breakEnd ? range(r.breakStart, r.breakEnd) : t("since", { date: medium(r.breakStart) })) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
      {view.state === "no_settings" && canChange && <div className="flex justify-end">{importButton}</div>}
      {importing && <ImportHours onClose={() => setImporting(false)} />}
    </div>
  );
}

function ImportHours({ onClose }: { onClose: () => void }) {
  const t = useTranslations("compliance.aca.import");
  const te = useTranslations("compliance.errors");
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [problems, setProblems] = useState<ImportProblem[] | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      if (!file) return;
      const form = new FormData();
      form.set("file", file);
      const r = await importAcaHoursAction(form);
      if (r.ok) {
        toast.success(t("done", { rows: r.rows }));
        router.refresh();
        onClose();
      } else if (r.error === "invalid") setProblems(r.problems);
      else if (r.error === "too_large") toast.error(t("tooLarge"));
      else toast.error(te(r.error === "not_allowed" || r.error === "busy" ? r.error : "generic"));
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>
        <pre className="rounded-md bg-muted p-2 text-xs">{t("example")}</pre>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="aca-file">{t("file")}</Label>
          <Input
            id="aca-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setProblems(null);
            }}
            data-testid="aca-file"
          />
        </div>
        {problems && (
          <div className="flex flex-col gap-1 rounded-md border border-destructive/40 p-3 text-sm" role="alert" data-testid="aca-problems">
            <p className="font-medium text-destructive">{t("problemsTitle")}</p>
            <ul className="list-disc pl-5">
              {problems.map((p) => (
                <li key={`${p.row}-${p.reason}`}>{t(`problems.${p.reason}`, { row: p.row })}</li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={pending || file === null} onClick={submit} data-testid="aca-import-save">
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
