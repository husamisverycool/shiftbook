"use client";

// Patterns: docs/patterns/approve/[token].md (Bullhorn approval page; Upwork dispute form; TempWorks
// confirmation; Stripe hosted page states) inside docs/patterns/_layouts/portal.md (Stripe hosted
// invoice page frame: the business's name on top, its contact details at the foot).
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { newLinkAction, removeDisputeAction, saveDisputeAction, submitDecisionAction } from "@/app/[locale]/(portal)/approve/[token]/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { PortalAgency, PortalView } from "@/server/approvals/service";
import { clock, dateTime, hoursMinutes, longDate, shortDate } from "../format";
import { HoursTable, type ShiftView } from "./hours-table";

const contactOf = (a: PortalAgency) => [a.phone, a.email].filter(Boolean).join(" · ");

function Frame({ agency, children }: { agency: PortalAgency | null; children: ReactNode }) {
  const t = useTranslations("portal");
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl min-w-0 items-center gap-4 px-4 py-3">
          <p className="mr-auto truncate font-semibold">{agency?.name ?? ""}</p>
          <nav aria-label={t("language")} className="flex items-center gap-3 text-sm">
            {(["en", "es"] as const).map((l) => (
              <Link key={l} href={pathname} locale={l} aria-current={l === locale ? "true" : undefined} className={l === locale ? "font-medium" : "text-muted-foreground underline-offset-4 hover:underline"}>
                {t(l === "en" ? "english" : "spanish")}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl min-w-0 flex-1 flex-col gap-6 px-4 py-8">{children}</main>
      {agency && (
        <footer className="border-t">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-4 text-sm text-muted-foreground">
            {contactOf(agency) && <p>{t("contact", { agency: agency.name, contact: contactOf(agency) })}</p>}
            <p>{t("providedBy", { agency: agency.name })}</p>
          </div>
        </footer>
      )}
    </>
  );
}

/** A state with nothing to act on but, at most, one button (Stripe: say what happened, who to contact). */
function Notice({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" data-testid="portal-notice">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
      {children}
    </section>
  );
}

export function ApprovalPortal({ view, token }: { view: PortalView; token: string }) {
  const t = useTranslations("portal");
  if (view.state === "invalid")
    return (
      <Frame agency={null}>
        <Notice title={t("invalid.title")} body={t("invalid.body")} />
      </Frame>
    );
  if (view.state === "replaced")
    return (
      <Frame agency={view.agency}>
        <Notice title={t("replaced.title")} body={t("replaced.body", { agency: view.agency.name })} />
      </Frame>
    );
  if (view.state === "expired")
    return (
      <Frame agency={view.agency}>
        <Expired token={token} agency={view.agency} canRenew={view.canRenew} />
      </Frame>
    );
  return (
    <Frame agency={view.agency}>
      <Active view={view} token={token} />
    </Frame>
  );
}

function Expired({ token, agency, canRenew }: { token: string; agency: PortalAgency; canRenew: boolean }) {
  const t = useTranslations("portal");
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  return (
    <Notice title={t("expired.title")} body={canRenew ? t("expired.body", { agency: agency.name }) : t("expired.closed", { agency: agency.name })}>
      {canRenew &&
        (sent ? (
          <p role="status" className="font-medium">
            {t("expired.sent")}
          </p>
        ) : (
          <Button
            className="w-fit"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await newLinkAction(token);
                if (r.ok) setSent(true);
                else toast.error(t.has(`errors.${r.error}`) ? t(`errors.${r.error}` as "errors.generic") : t("errors.generic"));
              })
            }
          >
            {t("expired.newLink")}
          </Button>
        ))}
    </Notice>
  );
}

type ActiveView = Extract<PortalView, { state: "active" | "closed" }>;

