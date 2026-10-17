"use client";

// Pattern: docs/patterns/_layouts/portal-portal-token.md, States — a link that does not work, was
// turned off, or expired: the portal frame (_layouts/portal.md, Stripe hosted page: say what happened
// and who to contact) with one notice; an expired link may ask for a new one (decision 0013).
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { renewPortalLinkAction } from "@/app/[locale]/(portal)/portal/[token]/actions";
import { Button } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { ShellAgency } from "./shell";

export type NoticeState = { state: "invalid" } | { state: "revoked"; agency: ShellAgency } | { state: "expired"; agency: ShellAgency; canRenew: boolean };

export function PortalNotice({ view, token }: { view: NoticeState; token: string }) {
  const t = useTranslations("clientPortal");
  const tp = useTranslations("portal");
  const locale = useLocale();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<"sent" | string | null>(null);
  const agency = view.state === "invalid" ? null : view.agency;
  const contact = agency ? [agency.phone, agency.email].filter(Boolean).join(" · ") : "";
  const title = t(`states.${view.state}.title`);
  const body = view.state === "invalid" ? t("states.invalid.body") : view.state === "revoked" ? t("states.revoked.body", { agency: view.agency.name }) : t("states.expired.body");
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl min-w-0 items-center gap-4 px-4 py-3">
          <p className="mr-auto truncate font-semibold">{agency?.name ?? ""}</p>
          <nav aria-label={tp("language")} className="flex items-center gap-3 text-sm">
            {(["en", "es"] as const).map((l) => (
              <Link key={l} href={pathname} locale={l} aria-current={l === locale ? "true" : undefined} className={cn("rounded-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50", l === locale ? "font-medium" : "text-muted-foreground underline-offset-4 hover:text-foreground hover:underline")}>
                {tp(l === "en" ? "english" : "spanish")}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl min-w-0 flex-1 flex-col gap-6 px-4 py-8">
        <section className="flex flex-col gap-3" data-testid="portal-notice" data-state={view.state}>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-muted-foreground">{body}</p>
          {view.state === "expired" &&
            (!view.canRenew ? (
              <p className="text-muted-foreground">{t("states.expired.tooOld", { agency: view.agency.name })}</p>
            ) : result === "sent" ? (
              <p role="status" data-testid="portal-renewed">
                {t("states.expired.renewed")}
              </p>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <Button
                  variant="outline"
                  loading={pending}
                  loadingLabel={t("states.expired.renew")}
                  data-testid="portal-renew"
                  onClick={() =>
                    start(async () => {
                      const r = await renewPortalLinkAction(token);
                      setResult(r.ok ? "sent" : r.error);
                    })
                  }
                >
                  {t("states.expired.renew")}
                </Button>
                {result && result !== "sent" && (
                  <p role="alert" className="text-sm text-destructive">
                    {t.has(`errors.${result}`) ? t(`errors.${result}`) : t("errors.generic")}
                  </p>
                )}
              </div>
            ))}
        </section>
      </main>
      {agency && (
        <footer className="border-t">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-4 text-sm text-muted-foreground">
            {contact && <p>{tp("contact", { agency: agency.name, contact })}</p>}
            <p>{tp("providedBy", { agency: agency.name })}</p>
          </div>
        </footer>
      )}
    </>
  );
}
