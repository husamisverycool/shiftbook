"use client";

// Pattern: docs/patterns/sign-in.md — GitHub sign-in (email, password with "Forgot password?", Sign in;
// the code comes on its own page); Linear's login list ("Continue with …") for the demo people.
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { demoSignInAction, signInAction } from "@/app/[locale]/(auth)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import type { Role } from "@/server/permissions";

export type SignInNotice = "signed_out" | "expired" | "password_changed" | "link_expired";

export function SignInView({ notice, next, email: initialEmail, demoPeople }: { notice: SignInNotice | null; next: string | null; email: string; demoPeople: { id: string; name: string; role: Role }[] }) {
  const t = useTranslations("signIn");
  const tr = useTranslations("roles");
  const id = useId();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<"invalid" | "locked" | "busy" | null>(null);
  const [pending, start] = useTransition();
  const [demoPending, startDemo] = useTransition();

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {notice && (
        <Alert data-testid="sign-in-notice">
          <AlertDescription>{t(`notice.${notice}`)}</AlertDescription>
        </Alert>
      )}
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await signInAction({ email, password, next });
            // Reached only when refused (success leaves the page).
            setError(r.error);
            setPassword("");
          });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-email`}>{t("email")}</Label>
          <Input id={`${id}-email`} type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={!initialEmail} required data-testid="email" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor={`${id}-password`}>{t("password")}</Label>
            <Link href={{ pathname: "/sign-in/reset", query: email ? { email } : {} }} className="text-sm text-primary underline-offset-4 hover:underline" data-testid="forgot">
              {t("forgot")}
            </Link>
          </div>
          <Input
            id={`${id}-password`}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus={Boolean(initialEmail)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            required
            data-testid="password"
          />
        </div>
        {error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive" data-testid="sign-in-error">
            {t(error)}{" "}
            {error === "locked" && (
              <Link href={{ pathname: "/sign-in/reset", query: email ? { email } : {} }} className="text-primary underline underline-offset-4">
                {t("resetLink")}
              </Link>
            )}
          </p>
        )}
        <Button type="submit" disabled={pending || !email || !password} className="w-full" data-testid="sign-in">
          {pending ? t("submitting") : t("submit")}
        </Button>
      </form>
      {demoPeople.length > 0 && (
        <section aria-labelledby={`${id}-demo`} className="flex flex-col gap-3 border-t pt-6" data-testid="demo-people">
          <div className="flex flex-col gap-1">
            <h2 id={`${id}-demo`} className="font-semibold">
              {t("demoTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("demoHint")}</p>
          </div>
          {demoPeople.map((p) => (
            <Button
              key={p.id}
              variant="outline"
              className="h-auto w-full flex-col items-start gap-0.5 py-2 text-left"
              disabled={demoPending}
              onClick={() => startDemo(async () => void (await demoSignInAction(p.id, next)))}
              data-testid={`continue-${p.role}`}
            >
              <span>{t("continueAs", { name: p.name })}</span>
              <span className="text-xs font-normal text-muted-foreground">{tr(`${p.role}.name`)}</span>
            </Button>
          ))}
        </section>
      )}
    </>
  );
}
