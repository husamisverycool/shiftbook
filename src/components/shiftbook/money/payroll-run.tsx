"use client";

// Pattern: docs/patterns/money/payroll/[id].md — Check's payroll preview and approval (each payroll
// item's earnings; the employee's onboarding steps the partner collects) and Zeal's employee check
// (hours × wage per shift), on the Stripe detail page: ancestors, title with status, facts line; the
// record on the left, its details and the one action on the right.
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HandoffRow, PayrollHandoffView } from "@/server/money/queries";
import type { EarningOut } from "@/server/money/payroll-payload";
import { recordPayrollHandoffAction } from "@/app/[locale]/(app)/money/actions";
import { useCan } from "../abilities";
import { useDateTime } from "../agency-zone";
import { dateRange, hoursMinutes, longDate, money } from "../format";
import { Crumbs, Facts, Page, PageHeader, RecordLayout, Section } from "../page";
import { Status } from "../status";
import { Tip } from "../tip";
import { useCopied } from "../use-copied";
import { NoMoneyMoves } from "./frame";

type Format = "check" | "zeal" | "file";

function sums(earnings: EarningOut[]) {
  const pick = (types: string[]) => earnings.filter((e) => types.includes(e.granite_type));
  const reg = pick(["REG"]);
  const ot = pick(["OT", "DT"]);
  const other = earnings.filter((e) => !["REG", "OT", "DT"].includes(e.granite_type));
  const total = (xs: EarningOut[]) => ({ minutes: xs.reduce((t, x) => t + x.minutes, 0), cents: xs.reduce((t, x) => t + x.amount_cents, 0) });
  return { reg: total(reg), ot: total(ot), other: total(other) };
}

