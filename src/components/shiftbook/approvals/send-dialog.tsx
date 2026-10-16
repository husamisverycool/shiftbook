"use client";

// Pattern: docs/patterns/approvals.md — "Send for approval" (Stripe's send-invoice dialog prefills the
// customer's email; not offered while any of the client's shifts still need review).
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { sendApprovalAction } from "@/app/[locale]/(app)/approvals/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Link, useRouter } from "@/i18n/navigation";
import { hoursMinutes } from "../format";

export interface SendTarget {
  clientId: string;
  clientName: string;
  payPeriodId: string;
  waiting: number;
  waitingMinutes: number;
  needsReview: number;
  prefill: { name: string; email: string; locale: "en" | "es" } | null;
}

export function SendDialog({ target, onClose }: { target: SendTarget; onClose: () => void }) {
  const t = useTranslations("approvals");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(target.prefill?.name ?? "");
  const [email, setEmail] = useState(target.prefill?.email ?? "");
  const [locale, setLocale] = useState<"en" | "es">(target.prefill?.locale ?? "en");
  const blocked = target.needsReview > 0;

  const send = () =>
    start(async () => {
      const r = await sendApprovalAction({ clientId: target.clientId, payPeriodId: target.payPeriodId, approverName: name, approverEmail: email, locale });
      if (r.ok) {
        toast.success(t("done.sent", { email: email.trim() }));
        onClose();
      } else {
        toast.error(t.has(`errors.${r.error}`) ? t(`errors.${r.error}` as "errors.generic", { detail: r.detail ?? "" }) : t("errors.generic"));
      }
      router.refresh();
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("sendTitle", { client: target.clientName })}</DialogTitle>
          {!blocked && <DialogDescription>{t("sendBody", { shifts: target.waiting, hours: hoursMinutes(target.waitingMinutes) })}</DialogDescription>}
        </DialogHeader>
        {blocked ? (
          <Alert variant="destructive" data-testid="send-blocked">
            <AlertDescription className="flex flex-col gap-2">
              <span>{t("sendBlocked", { count: target.needsReview })}</span>
              <Link href={{ pathname: "/convert", query: { period: target.payPeriodId, step: "hours" } }} className={buttonVariants({ size: "sm", variant: "outline", className: "w-fit" })}>
                {t("reviewHours")}
              </Link>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="approver-name">{t("approverName")}</Label>
              <Input id="approver-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="approver-email">{t("approverEmail")}</Label>
              <Input id="approver-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="approver-language">{t("approverLanguage")}</Label>
              <NativeSelect id="approver-language" value={locale} onChange={(e) => setLocale(e.target.value === "es" ? "es" : "en")} className="w-48">
                <NativeSelectOption value="en">{t("english")}</NativeSelectOption>
                <NativeSelectOption value="es">{t("spanish")}</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          {!blocked && (
            <Button onClick={send} disabled={pending || name.trim().length < 2 || !email.includes("@")} data-testid="send-request">
              {t("send")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
