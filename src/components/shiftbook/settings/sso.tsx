"use client";

// Pattern: docs/patterns/settings/sso.md (decision 0033) — Notion's Settings › Identity (the toggle, the
// address to copy into the identity provider, the provider's details, then save), Linear's Security ›
// Authentication methods, Stripe's configuration checks; every change confirms it's the Owner first
// (GitHub's sudo mode).
import { LockIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { saveSsoAction, setSsoEnabledAction, type SsoResult } from "@/app/[locale]/(app)/settings/sso/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { useConfirmed } from "../auth/confirm-access";
import { EmptyState } from "../empty-state";
import { Page, PageHeader } from "../page";

export interface SsoSettingsProps {
  canManage: boolean;
  demo: boolean;
  redirectUri: string;
  settings: { enabled: boolean; issuer: string; clientId: string; secretLast4: string; updatedAt: string; updatedByLabel: string } | null;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex max-w-2xl flex-col gap-3 border-t pt-6">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

const ISSUER_ERRORS = ["invalid_issuer", "issuer_private", "issuer_unreachable", "demo_issuer_only"];
const SECRET_ERRORS = ["secret_required", "secret_too_short", "invalid_secret"];

/** Not the Owner: the same state the other settings pages show a role they are not for (margin settings). */
export function SsoNotForRole() {
  const t = useTranslations("sso.settings");
  return (
    <Page>
      <PageHeader title={t("title")} />
      <EmptyState icon={LockIcon} title={t("notForRoleTitle")} description={t("ownerOnly")} testId="sso-not-allowed" />
    </Page>
  );
}

export function SsoSettingsView({ canManage, demo, redirectUri, settings }: SsoSettingsProps) {
  const t = useTranslations("sso.settings");
  const locale = useLocale();
  const id = useId();
  const router = useRouter();
  const confirmed = useConfirmed();
  const [issuer, setIssuer] = useState(settings?.issuer ?? "");
  const [clientId, setClientId] = useState(settings?.clientId ?? "");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [switching, startSwitch] = useTransition();
  const failed = (r: SsoResult | null) => (r && !r.ok && r.error !== "confirm" ? r.error : null);

  const toggle = (on: boolean) =>
    startSwitch(async () => {
      const r = await confirmed(() => setSsoEnabledAction(on));
      if (r?.ok) toast.success(t(on ? "turnedOn" : "turnedOff"));
      else if (failed(r)) toast.error(t(`errors.${failed(r)}` as "errors.generic"));
      router.refresh();
    });
  const save = () =>
    startSave(async () => {
      const r = await confirmed(() => saveSsoAction({ issuer, clientId, clientSecret: secret.trim() ? secret : null }));
      setError(failed(r));
      if (r?.ok) {
        setSecret("");
        toast.success(t("saved"));
        router.refresh();
      }
    });
  const fieldError = (kinds: string[], key: string) =>
    error && kinds.includes(error) ? (
      <p id={`${id}-${key}-error`} role="alert" className="text-sm text-destructive" data-testid={`sso-${key}-error`}>
        {t(`errors.${error}` as "errors.generic")}
      </p>
    ) : null;
  const otherError = error && !ISSUER_ERRORS.includes(error) && !SECRET_ERRORS.includes(error) && error !== "invalid_client_id" ? error : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{t("eyebrow")}</p>
        <h1 className="text-[28px] leading-9 font-bold tracking-tight">{t("title")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("body")}</p>
        {demo && <p className="max-w-2xl text-sm text-muted-foreground">{t("demoNote")}</p>}
      </header>

      {/* The status row on its own under a rule (Notion's toggle): its label names it. */}
      <div className="flex max-w-2xl flex-col gap-3 border-t pt-6">
        <div className="flex items-start gap-3">
          <Switch
            id={`${id}-switch`}
            checked={Boolean(settings?.enabled)}
            disabled={!canManage || !settings || switching}
            onCheckedChange={(on) => toggle(on)}
            aria-describedby={`${id}-switch-line`}
            className="mt-0.5"
            data-testid="sso-enabled"
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor={`${id}-switch`}>{t("status")}</Label>
            <p id={`${id}-switch-line`} className="text-sm text-muted-foreground" data-testid="sso-status">
              {settings ? t(settings.enabled ? "on" : "off") : t("notSetUp")}
            </p>
          </div>
        </div>
        {!canManage && <p className="text-sm text-muted-foreground">{t("ownerOnly")}</p>}
      </div>

      {canManage && (
        <>
          <Section id={`${id}-provider`} title={t("forProvider")}>
            <div className="flex max-w-xl flex-col gap-2">
              <Label htmlFor={`${id}-redirect`}>{t("redirect")}</Label>
              <div className="flex gap-2">
                <Input id={`${id}-redirect`} readOnly value={redirectUri} className="font-mono text-xs" aria-describedby={`${id}-redirect-hint`} onFocus={(e) => e.currentTarget.select()} data-testid="sso-redirect" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(redirectUri).then(
                      () => toast.success(t("copied")),
                      () => undefined,
                    );
                  }}
                >
                  {t("copy")}
                </Button>
              </div>
              <p id={`${id}-redirect-hint`} className="text-xs text-muted-foreground">
                {t("redirectHint")}
              </p>
            </div>
          </Section>

          <Section id={`${id}-details`} title={t("details")}>
            <form
              className="flex max-w-xl flex-col gap-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-issuer`}>{t("issuer")}</Label>
                <Input
                  id={`${id}-issuer`}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  aria-invalid={error && ISSUER_ERRORS.includes(error) ? true : undefined}
                  aria-describedby={`${id}-issuer-hint${error && ISSUER_ERRORS.includes(error) ? ` ${id}-issuer-error` : ""}`}
                  data-testid="sso-issuer"
                />
                <p id={`${id}-issuer-hint`} className="text-xs text-muted-foreground">
                  {t("issuerHint")}
                </p>
                {fieldError(ISSUER_ERRORS, "issuer")}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-client`}>{t("clientId")}</Label>
                <Input
                  id={`${id}-client`}
                  autoComplete="off"
                  spellCheck={false}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  aria-invalid={error === "invalid_client_id" ? true : undefined}
                  aria-describedby={error === "invalid_client_id" ? `${id}-client-error` : undefined}
                  data-testid="sso-client-id"
                />
                {fieldError(["invalid_client_id"], "client")}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-secret`}>{settings ? t("replaceSecret") : t("clientSecret")}</Label>
                {settings && (
                  <p className="text-sm" data-testid="sso-secret-set">
                    {t("clientSecret")}: {t("secretSet", { last4: settings.secretLast4 })}
                  </p>
                )}
                <Input
                  id={`${id}-secret`}
                  type="password"
                  autoComplete="new-password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  aria-invalid={error && SECRET_ERRORS.includes(error) ? true : undefined}
                  aria-describedby={`${settings ? `${id}-secret-hint` : ""}${error && SECRET_ERRORS.includes(error) ? ` ${id}-secret-error` : ""}`.trim() || undefined}
                  data-testid="sso-secret"
                />
                {settings && (
                  <p id={`${id}-secret-hint`} className="text-xs text-muted-foreground">
                    {t("replaceHint")}
                  </p>
                )}
                {fieldError(SECRET_ERRORS, "secret")}
              </div>
              {otherError && (
                <p role="alert" className="text-sm text-destructive" data-testid="sso-error">
                  {t(`errors.${otherError}` as "errors.generic")}
                </p>
              )}
              <Button type="submit" className="w-fit" disabled={saving} data-testid="sso-save">
                {saving ? t("saving") : t("save")}
              </Button>
            </form>
          </Section>
        </>
      )}

      {settings && (
        <p className="border-t pt-6 text-xs text-muted-foreground">{t("lastChange", { name: settings.updatedByLabel, date: new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(new Date(settings.updatedAt)) })}</p>
      )}
    </div>
  );
}
