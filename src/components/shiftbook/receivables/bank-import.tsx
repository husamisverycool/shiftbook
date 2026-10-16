"use client";

// Pattern: docs/patterns/bank/import.md — QuickBooks Online Upload from file (Upload · Map columns ·
// Choose lines); Zoho Books Import Statement (three ways amounts are given; the mapping chosen
// automatically and remembered).
import { ChevronLeftIcon, UploadIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { type BankPreview, importBankFileAction, previewBankFileAction } from "@/app/[locale]/(app)/payments/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { BankMapping } from "@/server/db/schema";
import { longDate, money } from "../format";

type Step = "upload" | "map" | "choose";
const STEPS: Step[] = ["upload", "map", "choose"];
const KINDS = ["signed", "split", "typed"] as const;
const FORMATS = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"] as const;
const LIMIT_BYTES = 1_048_576;

/** A, B, … Z, AA, AB … — how a spreadsheet names columns. */
export function columnLetter(i: number): string {
  let n = i + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = (n - 1 - r) / 26;
  }
  return out;
}

const firstGuess = (columns: number): BankMapping => ({
  headerRow: 0,
  date: 0,
  description: Math.min(1, columns - 1),
  reference: null,
  amounts: { kind: "signed", amount: Math.min(2, columns - 1) },
  dateFormat: "MM/DD/YYYY",
});

