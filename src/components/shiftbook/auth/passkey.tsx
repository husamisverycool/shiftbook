"use client";

// Pattern: docs/patterns/sign-in.md — the "Passkey" tile (decision 0032; GitHub's "Sign in with a
// passkey": the browser asks for a passkey on this device or a nearby one, then the app opens).
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type ReactNode } from "react";
import { passkeySignInAction, passkeySignInOptionsAction } from "@/app/[locale]/(auth)/passkey-actions";

/** The person closed the browser's passkey prompt, or it timed out: nothing to say. */
export function cancelledByPerson(error: unknown): boolean {
  const e = error as { name?: string; code?: string; cause?: { name?: string } } | null;
  return e?.name === "NotAllowedError" || e?.name === "AbortError" || e?.cause?.name === "NotAllowedError" || e?.code === "ERROR_CEREMONY_ABORTED";
}

/** The passkey tile on the sign-in page: asks the browser for a passkey and signs in with it. */
export function PasskeySignIn({ next, className, children }: { next: string | null; className?: string; children: ReactNode }) {
  const t = useTranslations("passkeys.signIn");
  const id = useId();
  const [error, setError] = useState<"invalid" | "locked" | "unsupported" | null>(null);
  const [pending, start] = useTransition();

  const signIn = () =>
    start(async () => {
      setError(null);
      if (!browserSupportsWebAuthn()) return setError("unsupported");
      const options = await passkeySignInOptionsAction();
      if (!options.ok) return setError(options.error);
      let response;
      try {
        response = await startAuthentication({ optionsJSON: options.options });
      } catch (e) {
        if (!cancelledByPerson(e)) setError("invalid");
        return;
      }
      // Reached only when refused (success leaves the page).
      const r = await passkeySignInAction({ response, next });
      setError(r.error);
    });

  return (
    <>
      <button type="button" className={className} disabled={pending} aria-busy={pending || undefined} aria-describedby={error ? `${id}-error` : undefined} onClick={signIn} data-testid="sign-in-passkey">
        {children}
        {pending && (
          <span className="sr-only" role="status">
            {t("working")}
          </span>
        )}
      </button>
      {error && (
        // Under the tiles (last in the grid, across it), whatever the tile's place among them.
        <p id={`${id}-error`} role="alert" className="order-last col-span-full text-center text-sm text-destructive" data-testid="passkey-error">
          {t(error)}
        </p>
      )}
    </>
  );
}
