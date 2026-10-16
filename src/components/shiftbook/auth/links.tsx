"use client";

// Patterns: docs/patterns/sign-in/reset.md (GitHub: request a new password by email),
// sign-in/reset/[token].md (GitHub: the reset link — the code first when two-factor is on, then the new
// password twice) and invite/[token].md (Stripe/GitHub invites: the role, then join).
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { redeemLinkAction, requestResetAction, verifyResetCodeAction } from "@/app/[locale]/(auth)/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import type { Role } from "@/server/permissions";
import { LinkedText } from "../linked-text";
import { CodeFields, NewPasswordFields } from "./fields";

export function ResetRequestView({ email: initialEmail }: { email: string }) {
  const t = useTranslations("reset");
  const id = useId();
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState<{ email: string; demoCopy: string | null } | null>(null);
  const [pending, start] = useTransition();
  if (sent)
    return (
      <>
        <div className="flex flex-col gap-2" role="status">
          <h1 className="text-2xl font-semibold">{t("sentTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("sentBody", { email: sent.email })}</p>
        </div>
        {sent.demoCopy && (
          <div className="flex flex-col gap-2 rounded-md border p-3 text-sm" data-testid="demo-reset-copy">
            <p className="font-medium">{t("demoCopy")}</p>
            <div tabIndex={0} aria-label={t("demoCopy")} className="max-h-64 overflow-auto whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <LinkedText text={sent.demoCopy} />
            </div>
          </div>
        )}
        <Link href="/sign-in" className="text-sm text-primary underline-offset-4 hover:underline">
          {t("back")}
        </Link>
      </>
    );
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("body")}</p>
      </div>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          start(async () => {
            const r = await requestResetAction(email);
            setSent({ email: email.trim(), demoCopy: r.demoCopy });
          });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-email`}>{t("email")}</Label>
          <Input id={`${id}-email`} type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required data-testid="reset-email" />
        </div>
        <Button type="submit" disabled={pending || !email.trim()} className="w-full" data-testid="reset-send">
          {pending ? t("sending") : t("submit")}
        </Button>
      </form>
      <Link href="/sign-in" className="text-sm text-primary underline-offset-4 hover:underline">
        {t("back")}
      </Link>
    </>
  );
}

/** A link that no longer works: what to do instead. */
export function LinkGone({ kind }: { kind: "reset" | "invite" }) {
  const tn = useTranslations("newPassword");
  const ti = useTranslations("invite");
  return (
    <>
      <div className="flex flex-col gap-2" data-testid="link-gone">
        <h1 className="text-2xl font-semibold">{kind === "reset" ? tn("expiredTitle") : ti("expiredTitle")}</h1>
        <p className="text-sm text-muted-foreground">{kind === "reset" ? tn("expiredBody") : ti("expiredBody")}</p>
      </div>
      <div className="flex flex-col gap-2">
        {kind === "reset" && (
          <Link href="/sign-in/reset" className={buttonVariants({ className: "w-full" })}>
            {tn("askAgain")}
          </Link>
        )}
        <Link href="/sign-in" className={buttonVariants({ variant: kind === "reset" ? "outline" : "default", className: "w-full" })}>
          {kind === "reset" ? tn("back") : ti("toSignIn")}
        </Link>
      </div>
    </>
  );
}

export function NewPasswordView({ token, email, needsCode }: { token: string; email: string; needsCode: boolean }) {
  const t = useTranslations("newPassword");
  const [codeGiven, setCodeGiven] = useState(!needsCode);
  const [codeError, setCodeError] = useState<"invalid" | "locked" | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (gone) return <LinkGone kind="reset" />;
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("forEmail", { email })}</p>
      </div>
      {!codeGiven ? (
        <>
          <p className="text-sm">{t("codeStep")}</p>
          <CodeFields
            pending={pending}
            error={codeError}
            onSubmit={(code) =>
              start(async () => {
                const r = await verifyResetCodeAction(token, code);
                if (r.ok) setCodeGiven(true);
                else if (r.error === "expired") setGone(true);
                else setCodeError(r.error);
              })
            }
          />
        </>
      ) : (
        <NewPasswordFields
          email={email}
          pending={pending}
          submitLabel={t("submit")}
          pendingLabel={t("submitting")}
          serverError={error}
          onSubmit={(password) =>
            start(async () => {
              const r = await redeemLinkAction(token, "reset", password);
              if (r.error === "expired") setGone(true);
              else if (r.error === "code_needed") setCodeGiven(false);
              else setError(r.error);
            })
          }
        />
      )}
      <Link href="/sign-in" className="text-sm text-primary underline-offset-4 hover:underline">
        {t("back")}
      </Link>
    </>
  );
}

export function InviteView({ token, invite }: { token: string; invite: { agencyName: string; byLabel: string; role: Role; email: string } }) {
  const t = useTranslations("invite");
  const tr = useTranslations("roles");
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (gone) return <LinkGone kind="invite" />;
  const needsApp = invite.role === "owner" || invite.role === "coordinator";
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title", { agency: invite.agencyName })}</h1>
        <p className="text-sm">{t("body", { by: invite.byLabel, role: tr(`${invite.role}.name`) })}</p>
        <p className="text-sm text-muted-foreground">{tr(`${invite.role}.line`)}</p>
        <p className="text-sm text-muted-foreground">{t("email", { email: invite.email })}</p>
      </div>
      <NewPasswordFields
        email={invite.email}
        pending={pending}
        submitLabel={t("submit", { agency: invite.agencyName })}
        pendingLabel={t("submitting")}
        serverError={error}
        onSubmit={(password) =>
          start(async () => {
            const r = await redeemLinkAction(token, "invite", password);
            if (r.error === "expired") setGone(true);
            else setError(r.error === "code_needed" ? "generic" : r.error);
          })
        }
      />
      {needsApp && <p className="text-sm text-muted-foreground">{t("nextSetup")}</p>}
    </>
  );
}
