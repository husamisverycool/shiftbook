"use client";

// Pattern: docs/patterns/sign-in/email.md (decision 0033) — Linear's "Continue with Email" (the code
// from the email typed on the login page) and Vercel's emailed six-digit code: the email, then the
// code on the same page; the same answer whatever the address. In the demo, the mailbox's copy.
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { requestEmailCodeAction, verifyEmailCodeAction } from "@/app/[locale]/(auth)/identity-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

export function EmailCodeView({ email: initialEmail, next }: { email: string; next: string | null }) {
  const t = useTranslations("emailCode");
  const id = useId();
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState<{ email: string; demoCopy: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<"invalid" | "locked" | null>(null);
  const [resent, setResent] = useState(false);
  const [sending, startSend] = useTransition();
  const [checking, startCheck] = useTransition();
  const triedFor = useRef<string | null>(null);

  const send = (address: string, again: boolean) =>
    startSend(async () => {
      const r = await requestEmailCodeAction(address);
      setSent({ email: address, demoCopy: r.demoCopy });
      setResent(again);
      setError(null);
      setCode("");
      triedFor.current = null;
    });
  const verify = (value: string) => {
    if (!sent) return;
    triedFor.current = value;
    startCheck(async () => {
      // Success leaves the page; only a refusal comes back.
      const r = await verifyEmailCodeAction({ email: sent.email, code: value, next });
      setError(r.error);
      setCode("");
      triedFor.current = null;
    });
  };
  const back = (
    <Link href={{ pathname: "/sign-in", query: next ? { next } : {} }} className="self-center text-sm text-primary underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      {t("back")}
    </Link>
  );

  if (!sent)
    return (
      <>
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("body")}</p>
        </div>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) send(email.trim(), false);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-email`}>{t("email")}</Label>
            <Input id={`${id}-email`} className="bg-background" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required data-testid="code-email" />
          </div>
          <Button type="submit" disabled={sending || !email.trim()} className="w-full" data-testid="code-send">
            {sending ? t("sending") : t("send")}
          </Button>
        </form>
        {back}
      </>
    );

  const message = error === "locked" ? t("locked") : error === "invalid" ? t("invalid") : null;
  return (
    <>
      <div className="flex flex-col gap-2 text-center" role="status">
        <h1 className="text-2xl font-semibold tracking-tight">{t("sentTitle")}</h1>
        <p className="text-sm text-muted-foreground">{resent ? t("resent") : t("sentBody", { email: sent.email })}</p>
      </div>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) verify(code);
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-code`}>{t("code")}</Label>
          <Input
            id={`${id}-code`}
            className="bg-background font-mono tracking-widest"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(digits);
              // Sent on its own once six digits are typed, as the authenticator code page does.
              if (digits.length === 6 && triedFor.current !== digits && !checking) verify(digits);
            }}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? `${id}-error` : undefined}
            autoFocus
            data-testid="email-code"
          />
        </div>
        {message && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive" data-testid="email-code-error">
            {message}
          </p>
        )}
        <Button type="submit" disabled={checking || code.length !== 6} className="w-full" data-testid="email-code-submit">
          {checking ? t("submitting") : t("submit")}
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
        <button type="button" className="text-primary underline-offset-4 hover:underline disabled:opacity-50 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" disabled={sending} onClick={() => send(sent.email, true)} data-testid="code-resend">
          {t("resend")}
        </button>
        <button
          type="button"
          className="text-primary underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => {
            setSent(null);
            setError(null);
            setCode("");
          }}
          data-testid="code-other-email"
        >
          {t("otherEmail")}
        </button>
      </div>
      {sent.demoCopy && (
        <div className="flex flex-col gap-2 rounded-md border bg-background p-3 text-sm" data-testid="demo-code-copy">
          <p className="font-medium">{t("demoCopy")}</p>
          <div tabIndex={0} aria-label={t("demoCopy")} className="max-h-64 overflow-auto whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="demo-code-text">
            {sent.demoCopy}
          </div>
        </div>
      )}
      {back}
    </>
  );
}