export function BankImport({ demo }: { demo: boolean }) {
  const t = useTranslations("bankImport");
  const locale = useLocale();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const asked = useRef(0);
  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<BankPreview | null>(null);
  const [mapping, setMapping] = useState<BankMapping | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choose = (f: File | null | undefined) => {
    setFile(f ?? null);
    setError(null);
  };

  const read = () =>
    start(async () => {
      if (!file) return;
      if (!/\.(csv|txt)$/i.test(file.name)) return setError(t("errors.type"));
      if (file.size > LIMIT_BYTES) return setError(t("errors.size"));
      const body = await file.text();
      const r = await previewBankFileAction(body);
      if (!r.ok) return setError(t(`errors.${r.error}`));
      setText(body);
      setPreview(r);
      setMapping(r.mapping ?? firstGuess(r.columns));
      if (!r.mapping) {
        // Nothing recognisable: read it with the first guess so the person sees what it gives.
        const again = await previewBankFileAction(body, firstGuess(r.columns));
        if (again.ok) setPreview(again);
      }
      setStep("map");
    });

  const remap = (next: BankMapping) => {
    setMapping(next);
    const ask = ++asked.current;
    start(async () => {
      const r = await previewBankFileAction(text, next);
      // Only the latest choice counts when several were made quickly.
      if (ask !== asked.current) return;
      if (r.ok) setPreview(r);
      else toast.error(t(`errors.${r.error}`));
    });
  };

  const toChoose = () => {
    if (!preview) return;
    setChosen(new Set(preview.lines.filter((l) => l.amountCents > 0 && !l.imported).map((l) => l.rowNumber)));
    setStep("choose");
  };

  const importLines = () =>
    start(async () => {
      if (!file || !mapping) return;
      const r = await importBankFileAction(file.name, text, mapping, [...chosen].sort((a, b) => a - b));
      if (r.ok) {
        toast.success(t("done", { imported: r.imported, skipped: r.skipped }));
        router.push("/bank");
        return;
      }
      if (r.error === "file") setError(r.reason === "unreadable" ? t("errors.unreadable", { rows: (r.rows ?? []).join(", ") }) : t(`errors.${r.reason}`));
      else setError(t(`errors.${r.error === "busy" || r.error === "not_allowed" ? r.error : "generic"}`));
    });

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-1">
        <Link href="/bank" className="flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline" data-testid="back-to-bank">
          <ChevronLeftIcon className="size-4" />
          {t("bank")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
      </div>
      <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label={t("steps")}>
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">·</span>}
            <span aria-current={step === s ? "step" : undefined} className={cn(step === s ? "font-semibold" : "text-muted-foreground")}>
              {i + 1}. {t(`step.${s}`)}
            </span>
          </li>
        ))}
      </ol>

      {step === "upload" && (
        <section className="flex flex-col gap-4" aria-label={t("step.upload")}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              choose(e.dataTransfer.files[0]);
            }}
            className={cn("flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-sm", dragging && "bg-muted")}
          >
            <UploadIcon className="size-5 text-muted-foreground" />
            <p>{file ? t("chosen", { name: file.name }) : t("drop")}</p>
            <p className="text-xs text-muted-foreground">{t("limits")}</p>
            <input ref={input} type="file" accept=".csv,.txt,text/csv" className="sr-only" aria-label={t("choose")} data-testid="bank-file" onChange={(e) => choose(e.target.files?.[0])} />
            <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
              {t("choose")}
            </Button>
            {error && (
              <p role="alert" className="text-destructive" data-testid="import-error">
                {error}
              </p>
            )}
          </div>
          {demo && (
            <p className="text-sm text-muted-foreground">
              {t("demoSample")}{" "}
              <a href="/api/demo/bank-sample" download className="text-foreground underline underline-offset-4" data-testid="bank-sample">
                {t("demoSampleLink")}
              </a>
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={read} disabled={!file || pending} data-testid="next">
              {t("next")}
            </Button>
          </div>
        </section>
      )}

      {step === "map" && preview && mapping && <MapStep preview={preview} mapping={mapping} onChange={remap} pending={pending} onBack={() => setStep("upload")} onNext={toChoose} />}

      {step === "choose" && preview && (
        <section className="flex flex-col gap-4" aria-label={t("step.choose")}>
          {preview.lines.every((l) => l.imported) ? (
            <p className="py-10 text-center text-sm text-muted-foreground" data-testid="all-imported">
              {t("allImported")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table aria-label={t("step.choose")} data-testid="choose-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-0">
                      <Checkbox
                        aria-label={t("chooseAll")}
                        checked={preview.lines.filter((l) => !l.imported).every((l) => chosen.has(l.rowNumber))}
                        indeterminate={chosen.size > 0 && !preview.lines.filter((l) => !l.imported).every((l) => chosen.has(l.rowNumber))}
                        onCheckedChange={(on) => setChosen(new Set(on ? preview.lines.filter((l) => !l.imported).map((l) => l.rowNumber) : []))}
                      />
                    </TableHead>
                    <TableHead>{t("date")}</TableHead>
                    <TableHead>{t("description")}</TableHead>
                    <TableHead className="text-right">{t("amount")}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t("note")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.lines.map((l) => (
                    <TableRow key={l.rowNumber} data-testid="choose-line" className={l.imported ? "text-muted-foreground" : undefined}>
                      <TableCell>
                        <Checkbox
                          aria-label={t("chooseLine", { row: l.rowNumber })}
                          disabled={l.imported}
                          checked={chosen.has(l.rowNumber)}
                          onCheckedChange={(on) =>
                            setChosen((cur) => {
                              const next = new Set(cur);
                              if (on) next.add(l.rowNumber);
                              else next.delete(l.rowNumber);
                              return next;
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{longDate(l.postedOn, locale)}</TableCell>
                      <TableCell className="max-w-96 break-all">{l.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(l.amountCents, locale)}</TableCell>
                      <TableCell>
                        {l.imported ? <Badge variant="outline">{t("imported")}</Badge> : l.amountCents < 0 ? <Badge variant="outline">{t("withdrawal")}</Badge> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {preview.problems.length > 0 && <p className="text-sm text-muted-foreground">{t("leftOut", { count: preview.problems.length })}</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive" data-testid="import-error">
              {error}
            </p>
          )}
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setStep("map")}>
              {t("back")}
            </Button>
            {!preview.lines.every((l) => l.imported) && (
              <Button onClick={importLines} disabled={pending || chosen.size === 0} data-testid="import-lines">
                {t("import", { count: chosen.size })}
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function MapStep({ preview, mapping, onChange, pending, onBack, onNext }: { preview: BankPreview; mapping: BankMapping; onChange: (m: BankMapping) => void; pending: boolean; onBack: () => void; onNext: () => void }) {
  const t = useTranslations("bankImport");
  const locale = useLocale();
  const header = mapping.headerRow === null ? null : preview.head[mapping.headerRow];
  const sample = preview.head[mapping.headerRow === null ? 0 : mapping.headerRow + 1];
  const label = (i: number) => {
    const named = header?.[i]?.trim();
    const example = sample?.[i]?.trim();
    return `${t("column", { letter: columnLetter(i) })}${named ? ` · ${named}` : example ? ` · ${example.slice(0, 30)}` : ""}`;
  };
  const columns = Array.from({ length: preview.columns }, (_, i) => i);
  const select = (id: string, name: string, value: number | null, set: (v: number | null) => void, optional = false) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{name}</Label>
      <NativeSelect id={id} className="w-full" value={value === null ? "" : String(value)} onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))}>
        {optional && <NativeSelectOption value="">{t("none")}</NativeSelectOption>}
        {columns.map((c) => (
          <NativeSelectOption key={c} value={String(c)}>
            {label(c)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
  const a = mapping.amounts;
  const first = a.kind === "split" ? a.deposits : a.amount;
  const setKind = (kind: (typeof KINDS)[number]) =>
    onChange({
      ...mapping,
      amounts: kind === "signed" ? { kind, amount: first } : kind === "split" ? { kind, deposits: first, withdrawals: Math.min(first + 1, preview.columns - 1) } : { kind, amount: first, type: Math.min(first + 1, preview.columns - 1) },
    });
  const shown = preview.lines.slice(0, 5);

  return (
    <section className="flex flex-col gap-6" aria-label={t("step.map")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="header-row">{t("headerRow")}</Label>
          <NativeSelect id="header-row" className="w-full" value={mapping.headerRow === null ? "" : String(mapping.headerRow)} onChange={(e) => onChange({ ...mapping, headerRow: e.target.value === "" ? null : Number(e.target.value) })}>
            <NativeSelectOption value="">{t("noHeader")}</NativeSelectOption>
            {preview.head.map((row, i) => (
              <NativeSelectOption key={i} value={String(i)}>
                {t("line", { row: i + 1 })}: {row.join(", ").slice(0, 80)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {select("map-date", t("date"), mapping.date, (v) => onChange({ ...mapping, date: v ?? 0 }))}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="map-format">{t("dateFormat")}</Label>
          <NativeSelect id="map-format" className="w-full" value={mapping.dateFormat} onChange={(e) => onChange({ ...mapping, dateFormat: e.target.value as BankMapping["dateFormat"] })}>
            {FORMATS.map((f) => (
              <NativeSelectOption key={f} value={f}>
                {t(`formats.${f.replaceAll("/", "").replaceAll("-", "")}` as "formats.MMDDYYYY")}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {select("map-description", t("description"), mapping.description, (v) => onChange({ ...mapping, description: v ?? 0 }))}
        {select("map-reference", t("reference"), mapping.reference, (v) => onChange({ ...mapping, reference: v }), true)}
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">{t("amountsGiven")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <label key={k} className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm has-[:checked]:border-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
              <input type="radio" name="amount-kind" className="mt-1" value={k} checked={a.kind === k} onChange={() => setKind(k)} />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{t(`kinds.${k}`)}</span>
                <span className="text-muted-foreground">{t(`kindHints.${k}`)}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {a.kind === "signed" && select("map-amount", t("amount"), a.amount, (v) => onChange({ ...mapping, amounts: { kind: "signed", amount: v ?? 0 } }))}
          {a.kind === "split" && (
            <>
              {select("map-deposits", t("deposits"), a.deposits, (v) => onChange({ ...mapping, amounts: { ...a, deposits: v ?? 0 } }))}
              {select("map-withdrawals", t("withdrawals"), a.withdrawals, (v) => onChange({ ...mapping, amounts: { ...a, withdrawals: v ?? 0 } }))}
            </>
          )}
          {a.kind === "typed" && (
            <>
              {select("map-amount", t("amount"), a.amount, (v) => onChange({ ...mapping, amounts: { ...a, amount: v ?? 0 } }))}
              {select("map-type", t("type"), a.type, (v) => onChange({ ...mapping, amounts: { ...a, type: v ?? 0 } }))}
            </>
          )}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2" aria-busy={pending}>
        <h2 className="text-sm font-medium">{t("previewTitle")}</h2>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="preview-empty">
            {t("previewEmpty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table aria-label={t("previewTitle")} data-testid="map-preview">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("lineHead")}</TableHead>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("description")}</TableHead>
                  <TableHead className="text-right">{t("amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((l) => (
                  <TableRow key={l.rowNumber}>
                    <TableCell className="text-muted-foreground tabular-nums">{l.rowNumber}</TableCell>
                    <TableCell className="whitespace-nowrap">{longDate(l.postedOn, locale)}</TableCell>
                    <TableCell className="max-w-96 break-all">{l.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(l.amountCents, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {preview.problems.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-destructive" data-testid="map-problems">
            {preview.problems.slice(0, 5).map((p) => (
              <li key={`${p.rowNumber}-${p.field}`}>{t(`problems.${p.field}`, { row: p.rowNumber, text: p.text })}</li>
            ))}
            {preview.problems.length > 5 && <li>{t("moreProblems", { count: preview.problems.length - 5 })}</li>}
          </ul>
        )}
      </div>
      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={onBack}>
          {t("back")}
        </Button>
        <Button onClick={onNext} disabled={pending || preview.lines.length === 0} data-testid="next">
          {t("next")}
        </Button>
      </div>
    </section>
  );
}
