"use client";

// Pattern: docs/patterns/sign-in/setup.md, part 4 — GitHub's offer to add a passkey once two-factor is on:
// one line on what it changes, Add a passkey or Not now. Adding goes as Your account's does (decision
// 0032): a code from the authenticator with the request, then the device's own prompt.
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { CheckIcon, FingerprintIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { addPasskeyAction, passkeyRegistrationOptionsAction } from "@/app/[locale]/(auth)/passkey-actions";
import { Button } from "@/components/ui/button";
import { cancelledByPerson } from "./passkey";
import { useAskToConfirm } from "./confirm-access";

type Options = Awaited<ReturnType<typeof passkeyRegistrationOptionsAction>>;

/** Whether this browser can make a passkey (checked once on the client). */
export const canMakePasskeys = () => typeof window !== "undefined" && browserSupportsWebAuthn();

export function PasskeyOffer({ onDone, pending }: { onDone: () => void; pending: boolean }) {
  const t = useTranslations("setup.passkey");
  const askToConfirm = useAskToConfirm();
  const [adding, start] = useTransition();
  const [added, setAdded] = useState(false);
  const [failed, setFailed] = useState(false);

  const add = () =>
    start(async () => {
      setFailed(false);
      let options: Options = await passkeyRegistrationOptionsAction(null);
      if (!options.ok && options.error === "confirm") {
        const box: { answer?: Options } = {};
        const yes = askToConfirm
          ? await askToConfirm(async (secret) => {
              const r = await passkeyRegistrationOptionsAction(secret);
              if (!r.ok && (r.error === "invalid" || r.error === "locked" || r.error === "busy")) return { ok: false, error: r.error };
              box.answer = r;
              return { ok: true };
            })
          : false;
        if (!yes || !box.answer) return;
        options = box.answer;
      }
      if (!options.ok) return setFailed(true);
      let response;
      try {
        response = await startRegistration({ optionsJSON: options.options });
      } catch (e) {
        if (!cancelledByPerson(e)) setFailed(true);
        return;
      }
      const r = await addPasskeyAction(response);
      if (!r.ok) return setFailed(true);
      setAdded(true);
    });

  return (
    <section aria-labelledby="passkey-offer-title" className="flex flex-col gap-4 rounded-lg border bg-background p-5" data-testid="passkey-offer">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {added ? <CheckIcon className="size-4" /> : <FingerprintIcon className="size-4" />}
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="passkey-offer-title" className="text-sm font-medium">
            {added ? t("addedTitle") : t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{added ? t("addedBody") : t("body")}</p>
        </div>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive" data-testid="passkey-offer-error">
          {t("failed")}
        </p>
      )}
      {added ? (
        <Button className="w-full" onClick={onDone} loading={pending} loadingLabel={t("continuing")} data-testid="passkey-offer-continue">
          {t("continue")}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Button className="w-full" onClick={add} loading={adding} loadingLabel={t("adding")} disabled={pending} data-testid="passkey-offer-add">
            {t("add")}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onDone} disabled={adding || pending} data-testid="passkey-offer-skip">
            {t("notNow")}
          </Button>
        </div>
      )}
    </section>
  );
}
