"use client";

// Pattern: docs/patterns/assignments/import.md — one step at a time with Back and Next (Attio's
// import steps), the source system chosen first (Linear importers), file columns on the left and
// Shiftbook fields on the right with sample values (Attio), each distinct value with its row count
// and match, unresolved values marked (Flatfile), a preview of what will happen, then every row
// with its result, filterable; earlier imports listed underneath (Attio import history).
import { CheckIcon, CircleAlertIcon, FileSpreadsheetIcon, ShieldCheckIcon, UploadIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { runImportAction, saveDateOrderAction, saveDecisionAction, saveMappingAction, startImportAction } from "@/app/[locale]/(app)/assignments/import/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { MAX_PLACEMENT_FILE_BYTES } from "@/lib/limits";
import { cn } from "@/lib/utils";
import { FIELDS, SOURCES, type Field, type Mapping, type Source } from "@/server/placements/fields";
import type { DateOrder, DistinctValue, PlannedRow } from "@/server/placements/plan";
import type { ImportView } from "@/server/placements/service";
import { longDate, money } from "../format";
import type { CatalogOptions } from "./job-order-form";

const STEPS = ["source", "map", "values", "preview", "run"] as const;
type Step = (typeof STEPS)[number];
type History = { id: string; source: string; filename: string; status: "draft" | "done"; createdAt: string; imported: number; skipped: number }[];

export function ImportWizard({ view, history, options, step: asked }: { view: ImportView | null; history: History; options: CatalogOptions; step: string | null }) {
  const t = useTranslations("import");
  const step: Step = !view ? "source" : view.status === "done" ? "run" : (STEPS as readonly string[]).includes(asked ?? "") && asked !== "source" && asked !== "run" ? (asked as Step) : "map";
  const at = STEPS.indexOf(step);
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/assignments" />}>{t("breadcrumb")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {view && <p className="text-sm text-muted-foreground">{t("fileLine", { file: view.filename, source: t(`sources.${view.source}`), rows: view.rowCount })}</p>}
      </div>
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label={t("steps")}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={s === step ? "step" : undefined} className={cn("flex items-center gap-2", i > at ? "text-muted-foreground" : "", s === step && "font-semibold")}>
            <span className={cn("flex size-6 items-center justify-center rounded-full border text-xs tabular-nums", i < at && "bg-primary text-primary-foreground", s === step && "border-foreground")}>
              {i < at ? <CheckIcon className="size-3.5" /> : i + 1}
            </span>
            {t(`step.${s}`)}
          </li>
        ))}
      </ol>
      {step === "source" && <SourceStep />}
      {view && step === "map" && <MapStep view={view} />}
      {view && step === "values" && <ValuesStep view={view} options={options} />}
      {view && step === "preview" && <PreviewStep view={view} options={options} />}
      {view && step === "run" && <RunStep view={view} />}
      {step === "source" && <HistoryList history={history} />}
    </div>
  );
}

function useGo() {
  const router = useRouter();
  const pathname = usePathname();
  return (id: string, step: Step) => router.push(`${pathname}?id=${id}&step=${step}`);
}

function Nav({ back, next, nextLabel, disabled, pending, onNext }: { back?: () => void; next?: () => void; nextLabel?: string; disabled?: boolean; pending?: boolean; onNext?: () => void }) {
  const t = useTranslations("import");
  return (
    <div className="flex justify-between border-t pt-4">
      {back ? (
        <Button variant="outline" onClick={back}>
          {t("back")}
        </Button>
      ) : (
        <span />
      )}
      {(next || onNext) && (
        <Button disabled={disabled || pending} onClick={onNext ?? next} data-testid="import-next">
          {nextLabel ?? t("next")}
        </Button>
      )}
    </div>
  );
}

