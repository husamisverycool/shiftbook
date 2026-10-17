"use client";

// Pattern: docs/patterns/sign-in/sso.md (decision 0033) — Notion's single sign-on (type the email; one
// configuration for it: straight to that identity provider; none: the usual ways in), Linear's
// "Continue with SAML SSO", Stripe's sign-in from its own page.
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { ssoContinueAction } from "@/app/[locale]/(auth)/identity-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

export function SsoSignInView({ email: initialEmail, next }: { email: string; next: string | null }) {
  const t = useTranslations("sso.signIn");
  const id = useId();
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<"not_set_up" | "failed" | "too_many" | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [pending, start] = useTransition();
  const busy = pending || leaving;
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
          if (!email.trim()) return;
          start(async () => {
            const r = await ssoContinueAction({ email: email.trim(), next });
            if (r.ok) {
              // The browser leaves for the agency's identity provider.
              setLeaving(true);
              window.location.assign(r.url);
            } else setError(r.error);
          });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-email`}>{t("email")}</Label>
          <Input
            id={`${id}-email`}
            className="bg-background"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            autoFocus
            required
            data-testid="sso-email"
          />
        </div>
        {error && (
          <div id={`${id}-error`} role="alert" className="flex flex-col gap-1 text-sm" data-testid="sso-error">
            <p className="text-destructive">{t(error === "failed" ? "failed" : error === "too_many" ? "tooMany" : "notSetUp")}</p>
            <p className="flex flex-wrap gap-x-4">
              <Link href={{ pathname: "/sign-in", query: { ...(next ? { next } : {}), email: email.trim() } }} className="text-primary underline underline-offset-4">
                {t("otherWay")}
              </Link>
              <Link href={{ pathname: "/sign-in/email", query: { ...(next ? { next } : {}), email: email.trim() } }} className="text-primary underline underline-offset-4">
                {t("emailCode")}
              </Link>
            </p>
          </div>
        )}
        <Button type="submit" disabled={busy || !email.trim()} className="w-full" data-testid="sso-continue">
          {busy ? t("submitting") : t("submit")}
        </Button>
      </form>
      <Link href={{ pathname: "/sign-in", query: next ? { next } : {} }} className="self-center text-sm text-primary underline-offset-4 hover:underline">
        {t("back")}
      </Link>
    </>
  );
}
