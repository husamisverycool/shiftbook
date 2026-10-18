"use client";

// Pattern: docs/patterns/sign-in/code.md — GitHub's two-factor step: the code from the app, Verify; "More
// options" → a recovery code; and a way out (sign out).
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { signOutAction, verifyCodeAction } from "@/app/[locale]/(auth)/actions";
import { CodeFields } from "./fields";

export function CodeView({ next }: { next: string | null }) {
  const t = useTranslations("signInCode");
  const [error, setError] = useState<"invalid" | "locked" | null>(null);
  const [pending, start] = useTransition();
  const [leaving, leave] = useTransition();
  return (
    <>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("body")}</p>
      </div>
      <CodeFields
        pending={pending}
        error={error}
        onSubmit={(code) =>
          start(async () => {
            const r = await verifyCodeAction({ code, next });
            setError(r.error);
          })
        }
      />
      <p className="border-t pt-4 text-center text-sm text-muted-foreground">
        {t("notYou")}{" "}
        <button type="button" className="text-accent-text underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" disabled={leaving} onClick={() => leave(() => signOutAction())} data-testid="code-sign-out">
          {t("signOut")}
        </button>
      </p>
    </>
  );
}
