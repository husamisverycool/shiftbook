// Files — docs/patterns/convert.md step 5 (Gusto receipt step) with sections from exports.md
// (Stripe report sections: each file with its figures and Download at the section's upper right).
// Versions (slice e; Check: a paid payroll is immutable, a correction is a new unit; Stripe "older
// versions"): the period's versions newest first, each with its files; Start a correction (Owner).
import { CircleCheckIcon, DownloadIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ControlTotals, InvoiceKind } from "@/server/db/schema";
import { hoursMinutes, longDate, money } from "../format";
import type { Said } from "@/server/said";
import { getEngineSay } from "../engine-say-server";
import { StartCorrectionButton } from "./correction-actions";
import { Tip } from "../tip";

export interface FilesVersion {
  id: string;
  version: number;
  kind: "regular" | "correction";
  reason: string | null;
  payroll: { id: string; format: string; filename: string; sha256: string; controlTotals: ControlTotals; notes: string[] } | null;
  invoices: { id: string; number: string; kind: InvoiceKind; originalNumber: string | null; clientName: string; dueOn: string; totalCents: number }[];
  decisions: { name: string; text: string; said?: Said; note: string; by: string }[];
  /** A correction's clients whose differences net to zero: no document (decision E11). */
  netZero: string[];
  /** A correction's cents left over from rounding when hours moved at one rate: neither paid nor taken back. */
  roundings: { name: string; cents: number }[];
}

export interface FilesData {
  periodId: string;
  versions: FilesVersion[];
  canCorrect: boolean;
}

export async function FilesStep({ data }: { data: FilesData }) {
  const t = await getTranslations("convert.files");
  const tr = await getTranslations("convert.correction");
  const latest = data.versions[0];
  return (
    <div className="flex flex-col gap-8">
      <Alert>
        <CircleCheckIcon />
        <AlertTitle>{t("successTitle")}</AlertTitle>
        <AlertDescription>{t("successBody")}</AlertDescription>
      </Alert>

      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold">{tr("versionsTitle")}</h2>
        {data.canCorrect && latest && <StartCorrectionButton periodId={data.periodId} nextVersion={latest.version + 1} />}
      </div>

      {data.versions.map((v) => (
        <Version key={v.id} v={v} />
      ))}
    </div>
  );
}

