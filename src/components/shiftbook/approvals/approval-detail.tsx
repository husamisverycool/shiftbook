"use client";

// Pattern: docs/patterns/approvals/[id].md — Stripe invoice detail (status, actions that fit it, a
// timeline, the emails sent); Bullhorn One activity; Harvest approvals log and "withdraw approval";
// Instawork hour disputes (recorded against proposed hours, the reason, the change); Stripe dispute
// response (accept, or reply).
import { MailIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { sendReminderAction, settleDisputeAction, withdrawApprovalAction, type ApprovalActionResult } from "@/app/[locale]/(app)/approvals/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import type { ApprovalDetail } from "@/server/approvals/service";
import { useCan } from "../abilities";
import { clock, hoursMinutes, longDate, shortDate } from "../format";
import { LinkedText } from "../linked-text";
import { Crumbs, Page, PageHeader, Section } from "../page";
import { ApprovalStateBadge } from "./approvals-view";
import { HoursTable } from "./hours-table";
import { SendDialog, type SendTarget } from "./send-dialog";
import { Status, type Tone } from "../status";
import { useDateTime } from "../agency-zone";

type Email = ApprovalDetail["emails"][number];
type Dispute = ApprovalDetail["disputes"][number];

/** One status language (_components/status.md): an email going out waits, sent is done, one not sent failed. */
const EMAIL_TONE: Record<Email["status"], Tone> = { sending: "info", sent: "success", failed: "critical" };

/** Text with its web links clickable (the demo copy's approval link). */
export function ApprovalDetailView({ detail, demo }: { detail: ApprovalDetail; demo: boolean }) {
  const t = useTranslations("approvals");
  const td = useTranslations("approvals.detail");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  // Decision 0026: reminding, changing the approver, withdrawing and settling disputes are the hours ability.
  const mayAsk = useCan()("hours");
  const [pending, start] = useTransition();
  const [sending, setSending] = useState<SendTarget | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [keeping, setKeeping] = useState<Dispute | null>(null);
  const [text, setText] = useState("");
  const [email, setEmail] = useState<Email | null>(null);
  const r = detail.request;
  const when = useDateTime();
  const errorText = (res: Extract<ApprovalActionResult, { ok: false }>) => (t.has(`errors.${res.error}`) ? t(`errors.${res.error}` as "errors.generic", { detail: res.detail ?? "" }) : t("errors.generic"));
  const run = (fn: () => Promise<ApprovalActionResult>, done: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(done);
        after?.();
      } else toast.error(errorText(res));
      router.refresh();
    });

  const waiting = detail.shifts.filter((x) => x.state === "waiting");
  const approved = detail.shifts.filter((x) => x.state === "approved");
  const target = (prefill: SendTarget["prefill"]): SendTarget => ({
    clientId: r.clientId,
    clientName: detail.clientName,
    payPeriodId: detail.period.id,
    waiting: waiting.length,
    waitingMinutes: waiting.reduce((sum, x) => sum + x.minutes, 0),
    needsReview: detail.needsReview,
    prefill,
  });
  const open = detail.disputes.filter((d) => d.status === "open");
  const settled = detail.disputes.filter((d) => d.status !== "open");
  const active = r.status === "open" && detail.periodOpen;

  const timeline: { at: Date; node: ReactNode; key: string }[] = [
    ...detail.history.map((h, i) => ({
      key: `h${i}`,
      at: h.at,
      node: (
        <div className="flex flex-col">
          <span>{td.has(`event.${h.event}`) ? td(`event.${h.event}` as "event.sent", { approverEmail: "", newApproverEmail: "", typedName: "", approved: 0, disputed: 0, ...(h.details as Record<string, string | number>) }) : h.event}</span>
          {h.reason && <span className="text-muted-foreground">“{h.reason}”</span>}
          {/* An opening has no person behind it: its record's "who" repeats what the line already says. */}
          {h.event !== "link_opened" && <span className="text-xs text-muted-foreground">{h.details.automatic === true ? td("automatic") : h.actor}</span>}
        </div>
      ),
    })),
    ...detail.emails.map((e) => ({
      key: e.id,
      at: e.createdAt,
      node: (
        <div className="flex flex-wrap items-center gap-2">
          <MailIcon className="size-4 text-muted-foreground" />
          <span>
            {td(`emailKind.${e.kind}`)} → {e.toEmail}
          </span>
          <Status tone={EMAIL_TONE[e.status]} data-testid="email-status">
            {td(`emailStatus.${e.status}`)}
          </Status>
          <Button size="sm" variant="ghost" onClick={() => setEmail(e)} data-testid="view-email">
            {td("viewEmail")}
          </Button>
        </div>
      ),
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const times = (x: { inMinute: number | null; outMinute: number | null; breakMinutes: number | null }) => `${clock(x.inMinute, locale)} – ${clock(x.outMinute, locale)} · ${x.breakMinutes ?? 0} min`;

  return (
    <Page>
      <PageHeader
        context={<Crumbs label={tc("breadcrumb")} items={[{ label: td("back"), href: { pathname: "/approvals", query: { period: detail.period.id } } }]} />}
        title={`${detail.clientName} · ${t("periodOption", { start: longDate(detail.period.startsOn, locale), end: longDate(detail.period.endsOn, locale) })}`}
        status={<ApprovalStateBadge state={detail.state} />}
        description={
          <span className="flex flex-col gap-1">
            <span>{td("sentTo", { name: r.approverName, email: r.approverEmail, language: t(r.locale === "es" ? "spanish" : "english") })}</span>
            {!mayAsk && <span>{t("readOnly")}</span>}
            {detail.needsReview > 0 && <span className="text-destructive">{td("needsReview", { count: detail.needsReview })}</span>}
          </span>
        }
        actions={
          active && mayAsk ? (
            <>
              {waiting.length > 0 && (
                <Button variant="outline" size="sm" disabled={pending} onClick={() => setSending(target(null))}>
                  {td("changeApprover")}
                </Button>
              )}
              {approved.length > 0 && (
                <Button variant="outline" size="sm" disabled={pending} onClick={() => setWithdrawing(true)}>
                  {td("withdraw")}
                </Button>
              )}
              {detail.state === "waiting" && (
                <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => sendReminderAction(r.id), t("done.reminded"))}>
                  {t("remind")}
                </Button>
              )}
              {detail.state === "send_again" && (
                <Button size="sm" disabled={pending} onClick={() => setSending(target({ name: r.approverName, email: r.approverEmail, locale: r.locale }))} data-testid="send-again">
                  {t("sendAgain")}
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {detail.disputes.length > 0 && (
        <Section id="disputes-title" title={td("disputesTitle")}>
          <div className="flex flex-col divide-y">
          {open.map((d) => {
            const proposed = d.proposedInMinute !== null && d.proposedOutMinute !== null && d.proposedBreakMinutes !== null ? { inMinute: d.proposedInMinute, outMinute: d.proposedOutMinute, breakMinutes: d.proposedBreakMinutes } : null;
            const proposedMinutes = proposed ? proposed.outMinute - proposed.inMinute - proposed.breakMinutes : null;
            return (
              <article key={d.id} className="flex flex-col gap-3 py-4 first:pt-1" data-testid="dispute-card">
                <h3 className="font-medium">
                  {d.workerName} · {shortDate(d.shift.workDate, locale)}
                </h3>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">{td("recorded")}</dt>
                    <dd className="tabular-nums">
                      {times(d.shift)} · {hoursMinutes(d.shift.minutes)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{td("clientTimes")}</dt>
                    <dd className="tabular-nums">{proposed ? `${times(proposed)} · ${hoursMinutes(proposedMinutes)}` : td("noProposal")}</dd>
                  </div>
                  {proposedMinutes !== null && (
                    <div>
                      <dt className="text-muted-foreground">{td("change")}</dt>
                      <dd className="tabular-nums">
                        {proposedMinutes - d.shift.minutes > 0 ? "+" : ""}
                        {hoursMinutes(proposedMinutes - d.shift.minutes)}
                      </dd>
                    </div>
                  )}
                  <div className="sm:col-span-3">
                    <dt className="text-muted-foreground">{td("clientReason")}</dt>
                    <dd>{d.reason}</dd>
                  </div>
                </dl>
                {detail.periodOpen && mayAsk && (
                  <div className="flex flex-wrap gap-2">
                    {proposed && (
                      <Button size="sm" disabled={pending} onClick={() => run(() => settleDisputeAction(d.id, "accept", ""), t("done.settled"))} data-testid="accept-dispute">
                        {td("accept")}
                      </Button>
                    )}
                    <Link href={{ pathname: "/convert", query: { period: detail.period.id, step: "hours", q: d.workerName } }} className={buttonVariants({ size: "sm", variant: "outline" })}>
                      {td("edit")}
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        setText("");
                        setKeeping(d);
                      }}
                    >
                      {td("keep")}
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
          </div>
          {settled.length > 0 && (
            <ul className="flex flex-col divide-y border-t text-sm">
              {settled.map((d) => (
                <li key={d.id} className="py-2.5">
                  <span className="font-medium">
                    {d.workerName} · {shortDate(d.shift.workDate, locale)}
                  </span>
                  : {td(`settled.${d.status as "accepted" | "edited" | "kept"}`)}
                  {d.reply ? ` — “${d.reply}”` : ""}
                  {d.resolvedAt && <span className="text-muted-foreground"> ({td("settledBy", { who: d.resolvedByLabel ?? "", when: when(d.resolvedAt) })})</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section id="hours-title" title={td("hoursTitle")}>
        <HoursTable shifts={detail.shifts} period={detail.period} />
      </Section>

      <Section id="history-title" title={td("historyTitle")}>
        <ol className="flex flex-col divide-y" data-testid="history">
          {timeline.map((item) => (
            <li key={item.key} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:gap-6">
              <time className="w-44 shrink-0 text-muted-foreground tabular-nums">{when(item.at)}</time>
              <div className="min-w-0">{item.node}</div>
            </li>
          ))}
        </ol>
      </Section>

      {sending && <SendDialog target={sending} onClose={() => setSending(null)} />}

      <Dialog open={withdrawing} onOpenChange={setWithdrawing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{td("withdrawTitle")}</DialogTitle>
            <DialogDescription>{td("withdrawBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="withdraw-reason">{td("reason")}</Label>
            <Textarea id="withdraw-reason" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawing(false)}>
              {t("cancel")}
            </Button>
            <Button disabled={pending || text.trim() === ""} onClick={() => run(() => withdrawApprovalAction(r.id, text), t("done.withdrawn"), () => setWithdrawing(false))}>
              {td("withdrawConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={keeping !== null} onOpenChange={(o) => !o && setKeeping(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{td("keepTitle")}</DialogTitle>
            <DialogDescription>{td("keepBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="keep-reply">{td("reply")}</Label>
            <Textarea id="keep-reply" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeeping(null)}>
              {t("cancel")}
            </Button>
            <Button disabled={pending || text.trim() === ""} onClick={() => keeping && run(() => settleDisputeAction(keeping.id, "keep", text), t("done.settled"), () => setKeeping(null))}>
              {td("keepConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={email !== null} onOpenChange={(o) => !o && setEmail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{email ? td(`emailKind.${email.kind}`) : ""}</DialogTitle>
            <DialogDescription>{td("linkHidden")}</DialogDescription>
          </DialogHeader>
          {email && (
            <div className="flex min-w-0 flex-col gap-3 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">{td("emailTo")}</dt>
                <dd className="break-all">{email.toName ? `${email.toName} <${email.toEmail}>` : email.toEmail}</dd>
                <dt className="text-muted-foreground">{td("emailSubject")}</dt>
                <dd>{email.subject}</dd>
                <dt className="text-muted-foreground">{td("emailSentAt")}</dt>
                <dd>
                  {email.sentAt ? when(email.sentAt) : "—"} · {td(`emailStatus.${email.status}`)}
                  {email.error ? ` (${email.error})` : ""}
                </dd>
              </dl>
              {/* A scrolling box is reachable from the keyboard (WCAG 2.1.1). */}
              <pre tabIndex={0} aria-label={email.subject} className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-sans whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {email.textBody}
              </pre>
              {demo && email.demoCopy && (
                <div className="flex flex-col gap-2" data-testid="demo-copy">
                  <p className="font-medium">{td("demoCopy")}</p>
                  <div tabIndex={0} aria-label={td("demoCopy")} className="max-h-64 overflow-auto rounded-md border p-3 whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <LinkedText text={email.demoCopy.textBody} />
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Page>
  );
}
