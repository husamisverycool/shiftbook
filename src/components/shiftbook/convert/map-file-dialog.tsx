"use client";

/**
 * "Map this file" (docs/patterns/inbox.md; the placement import's mapping step, Attio): the line
 * holding the column names, then each Granite field given a file column with sample values beside it
 * and the date format, then the first rows as they will be read, a name, and Save. Saving reads the
 * file again; later files with these columns are read without asking (SPEC §6 saved profiles).
 */
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { mappingLinesAction, mappingPreviewAction, saveMappingAction } from "@/app/[locale]/(app)/convert/inbox-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import type { MappingDraft, MappingPreview } from "@/server/intake/mapping";
import type { Line } from "@/server/intake/structured";
import { clock, hoursMinutes, shortDate } from "../format";

const FIELDS = ["name", "date", "in", "out", "breakMinutes", "totalHours", "clientName", "externalId"] as const;
type Field = (typeof FIELDS)[number];

export function MapFileDialog({ documentId, filename, onClose }: { documentId: string | null; filename: string; onClose: () => void }) {
  const t = useTranslations("timeMapping");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [step, setStep] = useState<"header" | "columns" | "preview">("header");
  const [lines, setLines] = useState<Line[] | null>(null);
  const [headerRow, setHeaderRow] = useState(1);
  const [columns, setColumns] = useState<Partial<Record<Field, string>>>({});
  const [dateFormat, setDateFormat] = useState<MappingDraft["dateFormat"]>("MM/DD/YYYY");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<MappingPreview | null>(null);
  const [pending, start] = useTransition();

  // A new file opens at its first step.
  useEffect(() => {
    if (!documentId) return;
    let live = true;
    void mappingLinesAction(documentId).then((r) => {
      if (!live) return;
      if ("error" in r) return void toast.error(t("stale"));
      setLines(r.lines);
      // The first line with the most filled cells is most likely the column names.
      const widest = r.lines.reduce((best, l) => (l.values.filter((v) => v.trim()).length > best.values.filter((v) => v.trim()).length ? l : best), r.lines[0] ?? { n: 1, values: [] });
      setHeaderRow(widest.n);
    });
    return () => {
      live = false;
    };
  }, [documentId, t]);

  const header = lines?.find((l) => l.n === headerRow)?.values ?? [];
  const below = (lines ?? []).filter((l) => l.n > headerRow);
  const sample = (col: string | undefined) => {
    const i = col ? header.indexOf(col) : -1;
    return i < 0 ? "" : below.map((l) => l.values[i] ?? "").filter((v) => v.trim()).slice(0, 3).join(" · ");
  };
  const draft = (): MappingDraft => ({ name, headerRow, dateFormat, columns: { name: columns.name ?? "", date: columns.date ?? "", in: columns.in, out: columns.out, breakMinutes: columns.breakMinutes, totalHours: columns.totalHours, clientName: columns.clientName, externalId: columns.externalId } });

  const showPreview = () =>
    start(async () => {
      if (!documentId) return;
      const r = await mappingPreviewAction(documentId, draft());
      if ("error" in r) return void toast.error(t("stale"));
      setPreview(r);
      setStep("preview");
    });
  const save = () =>
    start(async () => {
      if (!documentId) return;
      const r = await saveMappingAction(documentId, draft());
      if ("problems" in r) return void toast.error(t(`problems.${r.problems[0]}`));
      if ("error" in r) return void toast.error(t(r.error === "stale" ? "stale" : r.error === "busy" ? "busy" : "locked"));
      toast.success(t("saved"));
      onClose();
      router.refresh();
    });

  const close = () => {
    setStep("header");
    setLines(null);
    setColumns({});
    setPreview(null);
    setName("");
    onClose();
  };

  return (
    <Dialog open={documentId !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl" data-testid="map-file">
        <DialogHeader>
          <DialogTitle>{t("title", { file: filename })}</DialogTitle>
          <DialogDescription>{t(`step.${step}`)}</DialogDescription>
        </DialogHeader>

        {step === "header" && (
          <fieldset className="flex flex-col gap-1">
            <legend className="sr-only">{t("headerLegend")}</legend>
            {(lines ?? []).map((l) => (
              <label key={l.n} className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted ${l.n === headerRow ? "bg-muted" : ""}`}>
                <input type="radio" name="header-row" value={l.n} checked={l.n === headerRow} onChange={() => setHeaderRow(l.n)} data-testid={`header-row-${l.n}`} />
                <span className="w-8 shrink-0 text-muted-foreground tabular-nums">{l.n}</span>
                <span className="truncate font-mono text-xs">{l.values.join(" | ")}</span>
              </label>
            ))}
          </fieldset>
        )}

        {step === "columns" && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3">
              {FIELDS.map((f) => (
                <div key={f} className="grid items-center gap-2 sm:grid-cols-[12rem_14rem_1fr]">
                  <Label htmlFor={`map-${f}`}>
                    {t(`fields.${f}`)}
                    {(f === "name" || f === "date") && <span className="text-muted-foreground"> *</span>}
                  </Label>
                  <NativeSelect id={`map-${f}`} value={columns[f] ?? ""} onChange={(e) => setColumns((c) => ({ ...c, [f]: e.target.value || undefined }))} data-testid={`map-${f}`}>
                    <NativeSelectOption value="">{t("unmapped")}</NativeSelectOption>
                    {header.map((h, i) => (
                      <NativeSelectOption key={`${h}-${i}`} value={h}>
                        {h || t("blankColumn", { n: i + 1 })}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <span className="truncate text-xs text-muted-foreground">{sample(columns[f])}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{t("hoursOrPunches")}</p>
            <div className="grid items-center gap-2 sm:grid-cols-[12rem_14rem]">
              <Label htmlFor="map-date-format">{t("dateFormat")}</Label>
              <NativeSelect id="map-date-format" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as MappingDraft["dateFormat"])} data-testid="map-date-format">
                <NativeSelectOption value="MM/DD/YYYY">{t("formats.us")}</NativeSelectOption>
                <NativeSelectOption value="YYYY-MM-DD">{t("formats.iso")}</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
        )}

        {step === "preview" && preview && (
          <div className="flex flex-col gap-4">
            {preview.problems.length > 0 ? (
              <p className="text-sm text-destructive" role="alert">
                {t(`problems.${preview.problems[0]}`)}
              </p>
            ) : (
              <Table aria-label={t("previewLabel")}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("fields.name")}</TableHead>
                    <TableHead>{t("fields.date")}</TableHead>
                    <TableHead>{t("fields.in")}</TableHead>
                    <TableHead>{t("fields.out")}</TableHead>
                    <TableHead className="text-right">{t("hours")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.read.map((r, i) => (
                    <TableRow key={i} data-testid="map-preview-row">
                      <TableCell>{r.worker || "—"}</TableCell>
                      <TableCell>{r.date ? shortDate(r.date, locale) : <span className="text-destructive">{t("unreadable")}</span>}</TableCell>
                      <TableCell>{r.in !== null ? clock(r.in, locale) : "—"}</TableCell>
                      <TableCell>{r.out !== null ? clock(r.out, locale) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.minutes !== null ? hoursMinutes(r.minutes) : r.in !== null && r.out !== null ? hoursMinutes(r.out - r.in - (r.breakMinutes ?? 0)) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="map-name">{t("name")}</Label>
              <Input id="map-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} data-testid="map-name" />
            </div>
          </div>
        )}

        <DialogFooter>
          {step !== "header" && (
            <Button variant="outline" onClick={() => setStep(step === "preview" ? "columns" : "header")} disabled={pending}>
              {t("back")}
            </Button>
          )}
          {step === "header" && (
            <Button onClick={() => setStep("columns")} disabled={!lines || header.length === 0} data-testid="map-next">
              {t("next")}
            </Button>
          )}
          {step === "columns" && (
            <Button onClick={showPreview} disabled={!columns.name || !columns.date} loading={pending} loadingLabel={tc("loading")} data-testid="map-next">
              {t("next")}
            </Button>
          )}
          {step === "preview" && (
            <Button onClick={save} disabled={!preview || preview.problems.length > 0 || name.trim() === ""} loading={pending} loadingLabel={tc("loading")} data-testid="map-save">
              {t("save")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
