"use client";

// Pattern: docs/patterns/invoices/[id].md §5 Payments — Stripe invoice payment history; QuickBooks
// Online Receive payment from the invoice and the manual reminder; FreshBooks reminder template
// variables; TempWorks small-balance write-off and short pay reasons.
import { CopyIcon, MailIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { reminderAction, shortPayAction, writeOffAction } from "@/app/[locale]/(app)/payments/actions";
import { Badge } from "@/components/ui/badge";
import { Section } from "../page";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { centsToInput, parseDollars } from "@/lib/amounts";
import type { InvoiceReceivables, PaymentClients } from "@/server/receivables/queries";
import { longDate, money } from "../format";
import { PaymentDialog } from "./payment-dialog";
import { useDateTime } from "../agency-zone";

const WRITE_OFF_REASONS = ["small_balance", "disputed_hours", "rate_difference", "bank_fee", "bad_debt", "other"] as const;
const SHORT_PAY_REASONS = ["disputed_hours", "rate_difference", "bank_fee", "client_deduction", "unknown", "other"] as const;
const STAGES = ["before_due", "overdue", "final"] as const;
type Stage = (typeof STAGES)[number];
type Problem = { field: string; rule: string };

export function InvoicePayments({ invoiceId, number, clientId, ar, clients, today, canChange }: { invoiceId: string; number: string; clientId: string; ar: InvoiceReceivables; clients: PaymentClients; today: string; canChange: boolean }) {
  const t = useTranslations("invoicePayments");
  const tp = useTranslations("payments");
  const locale = useLocale();
  const [dialog, setDialog] = useState<"pay" | "writeOff" | "short" | "remind" | "credit" | null>(null);
  const open = ar.balanceCents > 0;
  // More credited than was still owed: the client's credit, to apply to its other invoices (decision 0019).
  const credit = ar.balanceCents < 0;
  const when = useDateTime();
  const dateTime = (at: Date | string) => when(at, { time: false });

  return (
    <Section
      id="payments-title"
      title={t("title")}
      actions={
        canChange && open ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setDialog("remind")} data-testid="prepare-reminder">
              {t("prepareReminder")}
            </Button>
            {ar.shortPaid && (
              <Button size="sm" variant="outline" onClick={() => setDialog("writeOff")} data-testid="write-off">
                {t("writeOff")}
              </Button>
            )}
            <Button size="sm" onClick={() => setDialog("pay")} data-testid="invoice-record-payment">
              {t("recordPayment")}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col divide-y text-sm" data-testid="invoice-payments">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span className="font-medium">{credit ? t("creditForClient") : t("balance")}</span>
          <span className="flex items-center gap-3">
            {credit && canChange && (
              <Button size="sm" variant="outline" onClick={() => setDialog("credit")} data-testid="apply-invoice-credit">
                {t("applyCredit")}
              </Button>
            )}
            <span className="text-base font-semibold tabular-nums" data-testid="invoice-balance">
              {ar.balanceCents === 0 ? t("paidInFull") : money(Math.abs(ar.balanceCents), locale)}
            </span>
          </span>
        </div>
        {ar.payments.map((p) => (
          <div key={p.paymentId} className={`flex items-baseline justify-between gap-6 py-3 ${p.voided ? "text-muted-foreground line-through" : ""}`} data-testid="invoice-payment">
            <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
              <Link href={`/payments?client=${clientId}`} className="underline-offset-4 hover:underline">
                {t("payment", { date: longDate(p.receivedOn, locale), method: tp(`methods.${p.method}`) })}
              </Link>
              {p.reference && <span className="text-muted-foreground">{p.reference}</span>}
              {p.voided && <Badge variant="outline">{tp("statuses.voided")}</Badge>}
            </span>
            <span className="shrink-0 tabular-nums">−{money(p.amountCents, locale)}</span>
          </div>
        ))}
        {ar.credits.map((c) => (
          <div key={c.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3" data-testid="invoice-credit">
            <Link href={`/invoices/${c.id}`} className="underline-offset-4 hover:underline">
              {t("credit", { number: c.number, date: longDate(c.issuedOn, locale) })}
            </Link>
            <span className="tabular-nums">−{money(c.amountCents, locale)}</span>
          </div>
        ))}
        {ar.creditApplications.map((c) => (
          <div key={c.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3" data-testid="invoice-credit-application">
            <span className="flex flex-col">
              <Link href={`/invoices/${c.invoiceId}`} className="underline-offset-4 hover:underline">
                {t(c.direction === "in" ? "creditIn" : "creditOut", { number: c.number, date: longDate(c.appliedOn, locale) })}
              </Link>
              <span className="text-xs text-muted-foreground">{c.by}</span>
            </span>
            <span className="tabular-nums">
              {c.direction === "in" ? "−" : "+"}
              {money(c.amountCents, locale)}
            </span>
          </div>
        ))}
        {ar.writeOffs.map((w) => (
          <div key={w.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3" data-testid="invoice-write-off">
            <span className="flex flex-col">
              <span>{t("writtenOff", { date: longDate(w.writtenOn, locale), reason: t(`writeOffReasons.${w.reason}`) })}</span>
              <span className="text-xs text-muted-foreground">{w.note ? `${w.note} · ${w.by}` : w.by}</span>
            </span>
            <span className="tabular-nums">−{money(w.amountCents, locale)}</span>
          </div>
        ))}
        {ar.shortPaid && (
          <div className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="short-pay">
            <span className="flex flex-col">
              <span>{ar.shortPay ? t("shortReason", { reason: t(`shortReasons.${ar.shortPay.reason}`) }) : t("shortNoReason")}</span>
              {ar.shortPay && <span className="text-xs text-muted-foreground">{ar.shortPay.note ? `${ar.shortPay.note} · ${ar.shortPay.by}` : ar.shortPay.by}</span>}
            </span>
            {canChange && (
              <Button size="sm" variant="outline" onClick={() => setDialog("short")} data-testid="short-reason">
                {ar.shortPay ? t("changeReason") : t("recordReason")}
              </Button>
            )}
          </div>
        )}
        {ar.reminders.map((r, i) => (
          <div key={i} className="py-3 text-muted-foreground" data-testid="reminder-prepared">
            {t("reminderPrepared", { date: dateTime(r.at), stage: t(`stages.${r.stage}`), language: t(`languages.${r.locale}`), by: r.by })}
          </div>
        ))}
      </div>
      {!canChange && <p className="text-sm text-muted-foreground">{tp("readOnly")}</p>}
      {dialog === "pay" && <PaymentDialog clients={clients} mode={{ kind: "record", clientId, invoiceId }} today={today} onClose={() => setDialog(null)} />}
      {dialog === "credit" && <PaymentDialog clients={clients} mode={{ kind: "credit", fromInvoiceId: invoiceId, clientId, unusedCents: -ar.balanceCents }} today={today} onClose={() => setDialog(null)} />}
      {dialog === "writeOff" && <WriteOffDialog invoiceId={invoiceId} number={number} balanceCents={ar.balanceCents} onClose={() => setDialog(null)} />}
      {dialog === "short" && <ShortPayDialog invoiceId={invoiceId} current={ar.shortPay} onClose={() => setDialog(null)} />}
      {dialog === "remind" && <ReminderDialog invoiceId={invoiceId} reminder={ar.reminder} onClose={() => setDialog(null)} />}
    </Section>
  );
}

function WriteOffDialog({ invoiceId, number, balanceCents, onClose }: { invoiceId: string; number: string; balanceCents: number; onClose: () => void }) {
  const t = useTranslations("invoicePayments");
  const tp = useTranslations("payments");
  const locale = useLocale();
  const router = useRouter();
  const [amount, setAmount] = useState(centsToInput(balanceCents));
  const [reason, setReason] = useState<(typeof WRITE_OFF_REASONS)[number] | "">("");
  const [note, setNote] = useState("");
  const [problems, setProblems] = useState<Problem[]>([]);
  const [pending, start] = useTransition();
  const problem = (field: string) => problems.find((p) => p.field === field);
  const save = () =>
    start(async () => {
      const r = await writeOffAction(invoiceId, { amountCents: parseDollars(amount) ?? -1, reason, note: note.trim() || null });
      if (r.ok) {
        toast.success(t("writtenOffToast"));
        onClose();
        router.refresh();
      } else if (r.error === "invalid") setProblems(r.problems);
      else toast.error(tp(`errors.${r.error}` as "errors.generic"));
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("writeOffTitle", { number })}</DialogTitle>
          <DialogDescription>{t("writeOffBody", { balance: money(balanceCents, locale) })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="write-off-amount">{t("amount")}</Label>
            <Input id="write-off-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!problem("amountCents")} aria-describedby={problem("amountCents") ? "write-off-amount-error" : undefined} className="w-40 tabular-nums" />
            {problem("amountCents") && (
              <p id="write-off-amount-error" className="text-sm text-destructive">
                {tp(`rules.${problem("amountCents")!.rule}` as "rules.amount")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="write-off-reason">{t("reason")}</Label>
            <NativeSelect id="write-off-reason" className="w-full" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} aria-invalid={!!problem("reason")}>
              <NativeSelectOption value="">{t("chooseReason")}</NativeSelectOption>
              {WRITE_OFF_REASONS.map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {t(`writeOffReasons.${r}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {problem("reason") && <p className="text-sm text-destructive">{tp("rules.choose_reason")}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="write-off-note">{t("note")}</Label>
            <Textarea id="write-off-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tp("cancel")}
          </Button>
          <Button onClick={save} disabled={pending} data-testid="confirm-write-off">
            {t("writeOff")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShortPayDialog({ invoiceId, current, onClose }: { invoiceId: string; current: InvoiceReceivables["shortPay"]; onClose: () => void }) {
  const t = useTranslations("invoicePayments");
  const tp = useTranslations("payments");
  const router = useRouter();
  const [reason, setReason] = useState<string>(current?.reason ?? "");
  const [note, setNote] = useState(current?.note ?? "");
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("shortTitle")}</DialogTitle>
          <DialogDescription>{t("shortBody")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="short-reason">{t("reason")}</Label>
            <NativeSelect id="short-reason" className="w-full" value={reason} onChange={(e) => setReason(e.target.value)}>
              <NativeSelectOption value="">{t("chooseReason")}</NativeSelectOption>
              {SHORT_PAY_REASONS.map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {t(`shortReasons.${r}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="short-note">{t("note")}</Label>
            <Textarea id="short-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tp("cancel")}
          </Button>
          <Button
            disabled={pending || reason === ""}
            onClick={() =>
              start(async () => {
                const r = await shortPayAction(invoiceId, reason, note.trim() || null);
                if (r.ok) {
                  toast.success(t("reasonSaved"));
                  onClose();
                  router.refresh();
                } else toast.error(tp(`errors.${r.error}` as "errors.generic"));
              })
            }
            data-testid="save-short-reason"
          >
            {tp("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReminderDialog({ invoiceId, reminder, onClose }: { invoiceId: string; reminder: InvoiceReceivables["reminder"]; onClose: () => void }) {
  const t = useTranslations("invoicePayments");
  const tp = useTranslations("payments");
  const locale = useLocale();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(reminder.stage);
  const [language, setLanguage] = useState<"en" | "es">(locale === "es" ? "es" : "en");
  const [subject, setSubject] = useState(reminder.drafts[language][stage].subject);
  const [body, setBody] = useState(reminder.drafts[language][stage].body);
  const [pending, start] = useTransition();
  // Choosing another stage or language starts again from that template (FreshBooks templates).
  const refill = (s: Stage, l: "en" | "es") => {
    setStage(s);
    setLanguage(l);
    setSubject(reminder.drafts[l][s].subject);
    setBody(reminder.drafts[l][s].body);
  };
  const record = (how: "copied" | "email_app") =>
    start(async () => {
      const r = await reminderAction(invoiceId, stage, language, how);
      if (r.ok) {
        toast.success(how === "copied" ? t("copied") : t("opened"));
        onClose();
        router.refresh();
      } else toast.error(tp(`errors.${r.error}` as "errors.generic"));
    });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
    } catch {
      toast.error(t("copyFailed"));
      return;
    }
    record("copied");
  };
  // Several billing addresses stay several (commas are not encoded in a mailto list; review nit).
  const mailto = `mailto:${encodeURIComponent(reminder.to ?? "").replace(/%2C/gi, ",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("reminderTitle")}</DialogTitle>
          <DialogDescription>{reminder.daysLate > 0 ? t("reminderLate", { days: reminder.daysLate }) : t("reminderNotDue")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-stage">{t("stage")}</Label>
              <NativeSelect id="reminder-stage" className="w-full" value={stage} onChange={(e) => refill(e.target.value as Stage, language)} data-testid="reminder-stage">
                {STAGES.map((s) => (
                  <NativeSelectOption key={s} value={s}>
                    {t(`stages.${s}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-language">{t("language")}</Label>
              <NativeSelect id="reminder-language" className="w-full" value={language} onChange={(e) => refill(stage, e.target.value === "es" ? "es" : "en")} data-testid="reminder-language">
                <NativeSelectOption value="en">{t("languages.en")}</NativeSelectOption>
                <NativeSelectOption value="es">{t("languages.es")}</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
          <p className="text-sm">
            <span className="text-muted-foreground">{t("to")}</span> {reminder.to ?? <span className="text-muted-foreground">{t("noEmail")}</span>}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reminder-subject">{t("subject")}</Label>
            <Input id="reminder-subject" value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="reminder-subject" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reminder-body">{t("message")}</Label>
            <Textarea id="reminder-body" value={body} onChange={(e) => setBody(e.target.value)} rows={10} data-testid="reminder-body" />
          </div>
          <p className="text-xs text-muted-foreground">{t("sendsNothing")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tp("cancel")}
          </Button>
          <a href={mailto} className={buttonVariants({ variant: "outline" })} onClick={() => record("email_app")} data-testid="reminder-mailto">
            <MailIcon />
            {t("openEmail")}
          </a>
          <Button onClick={copy} disabled={pending} data-testid="reminder-copy">
            <CopyIcon />
            {t("copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
