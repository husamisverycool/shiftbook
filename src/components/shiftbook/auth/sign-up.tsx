"use client";

// Patterns: docs/patterns/sign-up.md (decision 0036) — Stripe's "Create your account" form (labelled
// fields one under another, the primary button full width, "Already have an account? Sign in" centred at
// the foot), Linear's and Vercel's email step ("Check your email" in place of the form); and
// docs/patterns/sign-up/[token].md — the invite page's "Set your password" (GitHub: the password twice,
// then two-factor before access).
import { useEffect, useId, useState, useTransition, type ComponentProps } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { completeSignupAction, requestSignupAction, verifySignupCodeAction } from "@/app/[locale]/(auth)/signup-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { CodeBoxes } from "./code-boxes";
import { NewPasswordFields } from "./fields";

/** Stripe's and Linear's foot line: "Already have an account? Sign in". */
function HaveAccount() {
  const t = useTranslations("signUp");
  return (
    <p className="text-center text-sm text-muted-foreground" data-testid="sign-up-have-account">
      {t("haveAccount")}{" "}
      <Link href="/sign-in" className="text-accent-text underline underline-offset-4 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
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

type RequestError = "invalid_email" | "invalid_name" | "invalid_agency_name" | "too_many" | "send_failed" | "demo" | "generic";
type CodeError = "wrong_code" | "too_many" | "demo" | "generic";

const RESEND_SECONDS = 60;
const MAIL_SITES = [
  { key: "openGmail", href: "https://mail.google.com/mail/u/0/#search/from%3Atabulado+in%3Aanywhere" },
  { key: "openOutlook", href: "https://outlook.live.com/mail/0/" },
] as const;

/** "Check your email": the code boxes, the mail sites, and a new code once a minute (Slack). */
function SentStep({ email, onWrongEmail, onResend }: { email: string; onWrongEmail: () => void; onResend: () => Promise<RequestError | null> }) {
  const t = useTranslations("signUp");
  const id = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState<CodeError | RequestError | null>(null);
  const [notice, setNotice] = useState(false);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);
  const check = (digits: string) =>
    start(async () => {
      setNotice(false);
      try {
        const r = await verifySignupCodeAction(email, digits);
        // Reached only when refused (a right code opens the password step).
        setError(r.error);
        setCode("");
      } catch {
        setError("generic");
      }
    });
  const message = !error ? null : error === "wrong_code" || error === "too_many" || error === "demo" || error === "generic" ? t(`codeErrors.${error}`) : t(`errors.${error}`);
  return (
    <>
      <div className="flex flex-col gap-2 text-center" role="status" data-testid="sign-up-sent">
        <h1 className="text-2xl font-semibold tracking-tight">{t("sentTitle")}</h1>
        <p className="text-sm text-balance text-muted-foreground">
          {t.rich("sentBody", { email, b: (c) => <strong className="font-medium text-foreground">{c}</strong> })}{" "}
          <button type="button" className="text-accent-text underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" onClick={onWrongEmail} data-testid="sign-up-different-email">
            {t("wrongEmail")}
          </button>
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <CodeBoxes value={code} onChange={setCode} onComplete={check} label={t("codeLabel")} disabled={pending} invalid={Boolean(error)} describedBy={message ? `${id}-error` : undefined} />
        <p id={`${id}-error`} role="alert" className="min-h-5 text-center text-sm text-destructive" data-testid="sign-up-code-error">
          {pending ? <span className="text-muted-foreground">{t("checking")}</span> : notice ? <span className="text-muted-foreground">{t("resent")}</span> : message}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {MAIL_SITES.map((m) => (
          <a key={m.key} href={m.href} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", className: "bg-background" })} data-testid={`sign-up-${m.key}`}>
            {t(m.key)}
            <ExternalLink aria-hidden className="size-3.5 text-muted-foreground" />
          </a>
        ))}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        {t("sentHint")}{" "}
        <button
          type="button"
          disabled={wait > 0 || pending}
          className="text-accent-text underline-offset-4 enabled:hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:text-muted-foreground"
          onClick={() =>
            start(async () => {
              const r = await onResend();
              setError(r);
              setNotice(!r);
              setCode("");
              setWait(RESEND_SECONDS);
            })
          }
          data-testid="sign-up-resend"
        >
          {wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
        </button>
        .
      </p>
      <Link href="/sign-in" className="self-center text-sm text-accent-text underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        {t("back")}
      </Link>
    </>
  );
}

export function SignUpView({ demo, trialDays, initialEmail }: { demo: boolean; trialDays: number; initialEmail?: string }) {
  const t = useTranslations("signUp");
  const id = useId();
  const [email, setEmail] = useState(initialEmail ?? "");
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

  const send = async (): Promise<RequestError | null> => {
    try {
      const r = await requestSignupAction({ email, name, agencyName });
      return r.ok ? null : r.error;
    } catch {
      return "generic";
    }
  };

  if (sentTo) return <SentStep email={sentTo} onWrongEmail={() => setSentTo(null)} onResend={send} />;

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
            const problem = await send();
            setError(problem);
            if (!problem) setSentTo(email.trim());
          });
        }}
      >
        {field("email", email, setEmail, { type: "email", autoComplete: "email", inputMode: "email", autoFocus: true })}
        {field("name", name, setName, { autoComplete: "name", maxLength: 120 })}
        {field("agencyName", agencyName, setAgencyName, { autoComplete: "organization", maxLength: 200 })}
        <Button type="submit" disabled={pending} className="h-10 w-full" data-testid="sign-up-submit" loading={pending} loadingLabel={t("submitting")}>
          {t("submit")}
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
            <Link href="/sign-in" className="text-accent-text underline underline-offset-4 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
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
