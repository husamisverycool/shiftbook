"use client";

// Patterns: docs/patterns/money/funding.md and money/funding/[id].md — what factors ask for (aging,
// concentration, disputes, approved timesheets, a schedule-of-accounts line) and Stripe Capital's offer
// anatomy and wording (prequalified, subject to review; an advance, a flat fee, the rest withheld), on
// a Stripe list and a Stripe detail page.
import { DownloadIcon, ReceiptTextIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, useRouter } from "@/i18n/navigation";
import type { FundingPacket, FundingRules } from "@/server/money/funding";
import type { HandoffRow } from "@/server/money/queries";
import { submitFundingAction } from "@/app/[locale]/(app)/money/actions";
import { useCan } from "../abilities";
import { useDateTime } from "../agency-zone";
import { EmptyState } from "../empty-state";
import { listDate, longDate, money, tableDate } from "../format";
import { ListAmount } from "../list-controls";
import { Crumbs, Facts, Page, PageHeader, RecordLayout, Section, TableFrame } from "../page";
import { Status } from "../status";
import { NoMoneyMoves } from "./frame";

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : bps % 10 === 0 ? 1 : 2)}%`;

export function FundingRulesLine({ rules }: { rules: FundingRules }) {
  const t = useTranslations("money.funding");
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground" data-testid="funding-rules">
      <span>
        {rules.enabled
          ? t("rules", { advance: pct(rules.advanceBps), fee: pct(rules.feeBps), share: pct(rules.maxConcentrationBps), days: rules.maxAgeDays, approval: rules.requireClientApproval ? t("approvalRequired") : t("approvalNotRequired") })
          : t("off")}
      </span>
      <Link href="/settings/money" className="rounded-sm text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        {t("change")}
      </Link>
    </div>
  );
}

function Decision({ packet, submitted }: { packet: FundingPacket; submitted: boolean }) {
  const t = useTranslations("money.funding");
  if (submitted)
    return (
      <Status tone="neutral" data-testid="funding-decision">
        {t("submitted")}
      </Status>
    );
  if (packet.eligible)
    return (
      <Status tone="info" data-testid="funding-decision">
        {t("prequalified")}
      </Status>
    );
  return (
    <div className="flex flex-col gap-0.5">
      <Status tone="neutral" data-testid="funding-decision">
        {t("notEligible")}
      </Status>
      <span className="text-[13px] text-muted-foreground">{t(`reasons.${packet.reasons[0]!}`)}</span>
    </div>
  );
}

export function FundingList({ packets, handoffs, rules, today }: { packets: FundingPacket[]; handoffs: HandoffRow[]; rules: FundingRules; today: string }) {
  const t = useTranslations("money.funding");
  const locale = useLocale();
  const router = useRouter();
  return (
    <>
      <FundingRulesLine rules={rules} />
      {packets.length === 0 ? (
        <EmptyState icon={ReceiptTextIcon} title={t("emptyTitle")} description={t("emptyBody")} testId="funding-empty" />
      ) : (
        <TableFrame>
          <Table aria-label={t("cols.invoice")} data-testid="funding-list">
            <TableHeader>
              <TableRow>
                <TableHead>{t("cols.invoice")}</TableHead>
                <TableHead>{t("cols.client")}</TableHead>
                <TableHead>{t("cols.issued")}</TableHead>
                <TableHead className="text-right">{t("cols.age")}</TableHead>
                <TableHead className="text-right">{t("cols.balance")}</TableHead>
                <TableHead className="text-right">{t("cols.share")}</TableHead>
                <TableHead>{t("cols.decision")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packets.map((p) => {
                const href = `/money/funding/${p.invoice.id}`;
                return (
                  <TableRow key={p.invoice.id} className="cursor-pointer" data-testid="funding-row" onClick={() => router.push(href)}>
                    <TableCell>
                      <Link href={href} className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50" onClick={(e) => e.stopPropagation()}>
                        {p.invoice.number}
                      </Link>
                    </TableCell>
                    <TableCell>{p.invoice.clientName}</TableCell>
                    <TableCell className="whitespace-nowrap">{listDate(p.invoice.issuedOn, locale, today)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">{t("days", { days: p.ageDays })}</TableCell>
                    <TableCell className="text-right">
                      <ListAmount text={money(p.invoice.balanceCents, locale)} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{pct(p.concentrationBps)}</TableCell>
                    <TableCell>
                      <Decision packet={p} submitted={handoffs.some((h) => h.subjectId === p.invoice.id)} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </>
  );
}

export function FundingDetail({ packet, handoff }: { packet: FundingPacket; handoff: HandoffRow | null }) {
  const t = useTranslations("money.funding");
  const tm = useTranslations("money");
  const tc = useTranslations("common");
  const locale = useLocale();
  const at = useDateTime();
  const can = useCan();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const p = packet;
  const inv = p.invoice;
  const submit = () =>
    start(async () => {
      const r = await submitFundingAction(inv.id);
      setConfirming(false);
      if (r.ok) toast.success(t("done"));
      else toast.error(t(`errors.${r.error === "already" || r.error === "not_allowed" || r.error === "not_found" || r.error === "not_ready" ? r.error : "generic"}`));
    });
  return (
    <Page width="default">
      <PageHeader
        context={<Crumbs label={tm("tabsLabel")} items={[{ label: t("crumbs"), href: "/money" }, { label: tm("tabs.funding"), href: "/money/funding" }]} />}
        title={t("title", { number: inv.number })}
        titleTestId="funding-title"
        status={
          handoff ? (
            <Status tone="neutral" size="lg" data-testid="funding-status">
              {t("submitted")}
            </Status>
          ) : (
            <Status tone={p.eligible ? "info" : "neutral"} size="lg" data-testid="funding-status">
              {p.eligible ? t("prequalified") : t("notEligible")}
            </Status>
          )
        }
        description={t("facts", { client: inv.clientName, balance: money(inv.balanceCents, locale), issued: longDate(inv.issuedOn, locale), due: longDate(inv.dueOn, locale) })}
      />
      <NoMoneyMoves />
      <RecordLayout
        aside={
          <>
            <Facts
              items={[
                { label: t("details.client"), value: inv.clientName },
                { label: t("details.total"), value: money(inv.totalCents, locale) },
                { label: t("details.balance"), value: <span className="font-semibold">{money(inv.balanceCents, locale)}</span> },
                { label: t("details.issued"), value: tableDate(inv.issuedOn, locale) },
                { label: t("details.due"), value: tableDate(inv.dueOn, locale) },
                { label: t("details.age"), value: t("days", { days: p.ageDays }) },
                ...(handoff
                  ? [
                      { label: t("details.submittedAt"), value: at(handoff.createdAt), testId: "funding-submitted-at" },
                      { label: t("details.by"), value: handoff.createdByLabel },
                      { label: t("details.fingerprint"), value: <code className="font-mono text-xs">{handoff.payloadSha256.slice(0, 16)}…</code> },
                    ]
                  : []),
              ]}
            />
            <div className="flex flex-col gap-2">
              {can("money") && (
                <a href={`/api/files/money?kind=funding&invoice=${inv.id}`} download className={buttonVariants({ variant: "outline" })} data-testid="download-packet">
                  <DownloadIcon />
                  {t("download")}
                </a>
              )}
              {can("money") && !handoff && (
                <Button onClick={() => setConfirming(true)} disabled={!p.eligible} data-testid="submit-funding">
                  {t("submit")}
                </Button>
              )}
            </div>
          </>
        }
      >
        {p.offer ? (
          <Section id="offer" title={t("offerTitle")} testId="funding-offer">
            <p className="text-sm font-medium">{t("offerLine")}</p>
            <Facts
              className="grid-cols-2 sm:grid-cols-4"
              items={[
                { label: t("advance"), value: <span className="text-2xl font-semibold tabular-nums">{money(p.offer.advanceCents, locale)}</span>, testId: "offer-advance" },
                { label: t("fee"), value: <span className="text-2xl font-semibold tabular-nums">{money(p.offer.feeCents, locale)}</span>, testId: "offer-fee" },
                { label: t("reserve"), value: <span className="text-2xl font-semibold tabular-nums">{money(p.offer.reserveCents, locale)}</span>, testId: "offer-reserve" },
                { label: t("released"), value: <span className="text-2xl font-semibold tabular-nums">{money(p.offer.releasedOnPaymentCents, locale)}</span> },
              ]}
            />
            <p className="text-[13px] text-muted-foreground">{t("disclosure")}</p>
          </Section>
        ) : (
          <Section id="reasons" title={t("reasonsTitle")} testId="funding-reasons">
            <ul className="flex flex-col gap-1.5 text-sm">
              {p.reasons.map((r) => (
                <li key={r} className="flex items-start gap-2" data-testid="funding-reason">
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                  {t(`reasons.${r}`)}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section id="schedule" title={t("scheduleTitle")}>
          <Table aria-labelledby="schedule">
            <TableHeader>
              <TableRow>
                <TableHead>{t("scheduleCols.debtor")}</TableHead>
                <TableHead>{t("scheduleCols.invoice")}</TableHead>
                <TableHead>{t("scheduleCols.date")}</TableHead>
                <TableHead>{t("scheduleCols.po")}</TableHead>
                <TableHead className="text-right">{t("scheduleCols.amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>{p.schedule.debtor}</TableCell>
                <TableCell>{p.schedule.invoiceNumber}</TableCell>
                <TableCell className="whitespace-nowrap">{tableDate(p.schedule.invoiceDate, locale)}</TableCell>
                <TableCell>{p.schedule.poNumber ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{money(p.schedule.amountCents, locale)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>

        <Section id="approvals" title={t("approvalsTitle")}>
          {p.facts.approvals.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noApprovals")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {p.facts.approvals.map((a, i) => (
                <li key={i}>{t("approvalLine", { name: a.approverName, approved: a.approvedShifts, disputed: a.disputedShifts, date: at(a.decidedAt) })}</li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="history" title={t("historyTitle")}>
          <p className="text-sm">{t("historyLine", { count: p.facts.paidInvoices, days: p.facts.averageDaysToPay ?? 0, late: p.facts.averageDaysLate ?? 0 })}</p>
        </Section>

        <Section id="risk" title={t("riskTitle")}>
          <Facts
            className="sm:grid-cols-3"
            items={[
              { label: t("share"), value: pct(p.concentrationBps), testId: "funding-share" },
              { label: t("disputeRate"), value: p.disputeRateBps === null ? t("noDisputeRate") : pct(p.disputeRateBps) },
              { label: t("aging"), value: t(`buckets.${p.bucket}`) },
            ]}
          />
        </Section>
      </RecordLayout>

      {p.offer && (
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("dialogTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("dialogBody", { advance: money(p.offer.advanceCents, locale), fee: money(p.offer.feeCents, locale), reserve: money(p.offer.reserveCents, locale) })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
              <AlertDialogAction loading={pending} loadingLabel={t("confirm")} onClick={submit} data-testid="confirm-funding">
                {t("confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Page>
  );
}
