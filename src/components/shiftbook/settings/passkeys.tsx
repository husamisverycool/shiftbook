"use client";

// Pattern: docs/patterns/settings/account.md — the Passkeys section (decision 0032; GitHub's
// "Passkeys" under "Password and authentication": each passkey listed, removed after a confirmation;
// "Add a passkey" re-authenticates — here every time, the password or code going with the request —
// then the device's prompt, then a confirmation and Done). Laid out as Linear's SAML domains list
// (docs/patterns/_components/settings.md): a tile, the name over when it was added, the action at the right.
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { KeyRoundIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { addPasskeyAction, passkeyRegistrationOptionsAction, removePasskeyAction } from "@/app/[locale]/(auth)/passkey-actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { useDateTime } from "../agency-zone";
import { cancelledByPerson } from "../auth/passkey";
import { useAskToConfirm, useConfirmed } from "../auth/confirm-access";
import { SettingsEmpty, SettingsRow, SettingsRows, SettingsSection, SettingsTile } from "../settings-panel";

export interface PasskeyItem {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

type Problem = "addFailed" | "alreadyAdded" | "unsupported" | "tooMany" | "unavailable";
type Options = Awaited<ReturnType<typeof passkeyRegistrationOptionsAction>>;
const problemOf = (error: string): Problem => (error === "too_many" ? "tooMany" : error === "unavailable" ? "unavailable" : error === "exists" ? "alreadyAdded" : "addFailed");

/** The device already holds a passkey for this person (one listed in excludeCredentials). */
const alreadyThere = (error: unknown) => {
  const e = error as { name?: string; code?: string } | null;
  return e?.name === "InvalidStateError" || e?.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED";
};

/** The account page's Passkeys section. */
export function PasskeysSection({ passkeys }: { passkeys: PasskeyItem[] }) {
  const t = useTranslations("passkeys");
  const router = useRouter();
  const id = useId();
  const confirmed = useConfirmed();
  const askToConfirm = useAskToConfirm();
  const [adding, startAdding] = useTransition();
  const [removing, startRemoving] = useTransition();
  const [error, setError] = useState<Problem | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<PasskeyItem | null>(null);
  const dateTime = useDateTime();
  const when = (iso: string) => dateTime(iso, { date: "long", time: false });

  const add = () =>
    startAdding(async () => {
      setError(null);
      if (!browserSupportsWebAuthn()) return setError("unsupported");
      let options: Options = await passkeyRegistrationOptionsAction(null);
      if (!options.ok && options.error === "confirm") {
        // "Confirm it's you", the password or code going with the request for this passkey.
        const box: { answer?: Options } = {};
        const yes = askToConfirm
          ? await askToConfirm(async (secret) => {
              const r = await passkeyRegistrationOptionsAction(secret);
              if (!r.ok && (r.error === "invalid" || r.error === "locked" || r.error === "busy")) return { ok: false, error: r.error };
              box.answer = r;
              return { ok: true };
            })
          : false;
        if (!yes || !box.answer) return; // Cancelled.
        options = box.answer;
      }
      if (!options.ok) return setError(problemOf(options.error));
      let response;
      try {
        response = await startRegistration({ optionsJSON: options.options });
      } catch (e) {
        if (alreadyThere(e)) setError("alreadyAdded");
        else if (!cancelledByPerson(e)) setError("addFailed");
        return;
      }
      const r = await addPasskeyAction(response);
      if (!r.ok) return setError(problemOf(r.error));
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

  return (
    <SettingsSection
      title={t("title")}
      description={t("intro")}
      action={
        <Button variant="outline" size="sm" disabled={adding} aria-describedby={error ? `${id}-error` : undefined} onClick={add} data-testid="passkey-add">
          <PlusIcon />
          {adding ? t("adding") : t("add")}
        </Button>
      }
    >
      {passkeys.length === 0 ? (
        <SettingsRows>
          <SettingsEmpty testId="passkeys-none">{t("none")}</SettingsEmpty>
        </SettingsRows>
      ) : (
        <SettingsRows as="ul" aria-label={t("listLabel")} testId="passkey-list">
          {passkeys.map((p) => (
            <SettingsRow
              key={p.id}
              as="li"
              testId="passkey"
              leading={
                <SettingsTile>
                  <KeyRoundIcon aria-hidden />
                </SettingsTile>
              }
              label={
                <span className="block truncate" data-testid="passkey-name">
                  {p.name}
                </span>
              }
              description={`${t("added", { date: when(p.createdAt) })} · ${p.lastUsedAt ? t("lastUsed", { date: when(p.lastUsedAt) }) : t("neverUsed")}`}
              control={
                <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={removing} aria-label={t("removeLabel", { name: p.name })} onClick={() => setToRemove(p)} data-testid="passkey-remove">
                  {t("remove")}
                </Button>
              }
            />
          ))}
        </SettingsRows>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive" data-testid="passkey-add-error">
          {t(error)}
        </p>
      )}

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
    </SettingsSection>
  );
}
