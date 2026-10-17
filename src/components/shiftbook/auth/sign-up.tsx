"use client";

// Patterns: docs/patterns/sign-up.md (decision 0036) — Stripe's "Create your account" form (labelled
// fields one under another, the primary button full width, "Already have an account? Sign in" centred at
// the foot), Linear's and Vercel's email step ("Check your email" in place of the form); and
// docs/patterns/sign-up/[token].md — the invite page's "Set your password" (GitHub: the password twice,
// then two-factor before access).
import { useId, useState, useTransition, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { completeSignupAction, requestSignupAction } from "@/app/[locale]/(auth)/signup-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { NewPasswordFields } from "./fields";

/** Stripe's and Linear's foot line: "Already have an account? Sign in". */
function HaveAccount() {
  const t = useTranslations("signUp");
  return (
    <p className="text-center text-sm text-muted-foreground" data-testid="sign-up-have-account">
      {t("haveAccount")}{" "}
      <Link href="/sign-in" className="text-primary underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        {t("signIn")}
      </Link>
    </p>
  );
}

function Heading({ title, line }: { title: string; line?: string }) {
  return (
    <div className="flex flex-col gap-2 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {line && <p className="text-sm text-balance text-muted-foreground">{line}</p>}
    </div>
  );
}

type RequestError = "invalid_email" | "invalid_name" | "invalid_agency_name" | "too_many" | "demo" | "generic";

export function SignUpView({ demo, trialDays }: { demo: boolean; trialDays: number }) {
  const t = useTranslations("signUp");
  const id = useId();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [error, setError] = useState<RequestError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const subtitle = trialDays > 0 ? t("subtitleTrial", { days: trialDays }) : t("subtitle");

  if (demo)
    return (
      <>
        <Heading title={t("title")} />
        <Alert data-testid="sign-up-demo">
          <AlertDescription>{t("demoBody")}</AlertDescription>
        </Alert>
        <Link href="/sign-in" className={buttonVariants({ className: "h-10 w-full" })} data-testid="sign-up-demo-continue">
          {t("demoContinue")}
        </Link>
        <HaveAccount />
      </>
    );

  if (sentTo)
    return (
      <>
        <div className="flex flex-col gap-2 text-center" role="status" data-testid="sign-up-sent">
          <h1 className="text-2xl font-semibold tracking-tight">{t("sentTitle")}</h1>
          <p className="text-sm">{t("sentBody", { email: sentTo })}</p>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {t("sentHint")}{" "}
          <button type="button" className="text-primary underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" onClick={() => setSentTo(null)} data-testid="sign-up-different-email">
            {t("differentEmail")}
          </button>
          .
        </p>
        <Link href="/sign-in" className="self-center text-sm text-primary underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          {t("back")}
        </Link>
      </>
    );

  const field = (key: "email" | "name" | "agencyName", value: string, set: (v: string) => void, props: Partial<ComponentProps<typeof Input>>) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-${key}`}>{t(key)}</Label>
      <Input
        id={`${id}-${key}`}
        className="bg-background"
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-invalid={error && error === `invalid_${key === "agencyName" ? "agency_name" : key}` ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        required
        data-testid={`sign-up-${key}`}
        {...props}
      />
    </div>
  );

  return (
    <>
      <Heading title={t("title")} line={subtitle} />
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return setError("invalid_email");
          if (!name.trim()) return setError("invalid_name");
          if (!agencyName.trim()) return setError("invalid_agency_name");
          start(async () => {
            try {
              const r = await requestSignupAction({ email, name, agencyName });
              if (r.ok) {
                setError(null);
                setSentTo(email.trim());
              } else setError(r.error);
            } catch {
              setError("generic");
            }
          });
        }}
      >
        {field("email", email, setEmail, { type: "email", autoComplete: "email", inputMode: "email", autoFocus: true })}
        {field("name", name, setName, { autoComplete: "name", maxLength: 120 })}
        {field("agencyName", agencyName, setAgencyName, { autoComplete: "organization", maxLength: 200 })}
        <Button type="submit" disabled={pending} className="h-10 w-full" data-testid="sign-up-submit">
          {pending ? t("submitting") : t("submit")}
        </Button>
        {error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive" data-testid="sign-up-error">
            {t(`errors.${error}`)}
          </p>
        )}
      </form>
      <HaveAccount />
    </>
  );
}

/** A sign-up link that no longer works: start again, or sign in. */
export function SignUpLinkGone() {
  const t = useTranslations("signUpFinish");
  return (
    <>
      <div className="flex flex-col gap-2" data-testid="sign-up-link-gone">
        <h1 className="text-center text-2xl font-semibold tracking-tight">{t("expiredTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("expiredBody")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Link href="/sign-up" className={buttonVariants({ className: "w-full" })}>
          {t("startAgain")}
        </Link>
        <Link href="/sign-in" className={buttonVariants({ variant: "outline", className: "w-full bg-background" })}>
          {t("toSignIn")}
        </Link>
      </div>
    </>
  );
}

export function SignUpFinishView({ token, info }: { token: string; info: { email: string; agencyName: string } }) {
  const t = useTranslations("signUpFinish");
  const [gone, setGone] = useState(false);
  const [taken, setTaken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (gone) return <SignUpLinkGone />;
  return (
    <>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm">{t("body", { agency: info.agencyName })}</p>
        <p className="text-sm text-muted-foreground">{t("email", { email: info.email })}</p>
      </div>
      {taken && (
        <Alert data-testid="sign-up-taken">
          <AlertDescription>
            {t("taken")}{" "}
            <Link href="/sign-in" className="text-primary underline underline-offset-4 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              {t("toSignIn")}
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <NewPasswordFields
        email={info.email}
        pending={pending}
        submitLabel={t("submit")}
        pendingLabel={t("submitting")}
        serverError={error}
        onSubmit={(password) =>
          start(async () => {
            const r = await completeSignupAction(token, password);
            // Reached only when refused (success opens the authenticator setup).
            if (r.error === "expired") setGone(true);
            else if (r.error === "email_taken") setTaken(true);
            else setError(r.error);
          })
        }
      />
      <p className="text-sm text-muted-foreground">{t("nextSetup")}</p>
    </>
  );
}
