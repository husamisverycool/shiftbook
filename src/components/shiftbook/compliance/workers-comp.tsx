"use client";

// Pattern: docs/patterns/compliance/workers-comp.md — Patriot Workers' Comp Wages report (a date
// range; state → class → worker, or class first; overtime apart; missing classes listed first and out
// of the totals; PDF and CSV); NCRB Basic Manual Rule 2-C-2-a.
import { DownloadIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { WcPacketView } from "@/server/compliance/documents";
import { hoursMinutes, money } from "../format";

type Figures = { minutes: number; straightCents: number; otPremiumCents: number; dtPremiumCents: number; otherCents: number; totalCents: number };

export function WorkersCompPacket({ view }: { view: WcPacketView }) {
  const t = useTranslations("compliance.workersComp");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [from, setFrom] = useState(view.from);
  const [to, setTo] = useState(view.to);
  const go = (next: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) p.set(k, v);
    router.replace(`${pathname}?${p.toString()}`);
  };
  const exportHref = (format: "pdf" | "csv") => `/api/files/compliance/packet?${new URLSearchParams({ from: view.from, to: view.to, order: view.order, format }).toString()}`;
  const cells = (f: Figures, bold = false) => (
    <>
      <TableCell className={`text-right tabular-nums ${bold ? "font-semibold" : ""}`}>{hoursMinutes(f.minutes)}</TableCell>
      <TableCell className={`text-right tabular-nums ${bold ? "font-semibold" : ""}`}>{money(f.straightCents, locale)}</TableCell>
      <TableCell className={`text-right tabular-nums ${bold ? "font-semibold" : ""}`}>{money(f.otPremiumCents, locale)}</TableCell>
      <TableCell className={`text-right tabular-nums ${bold ? "font-semibold" : ""}`}>{money(f.dtPremiumCents, locale)}</TableCell>
      <TableCell className={`text-right tabular-nums ${bold ? "font-semibold" : ""}`}>{money(f.otherCents, locale)}</TableCell>
      <TableCell className={`text-right tabular-nums ${bold ? "font-semibold" : ""}`}>{money(f.totalCents, locale)}</TableCell>
    </>
  );
  const groupKey = (r: { state: string; classCode: string }) => `${r.state}|${r.classCode}`;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to && from <= to) go({ from, to });
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="wc-from" className="text-xs text-muted-foreground">
              {t("from")}
            </Label>
            <Input id="wc-from" type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="wc-from" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="wc-to" className="text-xs text-muted-foreground">
              {t("to")}
            </Label>
            <Input id="wc-to" type="date" className="w-40" value={to} min={from} onChange={(e) => setTo(e.target.value)} data-testid="wc-to" />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={!from || !to || to < from || (from === view.from && to === view.to)} data-testid="wc-apply">
            {t("apply")}
          </Button>
        </form>
        <div className="flex flex-col gap-1">
          <Label htmlFor="wc-order" className="text-xs text-muted-foreground">
            {t("order")}
          </Label>
          <NativeSelect id="wc-order" className="w-40" value={view.order} onChange={(e) => go({ order: e.target.value })} data-testid="wc-order">
            <NativeSelectOption value="state">{t("orders.state")}</NativeSelectOption>
            <NativeSelectOption value="class">{t("orders.class")}</NativeSelectOption>
          </NativeSelect>
        </div>
        <span className="mr-auto" />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" data-testid="wc-export" />}>
            <DownloadIcon />
            {t("export")}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem render={<a href={exportHref("pdf")} download data-testid="wc-export-pdf" />}>{t("pdf")}</DropdownMenuItem>
            <DropdownMenuItem render={<a href={exportHref("csv")} download data-testid="wc-export-csv" />}>{t("csv")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {view.missing.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3" aria-labelledby="wc-missing" data-testid="wc-missing">
          <h2 id="wc-missing" className="text-sm font-semibold text-destructive">
            {t("missingTitle")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("missingIntro")}</p>
          <ul className="text-sm">
            {view.missing.map((m) => (
              <li key={`${m.workerId}-${m.state}`} className="flex gap-4">
                <span className="flex-1">{m.workerName}</span>
                <span className="text-muted-foreground">{m.state ?? "—"}</span>
                <span className="tabular-nums">{hoursMinutes(m.minutes)}</span>
                <span className="tabular-nums">{money(m.totalCents, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {view.rows.length === 0 ? (
        <p className="rounded-lg border py-14 text-center text-sm text-muted-foreground" data-testid="wc-none">
          {t("none")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table aria-label={t("tableLabel")} data-testid="wc-table">
            <TableHeader>
              <TableRow>
                <TableHead>{view.order === "state" ? t("cols.state") : t("cols.classCode")}</TableHead>
                <TableHead>{view.order === "state" ? t("cols.classCode") : t("cols.state")}</TableHead>
                <TableHead>{t("cols.worker")}</TableHead>
                <TableHead className="text-right">{t("cols.hours")}</TableHead>
                <TableHead className="text-right">{t("cols.straight")}</TableHead>
                <TableHead className="text-right">{t("cols.ot")}</TableHead>
                <TableHead className="text-right">{t("cols.dt")}</TableHead>
                <TableHead className="text-right">{t("cols.other")}</TableHead>
                <TableHead className="text-right">{t("cols.total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.classes.map((c) => (
                <Fragment key={groupKey(c)}>
                  {view.rows
                    .filter((r) => groupKey(r) === groupKey(c))
                    .map((r) => (
                      <TableRow key={`${groupKey(r)}|${r.workerId}`} data-testid="wc-row" title={r.explain}>
                        <TableCell>{view.order === "state" ? r.state : r.classCode}</TableCell>
                        <TableCell>{view.order === "state" ? r.classCode : r.state}</TableCell>
                        <TableCell className="font-medium">{r.workerName}</TableCell>
                        {cells(r)}
                      </TableRow>
                    ))}
                  <TableRow className="bg-muted/40 hover:bg-muted/40" data-testid="wc-subtotal">
                    <TableCell colSpan={3} className="font-medium">
                      {t("subtotal", { state: c.state, classCode: c.classCode })} {c.description ? <span className="font-normal text-muted-foreground">· {c.description}</span> : null}
                    </TableCell>
                    {cells(c, true)}
                  </TableRow>
                </Fragment>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-semibold">
                  {t("total")}
                </TableCell>
                {cells(view.totals, true)}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      <p className="text-sm" data-testid="wc-tie">
        {view.differenceCents !== 0
          ? t("tieDifferent", { files: view.files, gross: money(view.filesGrossCents, locale), settled: money(view.settledCents, locale), packet: money(view.allPayCents, locale), difference: money(view.differenceCents, locale) })
          : view.settledCents !== 0
            ? t("tieSettled", { files: view.files, gross: money(view.filesGrossCents, locale), settled: money(view.settledCents, locale), decisions: view.decisions })
            : t("tieEqual", { files: view.files, gross: money(view.filesGrossCents, locale) })}
      </p>
    </div>
  );
}
