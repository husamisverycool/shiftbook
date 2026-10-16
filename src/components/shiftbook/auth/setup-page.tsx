"use client";

// Pattern: docs/patterns/sign-in/setup.md — GitHub: an organization that requires two-factor
// authentication; the person turns it on (the three-part setup) before the app opens.
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { finishSetupAction, signOutAction } from "@/app/[locale]/(auth)/actions";
import { useRouter } from "@/i18n/navigation";
import { AuthenticatorSetup } from "./authenticator-setup";

export function SetupView({ email, next }: { email: string; next: string }) {
  const t = useTranslations("setup");
  const router = useRouter();
  const [leaving, leave] = useTransition();
  const [, finish] = useTransition();
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("required")}</p>
      </div>
      <AuthenticatorSetup
        email={email}
        onFinished={() =>
          finish(async () => {
            await finishSetupAction();
            router.replace(next);
            router.refresh();
          })
        }
      />
      <p className="border-t pt-4 text-sm">
        <button type="button" className="text-primary underline-offset-4 hover:underline" disabled={leaving} onClick={() => leave(() => signOutAction())} data-testid="setup-sign-out">
          {t("signOut")}
        </button>
      </p>
    </>
  );
}
