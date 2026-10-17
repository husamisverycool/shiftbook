"use client";

// Pattern: docs/patterns/invoices/[id].md, "Send, credit notes, promises (slice r)" — Stripe's "Send
// invoice" (the PDF attached) and "Issue a credit note" (a reason, an amount, a memo; never more than the
// invoice allows), and a promise to pay (date, amount, note).
import { PaperclipIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { issueCreditNoteAction, promiseAction, sendInvoiceAction, voidCreditNoteAction } from "@/app/[locale]/(app)/invoices/collect-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { centsToInput, parseDollars } from "@/lib/amounts";
import { CREDIT_NOTE_REASONS, type CreditNoteReason } from "@/server/db/schema";
import { money } from "../format";

export function SendInvoiceDialog({ invoiceId, number, kind, billingEmail, onClose }: { invoiceId: string; number: string; kind: "invoice" | "supplemental" | "credit_note"; billingEmail: string | null; onClose: () => void }) {
  const t = useTranslations("collect.send");
  const tc = useTranslations("common");
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const file = `${kind === "credit_note" ? "credit-note" : "invoice"}-${number}.pdf`;
  const send = () =>
    start(async () => {
      const r = await sendInvoiceAction(invoiceId, message.trim() || null);
      if (r.ok) {
        toast.success(t("sent", { email: r.to }));
        onClose();
        router.refresh();
      } else toast.error(r.error === "failed" ? t("failed") : t(`errors.${r.error}`));
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { number })}</DialogTitle>
          {!billingEmail && <DialogDescription>{t("noEmail")}</DialogDescription>}
        </DialogHeader>
        {billingEmail && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="send-to">{t("to")}</Label>
              <Input id="send-to" value={billingEmail} readOnly className="bg-muted/40" data-testid="send-to" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="send-message">{t("message")}</Label>
              <Textarea id="send-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={4} data-testid="send-message" />
            </div>
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" data-testid="send-attachment">
              <PaperclipIcon className="size-4" aria-hidden />
              {t("attachment", { file })}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          {billingEmail && (
            <Button onClick={send} loading={pending} loadingLabel={tc("loading")} data-testid="confirm-send">
              {t("submit")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreditNoteDialog({ invoiceId, number, roomCents, balanceCents, onClose }: { invoiceId: string; number: string; roomCents: number; balanceCents: number; onClose: () => void }) {
  const t = useTranslations("collect.credit");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [reason, setReason] = useState<CreditNoteReason | "">("");
  const [amount, setAmount] = useState(centsToInput(Math.max(0, Math.min(roomCents, balanceCents > 0 ? balanceCents : roomCents))));
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<"amount" | "reason" | "memo" | null>(null);
  const [pending, start] = useTransition();
  const cents = parseDollars(amount);
  const valid = cents !== null && cents > 0 && cents <= roomCents;
  // Stripe: an open invoice's amount due goes down; on a paid one, the amount becomes the client's credit.
  const after = valid ? balanceCents - cents : null;
  const issue = () =>
    start(async () => {
      const r = await issueCreditNoteAction(invoiceId, { reason, amountCents: cents ?? -1, memo: memo.trim() || null });
      if (r.ok) {
        toast.success(t("issued", { number: r.number }));
        onClose();
        router.refresh();
      } else if (r.error === "amount" || r.error === "reason" || r.error === "memo") setError(r.error);
      else toast.error(t(`errors.${r.error}`));
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { number })}</DialogTitle>
          <DialogDescription>{roomCents > 0 ? t("room", { amount: money(roomCents, locale) }) : t("noRoom")}</DialogDescription>
        </DialogHeader>
        {roomCents > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="credit-reason">{t("reason")}</Label>
              <NativeSelect id="credit-reason" className="w-full" value={reason} onChange={(e) => setReason(e.target.value as CreditNoteReason)} aria-invalid={error === "reason"} data-testid="credit-reason">
                <NativeSelectOption value="">{t("chooseReason")}</NativeSelectOption>
                {CREDIT_NOTE_REASONS.map((r) => (
                  <NativeSelectOption key={r} value={r}>
                    {t(`reasons.${r}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {error === "reason" && <p className="text-sm text-destructive">{t("errors.reason")}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="credit-amount">{t("amount")}</Label>
              <Input id="credit-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={error === "amount"} aria-describedby="credit-after" className="w-40 tabular-nums" data-testid="credit-amount" />
              {error === "amount" && <p className="text-sm text-destructive">{t("errors.amount", { amount: money(roomCents, locale) })}</p>}
              <p id="credit-after" className="text-sm text-muted-foreground" data-testid="credit-after">
                {after === null ? " " : after >= 0 ? t("after", { amount: money(after, locale) }) : t("afterCredit", { amount: money(-after, locale) })}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="credit-memo">{t("memo")}</Label>
              <Textarea id="credit-memo" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} aria-describedby="credit-memo-hint" data-testid="credit-memo" />
              <p id="credit-memo-hint" className="text-sm text-muted-foreground">
                {t("memoHint")}
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          {roomCents > 0 && (
            <Button onClick={issue} loading={pending} loadingLabel={tc("loading")} data-testid="confirm-credit-note">
              {t("submit")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Void credit note" (Stripe; decision 0043): a reason, then the credit is taken back. */
export function VoidCreditDialog({ creditNoteId, number, amountCents, onClose }: { creditNoteId: string; number: string; amountCents: number; onClose: () => void }) {
  const t = useTranslations("voidCredit");
  const locale = useLocale();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const confirm = () =>
    start(async () => {
      const r = await voidCreditNoteAction(creditNoteId, reason);
      if (r.ok) {
        toast.success(t("done", { number }));
        onClose();
        router.refresh();
      } else if (r.error === "reason") setError(true);
      else toast.error(r.error === "busy" ? t("errors.not_found") : t(`errors.${r.error}`));
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { number })}</DialogTitle>
          <DialogDescription>{t("body", { amount: money(amountCents, locale) })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="void-reason">{t("reason")}</Label>
          <Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} aria-invalid={error || undefined} aria-describedby="void-reason-hint" data-testid="void-reason" />
          <p id="void-reason-hint" className="text-sm text-muted-foreground">
            {t("reasonHint")}
          </p>
          {error && <p className="text-sm text-destructive">{t("errors.reason")}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="destructive" onClick={confirm} loading={pending} loadingLabel={t("voiding")} data-testid="confirm-void-credit">
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PromiseDialog({ invoiceId, number, today, onClose }: { invoiceId: string; number: string; today: string; onClose: () => void }) {
  const t = useTranslations("collect.promise");
  const tc = useTranslations("common");
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<"date" | "amount" | "note" | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const cents = amount.trim() === "" ? null : (parseDollars(amount) ?? -1);
      const r = await promiseAction(invoiceId, { promisedOn: date, amountCents: cents, note: note.trim() || null });
      if (r.ok) {
        toast.success(t("saved"));
        onClose();
        router.refresh();
      } else if (r.error === "date" || r.error === "amount" || r.error === "note") setError(r.error);
      else toast.error(t(`errors.${r.error}`));
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { number })}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promise-date">{t("date")}</Label>
            <Input id="promise-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={error === "date"} className="w-44" data-testid="promise-date" />
            {error === "date" && <p className="text-sm text-destructive">{t("errors.date")}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promise-amount">{t("amount")}</Label>
            <Input id="promise-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={error === "amount"} className="w-40 tabular-nums" data-testid="promise-amount" />
            {error === "amount" && <p className="text-sm text-destructive">{t("errors.amount")}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promise-note">{t("note")}</Label>
            <Textarea id="promise-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} loading={pending} loadingLabel={tc("loading")} data-testid="confirm-promise">
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
