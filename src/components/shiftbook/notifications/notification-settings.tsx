"use client";

// Pattern: docs/patterns/settings/notifications.md — Linear: Account › Notifications: one row per kind,
// its switch saving at once.
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setEmailAction } from "@/app/[locale]/(app)/settings/notifications/actions";
import { Switch } from "@/components/ui/switch";
import type { NotificationKind } from "@/server/db/schema";
import { SettingsEmpty, SettingsPage, SettingsRow, SettingsRows, SettingsSection } from "../settings-panel";

export function NotificationSettingsView({ settings, email }: { settings: Partial<Record<NotificationKind, boolean>>; email: string }) {
  const t = useTranslations("notify");
  const [values, setValues] = useState(settings);
  const [, start] = useTransition();
  const kinds = Object.keys(settings) as NotificationKind[];
  const change = (kind: NotificationKind, on: boolean) => {
    setValues((v) => ({ ...v, [kind]: on }));
    start(async () => {
      const r = await setEmailAction(kind, on);
      if (r.ok) toast.success(t("settings.saved"));
      else setValues((v) => ({ ...v, [kind]: !on }));
    });
  };
  return (
    <SettingsPage title={t("settings.title")} description={t("settings.intro")}>
      <SettingsSection title={t("settings.email")} description={t("settings.emailIntro", { email })} testId="notification-email">
        {kinds.length === 0 ? (
          <SettingsRows>
            <SettingsEmpty>{t("settings.none")}</SettingsEmpty>
          </SettingsRows>
        ) : (
          <SettingsRows>
            {kinds.map((kind) => (
              <SettingsRow
                key={kind}
                label={t(`kinds.${kind}.title`)}
                description={t(`settings.help.${kind}`)}
                htmlFor={`email-${kind}`}
                testId={`email-${kind}`}
                control={<Switch id={`email-${kind}`} checked={values[kind] ?? true} onCheckedChange={(on) => change(kind, on)} />}
              />
            ))}
          </SettingsRows>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
