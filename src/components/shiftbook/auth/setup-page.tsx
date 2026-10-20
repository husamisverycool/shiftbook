"use client";

// Pattern: docs/patterns/sign-in/setup.md — GitHub: an organization that requires two-factor
// authentication; the person turns it on (the three-part setup) before the app opens; then GitHub's offer
// to add a passkey (part 4), where the browser can make one.
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { finishSetupAction, signOutAction } from "@/app/[locale]/(auth)/actions";
import { useRouter } from "@/i18n/navigation";
import { AuthenticatorSetup } from "./authenticator-setup";
import { ConfirmAccessProvider } from "./confirm-access";
import { canMakePasskeys, PasskeyOffer } from "./passkey-offer";

export function SetupView({ email, next }: { email: string; next: string }) {
  const t = useTranslations("setup");
  const router = useRouter();
  const [leaving, leave] = useTransition();
  const [finishing, finish] = useTransition();
  const [offer, setOffer] = useState(false);
  const done = () =>
    finish(async () => {
      await finishSetupAction();
      router.replace(next);
      router.refresh();
    });
  return (
    <>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{offer ? t("passkey.pageTitle") : t("title")}</h1>
        <p className="text-sm text-muted-foreground">{offer ? t("passkey.pageLine") : t("required")}</p>
      </div>
      {offer ? (
        <ConfirmAccessProvider method="code">
          <PasskeyOffer onDone={done} pending={finishing} />
        </ConfirmAccessProvider>
      ) : (
        <AuthenticatorSetup email={email} onFinished={() => (canMakePasskeys() ? setOffer(true) : done())} />
      )}
      <p className="border-t pt-4 text-center text-sm">
        <button type="button" className="text-accent-text underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" disabled={leaving} onClick={() => leave(() => signOutAction())} data-testid="setup-sign-out">
          {t("signOut")}
        </button>
      </p>
    </>
  );
}
