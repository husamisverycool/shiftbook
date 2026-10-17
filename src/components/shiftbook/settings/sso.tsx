"use client";

// Pattern: docs/patterns/settings/sso.md (decision 0033) — Notion's Settings › Identity (the toggle, the
// address to copy into the identity provider, the provider's details, then save), Linear's Security ›
// Authentication methods, Stripe's configuration checks; every change confirms it's the Owner first
// (GitHub's sudo mode). Laid out as Linear's SAML settings (docs/patterns/_components/settings.md): the
// switch in a row, the address and the provider's details in panels, the Save in the panel's foot.
import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSsoAction, setSsoEnabledAction, type SsoResult } from "@/app/[locale]/(app)/settings/sso/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { useDateTime } from "../agency-zone";
import { useConfirmed } from "../auth/confirm-access";
import { EmptyState } from "../empty-state";
import { Page, PageHeader } from "../page";
import { SettingsField, SettingsFooter, SettingsPage, SettingsPanel, SettingsRow, SettingsRows, SettingsSection } from "../settings-panel";

export interface SsoSettingsProps {
  canManage: boolean;
  /** The agency's changes are paused (decision 0036): single sign-on can be turned off, nothing else. */
  paused?: boolean;
  demo: boolean;
  redirectUri: string;
  settings: { enabled: boolean; issuer: string; clientId: string; secretLast4: string; updatedAt: string; updatedByLabel: string } | null;
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

export function SsoSettingsView({ canManage, paused = false, demo, redirectUri, settings }: SsoSettingsProps) {
  const t = useTranslations("sso.settings");
  const dateTime = useDateTime();
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
    <SettingsPage
      context={t("eyebrow")}
      title={t("title")}
      description={
        <>
          <p>{t("body")}</p>
          {demo && <p>{t("demoNote")}</p>}
        </>
      }
    >
      {/* Linear's SAML: the switch at the right of its row (Notion's "Enable SAML SSO"). */}
      <div className="flex flex-col gap-3">
        <SettingsRows>
          <SettingsRow
            label={t("status")}
            htmlFor={`${id}-switch`}
            description={settings ? t(settings.enabled ? "on" : "off") : t("notSetUp")}
            descriptionId={`${id}-switch-line`}
            descriptionTestId="sso-status"
            control={
              <Switch
                id={`${id}-switch`}
                checked={Boolean(settings?.enabled)}
                disabled={!canManage || !settings || switching || (paused && !settings.enabled)}
                onCheckedChange={(on) => toggle(on)}
                aria-describedby={`${id}-switch-line`}
                data-testid="sso-enabled"
              />
            }
          />
        </SettingsRows>
        {!canManage && <p className="text-sm text-muted-foreground">{t("ownerOnly")}</p>}
        {canManage && paused && <p className="text-sm text-muted-foreground" data-testid="sso-paused">{t("pausedNote")}</p>}
      </div>

      {canManage && (
        <>
          <SettingsSection title={t("forProvider")}>
            <SettingsPanel>
              <SettingsField id={`${id}-redirect`} label={t("redirect")} hint={t("redirectHint")} hintId={`${id}-redirect-hint`}>
                <div className="flex gap-2">
                  <Input id={`${id}-redirect`} readOnly value={redirectUri} className="font-mono text-xs md:text-xs" aria-describedby={`${id}-redirect-hint`} onFocus={(e) => e.currentTarget.select()} data-testid="sso-redirect" />
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
              </SettingsField>
            </SettingsPanel>
          </SettingsSection>

          <SettingsSection title={t("details")}>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <SettingsPanel
                footer={
                  <SettingsFooter note={settings ? t("lastChange", { name: settings.updatedByLabel, date: dateTime(settings.updatedAt, { date: "long" }) }) : undefined}>
                    {!paused && (
                      <Button type="submit" disabled={saving} data-testid="sso-save">
                        {saving ? t("saving") : t("save")}
                      </Button>
                    )}
                  </SettingsFooter>
                }
              >
                <SettingsField id={`${id}-issuer`} label={t("issuer")} hint={t("issuerHint")} hintId={`${id}-issuer-hint`} problem={fieldError(ISSUER_ERRORS, "issuer")}>
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
                </SettingsField>
                <SettingsField id={`${id}-client`} label={t("clientId")} problem={fieldError(["invalid_client_id"], "client")}>
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
                </SettingsField>
                <SettingsField
                  id={`${id}-secret`}
                  label={settings ? t("replaceSecret") : t("clientSecret")}
                  hint={settings ? t("replaceHint") : undefined}
                  hintId={`${id}-secret-hint`}
                  problem={fieldError(SECRET_ERRORS, "secret")}
                >
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
                </SettingsField>
                {otherError && (
                  <p role="alert" className="text-sm text-destructive" data-testid="sso-error">
                    {t(`errors.${otherError}` as "errors.generic")}
                  </p>
                )}
              </SettingsPanel>
            </form>
          </SettingsSection>
        </>
      )}
    </SettingsPage>
  );
}
