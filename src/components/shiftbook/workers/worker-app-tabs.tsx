"use client";

// Pattern: docs/patterns/workers/[id].md "Onboarding and messages" — Gusto's admin onboarding (the
// person's tasks; Send and continue texts them the link) and a WhatsApp thread with the worker.
import { CheckIcon, CircleIcon, MessageSquareTextIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { openWorkerFormAction, sendAgencyMessageAction, sendOnboardingLinkAction, setWorkerPhoneAction } from "@/app/[locale]/(app)/workers/worker-app-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import type { AgencyWorkerApp } from "@/server/worker-app/agency";
import { useCan } from "../abilities";
import { useConfirmed } from "../auth/confirm-access";
import { dateTime } from "../format";
import { Thread } from "../worker-app/thread";
import { EditButtons, Facts, Section, useEscapeCancels } from "./worker-profile";

const STEPS = ["personal", "w4", "i9", "payment", "policies", "sign"] as const;
const FORMS = ["w4", "i9", "deposit"] as const;

export function OnboardingTab({ workerId, app, zone }: { workerId: string; app: AgencyWorkerApp; zone: string }) {
  const t = useTranslations("workerAppAgency");
  const ts = useTranslations("workerApp.onboarding.steps");
  const tf = useTranslations("workerApp.more.forms");
  const locale = useLocale();
  const can = useCan();
  const mayChange = can("workerApp");
  const mayOpen = can("revealSsn");
  const router = useRouter();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sending, startSend] = useTransition();
  const [opening, setOpening] = useState<(typeof FORMS)[number] | null>(null);
  const confirmPhone = useConfirmed();
  useEscapeCancels(editing, () => setEditing(false));
  const when = (d: Date) => dateTime(d, locale, zone, { date: "medium", time: false });
  const o = app.onboarding;
  const signed = Boolean(o.signedAt);
  const forms = signed ? FORMS.filter((f) => f !== "deposit" || o.paymentKind === "direct_deposit") : [];

  return (
    <>
      <Section title={t("phone")} testId="worker-phone-section" onEdit={mayChange ? () => (setEditing(true), setPhone(""), setProblem(null)) : undefined} editing={editing}>
        {editing ? (
          <form
            className="flex max-w-sm flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await confirmPhone(() => setWorkerPhoneAction(workerId, phone));
                if (!r) return;
                if (r.ok) {
                  setEditing(false);
                  router.refresh();
                } else setProblem(t(`phoneErrors.${r.error === "invalid" || r.error === "taken" || r.error === "owner_required" ? r.error : "generic"}`));
              });
            }}
          >
            <Label htmlFor={`${id}-phone`}>{t("phone")}</Label>
            <Input id={`${id}-phone`} type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={app.phone ?? "(312) 555-0142"} autoFocus aria-invalid={problem ? true : undefined} data-testid="worker-phone-input" />
            {problem ? (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("phoneHint")}</p>
            )}
            <EditButtons pending={pending} onCancel={() => setEditing(false)} testId="worker-phone" />
          </form>
        ) : (
          <Facts rows={[[t("phone"), <span key="p" className="tabular-nums" data-testid="worker-phone-value">{app.phone ?? t("phoneNone")}</span>]]} />
        )}
      </Section>

      <Section
        title={t("checklist")}
        testId="worker-onboarding-section"
        actions={
          mayChange ? (
            <Button
              size="sm"
              variant="outline"
              disabled={sending || !app.phone}
              loading={sending}
              onClick={() =>
                startSend(async () => {
                  const r = await sendOnboardingLinkAction(workerId);
                  if (r.ok) {
                    toast.success(t("sent"));
                    router.refresh();
                  } else toast.error(r.error === "no_phone" ? t("noPhone") : t("phoneErrors.generic"));
                })
              }
              data-testid="send-onboarding-link"
            >
              <MessageSquareTextIcon />
              {t("send")}
            </Button>
          ) : undefined
        }
      >
        <p className="text-sm text-muted-foreground">{app.invitedAt ? t("sentOn", { date: when(app.invitedAt), by: app.invitedBy ?? "" }) : app.phone ? t("sendHint") : t("noPhone")}</p>
        <ol className="flex flex-col" data-testid="worker-onboarding-checklist">
          {STEPS.map((s) => {
            const at = o.progress.steps[s];
            return (
              <li key={s} className="flex items-center gap-3 border-b py-2.5 text-sm last:border-b-0" data-testid={`checklist-${s}`}>
                {at ? <CheckIcon className="size-4 text-emerald-600" aria-hidden /> : <CircleIcon className="size-4 text-muted-foreground" aria-hidden />}
                <span className="flex-1">{ts(s)}</span>
                <span className="text-muted-foreground">{at ? t("doneOn", { date: when(at) }) : t("todo")}</span>
              </li>
            );
          })}
        </ol>
        <Facts rows={[[ts("payment"), o.paymentKind === "direct_deposit" ? t("payment.direct_deposit", { last4: o.depositLast4 ?? "" }) : o.paymentKind === "paper_check" ? t("payment.paper_check") : t("payment.none")]]} />
      </Section>

      <Section title={t("forms")} testId="worker-forms-section">
        {forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("formsNone")}</p>
        ) : (
          <>
            <ul className="flex flex-col">
              {forms.map((f) => (
                <li key={f} className="flex items-center gap-3 border-b py-2.5 text-sm last:border-b-0">
                  <span className="flex-1">{tf(f)}</span>
                  {mayOpen && (
                    <Button size="sm" variant="ghost" onClick={() => setOpening(f)} data-testid={`open-form-${f}`}>
                      {t("open")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {!mayOpen && <p className="text-sm text-muted-foreground">{t("openOnlyOwner")}</p>}
          </>
        )}
      </Section>
      {opening && <OpenFormDialog workerId={workerId} kind={opening} onClose={() => setOpening(null)} />}
    </>
  );
}

function OpenFormDialog({ workerId, kind, onClose }: { workerId: string; kind: (typeof FORMS)[number]; onClose: () => void }) {
  const t = useTranslations("workerAppAgency");
  const tf = useTranslations("workerApp.more.forms");
  const tw = useTranslations("workers");
  const tc = useTranslations("common");
  const id = useId();
  const confirmed = useConfirmed();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("openTitle", { form: tf(kind) })}</DialogTitle>
          <DialogDescription>{t("openBody")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await confirmed(() => openWorkerFormAction(workerId, kind, reason));
              if (!r) return;
              if (r.ok) {
                const a = document.createElement("a");
                a.href = r.url;
                a.download = `${kind}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                onClose();
                router.refresh();
              } else setProblem(true);
            });
          }}
        >
          <Label htmlFor={`${id}-reason`}>{t("reason")}</Label>
          <Input id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" autoFocus maxLength={300} aria-invalid={problem ? true : undefined} data-testid="open-form-reason" />
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {tw("errors.reason_required")}
            </p>
          )}
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {tw("profile.cancel")}
            </Button>
            <Button type="submit" disabled={pending} loading={pending} loadingLabel={tc("loading")} data-testid="open-form-confirm">
              {t("open")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MessagesTab({ workerId, name, app, zone }: { workerId: string; name: string; app: AgencyWorkerApp; zone: string }) {
  const t = useTranslations("workerAppAgency");
  const tm = useTranslations("workerApp.messages");
  const mayWrite = useCan()("workerApp");
  return (
    <Section title={t("thread")} testId="worker-messages-section">
      <Thread
        messages={app.thread}
        viewer="agency"
        zone={zone}
        testId="agency-thread"
        labels={{ empty: t("threadEmpty", { name }), placeholder: t("placeholder", { name }), send: t("messageSend"), translated: t("translated"), errors: { empty: tm("errors.empty"), too_long: tm("errors.too_long"), generic: tm("errors.generic") } }}
        send={mayWrite ? (body) => sendAgencyMessageAction(workerId, body) : undefined}
      />
    </Section>
  );
}
