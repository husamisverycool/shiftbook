"use client";

// Pattern: docs/patterns/settings/account.md — the Passkeys section (decision 0032; GitHub's
// "Passkeys" under "Password and authentication": each passkey listed, removed after a confirmation;
// "Add a passkey" re-authenticates, then the device's prompt, then a confirmation and Done).
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { KeyRoundIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { addPasskeyAction, passkeyRegistrationOptionsAction, removePasskeyAction } from "@/app/[locale]/(auth)/passkey-actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { cancelledByPerson } from "../auth/passkey";
import { useConfirmed } from "../auth/confirm-access";

export interface PasskeyItem {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** The device already holds a passkey for this person (one listed in excludeCredentials). */
const alreadyThere = (error: unknown) => {
  const e = error as { name?: string; code?: string } | null;
  return e?.name === "InvalidStateError" || e?.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED";
};

/** The section's body, put in the account page's own section frame (`frame`) under its title. */
export function PasskeysSection({ passkeys, frame }: { passkeys: PasskeyItem[]; frame: (title: string, body: ReactNode) => ReactNode }) {
  const t = useTranslations("passkeys");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const confirmed = useConfirmed();
  const [adding, startAdding] = useTransition();
  const [removing, startRemoving] = useTransition();
  const [error, setError] = useState<"addFailed" | "alreadyAdded" | "unsupported" | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<PasskeyItem | null>(null);
  const when = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(iso));

  const add = () =>
    startAdding(async () => {
      setError(null);
      if (!browserSupportsWebAuthn()) return setError("unsupported");
      const options = await confirmed(() => passkeyRegistrationOptionsAction());
      if (!options) return; // "Confirm it's you" was cancelled.
      if (!options.ok) return setError("addFailed");
      let response;
      try {
        response = await startRegistration({ optionsJSON: options.options });
      } catch (e) {
        if (alreadyThere(e)) setError("alreadyAdded");
        else if (!cancelledByPerson(e)) setError("addFailed");
        return;
      }
      const r = await confirmed(() => addPasskeyAction(response));
      if (!r) return;
      if (!r.ok) return setError(r.error === "exists" ? "alreadyAdded" : "addFailed");
      setAdded(r.passkey.name);
      router.refresh();
    });

  const remove = (passkeyId: string) =>
    startRemoving(async () => {
      setToRemove(null);
      const r = await confirmed(() => removePasskeyAction(passkeyId));
      if (!r?.ok) return;
      toast.success(t("removed"));
      router.refresh();
    });

  return frame(
    t("title"),
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {passkeys.length === 0 ? (
        <p className="text-sm" data-testid="passkeys-none">
          {t("none")}
        </p>
      ) : (
        <ul aria-label={t("listLabel")} className="divide-y rounded-lg border" data-testid="passkey-list">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3" data-testid="passkey">
              <KeyRoundIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium" data-testid="passkey-name">
                  {p.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("added", { date: when(p.createdAt) })} · {p.lastUsedAt ? t("lastUsed", { date: when(p.lastUsedAt) }) : t("neverUsed")}
                </span>
              </div>
              <Button variant="outline" size="sm" disabled={removing} aria-label={t("removeLabel", { name: p.name })} onClick={() => setToRemove(p)} data-testid="passkey-remove">
                {t("remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2">
        <Button className="w-fit" disabled={adding} aria-describedby={error ? `${id}-error` : undefined} onClick={add} data-testid="passkey-add">
          {adding ? t("adding") : t("add")}
        </Button>
        {error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive" data-testid="passkey-add-error">
            {t(error)}
          </p>
        )}
      </div>

      <AlertDialog open={toRemove !== null} onOpenChange={(open) => !open && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("removeBody", { name: toRemove?.name ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={removing} onClick={() => toRemove && remove(toRemove.id)} data-testid="passkey-remove-confirm">
              {t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={added !== null} onOpenChange={(open) => !open && setAdded(null)}>
        <DialogContent data-testid="passkey-added">
          <DialogHeader>
            <DialogTitle>{t("addedTitle")}</DialogTitle>
            <DialogDescription>{t("addedBody", { name: added ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setAdded(null)} data-testid="passkey-added-done">
              {t("done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>,
  );
}
