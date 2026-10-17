"use client";

// Pattern: docs/patterns/sign-in/link.md (decision 0033, review H2a) — GitHub's device verification:
// the code sent to the account's email, a hint of the address, typed here; then the account is
// connected and the sign-in goes on.
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { resendLinkCodeAction, verifyLinkCodeAction } from "@/app/[locale]/(auth)/identity-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

type Refusal = "invalid" | "locked" | "expired" | "taken" | "other_identity";

export function LinkProofView({ provider, hint, demoCopy: initialCopy }: { provider: "google" | "microsoft" | "sso"; hint: string; demoCopy: string | null }) {
  const t = useTranslations("linkProof");
  const id = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState<Refusal | null>(null);
  const [resent, setResent] = useState<boolean | null>(null);
  const [demoCopy, setDemoCopy] = useState(initialCopy);
  const [checking, startCheck] = useTransition();
  const [sending, startSend] = useTransition();
  const triedFor = useRef<string | null>(null);
  const name = t(`providers.${provider}`);
  const gone = error === "expired" || error === "taken" || error === "other_identity";

  const verify = (value: string) => {
    triedFor.current = value;
    startCheck(async () => {
      // Success leaves the page; only a refusal comes back.
      const r = await verifyLinkCodeAction(value);
      setError(r.error);
      setCode("");
      triedFor.current = null;
    });
  };

  return (
    <>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("body", { provider: name, hint })}</p>
      </div>
      {!gone && (
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
                if (digits.length === 6 && triedFor.current !== digits && !checking) verify(digits);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              autoFocus
              data-testid="link-code"
            />
          </div>
          {error && (
            <p id={`${id}-error`} role="alert" className="text-sm text-destructive" data-testid="link-code-error">
              {t(`errors.${error}`)}
            </p>
          )}
          <Button type="submit" disabled={checking || code.length !== 6} className="w-full" data-testid="link-code-submit">
            {checking ? t("confirming") : t("confirm")}
          </Button>
        </form>
      )}
      {gone && (
        <p role="alert" className="text-sm text-destructive" data-testid="link-code-error">
          {t(`errors.${error}`)}
        </p>
      )}
      {!gone && (
        <div className="flex flex-col items-center gap-1 text-sm">
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline disabled:opacity-50"
            disabled={sending}
            onClick={() =>
              startSend(async () => {
                const r = await resendLinkCodeAction();
                setResent(r.ok);
                if (r.demoCopy) setDemoCopy(r.demoCopy);
              })
            }
            data-testid="link-code-resend"
          >
            {t("resend")}
          </button>
          {resent !== null && (
            <p role="status" className="text-muted-foreground">
              {t(resent ? "resent" : "notResent")}
            </p>
          )}
        </div>
      )}
      {demoCopy && !gone && (
        <div className="flex flex-col gap-2 rounded-md border bg-background p-3 text-sm" data-testid="demo-link-copy">
          <p className="font-medium">{t("demoCopy")}</p>
          <div tabIndex={0} aria-label={t("demoCopy")} className="max-h-64 overflow-auto whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="demo-link-text">
            {demoCopy}
          </div>
        </div>
      )}
      <Link href="/sign-in" className="self-center text-sm text-primary underline-offset-4 hover:underline">
        {t("back")}
      </Link>
    </>
  );
}
