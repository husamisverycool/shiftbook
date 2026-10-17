"use client";

// Pattern: docs/patterns/settings/payroll.md — "Read a sample file" (Avionté's mapping from a file):
// the payroll system's own import file is read in the browser, its columns checked against the layout
// Granite writes, and the client id and the company's own codes it holds offered. Nothing is sent.
import { CheckIcon, CircleAlertIcon, FileUpIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { readPayrollSample, type SampleReading } from "@/exports/samples";

export function PayrollSample({ format, onClientId, disabled }: { format: "paychex_flex_csv" | "paylocity_time_csv"; onClientId?: (id: string) => void; disabled?: boolean }) {
  const t = useTranslations("payrollSample");
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<(SampleReading & { name: string }) | null>(null);
  const read = async (file: File) => {
    const text = await file.text();
    const r = readPayrollSample(format, text);
    setReading({ ...r, name: file.name });
    if (r.clientId && onClientId) onClientId(r.clientId);
  };
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4" data-testid="payroll-sample">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{t("title")}</span>
          <span className="text-sm text-muted-foreground">{t("hint")}</span>
        </div>
        <input
          ref={input}
          type="file"
          accept=".csv,.txt"
          className="sr-only"
          aria-label={t("choose")}
          data-testid="payroll-sample-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void read(f);
            e.target.value = "";
          }}
        />
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
          <FileUpIcon />
          {t("choose")}
        </Button>
      </div>
      {reading && (
        <div className="flex flex-col gap-1.5 text-sm" role="status" data-testid="payroll-sample-result">
          <p className="flex items-center gap-2">
            {reading.layoutMatches && reading.problems.length === 0 ? <CheckIcon className="size-4 text-emerald-600" aria-hidden /> : <CircleAlertIcon className="size-4 text-amber-600" aria-hidden />}
            {reading.layoutMatches && reading.problems.length === 0 ? t("matches", { name: reading.name, rows: reading.rows }) : t("differs", { name: reading.name })}
          </p>
          {reading.problems.map((p) => (
            <p key={p} className="text-muted-foreground">
              {p}
            </p>
          ))}
          {reading.clientId && <p>{t("clientIdFound", { id: reading.clientId })}</p>}
          {reading.codes.length > 0 && (
            <p>
              {t("codesFound")} <span className="font-mono text-xs">{reading.codes.join(" · ")}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
