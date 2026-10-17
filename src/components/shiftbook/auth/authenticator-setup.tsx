"use client";

// Pattern: docs/patterns/sign-in/setup.md and settings/account.md — GitHub's two-factor setup on one page:
// 1. scan the QR code ("Setup key" shows the secret as text); 2. verify the code from the app;
// 3. save the recovery codes (Download, Print, Copy), then "I have saved my recovery codes".
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { beginSetupAction, confirmSetupAction } from "@/app/[locale]/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirmed } from "./confirm-access";
import { useCopied } from "../use-copied";

export function AuthenticatorSetup({ email, onFinished, onCancel }: { email: string; onFinished: () => void; onCancel?: () => void }) {
  const t = useTranslations("setup");
  const id = useId();
  const [setup, setSetup] = useState<{ setupKey: string; qr: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<"invalid" | "expired" | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  const latest = useRef(0);
  const confirmed = useConfirmed();

  // Only the newest request's key is shown (an older one is replaced on the server).
  // A replacement first asks the person to confirm it's them (GitHub's sudo mode); cancelling goes back.
  const load = useCallback(() => {
    const ticket = ++latest.current;
    return confirmed(() => beginSetupAction()).then((r) => {
      if (ticket !== latest.current) return;
      if (!r) onCancel?.();
      else if (r.ok) setSetup({ setupKey: r.setupKey, qr: r.qr });
      else setError("expired");
    });
  }, [confirmed, onCancel]);
  useEffect(() => {
    void load();
  }, [load]);
  const begin = () => {
    setSetup(null);
    setError(null);
    setCode("");
    void load();
  };

  const verify = (value: string) =>
    start(async () => {
      const r = await confirmSetupAction(value);
      if (r.ok) setCodes(r.recoveryCodes);
      else setError(r.error);
    });

  if (codes) return <RecoveryCodes email={email} codes={codes} title={t("step3")} onSaved={onFinished} done={t("on")} />;

  return (
    <div className="flex flex-col gap-6" data-testid="authenticator-setup">
      <section aria-labelledby={`${id}-scan`} className="flex flex-col gap-3">
        <h2 id={`${id}-scan`} className="font-semibold">
          {t("step1")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("step1Body")}</p>
        {setup ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL made on the server, never fetched
          <img src={setup.qr} alt={t("qrAlt")} width={176} height={176} className="size-44 rounded-md border bg-white p-1" data-testid="setup-qr" />
        ) : (
          <Skeleton className="size-44" aria-label={t("loading")} />
        )}
        <div className="flex flex-col gap-1 text-sm">
          <button type="button" className="w-fit text-primary underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" aria-expanded={showKey} onClick={() => setShowKey((s) => !s)} data-testid="show-setup-key">
            {t("showKey")}
          </button>
          {showKey && setup && (
            <>
              <p className="text-muted-foreground">{t("keyBody")}</p>
              <code className="w-fit rounded-md bg-muted px-2 py-1 font-mono text-sm break-all select-all" data-testid="setup-key">
                {setup.setupKey}
              </code>
            </>
          )}
        </div>
      </section>
      <section aria-labelledby={`${id}-verify`} className="flex flex-col gap-3">
        <h2 id={`${id}-verify`} className="font-semibold">
          {t("step2")}
        </h2>
        <form
          className="flex flex-col gap-3"
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
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              disabled={!setup}
              onChange={(e) => {
                setError(null);
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className="w-40 font-mono tracking-widest"
              data-testid="setup-code"
            />
          </div>
          {error && (
            <p id={`${id}-error`} role="alert" className="text-sm text-destructive" data-testid="setup-error">
              {t(error)}{" "}
              {error === "expired" && (
                <button type="button" className="text-primary underline underline-offset-4 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" onClick={begin}>
                  {t("startAgain")}
                </button>
              )}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || code.length !== 6 || !setup} data-testid="setup-verify" loading={pending} loadingLabel={t("verifying")}>
              {t("verify")}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                {t("cancel")}
              </Button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

/** Ten recovery codes, shown once: Download, Print, Copy, then "I have saved my recovery codes". */
export function RecoveryCodes({ email, codes, title, onSaved, done }: { email: string; codes: string[]; title: string; onSaved: () => void; done?: string }) {
  const t = useTranslations("setup");
  const id = useId();
  const text = `${t("fileHeader", { email })}\n\n${codes.join("\n")}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = t("fileName");
    a.click();
    URL.revokeObjectURL(url);
  };
  const print = () => {
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    const doc = w.document;
    doc.title = t("fileName");
    const pre = doc.createElement("pre");
    pre.textContent = text;
    pre.style.font = "16px/1.6 monospace";
    doc.body.appendChild(pre);
    w.focus();
    w.print();
    w.close();
  };
  const [copied, markCopied] = useCopied();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      markCopied();
      toast.success(t("copied"));
    } catch {
      toast.error(t("copy"));
    }
  };
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3" data-testid="recovery-codes">
      {done && (
        <p className="text-sm font-medium" role="status">
          {done}
        </p>
      )}
      <h2 id={`${id}-title`} className="font-semibold">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{t("step3Body")}</p>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border bg-muted/40 p-3 font-mono text-sm" aria-label={title}>
        {codes.map((c) => (
          <li key={c} data-testid="recovery-code-item">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={download}>
          {t("download")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={print}>
          {t("print")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {t("copy")}
        </Button>
      </div>
      <Button type="button" onClick={onSaved} data-testid="codes-saved">
        {t("saved")}
      </Button>
    </section>
  );
}
