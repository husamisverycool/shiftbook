// Files — docs/patterns/convert.md step 4 (Gusto receipt step) with sections from exports.md
// (Stripe report sections: each file with its figures and Download at the section's upper right).
import { CircleCheckIcon, DownloadIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ControlTotals } from "@/server/db/schema";
import { hoursMinutes, longDate, money } from "../format";

export interface FilesData {
  payroll: { id: string; filename: string; sha256: string; controlTotals: ControlTotals } | null;
  notes: string[];
  invoices: { id: string; number: string; clientName: string; dueOn: string; totalCents: number }[];
}

export async function FilesStep({ data }: { data: FilesData }) {
  const t = await getTranslations("convert.files");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const ct = data.payroll?.controlTotals;
  return (
    <div className="flex flex-col gap-8">
      <Alert>
        <CircleCheckIcon />
        <AlertTitle>{t("successTitle")}</AlertTitle>
        <AlertDescription>{t("successBody")}</AlertDescription>
      </Alert>

      {data.payroll && ct && (
        <section className="flex flex-col gap-3" data-testid="payroll-file">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{t("payrollTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("payrollFormat")} · {data.payroll.filename}
              </p>
            </div>
            <a href={`/api/files/export/${data.payroll.id}`} download className={buttonVariants({ variant: "outline" })}>
              <DownloadIcon />
              {tc("download")}
            </a>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-medium">{t("controlTotals")}</h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Figure label={t("workers")} value={String(ct.workers)} />
              {(["REG", "OT", "DT"] as const)
                .filter((k) => (ct.minutesByType[k] ?? 0) > 0)
                .map((k) => (
                  <Figure key={k} label={t("minutes", { type: t(`earning.${k}`) })} value={hoursMinutes(ct.minutesByType[k] ?? 0)} />
                ))}
              <Figure label={t("gross")} value={money(ct.grossCents, locale)} />
              {ct.payrollSystemGrossCents !== undefined && <Figure label={t("gustoGross")} value={money(ct.payrollSystemGrossCents, locale)} />}
              {ct.payrollSystemDifferenceCents !== undefined && <Figure label={t("difference")} value={money(ct.payrollSystemDifferenceCents, locale)} />}
            </dl>
            <p className="mt-3 truncate font-mono text-xs text-muted-foreground" title={data.payroll.sha256}>
              {t("fingerprint")} {data.payroll.sha256}
            </p>
          </div>
          {data.notes.length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <h3 className="font-medium">{t("notes")}</h3>
              <ul className="list-disc pl-5 text-muted-foreground">
                {data.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3" data-testid="invoices">
        <h2 className="text-lg font-semibold">{t("invoicesTitle")}</h2>
        <div className="overflow-x-auto rounded-lg border">
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
              {data.invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.number}</TableCell>
                  <TableCell>{inv.clientName}</TableCell>
                  <TableCell>{longDate(inv.dueOn, locale)}</TableCell>
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
      </section>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
