"use client";

// Pattern: docs/patterns/approvals.md — Harvest approval page (timeframe, status filter, per-row
// approve or remind), Stripe invoices list (status badge with a tooltip, row opens the detail page),
// Instawork's disputes banner, Linear's fixed status order; drawn as Stripe's current lists (the
// statuses as boxes with their counts, the client as a filter pill, the pay period as a pill at the
// right of the title, the number of results under the table).
import { CircleAlertIcon, EllipsisIcon, InboxIcon, ListFilterIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { toast } from "sonner";
import { sendReminderAction, setApprovalRequiredAction } from "@/app/[locale]/(app)/approvals/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { ClientApprovalRow, ClientApprovalState } from "@/server/approvals/service";
import { useCan } from "../abilities";
import { EmptyState } from "../empty-state";
import { dateRange, hoursMinutes } from "../format";
import { FilterPill, ListToolbar, NavPill, PillChoices, ResultsCount, StatusTabs } from "../list-controls";
import { Page, PageHeader, TableFrame } from "../page";
import { Status, type Tone } from "../status";
import { SendDialog, type SendTarget } from "./send-dialog";
import { useDateTime } from "../agency-zone";

export const STATE_ORDER: ClientApprovalState[] = ["disputed", "not_sent", "send_again", "waiting", "approved"];
/**
 * One status language (_components/status.md): not sent is not started yet (neutral), new hours to send
 * need attention, waiting is the client's turn, approved is done, disputed needs the agency.
 */
const STATE_TONE: Record<ClientApprovalState, Tone> = { disputed: "critical", not_sent: "neutral", send_again: "warning", waiting: "info", approved: "success" };

export function ApprovalStateBadge({ state }: { state: ClientApprovalState }) {
  const t = useTranslations("approvals");
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" />}>
        <Status tone={STATE_TONE[state]} data-testid="approval-state">
          {t(`state.${state}`)}
        </Status>
      </TooltipTrigger>
      <TooltipContent>{t(`stateHint.${state}`)}</TooltipContent>
    </Tooltip>
  );
}

export function sendTargetOf(row: ClientApprovalRow, payPeriodId: string): SendTarget {
  return { clientId: row.clientId, clientName: row.clientName, payPeriodId, waiting: row.counts.waiting, waitingMinutes: row.waitingMinutes, needsReview: row.counts.needsReview, prefill: row.lastApprover };
}

