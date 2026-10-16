"use client";

// Pattern: docs/patterns/_components/confirm-access.md — GitHub's sudo mode: before a change to how one
// signs in or to the agency's people, the password (or a code) again; then the change goes ahead.
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { confirmAccessAction } from "@/app/[locale]/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Ask = () => Promise<boolean>;
const Confirm = createContext<Ask | null>(null);

export function ConfirmAccessProvider({ method, children }: { method: "code" | "password"; children: ReactNode }) {
  const t = useTranslations("confirmAccess");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<"invalid" | "locked" | "busy" | null>(null);
  const [pending, start] = useTransition();
  const settle = useRef<((yes: boolean) => void) | null>(null);

  const ask = useCallback<Ask>(
    () =>
      new Promise<boolean>((resolve) => {
        settle.current = resolve;
        setSecret("");
        setError(null);
        setOpen(true);
      }),
    [],
  );
  const finish = (yes: boolean) => {
    setOpen(false);
    settle.current?.(yes);
    settle.current = null;
  };

  return (
    <Confirm.Provider value={ask}>
      {children}
      <Dialog open={open} onOpenChange={(o) => !o && finish(false)}>
        <DialogContent data-testid="confirm-access">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t(method === "code" ? "bodyCode" : "bodyPassword")}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!secret.trim()) return;
              start(async () => {
                const r = await confirmAccessAction(secret);
                if (r.ok) finish(true);
                else {
                  setError(r.error);
                  setSecret("");
                }
              });
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-secret`}>{t(method === "code" ? "code" : "password")}</Label>
              <Input
                id={`${id}-secret`}
                type={method === "password" ? "password" : "text"}
                autoComplete={method === "password" ? "current-password" : "one-time-code"}
                inputMode={method === "code" ? "text" : undefined}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                autoFocus
                data-testid="confirm-secret"
              />
            </div>
            {error && (
              <p id={`${id}-error`} role="alert" className="text-sm text-destructive" data-testid="confirm-error">
                {t(error)}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => finish(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending || !secret.trim()} data-testid="confirm-submit">
                {pending ? t("confirming") : t("confirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Confirm.Provider>
  );
}

/**
 * Runs an action; when it answers "confirm", asks the person to confirm it's them and runs it again.
 * Null when they cancel. Outside the app frame (the sign-in pages), the action runs as it is.
 */
export function useConfirmed() {
  const ask = useContext(Confirm);
  return useCallback(
    async <T extends { ok: boolean; error?: string }>(fn: () => Promise<T>): Promise<T | null> => {
      const first = await fn();
      if (first.ok || first.error !== "confirm" || !ask) return first;
      return (await ask()) ? fn() : null;
    },
    [ask],
  );
}