function SourceStep() {
  const t = useTranslations("import");
  const go = useGo();
  const [source, setSource] = useState<Source>("bullhorn");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, run] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const upload = () =>
    run(async () => {
      if (!file) return;
      if (file.size > MAX_PLACEMENT_FILE_BYTES) {
        setError(t("refused.too_large"));
        return;
      }
      const form = new FormData();
      form.append("file", file);
      const r = await startImportAction(source, form);
      if (r.ok) go(r.id, "map");
      else setError(t(`refused.${r.error}`));
    });
  return (
    <section className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-semibold">{t("whichSource")}</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SOURCES.map((s) => (
            <label key={s} className={cn("flex cursor-pointer flex-col gap-1 rounded-lg border p-4 text-sm has-[:checked]:border-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring")}>
              <span className="flex items-center gap-2 font-medium">
                <input type="radio" name="source" value={s} checked={source === s} onChange={() => setSource(s)} />
                {t(`sources.${s}`)}
              </span>
              <span className="text-muted-foreground">{t(`sourceHint.${s}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
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
          if (f) {
            setFile(f);
            setError(null);
          }
        }}
        className={cn("flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm", dragging && "bg-muted")}
      >
        <UploadIcon className="size-5 text-muted-foreground" />
        <p>{file ? t("chosen", { name: file.name }) : t("drop")}</p>
        <p className="text-xs text-muted-foreground">{t("accepted")}</p>
        <input
          ref={input}
          type="file"
          accept=".csv,.xlsx"
          className="sr-only"
          id="placement-file"
          aria-label={t("choose")}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
          }}
        />
        <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
          {t("choose")}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <Nav onNext={upload} disabled={!file} pending={pending} nextLabel={t("upload")} />
    </section>
  );
}

function MapStep({ view }: { view: ImportView }) {
  const t = useTranslations("import");
  const tf = useTranslations("import.fields");
  const go = useGo();
  const router = useRouter();
  const [mapping, setMapping] = useState<Mapping>(view.mapping);
  const [pending, run] = useTransition();
  const fieldOf = (column: string) => (Object.entries(mapping) as [Field, string][]).find(([, c]) => c === column)?.[0] ?? "";
  const missing = (() => {
    const m: Field[] = [];
    if (!mapping.workerName && !(mapping.workerFirstName && mapping.workerLastName)) m.push("workerName");
    for (const f of ["client", "position", "startDate"] as const) if (!mapping[f]) m.push(f);
    return m;
  })();
  const setColumn = (column: string, field: Field | "") => {
    const next: Mapping = {};
    for (const [f, c] of Object.entries(mapping) as [Field, string][]) if (c !== column && f !== field) next[f] = c;
    if (field) next[field] = column;
    setMapping(next);
  };
  const save = () =>
    run(async () => {
      const r = await saveMappingAction(view.id, mapping);
      if (r.ok) {
        router.refresh();
        go(view.id, "values");
      } else toast.error(t(`refused.${r.error}`));
    });
  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("mapBody")}</p>
      <RemovedColumns removed={view.removed} />
      {missing.length > 0 && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t("missingTitle")}</AlertTitle>
          <AlertDescription className="text-foreground">{missing.map((f) => tf(f)).join(", ")}</AlertDescription>
        </Alert>
      )}
      <div className="rounded-lg border">
        <Table aria-label={t("step.map")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fileColumn")}</TableHead>
              <TableHead>{t("samples")}</TableHead>
              <TableHead>{t("shiftbookField")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.header.map((column) => (
              <TableRow key={column}>
                <TableCell className="font-medium">{column}</TableCell>
                <TableCell className="max-w-72 truncate text-muted-foreground" title={(view.samples[column] ?? []).join(" · ")}>
                  {(view.samples[column] ?? []).slice(0, 3).join(" · ") || "—"}
                </TableCell>
                <TableCell>
                  <NativeSelect aria-label={t("fieldFor", { column })} className="w-56" value={fieldOf(column)} onChange={(e) => setColumn(column, e.target.value as Field | "")}>
                    <NativeSelectOption value="">{t("dontImport")}</NativeSelectOption>
                    {FIELDS.map((f) => (
                      <NativeSelectOption key={f} value={f}>
                        {tf(f)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Nav back={() => router.push("/assignments/import")} onNext={save} disabled={missing.length > 0} pending={pending} />
    </section>
  );
}

/** The columns removed on receipt, kept with the import so the notice never disappears. */
function RemovedColumns({ removed }: { removed: ImportView["removed"] }) {
  const t = useTranslations("import");
  if (removed.length === 0) return null;
  return (
    <Alert data-testid="removed-columns">
      <ShieldCheckIcon />
      <AlertTitle>{t("removedTitle", { count: removed.length })}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {removed.map((r) => (
            <li key={r.column}>{t("removedColumn", { column: r.column, heading: r.heading, reason: t(`removedReason.${r.reason}`) })}</li>
          ))}
        </ul>
        <p>{t("removedBody")}</p>
      </AlertDescription>
    </Alert>
  );
}

const KINDS = ["worker", "client", "jobOrder", "status"] as const;
type Kind = (typeof KINDS)[number] | "dates";

function ValuesStep({ view, options }: { view: ImportView; options: CatalogOptions }) {
  const t = useTranslations("import");
  const go = useGo();
  const router = useRouter();
  const values = view.values!;
  const kinds: Kind[] = [...KINDS.filter((k) => values[k].length > 0), ...(view.dates.values.length > 0 ? (["dates"] as const) : [])];
  const [kind, setKind] = useState<Kind>(KINDS.find((k) => values[k].some((v) => v.match === null)) ?? "worker");
  const [pending, run] = useTransition();
  const open = (k: Kind) => (k === "dates" ? 0 : values[k].filter((v) => v.match === null).length);
  const invalidDates = view.dates.values.filter((d) => d.date === null).length;
  const unresolved = KINDS.reduce((n, k) => n + open(k), 0);
  const decide = (raw: string, value: string) =>
    run(async () => {
      if (kind === "dates") return;
      const r = await saveDecisionAction(view.id, kind, raw, value === "" ? null : value);
      if (!r.ok) toast.error(t(`refused.${r.error}`));
      router.refresh();
    });
  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("valuesBody")}</p>
      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        <nav aria-label={t("valueKinds")} className="flex flex-col gap-1">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              aria-current={k === kind ? "true" : undefined}
              onClick={() => setKind(k)}
              className={cn("flex items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted", k === kind && "bg-muted font-medium")}
            >
              {t(`kinds.${k}`)}
              {k === "dates" && invalidDates > 0 ? (
                <Badge variant="outline" aria-label={t("invalidDates", { count: invalidDates })}>
                  {invalidDates}
                </Badge>
              ) : open(k) > 0 ? (
                <Badge variant="destructive">{open(k)}</Badge>
              ) : (
                <CheckIcon className="size-4 text-muted-foreground" />
              )}
            </button>
          ))}
        </nav>
        {kind === "dates" ? (
          <DatesPanel view={view} />
        ) : (
          <div className="rounded-lg border">
            <Table aria-label={t(`kinds.${kind}`)}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("inFile")}</TableHead>
                  <TableHead className="text-right">{t("rows")}</TableHead>
                  <TableHead>{t("becomes")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {values[kind].map((v) => (
                  <TableRow key={v.raw} data-testid="value-row" className={cn(v.match === null && "bg-destructive/5")}>
                    <TableCell className="font-medium">{kind === "jobOrder" ? v.label : v.raw || t("blank")}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.count}</TableCell>
                    <TableCell>
                      <ValueChoice kind={kind} value={v} options={options} disabled={pending} onChange={(next) => decide(v.raw, next)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      {unresolved > 0 && <p className="text-sm text-destructive">{t("unresolved", { count: unresolved })}</p>}
      <Nav back={() => go(view.id, "map")} next={() => go(view.id, "preview")} disabled={unresolved > 0} pending={pending} />
    </section>
  );
}

/** Start and end dates: the format the file uses (Attio's per-column format setting) and each date as read. */
function DatesPanel({ view }: { view: ImportView }) {
  const t = useTranslations("import");
  const locale = useLocale();
  const router = useRouter();
  const [pending, run] = useTransition();
  const choose = (order: DateOrder) =>
    run(async () => {
      const r = await saveDateOrderAction(view.id, order);
      if (!r.ok) toast.error(t(`refused.${r.error}`));
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2 rounded-lg border p-4" disabled={pending}>
        <legend className="px-1 text-sm font-medium">{t("dateOrder.legend")}</legend>
        {(["month_first", "day_first"] as const).map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm">
            <input type="radio" name="date-order" value={o} checked={view.dates.order === o} onChange={() => choose(o)} />
            {t(`dateOrder.${o}`)}
          </label>
        ))}
        <p className="text-xs text-muted-foreground">{t(view.dates.chosen ? "dateOrder.chosen" : "dateOrder.auto")}</p>
      </fieldset>
      <div className="rounded-lg border">
        <Table aria-label={t("kinds.dates")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("inFile")}</TableHead>
              <TableHead className="text-right">{t("rows")}</TableHead>
              <TableHead>{t("readsAs")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.dates.values.map((d) => (
              <TableRow key={d.raw} data-testid="date-row" className={cn(d.date === null && "bg-destructive/5")}>
                <TableCell className="font-medium tabular-nums">{d.raw}</TableCell>
                <TableCell className="text-right tabular-nums">{d.count}</TableCell>
                <TableCell className={cn(d.date === null && "text-destructive")}>{d.date ? longDate(d.date, locale) : t("invalidFormat")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ValueChoice({ kind, value, options, disabled, onChange }: { kind: Exclude<Kind, "dates">; value: DistinctValue; options: CatalogOptions; disabled: boolean; onChange: (v: string) => void }) {
  const t = useTranslations("import");
  const common = { "aria-label": t("choiceFor", { value: value.label ?? value.raw }), className: "w-72", disabled, value: value.match ?? "", onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) };
  if (kind === "worker") {
    return (
      <NativeSelect {...common} aria-invalid={value.match === null || undefined}>
        <NativeSelectOption value="">{t("notMatched")}</NativeSelectOption>
        <NativeSelectOption value="leave_out">{t("leaveOut")}</NativeSelectOption>
        <NativeSelectOptGroup label={t("roster")}>
          {options.workers.map((w) => (
            <NativeSelectOption key={w.id} value={w.id}>
              {w.name}
            </NativeSelectOption>
          ))}
        </NativeSelectOptGroup>
      </NativeSelect>
    );
  }
  if (kind === "client") {
    return (
      <NativeSelect {...common} aria-invalid={value.match === null || undefined}>
        <NativeSelectOption value="">{t("notMatched")}</NativeSelectOption>
        <NativeSelectOption value="leave_out">{t("leaveOut")}</NativeSelectOption>
        {options.clients.map((c) => (
          <NativeSelectOption key={c.id} value={c.id}>
            {c.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    );
  }
  if (kind === "jobOrder") {
    return (
      <NativeSelect {...common} aria-invalid={value.match === null || undefined}>
        <NativeSelectOption value="">{t("notMatched")}</NativeSelectOption>
        <NativeSelectOption value="leave_out">{t("leaveOut")}</NativeSelectOption>
        <NativeSelectOptGroup label={t("existingJobOrders")}>
          {options.jobOrders
            .filter((j) => j.clientId === value.clientId)
            .map((j) => (
              <NativeSelectOption key={j.id} value={j.id}>
                {j.label}
              </NativeSelectOption>
            ))}
        </NativeSelectOptGroup>
        <NativeSelectOptGroup label={t("newJobOrderAt")}>
          {options.worksites
            .filter((w) => w.clientId === value.clientId)
            .map((w) => (
              <NativeSelectOption key={w.id} value={`new:${w.id}`}>
                {t("newAt", { site: `${w.name}, ${w.city}, ${w.state}` })}
              </NativeSelectOption>
            ))}
        </NativeSelectOptGroup>
      </NativeSelect>
    );
  }
  return (
    <NativeSelect {...common} aria-invalid={value.match === null || undefined}>
      <NativeSelectOption value="">{t("notMatched")}</NativeSelectOption>
      {(["active", "ended", "cancelled"] as const).map((s) => (
        <NativeSelectOption key={s} value={s}>
          {t(`statusAs.${s}`)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function PreviewStep({ view }: { view: ImportView; options: CatalogOptions }) {
  const t = useTranslations("import");
  const tf = useTranslations("import.fields");
  const locale = useLocale();
  const go = useGo();
  const router = useRouter();
  const reason = useReason();
  const [pending, run] = useTransition();
  const skips = view.plan.filter((p): p is Extract<PlannedRow, { outcome: "skip" }> => p.outcome === "skip" && p.reason.code !== "already_imported");
  const p = view.preview;
  const start = () =>
    run(async () => {
      const r = await runImportAction(view.id);
      if (!r.ok) toast.error(t(`refused.${r.error}`));
      router.refresh();
      go(view.id, "run");
    });
  const tile = (label: string, value: number, testId?: string) => (
    <div className="rounded-lg border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
  return (
    <section className="flex flex-col gap-4">
      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tile(t("willCreate"), p.create, "preview-create")}
        {tile(t("newJobOrders"), p.newJobOrders)}
        {tile(t("rateVersions"), p.rateVersions.length)}
        {tile(t("alreadyImported"), p.alreadyImported)}
        {tile(t("willSkip"), skips.length, "preview-skip")}
      </dl>
      <p className="text-sm text-muted-foreground">{t(`datesRead.${view.dates.order}`)}</p>
      {p.rows.length > 0 && (
        <div className="max-h-96 overflow-auto rounded-lg border">
          <Table aria-label={t("willCreate")}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">{t("row")}</TableHead>
                <TableHead>{t("worker")}</TableHead>
                <TableHead>{t("jobOrder")}</TableHead>
                <TableHead>{tf("startDate")}</TableHead>
                <TableHead>{tf("endDate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.rows.map((r) => (
                <TableRow key={r.row} data-testid="preview-row">
                  <TableCell className="tabular-nums">{r.row}</TableCell>
                  <TableCell>{r.workerName}</TableCell>
                  <TableCell>
                    {r.jobOrder}
                    {r.newJobOrder && (
                      <Badge variant="outline" className="ml-2">
                        {t("newBadge")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{longDate(r.startDate, locale)}</TableCell>
                  <TableCell>{r.endDate ? longDate(r.endDate, locale) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {p.rateVersions.length > 0 && (
        <div className="rounded-lg border">
          <Table aria-label={t("rateVersions")}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">{t("row")}</TableHead>
                <TableHead>{t("worker")}</TableHead>
                <TableHead>{t("from")}</TableHead>
                <TableHead className="text-right">{t("pay")}</TableHead>
                <TableHead className="text-right">{t("bill")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.rateVersions.map((v) => (
                <TableRow key={v.row}>
                  <TableCell className="tabular-nums">{v.row}</TableCell>
                  <TableCell>{v.workerName}</TableCell>
                  <TableCell>{longDate(v.from, locale)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(v.payRateCents, locale)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(v.billRateCents, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {skips.length > 0 && (
        <div className="rounded-lg border">
          <Table aria-label={t("willSkip")}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">{t("row")}</TableHead>
                <TableHead>{t("reason")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skips.map((x) => (
                <TableRow key={x.row}>
                  <TableCell className="tabular-nums">{x.row}</TableCell>
                  <TableCell>{reason(x.reason)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-sm text-muted-foreground">{t("previewNote")}</p>
      <Nav back={() => go(view.id, "values")} onNext={start} disabled={p.create === 0} pending={pending} nextLabel={t("start")} />
    </section>
  );
}

/** A skip reason in plain words: the field it is about, or the refusal behind it, named. */
function useReason() {
  const t = useTranslations("import");
  const tf = useTranslations("import.fields");
  return (r: { code: string; value: string }) => {
    const value =
      r.code === "missing_value" || r.code === "invalid_value"
        ? (FIELDS as readonly string[]).includes(r.value)
          ? tf(r.value as Field)
          : r.value
        : r.code === "rates_refused"
          ? t.has(`rateRefusals.${r.value}`)
            ? t(`rateRefusals.${r.value}`)
            : t("rateRefusals.other")
          : r.value;
    return t.has(`reasons.${r.code}`) ? t(`reasons.${r.code}`, { value }) : r.code;
  };
}

function RunStep({ view }: { view: ImportView }) {
  const t = useTranslations("import");
  const reason = useReason();
  const [filter, setFilter] = useState<"all" | "imported" | "skipped">("all");
  const results = view.results ?? [];
  const shown = results.filter((r) => filter === "all" || r.outcome === filter);
  const imported = results.filter((r) => r.outcome === "imported").length;
  return (
    <section className="flex flex-col gap-4">
      <Alert>
        <CheckIcon />
        <AlertTitle data-testid="import-done">{t("doneTitle", { imported, skipped: results.length - imported })}</AlertTitle>
        <AlertDescription>
          <Link href="/assignments" className={buttonVariants({ variant: "link", size: "sm", className: "h-auto px-0" })}>
            {t("openAssignments")}
          </Link>
        </AlertDescription>
      </Alert>
      <div className="flex gap-2" role="group" aria-label={t("filterResults")}>
        {(["all", "imported", "skipped"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "secondary" : "ghost"} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`results.${f}`)}
          </Button>
        ))}
      </div>
      <div className="rounded-lg border">
        <Table aria-label={t("step.run")}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">{t("row")}</TableHead>
              <TableHead className="w-32">{t("result")}</TableHead>
              <TableHead>{t("reason")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.row} data-testid="result-row">
                <TableCell className="tabular-nums">{r.row}</TableCell>
                <TableCell>
                  <Badge variant={r.outcome === "imported" ? "secondary" : "outline"}>{t(`results.${r.outcome}`)}</Badge>
                </TableCell>
                <TableCell>{r.reason ? reason(r.reason) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function HistoryList({ history }: { history: History }) {
  const t = useTranslations("import");
  const locale = useLocale();
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("history")}</h2>
      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
          <FileSpreadsheetIcon className="size-5" />
          <p>{t("noHistory")}</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table aria-label={t("history")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("file")}</TableHead>
                <TableHead>{t("source")}</TableHead>
                <TableHead>{t("when")}</TableHead>
                <TableHead>{t("result")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">
                    <Link href={`/assignments/import?id=${h.id}&step=${h.status === "done" ? "run" : "map"}`} className="underline-offset-4 hover:underline">
                      {h.filename}
                    </Link>
                  </TableCell>
                  <TableCell>{t(`sources.${h.source as Source}`)}</TableCell>
                  <TableCell>{longDate(h.createdAt.slice(0, 10), locale)}</TableCell>
                  <TableCell>{h.status === "done" ? t("historyDone", { imported: h.imported, skipped: h.skipped }) : t("historyDraft")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