async function Version({ v }: { v: FilesVersion }) {
  const t = await getTranslations("convert.files");
  const tr = await getTranslations("convert.correction");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  // A recorded decision in the reader's language (decision 0030); the person's note stays as typed.
  const say = await getEngineSay();
  const ct = v.payroll?.controlTotals;
  const correction = v.kind === "correction";
  return (
    <article className="flex flex-col gap-6" data-testid="version" aria-labelledby={`version-${v.version}`}>
      <div className="flex flex-col gap-1 border-b pb-2">
        <h3 id={`version-${v.version}`} className="flex items-center gap-2 font-semibold">
          {tr("versionTitle", { version: v.version })}
          <Badge variant={correction ? "secondary" : "outline"}>{correction ? tr("correction") : tr("original")}</Badge>
        </h3>
        {v.reason && <p className="text-sm text-muted-foreground">{v.reason}</p>}
      </div>

      {v.payroll && ct ? (
        <section className="flex flex-col gap-3" data-testid="payroll-file">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-lg font-semibold">{t("payrollTitle")}</h4>
              <p className="text-sm text-muted-foreground">
                {t.has(`formats.${v.payroll.format}`) ? t(`formats.${v.payroll.format}` as "formats.gusto_hours_csv") : v.payroll.format} · {v.payroll.filename}
              </p>
            </div>
            <a href={`/api/files/export/${v.payroll.id}`} download className={buttonVariants({ variant: "outline" })}>
              <DownloadIcon />
              {tc("download")}
            </a>
          </div>
          <div className="flex flex-col gap-4 border-y py-4">
            <h5 className="text-sm font-medium">{t("controlTotals")}</h5>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-5 text-sm sm:grid-cols-3">
              <Figure label={t("workers")} value={String(ct.workers)} />
              {(["REG", "OT", "DT"] as const)
                .filter((k) => (ct.minutesByType[k] ?? 0) > 0)
                .map((k) => (
                  <Figure key={k} label={t("minutes", { type: t(`earning.${k}`) })} value={hoursMinutes(ct.minutesByType[k] ?? 0)} />
                ))}
              <Figure label={t("gross")} value={money(ct.grossCents, locale)} />
              {Object.values(ct.amountsByType ?? {}).some((c) => c !== 0) && <Figure label={t("dollars")} value={money(Object.values(ct.amountsByType ?? {}).reduce((sum, c) => sum + c, 0), locale)} />}
              {ct.payrollSystemGrossCents !== undefined && <Figure label={t("systemGross", { system: t.has(`systems.${v.payroll.format}`) ? t(`systems.${v.payroll.format}` as "systems.gusto_hours_csv") : "" })} value={money(ct.payrollSystemGrossCents, locale)} />}
              {ct.payrollSystemDifferenceCents !== undefined && <Figure label={t("difference")} value={money(ct.payrollSystemDifferenceCents, locale)} />}
            </dl>
            <Tip label={v.payroll.sha256}>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {t("fingerprint")} {v.payroll.sha256}
              </p>
            </Tip>
          </div>
          {v.payroll.notes.length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <h5 className="font-medium">{t("notes")}</h5>
              <ul className="list-disc pl-5 text-muted-foreground">
                {v.payroll.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="no-payroll">
          {tr("noPayroll")}
        </p>
      )}

      {v.decisions.length > 0 && (
        <section className="flex flex-col gap-1 text-sm" data-testid="decisions">
          <h4 className="font-medium">{tr("decisionsTitle")}</h4>
          <ul className="list-disc pl-5 text-muted-foreground">
            {v.decisions.map((d) => (
              <li key={d.name}>
                {d.name}: {say({ message: d.text, said: d.said })} — {d.note} ({d.by})
              </li>
            ))}
          </ul>
        </section>
      )}

      {v.roundings.length > 0 && (
        <section className="flex flex-col gap-1 text-sm" data-testid="roundings">
          <h4 className="font-medium">{tr("roundingTitle")}</h4>
          <ul className="list-disc pl-5 text-muted-foreground">
            {v.roundings.map((r) => (
              <li key={r.name}>{tr(r.cents > 0 ? "roundingMore" : "roundingLess", { name: r.name, amount: money(Math.abs(r.cents), locale) })}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3" data-testid="invoices">
        <h4 className="text-lg font-semibold">{t("invoicesTitle")}</h4>
        {v.netZero.length > 0 && (
          <p className="text-sm text-muted-foreground" data-testid="net-zero">
            {tr("netZero", { clients: v.netZero.join(", "), zero: money(0, locale) })}
          </p>
        )}
        {v.invoices.length === 0 ? (
          v.netZero.length === 0 && <p className="text-sm text-muted-foreground">{tr("noInvoices")}</p>
        ) : (
          <div className="min-w-0">
            <Table aria-label={t("invoicesTitle")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colNumber")}</TableHead>
                  <TableHead>{t("colClient")}</TableHead>
                  <TableHead>{t("colDue")}</TableHead>
                  <TableHead className="text-right">{t("colTotal")}</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">{tc("download")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {v.invoices.map((inv) => (
                  <TableRow key={inv.id} data-testid="invoice-row">
                    <TableCell className="font-medium">
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          {inv.number}
                          {inv.kind !== "invoice" && <Badge variant="outline">{tr(`kind.${inv.kind}`)}</Badge>}
                        </span>
                        {inv.originalNumber && <span className="text-xs font-normal text-muted-foreground">{tr("corrects", { number: inv.originalNumber })}</span>}
                      </span>
                    </TableCell>
                    <TableCell>{inv.clientName}</TableCell>
                    <TableCell>{inv.kind === "credit_note" ? "—" : longDate(inv.dueOn, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(inv.totalCents, locale)}</TableCell>
                    <TableCell className="text-right">
                      <a href={`/api/files/invoice/${inv.id}`} download className={buttonVariants({ size: "sm", variant: "outline" })}>
                        <DownloadIcon />
                        {tc("download")}
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </article>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}