function Active({ view, token }: { view: ActiveView; token: string }) {
  const t = useTranslations("portal");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [disputing, setDisputing] = useState<ShiftView | null>(null);
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const closed = view.state === "closed";
  const agency = view.agency.name;
  const errorText = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}` as "errors.generic") : t("errors.generic"));

  const waiting = view.shifts.filter((x) => x.state === "waiting");
  const drafts = waiting.filter((x) => x.draft !== null);
  const toApprove = waiting.filter((x) => x.draft === null);
  const latest = view.decisions[0];
  const decided = latest ? t("status.approved", { when: dateTime(latest.decidedAt, locale, view.agency.timeZone, { date: "long" }), name: latest.typedName }) : null;
  // What the page says about itself (Stripe's hosted page shows its own state): the latest decision,
  // then what waits — on the approver, or on the agency for disputed shifts.
  const status = closed
    ? []
    : [
        ...(decided && latest!.approved > 0 ? [decided] : []),
        ...(view.shifts.some((x) => x.state === "disputed") ? [t("status.disputed", { agency })] : []),
        ...(waiting.length > 0 ? [latest ? t("status.newHours") : t("status.waiting")] : []),
      ];

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) done?.();
      else toast.error(errorText(r.error));
      router.refresh();
    });

  const shiftActions = (x: ShiftView) =>
    closed || x.state !== "waiting" ? null : x.draft ? (
      <span className="inline-flex gap-1">
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDisputing(x)}>
          {t("editDispute")}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeDisputeAction(token, x.entryId))}>
          {t("removeDispute")}
        </Button>
      </span>
    ) : (
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setDisputing(x)} data-testid="dispute-shift">
        {t("dispute")}
      </Button>
    );
  const shiftNote = (x: ShiftView): ReactNode =>
    x.draft ? (
      <span className="text-foreground">
        <b>{t("willDispute")}:</b> {x.draft.reason}
      </span>
    ) : x.dispute ? (
      t("clientDispute", { reason: x.dispute.reason })
    ) : x.keptReply ? (
      t("keptReply", { agency, reply: x.keptReply })
    ) : null;

  return (
    <>
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title", { client: view.clientName })}</h1>
        <p className="text-muted-foreground">{t("period", { start: longDate(view.period.startsOn, locale), end: longDate(view.period.endsOn, locale) })}</p>
        <p className="text-sm text-muted-foreground">{t("sentTo", view.approver)}</p>
      </section>
      {closed ? (
        <Notice title={t("closed.title")} body={t("closed.body", { agency })} />
      ) : (
        status.length > 0 && (
          <div role="status" className="flex flex-col gap-1 font-medium" data-testid="portal-status">
            {status.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )
      )}

      <HoursTable shifts={view.shifts} period={view.period} shiftActions={closed ? undefined : shiftActions} shiftNote={shiftNote} initiallyOpen={[...new Set(view.shifts.filter((x) => x.draft || x.keptReply || x.dispute).map((x) => x.workerId))]} />

      {!closed &&
        (waiting.length === 0 ? (
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <p>{t("nothingWaiting")}</p>
            <p>{t("final", { agency })}</p>
          </div>
        ) : (
          <section className="flex flex-col gap-4 rounded-xl border bg-card p-4" aria-labelledby="approve-title" data-testid="approve-bar">
            <h2 id="approve-title" className="text-lg font-semibold">
              {t("approveTitle")}
            </h2>
            <div className="flex flex-col gap-1">
              <p>{t("approveSummary", { shifts: toApprove.length, hours: hoursMinutes(toApprove.reduce((sum, x) => sum + x.minutes, 0)) })}</p>
              {drafts.length > 0 && <p>{t("disputeSummary", { count: drafts.length, agency })}</p>}
            </div>
            <div className="flex max-w-sm flex-col gap-2">
              <Label htmlFor="approver-name">{t("fullName")}</Label>
              <Input id="approver-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox id="attest" checked={confirmed} onCheckedChange={(on) => setConfirmed(on === true)} />
              <Label htmlFor="attest" className="leading-snug font-normal">
                {t("attestation", { client: view.clientName })}
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">{t("evidence")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={pending || name.trim().length < 2 || !confirmed}
                data-testid="approve-hours"
                onClick={() =>
                  run(
                    () => submitDecisionAction(token, { typedName: name, confirmed, snapshot: view.snapshot, locale }),
                    () => toast.success(t("done")),
                  )
                }
              >
                {toApprove.length > 0 ? t("approveButton") : t("sendDisputesButton")}
              </Button>
              <p className="text-sm text-muted-foreground">{t("final", { agency })}</p>
            </div>
          </section>
        ))}

      {disputing && (
        <DisputeDialog
          shift={disputing}
          agency={agency}
          pending={pending}
          onClose={() => setDisputing(null)}
          onSave={(reason, proposed) => run(() => saveDisputeAction(token, disputing.entryId, reason, proposed), () => setDisputing(null))}
        />
      )}
    </>
  );
}

const toInput = (minute: number | null) => (minute === null ? "" : `${String(Math.trunc(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
/** "HH:MM" → minutes; an end at 00:00 after a later start is midnight at the end of the day (1440). */
const fromInput = (value: string, asEndAfter?: number) => {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const minute = Number(m[1]) * 60 + Number(m[2]);
  return asEndAfter !== undefined && minute === 0 && asEndAfter > 0 ? 1440 : minute;
};

function DisputeDialog(props: { shift: ShiftView; agency: string; pending: boolean; onClose: () => void; onSave: (reason: string, proposed: { inMinute: number; outMinute: number; breakMinutes: number } | null) => void }) {
  const t = useTranslations("portal");
  const locale = useLocale();
  const x = props.shift;
  const [start, setStart] = useState(props.shift.draft?.proposed ? toInput(props.shift.draft.proposed.inMinute) : "");
  const [end, setEnd] = useState(props.shift.draft?.proposed ? toInput(props.shift.draft.proposed.outMinute) : "");
  const [brk, setBrk] = useState(props.shift.draft?.proposed ? String(props.shift.draft.proposed.breakMinutes) : "");
  const [reason, setReason] = useState(props.shift.draft?.reason ?? "");
  // A shift recorded as a day's total (no clock times) is disputed with a reason only.
  const clocked = x.inMinute !== null && x.outMinute !== null;

  const save = () => {
    // A field left empty keeps what is recorded; nothing filled in means no corrected times.
    const any = clocked && (start !== "" || end !== "" || brk !== "");
    const inMinute = start !== "" ? (fromInput(start) ?? -1) : (x.inMinute ?? -1);
    const proposed = any
      ? {
          inMinute,
          outMinute: end !== "" ? (fromInput(end, inMinute) ?? -1) : (x.outMinute ?? -1),
          breakMinutes: brk !== "" ? (/^\d{1,3}$/.test(brk) ? Number(brk) : -1) : (x.breakMinutes ?? 0),
        }
      : null;
    props.onSave(reason, proposed);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("disputeTitle")}</DialogTitle>
          <DialogDescription>
            {t("disputeShift", { worker: x.workerName, day: shortDate(x.workDate, locale), start: clock(x.inMinute, locale), end: clock(x.outMinute, locale), break: x.breakMinutes ?? 0, hours: hoursMinutes(x.minutes) })}
          </DialogDescription>
        </DialogHeader>
        {clocked && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{t("correctedTimes")}</legend>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="dispute-start">{t("start")}</Label>
                <Input id="dispute-start" type="time" value={start} placeholder={toInput(x.inMinute)} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="dispute-end">{t("end")}</Label>
                <Input id="dispute-end" type="time" value={end} placeholder={toInput(x.outMinute)} onChange={(e) => setEnd(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="dispute-break">{t("breakMinutes")}</Label>
                <Input id="dispute-break" inputMode="numeric" value={brk} placeholder={String(x.breakMinutes ?? 0)} onChange={(e) => setBrk(e.target.value)} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{t("currentTimesHint")}</p>
          </fieldset>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="dispute-reason">{t("reason")}</Label>
          <Textarea id="dispute-reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby="dispute-reason-hint" />
          <p id="dispute-reason-hint" className="text-sm text-muted-foreground">
            {t("reasonHint", { agency: props.agency })}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={save} disabled={props.pending || reason.trim() === ""} data-testid="save-dispute">
            {t("saveDispute")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
