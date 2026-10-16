"use client";

// Pattern: docs/patterns/sign-in/demo-provider/[provider].md (decision 0033) — the demo's stand-in for
// a provider's sign-in step (OpenID Connect Core §3.1.2.4: choose the account, go back with a code),
// as Shiftbook's own plain page: the accounts as full-width buttons, one under another (Linear's ways
// in, decision K3). Nothing here imitates Google's or Microsoft's pages.
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { withoutNote } from "../person";

export function DemoProviderView({ provider, request, accounts }: { provider: "google" | "microsoft" | "sso"; request: string | null; accounts: { email: string; name: string | null }[] }) {
  const t = useTranslations("identities.demo");
  const name = t(`providerNames.${provider}`);
  const [pending, setPending] = useState(false);
  if (!request)
    return (
      <>
        <div className="flex flex-col gap-2 text-center" data-testid="demo-provider-bad">
          <h1 className="text-2xl font-semibold tracking-tight">{t("badTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("badBody")}</p>
        </div>
        <Link href="/sign-in" className={buttonVariants({ className: "w-full" })}>
          {t("back")}
        </Link>
      </>
    );
  return (
    <>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title", { provider: name })}</h1>
        <p className="text-sm text-balance text-muted-foreground">{t("body", { provider: name })}</p>
      </div>
      {/* A plain form to the stand-in's authorize step; the chosen button's value goes with it. */}
      <form
        method="post"
        action={`/api/demo/idp/${provider}/authorize`}
        className="flex flex-col gap-2.5"
        aria-busy={pending}
        onSubmit={(e) => {
          if (pending) e.preventDefault();
          else setPending(true);
        }}
      >
        <input type="hidden" name="request" value={request} />
        <h2 className="text-sm font-medium">{t("choose")}</h2>
        {accounts.map((a) => (
          <Button
            key={a.email}
            type="submit"
            name="account"
            value={a.email}
            variant="outline"
            className={cn("h-auto w-full justify-start bg-background px-3 py-2 text-left", pending && "pointer-events-none opacity-60")}
            data-testid={`demo-account-${a.email}`}
          >
            <span className="flex min-w-0 flex-col items-start">
              <span className="truncate">{a.name ? withoutNote(a.name) : t("notMember")}</span>
              <span className="truncate text-xs font-normal text-muted-foreground group-hover/button:text-foreground">{a.email}</span>
            </span>
          </Button>
        ))}
        <Button type="submit" name="account" value="cancel" variant="ghost" className={cn("w-full", pending && "pointer-events-none opacity-60")} data-testid="demo-provider-cancel">
          {pending ? t("working") : t("cancel")}
        </Button>
      </form>
    </>
  );
}
