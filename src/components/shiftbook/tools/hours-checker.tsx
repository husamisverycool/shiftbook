"use client";

// Pattern: docs/patterns/tools/il-720-hours.md — Gusto's calculator: inputs each with a label and one
// help line, the results right under them; Granite's figures, table and status badges for the results.
import { CircleAlertIcon, DownloadIcon, UploadIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { checkHoursAction, type CheckResult } from "@/app/[locale]/(tools)/tools/il-720-hours/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { csvCell } from "@/lib/csv-cell";
import { hoursMinutes, tableDate } from "../format";
import { KeyFigure, KeyFigures } from "../key-figures";
import { Status, type Tone } from "../status";

const TONE: Record<"over" | "near" | "ok", Tone> = { over: "critical", near: "warning", ok: "neutral" };

/** Invented rows: three made-up workers at two made-up clients, ten-hour weekdays from January. */
function sampleRows(asOf: string): string {
  const people = [
    { worker: "Rosa Example", client: "Sample Plastics (sample)", weeks: 16 },
    { worker: "Dev Sample", client: "Sample Plastics (sample)", weeks: 13 },
    { worker: "Lee Placeholder", client: "Demo Foods (sample)", weeks: 6 },
  ];
  const end = new Date(`${asOf}T00:00:00Z`).getTime();
  const lines = ["Worker,Client,Date,Hours"];
  for (const p of people) {
    for (let d = p.weeks * 7; d >= 1; d--) {
      const day = new Date(end - d * 86_400_000);
      if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
      lines.push(`${p.worker},${p.client},${day.toISOString().slice(0, 10)},10`);
    }
  }
  return lines.join("\n");
}

export function HoursChecker() {
  const t = useTranslations("hoursChecker");
  const locale = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(today);
  const [pasted, setPasted] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = { file: useId(), fileHelp: useId(), paste: useId(), pasteHelp: useId(), asOf: useId(), asOfHelp: useId() };

  const check = () => {
    const form = new FormData();
    form.set("asOf", asOf);
    if (file) form.set("file", file);
    else form.set("pasted", pasted);
    start(async () => setResult(await checkHoursAction(form)));
  };

  const download = () => {
    if (!result?.ok) return;
    const c = (k: string) => t(`results.${k}` as "results.colWorker");
    const head = [c("colWorker"), c("colClient"), c("col12"), c("col48"), c("colStatus"), c("col720"), c("col4160")];
    const statusWord = { over: c("statusOver"), near: c("statusNear"), ok: c("statusOk") };
    const lines = [head, ...result.pairs.map((p) => [p.worker, p.client, hoursMinutes(p.minutes12), hoursMinutes(p.minutes48), statusWord[p.status], p.crossed720 ?? (p.projected720 ? `~${p.projected720}` : ""), p.crossed4160 ?? ""])];
    const blob = new Blob([lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = t("results.file");
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const errorText = (r: Extract<CheckResult, { ok: false }>) =>
    r.error === "missing" ? t("errors.missing", { columns: r.missing.map((m) => t(`columns.${m}`)).join(", ") }) : r.error === "nothing" ? t("tool.nothing") : t(`errors.${r.error}`);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex max-w-3xl flex-col gap-6" aria-labelledby="tool-heading">
        <div className="flex flex-col gap-1">
          <h2 id="tool-heading" className="text-xl font-semibold">
            {t("tool.heading")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("tool.define")}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.file}>{t("tool.file")}</Label>
          <p id={ids.fileHelp} className="text-[13px] text-muted-foreground">
            {t("tool.fileHelp")}
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) setFile(f);
            }}
            className={cn("flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-6 text-sm transition-colors", dragging && "border-primary bg-muted")}
            data-testid="checker-drop"
          >
            <UploadIcon className="size-5 text-muted-foreground" aria-hidden />
            {file ? (
              <>
                <span className="font-medium">{t("tool.chosen", { name: file.name })}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("tool.clearFile")}
                  onClick={() => {
                    setFile(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                >
                  <XIcon />
                </Button>
              </>
            ) : (
              <>
                <span className="text-muted-foreground">{t("tool.drop")}</span>
                <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                  {t("tool.choose")}
                </Button>
              </>
            )}
            <input
              ref={fileInput}
              id={ids.file}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-describedby={ids.fileHelp}
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-testid="checker-file"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <Label htmlFor={ids.paste}>{t("tool.paste")}</Label>
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setPasted(sampleRows(asOf))} data-testid="checker-sample">
              {t("tool.sample")}
            </Button>
          </div>
          <p id={ids.pasteHelp} className="text-[13px] text-muted-foreground">
            {t("tool.pasteHelp")}
          </p>
          <Textarea id={ids.paste} aria-describedby={ids.pasteHelp} value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} className="font-mono text-xs" disabled={file !== null} data-testid="checker-paste" />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.asOf}>{t("tool.asOf")}</Label>
          <p id={ids.asOfHelp} className="text-[13px] text-muted-foreground">
            {t("tool.asOfHelp")}
          </p>
          <Input id={ids.asOf} type="date" value={asOf} max="2099-12-31" onChange={(e) => e.target.value && setAsOf(e.target.value)} aria-describedby={ids.asOfHelp} className="w-44" data-testid="checker-as-of" />
        </div>

        <div>
          <Button onClick={check} loading={pending} loadingLabel={t("tool.checking")} data-testid="checker-check">
            {t("tool.check")}
          </Button>
        </div>
      </section>

      {result && !result.ok && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive" data-testid="checker-error">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {errorText(result)}
        </p>
      )}

      {result?.ok && (
        <section className="flex flex-col gap-6" aria-labelledby="results-heading" data-testid="checker-results">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="results-heading" className="text-xl font-semibold">
              {t("results.heading")}
            </h2>
            <Button variant="outline" size="sm" onClick={download} data-testid="checker-download">
              <DownloadIcon />
              {t("results.download")}
            </Button>
          </div>
          <KeyFigures>
            <KeyFigure label={t("results.over")} value={result.pairs.filter((p) => p.status === "over").length} testId="checker-over" />
            <KeyFigure label={t("results.near")} value={result.pairs.filter((p) => p.status === "near").length} testId="checker-near" />
            <KeyFigure label={t("results.pairs")} value={result.pairs.length} note={t("results.pairsNote", { days: result.days })} />
          </KeyFigures>
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("results.colWorker")}</TableHead>
                  <TableHead>{t("results.colClient")}</TableHead>
                  <TableHead className="text-right">{t("results.col12")}</TableHead>
                  <TableHead className="text-right">{t("results.col48")}</TableHead>
                  <TableHead>{t("results.colStatus")}</TableHead>
                  <TableHead className="whitespace-normal">{t("results.col720")}</TableHead>
                  <TableHead className="whitespace-normal">{t("results.col4160")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.pairs.map((p) => (
                  <TableRow key={`${p.worker}|${p.client}`} data-testid="checker-row" data-status={p.status}>
                    <TableCell className="font-medium whitespace-normal">{p.worker}</TableCell>
                    <TableCell className="whitespace-normal">{p.client}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{hoursMinutes(p.minutes12)}</TableCell>
                    <TableCell className="text-right tabular-nums">{hoursMinutes(p.minutes48)}</TableCell>
                    <TableCell>
                      <Status tone={TONE[p.status]}>{t(p.status === "over" ? "results.statusOver" : p.status === "near" ? "results.statusNear" : "results.statusOk")}</Status>
                    </TableCell>
                    <TableCell className="min-w-28 whitespace-normal">{p.crossed720 ? tableDate(p.crossed720, locale) : p.projected720 ? <span className="text-muted-foreground">{t("results.about", { date: tableDate(p.projected720, locale) })}</span> : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.crossed4160 ? tableDate(p.crossed4160, locale) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {result.problems.length > 0 && (
            <div className="flex flex-col gap-1 text-sm" data-testid="checker-problems">
              <p className="font-medium">{t("results.problems", { count: result.problems.length })}</p>
              <ul className="text-muted-foreground">
                {result.problems.slice(0, 20).map((p) => (
                  <li key={p.row}>{t("results.problem", { row: p.row, what: t(`results.problemWhat.${p.problem}`) })}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