export function PayrollRunView({ view, handoff }: { view: PayrollHandoffView; handoff: HandoffRow | null }) {
  const t = useTranslations("money");
  const tr = useTranslations("money.run");
  const tc = useTranslations("common");
  const locale = useLocale();
  const at = useDateTime();
  const can = useCan();
  const [format, setFormat] = useState<Format>("check");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [copied, markCopied] = useCopied();
  const { run, payload } = view;
  const n = payload.neutral;
  const period = dateRange(run.periodStart, run.periodEnd, locale);
  const status = handoff ? "recorded" : payload.ready ? "ready" : "notReady";
  const tone = status === "recorded" ? "neutral" : status === "ready" ? "info" : "warning";
  const totals = sums(n.employees.flatMap((e) => e.earnings));
  const hm = (x: { minutes: number; cents: number }) => (x.minutes === 0 && x.cents === 0 ? "—" : tr("hoursAmount", { hours: hoursMinutes(x.minutes), amount: money(x.cents, locale) }));
  const download = `/api/files/money?kind=payroll&run=${run.id}&shape=${format}`;

  const record = () =>
    start(async () => {
      const r = await recordPayrollHandoffAction(run.id, format);
      setConfirming(false);
      if (r.ok) toast.success(tr("done"));
      else toast.error(tr(`errors.${r.error === "already" || r.error === "not_allowed" || r.error === "not_found" || r.error === "not_ready" ? r.error : "generic"}`));
    });

  return (
    <Page width="default">
      <PageHeader
        context={<Crumbs label={t("tabsLabel")} items={[{ label: tr("crumbs"), href: "/money" }, { label: t("tabs.payroll"), href: "/money/payroll" }]} />}
        title={tr("title", { period })}
        titleTestId="payroll-run-title"
        status={
          <Status tone={tone} size="lg" data-testid="payroll-run-status">
            {tr(`status.${status}`)}
          </Status>
        }
        description={tr("facts", { payday: longDate(run.payday, locale), workers: n.totals.workers, gross: money(n.totals.gross_cents, locale) })}
      />
      <NoMoneyMoves />
      <RecordLayout
        aside={
          <>
            <Facts
              items={[
                { label: tr("details.version"), value: run.version },
                { label: tr("details.rules"), value: n.run.rules_version || "—" },
                { label: tr("details.approved"), value: n.run.approved_at ? at(n.run.approved_at) : "—" },
                { label: tr("details.payday"), value: longDate(run.payday, locale) },
                ...(handoff
                  ? [
                      { label: tr("details.recordedAt"), value: at(handoff.createdAt), testId: "handoff-recorded-at" },
                      { label: tr("details.by"), value: handoff.createdByLabel },
                      {
                        label: tr("details.fingerprint"),
                        value: (
                          <span className="inline-flex items-center gap-1.5">
                            <code className="font-mono text-xs">{handoff.payloadSha256.slice(0, 16)}…</code>
                            <Tip label={tr("details.fingerprint")}>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={tr("details.fingerprint")}
                                onClick={() => void navigator.clipboard?.writeText(handoff.payloadSha256).then(markCopied)}
                              >
                                {copied ? <CheckIcon /> : <CopyIcon />}
                              </Button>
                            </Tip>
                          </span>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="partner-format">{tr("formatLabel")}</Label>
              <NativeSelect id="partner-format" value={format} onChange={(e) => setFormat(e.target.value as Format)} data-testid="partner-format">
                {(["check", "zeal", "file"] as const).map((f) => (
                  <NativeSelectOption key={f} value={f}>
                    {tr(`formats.${f}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              {can("money") && (
                <a href={download} download className={buttonVariants({ variant: "outline" })} data-testid="download-payload">
                  <DownloadIcon />
                  {tr("download")}
                </a>
              )}
              {can("money") && !handoff && (
                <Button onClick={() => setConfirming(true)} disabled={!payload.ready} data-testid="record-payroll-handoff">
                  {tr("approve")}
                </Button>
              )}
              {!handoff && !payload.ready && <p className="text-[13px] text-muted-foreground">{tr("notReadyReason")}</p>}
            </div>
          </>
        }
      >
        <Section id="earnings" title={tr("earnings")} testId="payroll-earnings">
          <Table aria-labelledby="earnings">
            <TableHeader>
              <TableRow>
                <TableHead>{tr("cols.worker")}</TableHead>
                <TableHead className="text-right">{tr("cols.regular")}</TableHead>
                <TableHead className="text-right">{tr("cols.overtime")}</TableHead>
                <TableHead className="text-right">{tr("cols.other")}</TableHead>
                <TableHead className="text-right">{tr("cols.gross")}</TableHead>
                <TableHead>{tr("cols.ready")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {n.employees.map((e) => {
                const s = sums(e.earnings);
                return (
                  <TableRow key={e.external_id} data-testid="payroll-employee">
                    <TableCell className="font-medium">
                      {e.first_name} {e.last_name}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">{hm(s.reg)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">{hm(s.ot)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">{s.other.cents === 0 ? "—" : money(s.other.cents, locale)}</TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums" data-testid="employee-gross">
                      {money(e.gross_cents, locale)}
                    </TableCell>
                    <TableCell>
                      {e.readiness.missing.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <CheckIcon className="size-4" aria-hidden />
                          {tr("readyYes")}
                        </span>
                      ) : (
                        <Status tone="warning">{tr("missingList", { items: e.readiness.missing.map((m) => tr(`missing.${m}`)).join(", ") })}</Status>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">{tr("total")}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{hm(totals.reg)}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{hm(totals.ot)}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{totals.other.cents === 0 ? "—" : money(totals.other.cents, locale)}</TableCell>
                <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums" data-testid="payload-gross">
                  {money(n.totals.gross_cents, locale)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </Section>

        <Section id="collects" title={tr("collectsTitle")}>
          <p className="text-sm text-muted-foreground">{tr("collectsBody")}</p>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {(["dob", "residence", "payment_method", "withholdings"] as const).map((k) => (
              <li key={k} className="flex items-start gap-2">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                {tr(`collects.${k}`)}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="reconcile" title={tr("reconcileTitle")} testId="payroll-reconciliation">
          <Facts
            className="sm:grid-cols-3"
            items={[
              { label: tr("fileGross"), value: <span className="font-semibold tabular-nums">{money(n.reconciliation.run_gross_cents, locale)}</span> },
              { label: tr("payloadGross"), value: <span className="font-semibold tabular-nums">{money(n.reconciliation.payload_gross_cents, locale)}</span> },
              {
                label: tr("reconcileTitle"),
                value: n.reconciliation.equal ? tr("reconciled") : tr("notReconciled", { amount: money(Math.abs(n.reconciliation.payload_gross_cents - n.reconciliation.run_gross_cents), locale) }),
                testId: "reconciled",
              },
            ]}
          />
          {format === "zeal" && payload.zeal.differences.length > 0 && (
            <div className="flex flex-col gap-2 pt-2">
              <h3 className="text-sm font-medium">{tr("zealTitle")}</h3>
              <p className="text-sm text-muted-foreground">{tr("zealBody")}</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr("zealCols.worker")}</TableHead>
                    <TableHead className="text-right">{tr("zealCols.exact")}</TableHead>
                    <TableHead className="text-right">{tr("zealCols.partner")}</TableHead>
                    <TableHead className="text-right">{tr("zealCols.difference")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payload.zeal.differences.map((d) => {
                    const e = n.employees.find((x) => x.external_id === d.worker);
                    return (
                      <TableRow key={d.line_id}>
                        <TableCell>{e ? `${e.first_name} ${e.last_name}` : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(d.exact_cents, locale)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(d.partner_cents, locale)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(d.difference_cents, locale)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>
      </RecordLayout>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("dialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{tr("dialogBody", { workers: n.totals.workers, gross: money(n.totals.gross_cents, locale), format: tr(`formats.${format}`) })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction loading={pending} loadingLabel={tr("confirm")} onClick={record} data-testid="confirm-payroll-handoff">
              {tr("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
