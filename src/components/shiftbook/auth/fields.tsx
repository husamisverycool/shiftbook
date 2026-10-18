"use client";

// Shared fields of the sign-in pages: a new password with its confirmation (GitHub "Password" and
// "Confirm password"), and the six-digit code / recovery code (GitHub's two-factor step).
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The rule NIST SP 800-63B-4 sets, checked before sending (the server checks it again). */
export function passwordIssue(password: string, confirm: string, email: string): string | null {
  const chars = [...password.normalize("NFKC")];
  if (chars.length < 15) return "too_short";
  if (chars.length > 128) return "too_long";
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) return "is_email";
  if (new Set(chars).size === 1) return "one_character";
  if (password !== confirm) return "mismatch";
  return null;
}

export function NewPasswordFields({
  email,
  pending,
  submitLabel,
  pendingLabel,
  serverError,
  onSubmit,
  currentField,
  labels,
  frame,
}: {
  email: string;
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
  serverError: string | null;
  onSubmit: (password: string, current: string) => void;
  /** The current password's label, when one is asked (the account page). */
  currentField?: { label: string };
  /** The account page's own labels ("New password", "Confirm new password"). */
  labels?: { password: string; confirm: string };
  /** The account page puts the fields in its settings panel and the button in the panel's foot. */
  frame?: (fields: ReactNode, submit: ReactNode) => ReactNode;
}) {
  const t = useTranslations("newPassword");
  const tc = useTranslations("common");
  const id = useId();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [issue, setIssue] = useState<string | null>(null);
  const shown = issue ?? serverError;
  const message = shown === "mismatch" ? t("mismatch") : shown ? t(`errors.${shown}` as "errors.generic") : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = passwordIssue(password, confirm, email);
    setIssue(problem);
    if (!problem) onSubmit(password, current);
  };
  const fields = (
    <>
      {currentField && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-current`}>{currentField.label}</Label>
          <Input
            id={`${id}-current`}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            aria-invalid={shown === "wrong_password" ? true : undefined}
            aria-describedby={shown === "wrong_password" ? `${id}-error` : undefined}
          />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-new`}>{labels?.password ?? t("password")}</Label>
        <Input
          id={`${id}-new`}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={shown && shown !== "mismatch" && shown !== "wrong_password" ? true : undefined}
          aria-describedby={`${id}-rule${shown ? ` ${id}-error` : ""}`}
          data-testid="new-password"
        />
        <p id={`${id}-rule`} className="text-xs text-muted-foreground">
          {t("rule")}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-confirm`}>{labels?.confirm ?? t("confirm")}</Label>
        <Input
          id={`${id}-confirm`}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={shown === "mismatch" ? true : undefined}
          data-testid="confirm-password"
        />
      </div>
      {message && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive" data-testid="password-error">
          {message}
        </p>
      )}
    </>
  );
  const button = (
    <Button type="submit" disabled={pending} className={frame ? undefined : "w-full"} data-testid="password-submit" loading={pending} loadingLabel={tc("loading")}>
      {pending ? pendingLabel : submitLabel}
    </Button>
  );
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {/* Lets a password manager tie the new password to the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      {frame ? (
        frame(fields, button)
      ) : (
        <>
          {fields}
          {button}
        </>
      )}
    </form>
  );
}

/**
 * The six-digit code from the app (sent on its own once six digits are typed), or — under "More
 * options" — a recovery code. `onSubmit` returns the refusal to show, if any.
 */
export function CodeFields({ onSubmit, pending, error }: { onSubmit: (code: string) => void; pending: boolean; error: "invalid" | "locked" | null }) {
  const t = useTranslations("signInCode");
  const id = useId();
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const sentFor = useRef<string | null>(null);
  const send = (value: string) => {
    sentFor.current = value;
    onSubmit(value);
  };
  const message = error === "locked" ? t("locked") : error === "invalid" ? t(recovery ? "invalidRecovery" : "invalid") : null;
  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) send(code.trim());
        }}
        className="flex flex-col gap-4"
        noValidate
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-code`}>{recovery ? t("recovery") : t("code")}</Label>
          {recovery ? (
            <Input
              id={`${id}-code`}
              key="recovery"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={message ? true : undefined}
              aria-describedby={`${id}-hint${message ? ` ${id}-error` : ""}`}
              autoFocus
              className="font-mono"
              data-testid="recovery-code"
            />
          ) : (
            <Input
              id={`${id}-code`}
              key="app"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(digits);
                if (digits.length === 6 && sentFor.current !== digits && !pending) send(digits);
              }}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? `${id}-error` : undefined}
              autoFocus
              className="font-mono tracking-widest"
              data-testid="code"
            />
          )}
          {recovery && (
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              {t("recoveryBody")}
            </p>
          )}
        </div>
        {message && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive" data-testid="code-error">
            {message}
          </p>
        )}
        <Button type="submit" disabled={pending || code.trim() === ""} className="w-full" data-testid="code-submit" loading={pending} loadingLabel={t("verifying")}>
          {t("verify")}
        </Button>
      </form>
      <div className="flex flex-col gap-1 text-sm">
        <p className="text-muted-foreground">{t("moreOptions")}</p>
        <button
          type="button"
          className="w-fit text-left text-accent-text underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => {
            setRecovery((r) => !r);
            setCode("");
            sentFor.current = null;
          }}
          data-testid="toggle-recovery"
        >
          {recovery ? t("useApp") : t("useRecovery")}
        </button>
      </div>
    </div>
  );
}
