"use client";

// Pattern: docs/patterns/w/sign-in.md — Tabulado's emailed-code sign-in (decision 0033) with the mobile
// number in place of the email: the number, then the six-digit code on the same page; the same answer
// whatever the number; several agencies → choose one; in the demo, the text's copy and Continue as.
import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { chooseAgencyAction, demoWorkerAction, requestCodeAction, verifyCodeAction } from "@/app/[locale]/(worker)/w/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

const masked = (phone: string) => `(•••) •••-${phone.replace(/\D/g, "").slice(-4)}`;

export function WorkerSignIn({ demoWorkers }: { demoWorkers: { id: string; name: string }[] }) {
  const t = useTranslations("workerApp.signIn");
  const locale = useLocale();
  const id = useId();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<{ phone: string; demoCopy: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<"invalid" | "throttled" | "invalidPhone" | null>(null);
  const [choice, setChoice] = useState<{ choice: string; agencies: { workerId: string; agencyName: string }[] } | null>(null);
  const [sending, startSend] = useTransition();
  const [checking, startCheck] = useTransition();
  const [demoing, startDemo] = useTransition();
  const triedFor = useRef<string | null>(null);

  const send = (number: string) =>
    startSend(async () => {
      const r = await requestCodeAction(locale, number);
      if (!r.ok) {
        setError(r.error === "invalid" ? "invalidPhone" : "throttled");
        return;
      }
      setSent({ phone: number, demoCopy: r.demoCopy });
      setError(null);
      setCode("");
      triedFor.current = null;
    });
  const verify = (value: string) => {
    if (!sent) return;
    triedFor.current = value;
    startCheck(async () => {
      // A single agency leaves the page; a refusal or a choice comes back.
      const r = await verifyCodeAction({ phone: sent.phone, code: value });
      if (r.ok) setChoice(r);
      else setError(r.error);
      setCode("");
      triedFor.current = null;
    });
  };

  const demo =
    demoWorkers.length > 0 ? (
      <div className="flex flex-col gap-3 border-t pt-5" data-testid="worker-demo">
        <p className="text-center text-sm text-muted-foreground">{t("demoTitle")}</p>
        {demoWorkers.map((w) => (
          <Button key={w.id} variant="outline" className="w-full" disabled={demoing} loading={demoing} onClick={() => startDemo(async () => void (await demoWorkerAction(w.id)))} data-testid={`worker-demo-${w.id}`}>
            {t("demoAs", { name: w.name })}
          </Button>
        ))}
      </div>
    ) : null;

  const message = error ? t(error) : null;

  if (choice)
    return (
      <>
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t("chooseTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("chooseBody")}</p>
        </div>
        <ul className="flex flex-col gap-2" data-testid="worker-agencies">
          {choice.agencies.map((a) => (
            <li key={a.workerId}>
              <Button variant="outline" className="w-full justify-start" onClick={() => startCheck(async () => void (await chooseAgencyAction(choice.choice, a.workerId)))} disabled={checking}>
                {a.agencyName}
              </Button>
            </li>
          ))}
        </ul>
      </>
    );

  if (!sent)
    return (
      <>
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("body")}</p>
        </div>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (phone.trim()) send(phone.trim());
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-phone`}>{t("phone")}</Label>
            <Input
              id={`${id}-phone`}
              className="bg-background"
              type="tel"
              autoComplete="tel-national"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? `${id}-error` : undefined}
              autoFocus
              data-testid="worker-phone"
            />
          </div>
          {message && (
            <p id={`${id}-error`} role="alert" className="text-sm text-destructive" data-testid="worker-sign-in-error">
              {message}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={sending || !phone.trim()} loading={sending} loadingLabel={t("sending")} data-testid="worker-send-code">
            {t("send")}
          </Button>
        </form>
        {demo}
        <Link href="/sign-in" className="self-center rounded-sm text-sm text-accent-text underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">
          {t("agencySignIn")}
        </Link>
      </>
    );

  return (
    <>
      <div className="flex flex-col gap-2 text-center" role="status">
        <h1 className="text-2xl font-semibold tracking-tight">{t("sentTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("sentBody", { phone: masked(sent.phone) })}</p>
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
              if (digits.length === 6 && triedFor.current !== digits && !checking) verify(digits);
            }}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? `${id}-error` : undefined}
            autoFocus
            data-testid="worker-code"
          />
        </div>
        {message && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive" data-testid="worker-sign-in-error">
            {message}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={checking || code.length !== 6} loading={checking} loadingLabel={t("submitting")} data-testid="worker-code-submit">
          {t("submit")}
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
        <button type="button" className="rounded-sm text-accent-text underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50" disabled={sending} onClick={() => send(sent.phone)}>
          {t("resend")}
        </button>
        <button
          type="button"
          className="rounded-sm text-accent-text underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => {
            setSent(null);
            setError(null);
            setCode("");
          }}
        >
          {t("otherNumber")}
        </button>
      </div>
      {sent.demoCopy && (
        <div className="flex flex-col gap-2 rounded-md border bg-background p-3 text-sm" data-testid="worker-demo-copy">
          <p className="font-medium">{t("demoCopy")}</p>
          <p className="whitespace-pre-wrap" data-testid="worker-demo-text">
            {sent.demoCopy}
          </p>
        </div>
      )}
    </>
  );
}
