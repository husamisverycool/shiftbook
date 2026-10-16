"use client";

// Pattern: docs/patterns/sign-in.md (decision 0031) — Linear's sign-in: the heading centred, the main way
// in as one filled full-width button and the others outlined under it (in the demo, the demo people);
// an "or" rule between ways in (GitHub, Stripe, Notion); then GitHub's form (email, password with
// "Forgot password?", Sign in; the code comes on its own page).
import { Building2Icon, KeyRoundIcon, MailIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { demoSignInAction, signInAction } from "@/app/[locale]/(auth)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { SignInMethods } from "@/server/auth/methods";
import type { Role } from "@/server/permissions";
import { initialsOf, withoutNote } from "../person";
import { PasskeySignIn } from "./passkey";
import { GoogleMark, MicrosoftMark } from "./provider-marks";

export type SignInNotice = "signed_out" | "expired" | "password_changed" | "link_expired" | "provider_failed" | "no_account" | "not_verified" | "suspended" | "too_many";

/** Notion's sign-in tiles: the mark over the name, in a two-column grid. */
const TILE = "flex h-16 flex-col items-center justify-center gap-1.5 rounded-lg border bg-background text-xs font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

export function SignInView({ notice, next, email: initialEmail, demoPeople, methods }: { notice: SignInNotice | null; next: string | null; email: string; demoPeople: { id: string; name: string; role: Role }[]; methods: SignInMethods }) {
  const t = useTranslations("signIn");
  const tr = useTranslations("roles");
  const id = useId();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<"invalid" | "locked" | "busy" | null>(null);
  const [pending, start] = useTransition();
  const [demoPending, startDemo] = useTransition();

  const demo = demoPeople.length > 0;
  const locale = useLocale();
  const others = [methods.google, methods.microsoft, methods.passkey, methods.sso].filter(Boolean).length;
  const providerHref = (provider: "google" | "microsoft") => `/api/auth/oidc/${provider}/start?${new URLSearchParams({ locale, ...(next ? { next } : {}) }).toString()}`;
  return (
    <>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {demo && <p className="text-sm text-balance text-muted-foreground">{t("demoSubtitle")}</p>}
      </div>
      {notice && (
        <Alert data-testid="sign-in-notice">
          <AlertDescription>{t(`notice.${notice}`)}</AlertDescription>
        </Alert>
      )}
      {demo && (
        <section aria-labelledby={`${id}-demo`} className="flex flex-col gap-2.5" data-testid="demo-people">
          <h2 id={`${id}-demo`} className="sr-only">
            {t("demoTitle")}
          </h2>
          {demoPeople.map((p, i) => (
            <Button
              key={p.id}
              variant={i === 0 ? "default" : "outline"}
              className={cn("h-11 w-full justify-start gap-3 px-3 text-left", i > 0 && "bg-background")}
              disabled={demoPending}
              onClick={() => startDemo(async () => void (await demoSignInAction(p.id, next)))}
              data-testid={`continue-${p.role}`}
            >
              <span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", i === 0 ? "bg-primary-foreground/15" : "bg-muted text-foreground/70")}>
                {initialsOf(p.name)}
              </span>
              <span className="min-w-0 flex-1 truncate">{t("continueAs", { name: withoutNote(p.name) })}</span>
              <span className={cn("shrink-0 text-xs font-normal", i === 0 ? "text-primary-foreground/70" : "text-muted-foreground")}>{tr(`${p.role}.name`)}</span>
            </Button>
          ))}
          <p className="pt-1 text-center text-xs text-muted-foreground">{t("demoHint")}</p>
        </section>
      )}
      {demo && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground" role="separator" aria-label={t("or")}>
          <span className="h-px flex-1 bg-border" aria-hidden />
          <span aria-hidden>{t("or")}</span>
          <span className="h-px flex-1 bg-border" aria-hidden />
        </div>
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
          <Input id={`${id}-email`} className="bg-background" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={!initialEmail && !demo} required data-testid="email" />
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
            className="bg-background"
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
        <Button type="submit" variant={demo ? "outline" : "default"} disabled={pending || !email || !password} className={cn("w-full", demo && "bg-background")} data-testid="sign-in">
          {pending ? t("submitting") : t("submit")}
        </Button>
      </form>
      {methods.emailCode && (
        <Link href={{ pathname: "/sign-in/email", query: next ? { next } : {} }} className="-mt-2 inline-flex items-center justify-center gap-1.5 self-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" data-testid="sign-in-email-code">
          <MailIcon className="size-4" aria-hidden />
          {t("emailCode")}
        </Link>
      )}
      {others > 0 && (
        <section aria-labelledby={`${id}-others`} className="flex flex-col gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" aria-hidden />
            <h2 id={`${id}-others`} className="font-normal">
              {t("orContinueWith")}
            </h2>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {methods.google && (
              <a href={providerHref("google")} className={TILE} data-testid="sign-in-google">
                <GoogleMark className="size-5" />
                {t("providers.google")}
              </a>
            )}
            {methods.microsoft && (
              <a href={providerHref("microsoft")} className={TILE} data-testid="sign-in-microsoft">
                <MicrosoftMark className="size-5" />
                {t("providers.microsoft")}
              </a>
            )}
            {methods.passkey && (
              <PasskeySignIn next={next} className={TILE}>
                <KeyRoundIcon className="size-5" aria-hidden />
                {t("providers.passkey")}
              </PasskeySignIn>
            )}
            {methods.sso && (
              <Link href={{ pathname: "/sign-in/sso", query: next ? { next } : {} }} className={TILE} data-testid="sign-in-sso">
                <Building2Icon className="size-5" aria-hidden />
                {t("providers.sso")}
              </Link>
            )}
          </div>
        </section>
      )}
    </>
  );
}