export function ApprovalsView(props: { rows: ClientApprovalRow[]; periods: { id: string; startsOn: string; endsOn: string }[]; periodId: string; periodOpen: boolean }) {
  const t = useTranslations("approvals");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Decision 0026: asking clients is the hours ability; which clients must approve is the run's (Owner).
  const can = useCan();
  const mayAsk = can("hours");
  const [pending, start] = useTransition();
  const [sending, setSending] = useState<SendTarget | null>(null);
  const status = params.get("status") ?? "";
  const client = params.get("client") ?? "";
  const when = useDateTime();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  };
  const shown = props.rows.filter((r) => (status === "" || r.state === status) && (client === "" || r.clientId === client));
  const disputed = props.rows.reduce((sum, r) => sum + r.counts.disputed, 0);
  const setRequired = (clientId: string, required: boolean) =>
    start(async () => {
      const r = await setApprovalRequiredAction(clientId, required);
      if (!r.ok) toast.error(t.has(`errors.${r.error}`) ? t(`errors.${r.error}` as "errors.generic", { detail: "" }) : t("errors.generic"));
      router.refresh();
    });
  const remind = (requestId: string) =>
    start(async () => {
      const r = await sendReminderAction(requestId);
      if (r.ok) toast.success(t("done.reminded"));
      else toast.error(t.has(`errors.${r.error}`) ? t(`errors.${r.error}` as "errors.generic", { detail: r.detail ?? "" }) : t("errors.generic"));
      router.refresh();
    });

  return (
    <Page>
      <PageHeader
        title={t("title")}
        description={mayAsk ? undefined : t("readOnly")}
        actions={
          // Harvest's timeframe, as Stripe's date range pill.
          <NavPill
            label={t("period")}
            current={props.periodId}
            align="end"
            testId="period-filter"
            options={props.periods.map((p) => ({ value: p.id, label: dateRange(p.startsOn, p.endsOn, locale), href: { pathname: "/approvals", query: { period: p.id } } }))}
          />
        }
      />

      {disputed > 0 && (
        <Alert variant="destructive" data-testid="disputes-banner">
          <CircleAlertIcon />
          <AlertTitle>{t("disputesBanner", { count: disputed })}</AlertTitle>
          <AlertDescription>
            <Button size="sm" variant="outline" className="w-fit" onClick={() => setParam("status", "disputed")}>
              {t("showDisputed")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Harvest's status filter, in the address, as Stripe's boxes with their counts; the client as a pill. */}
      <StatusTabs
        label={t("filterStatus")}
        current={status || "all"}
        tabs={(["", ...STATE_ORDER] as const).map((s) => ({
          key: s || "all",
          label: s === "" ? t("all") : t(`state.${s}`),
          count: props.rows.filter((r) => (s === "" || r.state === s) && (client === "" || r.clientId === client)).length,
          href: { pathname: "/approvals", query: { period: props.periodId, ...(s ? { status: s } : {}), ...(client ? { client } : {}) } },
          testId: `status-chip-${s || "all"}`,
        }))}
      />
      <div className="flex min-w-0 flex-col">
        <ListToolbar>
          <FilterPill label={t("filterClient")} value={props.rows.find((r) => r.clientId === client)?.clientName} onClear={() => setParam("client", "")} testId="client-filter">
            <PillChoices heading={t("filterClient")} value={client} options={props.rows.map((r) => ({ value: r.clientId, label: r.clientName }))} onChoose={(v) => setParam("client", v)} />
          </FilterPill>
        </ListToolbar>

        {props.rows.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={
              <Link href="/convert" className={buttonVariants({ size: "sm" })}>
                {t("emptyLink")}
              </Link>
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState
            kind="filtered"
            icon={ListFilterIcon}
            title={t("noResults")}
            action={
              <Button variant="outline" size="sm" onClick={() => router.replace(`${pathname}?period=${props.periodId}`)}>
                {t("clearFilters")}
              </Button>
            }
          />
        ) : (
          <TableFrame className="flex flex-col gap-4">
            <Table aria-label={t("title")} data-testid="approvals-list">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colClient")}</TableHead>
                  <TableHead>{t("colApprover")}</TableHead>
                  <TableHead className="text-right">{t("colHours")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead>{t("colActivity")}</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">{t("colActions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {STATE_ORDER.map((state) => {
                  const group = shown.filter((r) => r.state === state);
                  if (group.length === 0) return null;
                  return (
                    <Fragment key={state}>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={6} className="text-[13px] font-semibold">
                          {t(`state.${state}`)} <span className="font-normal text-muted-foreground tabular-nums">{group.length}</span>
                        </TableCell>
                      </TableRow>
                      {group.map((r) => (
                        <TableRow key={r.clientId} data-testid="approval-row">
                          <TableCell className="font-medium">
                            <span className="inline-flex flex-wrap items-center gap-2">
                            {r.request ? (
                              <Link href={`/approvals/${r.request.id}`} className="underline-offset-4 hover:underline">
                                {r.clientName}
                              </Link>
                            ) : props.periodOpen && mayAsk ? (
                              <button type="button" className="text-left underline-offset-4 hover:underline" onClick={() => setSending(sendTargetOf(r, props.periodId))}>
                                {r.clientName}
                              </button>
                            ) : (
                              r.clientName
                            )}
                            {r.approvalRequired && (
                              <Badge variant="outline" data-testid="approval-required">
                                {t("requiredBadge")}
                              </Badge>
                            )}
                            </span>
                          </TableCell>
                          <TableCell>
                            {r.request ? (
                              <span className="flex flex-col">
                                <span>{r.request.approverName}</span>
                                <span className="text-xs text-muted-foreground">{r.request.approverEmail}</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">{t("noApprover")}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className="flex flex-col items-end">
                              <span>{t("shiftsHours", { shifts: r.shifts, hours: hoursMinutes(r.minutes) })}</span>
                              {r.counts.needsReview > 0 && <span className="text-xs text-destructive">{t("needsReview", { count: r.counts.needsReview })}</span>}
                            </span>
                          </TableCell>
                          <TableCell>
                            <ApprovalStateBadge state={r.state} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.lastActivity ? t(`activity.${r.lastActivity.kind}` as "activity.decided", { when: when(r.lastActivity.at) }) : "—"}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {/* A period whose files exist cannot be asked about any more: only Open. */}
                            {mayAsk && props.periodOpen && (r.state === "not_sent" || r.state === "send_again") ? (
                              <Button size="sm" variant="outline" disabled={pending} onClick={() => setSending(sendTargetOf(r, props.periodId))} data-testid="row-send">
                                {r.state === "not_sent" ? t("send") : t("sendAgain")}
                              </Button>
                            ) : mayAsk && props.periodOpen && r.state === "waiting" && r.request ? (
                              <Button size="sm" variant="outline" disabled={pending} onClick={() => remind(r.request!.id)}>
                                {t("remind")}
                              </Button>
                            ) : r.request ? (
                              <Link href={`/approvals/${r.request.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                                {t("open")}
                              </Link>
                            ) : null}
                            {can("run") && (
                              <DropdownMenu>
                                <DropdownMenuTrigger render={<Button size="icon-xs" variant="ghost" className="ml-1" aria-label={t("rowMenu", { client: r.clientName })} data-testid="row-menu" />}>
                                  <EllipsisIcon className="size-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuCheckboxItem checked={r.approvalRequired} disabled={pending} onCheckedChange={(on) => setRequired(r.clientId, on === true)} data-testid="toggle-approval-required">
                                    {t("approvalRequired")}
                                  </DropdownMenuCheckboxItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            <ResultsCount shown={shown.length} testId="approval-count" />
          </TableFrame>
        )}
      </div>
      {sending && <SendDialog target={sending} onClose={() => setSending(null)} />}
    </Page>
  );
}
