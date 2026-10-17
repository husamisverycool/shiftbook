"use client";

// Pattern: docs/patterns/settings/account.md §5 (decision 0033) — Vercel's "Login Connections" in the
// account's Authentication settings: one row per outside service, its mark and name, the account
// connected (one per service), Connect / Disconnect; a change to how one signs in confirms it's them
// first (GitHub's sudo mode, `_components/confirm-access.md`). Laid out as Linear's notification methods
// (docs/patterns/_components/settings.md): a tile with the mark, the name over its state, the action at the right.
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { connectIdentityAction, disconnectIdentityAction } from "@/app/[locale]/(auth)/identity-actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useDateTime } from "../agency-zone";
import { useConfirmed } from "../auth/confirm-access";
import { GoogleMark, MicrosoftMark } from "../auth/provider-marks";
import { SettingsRow, SettingsRows, SettingsSection, SettingsTile } from "../settings-panel";

type Provider = "google" | "microsoft";
export interface ConnectedAccountsValue {
  offered: Record<Provider, boolean>;
  identities: { id: string; provider: Provider | "sso"; email: string | null; createdAt: string }[];
}

const Data = createContext<ConnectedAccountsValue | null>(null);

/** The account page's server part hands the rows in; the section reads them where it sits. */
export function ConnectedAccountsData({ value, children }: { value: ConnectedAccountsValue; children: ReactNode }) {
  return <Data.Provider value={value}>{children}</Data.Provider>;
}

const MARKS: Record<Provider, typeof GoogleMark> = { google: GoogleMark, microsoft: MicrosoftMark };
const RESULTS = ["connected", "taken", "already", "failed", "confirm"] as const;

export function ConnectedAccounts() {
  const data = useContext(Data);
  const t = useTranslations("identities");
  const dateTime = useDateTime();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const confirmed = useConfirmed();
  const [pending, start] = useTransition();
  const name = (p: string) => (p === "google" || p === "microsoft" ? t(`providers.${p}`) : p);

  // Back from the provider: say how it went, once.
  const result = search.get("identity");
  const from = search.get("provider") ?? "";
  useEffect(() => {
    const known = RESULTS.find((r) => r === result);
    if (!known) return;
    const text = t(`result.${known}`, { provider: name(from) });
    if (known === "connected") toast.success(text);
    else toast.error(text);
    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per answer in the address
  }, [result]);

  if (!data) return null;
  const rows = (["google", "microsoft"] as const).filter((p) => data.offered[p] || data.identities.some((i) => i.provider === p));
  if (rows.length === 0) return null;
  const when = (iso: string) => dateTime(iso, { date: "long", time: false });

  const connect = (provider: Provider) =>
    start(async () => {
      const r = await confirmed(() => connectIdentityAction(provider));
      if (!r) return;
      if (r.ok) window.location.assign(r.url);
      else toast.error(t(`result.${r.error === "confirm" ? "confirm" : r.error}`, { provider: name(provider) }));
    });
  const disconnect = (identityId: string, provider: Provider) =>
    start(async () => {
      const r = await confirmed(() => disconnectIdentityAction(identityId));
      if (!r) return;
      if (r.ok) toast.success(t("result.disconnected", { provider: name(provider) }));
      router.refresh();
    });

  return (
    <SettingsSection title={t("connectedTitle")} description={t("connectedBody")} testId="connected-accounts">
      <SettingsRows as="ul">
        {rows.map((provider) => {
          const Mark = MARKS[provider];
          const linked = data.identities.find((i) => i.provider === provider);
          return (
            <SettingsRow
              key={provider}
              as="li"
              testId={`connected-${provider}`}
              leading={
                <SettingsTile>
                  <Mark className="size-4" />
                </SettingsTile>
              }
              label={name(provider)}
              description={<span className="block truncate">{linked ? [linked.email, t("connectedOn", { date: when(linked.createdAt) })].filter(Boolean).join(" · ") : t("notConnected")}</span>}
              descriptionTestId={`connected-${provider}-state`}
              control={
                linked ? (
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="ghost" className="text-destructive hover:text-destructive" disabled={pending} data-testid={`disconnect-${provider}`} />}>{t("disconnect")}</AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("disconnectTitle", { provider: name(provider) })}</AlertDialogTitle>
                        <AlertDialogDescription>{t("disconnectBody", { provider: name(provider) })}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => disconnect(linked.id, provider)} data-testid={`disconnect-${provider}-confirm`}>
                          {t("disconnect")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Button variant="ghost" disabled={pending || !data.offered[provider]} onClick={() => connect(provider)} data-testid={`connect-${provider}`}>
                    {pending ? t("connecting") : t("connect")}
                  </Button>
                )
              }
            />
          );
        })}
      </SettingsRows>
    </SettingsSection>
  );
}
