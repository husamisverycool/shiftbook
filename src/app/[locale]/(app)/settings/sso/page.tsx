// Pattern: docs/patterns/settings/sso.md — Notion's Settings › Identity (enable SSO, the address to copy
// into the identity provider, the provider's details), Linear's Security › Authentication methods,
// Stripe's configuration checks (decision 0033).
import { setRequestLocale } from "next-intl/server";
import { SsoSettingsView } from "@/components/shiftbook/settings/sso";
import { authDeps } from "@/server/auth/deps";
import { resolveIssuer, ssoSettingsOf } from "@/server/auth/identities";
import { redirectUri } from "@/server/auth/oidc-flow";
import { can } from "@/server/permissions";
import { requestOrigin } from "@/server/request-info";
import { linkBaseUrl } from "@/server/services";
import { currentActor, isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function SsoSettingsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const base = linkBaseUrl(await requestOrigin());
  const settings = await ssoSettingsOf(authDeps(), actor.agencyId);
  return (
    <SsoSettingsView
      canManage={can(actor, "members")}
      demo={isDemo()}
      redirectUri={redirectUri(base, "sso")}
      settings={
        settings && {
          enabled: settings.enabled,
          issuer: resolveIssuer(settings.issuer, base, isDemo()) ?? settings.issuer,
          clientId: settings.clientId,
          secretLast4: settings.secretLast4,
          updatedAt: settings.updatedAt.toISOString(),
          updatedByLabel: settings.updatedByLabel,
        }
      }
    />
  );
}
