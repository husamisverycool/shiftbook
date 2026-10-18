// Pattern: docs/patterns/settings/account.md — Slack's Language & region; GitHub's Password and
// authentication; Vercel's Login Connections (decision 0033).
import { setRequestLocale } from "next-intl/server";
import { AccountView } from "@/components/shiftbook/settings/account";
import { ConnectedAccountsData } from "@/components/shiftbook/settings/connected-accounts";
import { authDeps } from "@/server/auth/deps";
import { identitiesOf } from "@/server/auth/identities";
import { providerOffered } from "@/server/auth/oidc-flow";
import { listPasskeys } from "@/server/auth/passkeys";
import { accountOf, requiresSecondStep } from "@/server/auth/service";
import { currentActor, currentSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AccountPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  await currentActor();
  const session = (await currentSession())!;
  const account = await accountOf(authDeps(), session.userId);
  const identities = await identitiesOf(authDeps(), session.userId);
  const connected = {
    offered: { google: providerOffered("google"), microsoft: providerOffered("microsoft") },
    identities: identities.map((i) => ({ id: i.id, provider: i.provider, email: i.email, createdAt: i.createdAt.toISOString() })),
  };
  const passkeys = await listPasskeys(authDeps(), session);
  return (
    <ConnectedAccountsData value={connected}>
    <AccountView
      name={session.name}
      email={session.email}
      role={session.role}
      demo={session.demo}
      requiresAuthenticator={requiresSecondStep(session.role)}
      hasPassword={account.hasPassword}
      passwordChangedAt={account.passwordChangedAt?.toISOString() ?? null}
      authenticatorSince={account.authenticatorSince?.toISOString() ?? null}
      passkeys={passkeys.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt.toISOString(), lastUsedAt: p.lastUsedAt?.toISOString() ?? null }))}
      recoveryCodesLeft={account.recoveryCodesLeft}
      appearance={session.appearance ?? "system"}
    />
    </ConnectedAccountsData>
  );
}
