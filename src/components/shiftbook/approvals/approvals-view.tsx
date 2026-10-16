"use client";

// Pattern: docs/patterns/approvals.md — Harvest approval page (timeframe, status filter, per-row
// approve or remind), Stripe invoices list (status badge with a tooltip, row opens the detail page),
// Instawork's disputes banner, Linear's fixed status order.
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { ClientApprovalRow, ClientApprovalState } from "@/server/approvals/service";
import { useCan } from "../abilities";
import { EmptyState } from "../empty-state";
import { hoursMinutes, longDate } from "../format";
import { Page, PageHeader, TableFrame } from "../page";
import { Status, type Tone } from "../status";
import { SendDialog, type SendTarget } from "./send-dialog";

export const STATE_ORDER: ClientApprovalState[] = ["disputed", "not_sent", "send_again", "waiting", "approved"];
/** One status language (decision 0029): disputed needs the agency, waiting is the client's turn. */
const STATE_TONE: Record<ClientApprovalState, Tone> = { disputed: "critical", not_sent: "warning", send_again: "warning", waiting: "info", approved: "success" };

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
  const when = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

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
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("period")}</span>
            <NativeSelect value={props.periodId} onChange={(e) => router.replace(`${pathname}?period=${e.target.value}`)} className="w-80" aria-label={t("period")}>
              {props.periods.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {t("periodOption", { start: longDate(p.startsOn, locale), end: longDate(p.endsOn, locale) })}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
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

      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label={t("filterStatus")} value={status} onChange={(e) => setParam("status", e.target.value)} className="w-48">
          <NativeSelectOption value="">
            {t("filterStatus")}: {t("any")}
          </NativeSelectOption>
          {STATE_ORDER.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {t(`state.${s}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect aria-label={t("filterClient")} value={client} onChange={(e) => setParam("client", e.target.value)} className="w-64">
          <NativeSelectOption value="">
            {t("filterClient")}: {t("any")}
          </NativeSelectOption>
          {props.rows.map((r) => (
            <NativeSelectOption key={r.clientId} value={r.clientId}>
              {r.clientName}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {(status || client) && (
          <Button size="sm" variant="ghost" onClick={() => router.replace(`${pathname}?period=${props.periodId}`)}>
            {t("clearFilters")}
          </Button>
        )}
      </div>

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
        <TableFrame>
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
                      <TableCell colSpan={6} className="text-sm font-medium">
                        {t(`state.${state}`)} <span className="text-muted-foreground">{group.length}</span>
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
                            <span>{t("shiftsHours", { shifts: r.counts.waiting + r.counts.approved + r.counts.disputed, hours: hoursMinutes(r.minutes) })}</span>
                            {r.counts.needsReview > 0 && <span className="text-xs text-destructive">{t("needsReview", { count: r.counts.needsReview })}</span>}
                          </span>
                        </TableCell>
                        <TableCell>
                          <ApprovalStateBadge state={r.state} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.lastActivity ? t(`activity.${r.lastActivity.kind}` as "activity.decided", { when: when(r.lastActivity.at) }) : ""}</TableCell>
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
                              <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" className="ml-1" aria-label={t("rowMenu", { client: r.clientName })} data-testid="row-menu" />}>
                                <EllipsisIcon />
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
        </TableFrame>
      )}
      {sending && <SendDialog target={sending} onClose={() => setSending(null)} />}
    </Page>
  );
}
