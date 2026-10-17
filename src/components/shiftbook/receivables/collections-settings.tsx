"use client";

// Pattern: docs/patterns/settings/collections.md — Stripe's automatic reminders for unpaid invoices
// (before, when or after the due date, from fixed choices), drawn as the settings column's panels.
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveScheduleAction, setClientRemindersAction } from "@/app/[locale]/(app)/settings/collections/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { SCHEDULE_CHOICES, type ReminderSchedule } from "@/server/collections/schedule";
import { ReadOnlyNote } from "../abilities";
import { SettingsEmpty, SettingsFooter, SettingsPage, SettingsRow, SettingsRows, SettingsSection } from "../settings-panel";

type Field = "beforeDueDays" | "overdueDays" | "finalDays";
const STAGES: { stage: "before_due" | "overdue" | "final"; field: Field; before: boolean }[] = [
  { stage: "before_due", field: "beforeDueDays", before: true },
  { stage: "overdue", field: "overdueDays", before: false },
  { stage: "final", field: "finalDays", before: false },
];

export interface ReminderClient {
  id: string;
  name: string;
  billingEmail: string | null;
  remindersOn: boolean;
  hasProfile: boolean;
}

export function CollectionsSettingsView({ schedule, clients, canChange, canChangeClients }: { schedule: ReminderSchedule; clients: ReminderClient[]; canChange: boolean; canChangeClients: boolean }) {
  const t = useTranslations("collect.settings");
  const [draft, setDraft] = useState(schedule);
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(clients.map((c) => [c.id, c.remindersOn])));
  const [saving, startSave] = useTransition();
  const [, startClient] = useTransition();
  const changed = JSON.stringify(draft) !== JSON.stringify(schedule);
  const save = () =>
    startSave(async () => {
      const r = await saveScheduleAction(draft);
      if (r.ok) toast.success(t("saved"));
      else toast.error(t(`errors.${r.error}`));
    });
  const toggleClient = (id: string, value: boolean) => {
    setOn((o) => ({ ...o, [id]: value }));
    startClient(async () => {
      const r = await setClientRemindersAction(id, value);
      if (!r.ok) setOn((o) => ({ ...o, [id]: !value }));
    });
  };
  return (
    <SettingsPage title={t("title")} description={canChange ? undefined : <ReadOnlyNote text={t("errors.forbidden")} />}>
      <SettingsSection title={t("remindersTitle")} description={t("remindersIntro")} testId="reminder-schedule">
        <SettingsRows
          footer={
            canChange && (
              <SettingsFooter>
                <Button onClick={save} loading={saving} loadingLabel={t("save")} disabled={!changed} data-testid="save-schedule">
                  {t("save")}
                </Button>
              </SettingsFooter>
            )
          }
        >
          <SettingsRow
            label={t("enabled")}
            description={t("enabledHint")}
            htmlFor="reminders-enabled"
            control={<Switch id="reminders-enabled" checked={draft.enabled} disabled={!canChange} onCheckedChange={(enabled) => setDraft((d) => ({ ...d, enabled }))} data-testid="reminders-enabled" />}
          />
          {STAGES.map(({ stage, field, before }) => (
            <SettingsRow
              key={stage}
              label={t(`stages.${stage}.label`)}
              description={t(`stages.${stage}.hint`)}
              htmlFor={`days-${stage}`}
              control={
                <NativeSelect
                  id={`days-${stage}`}
                  className="w-44"
                  disabled={!canChange || !draft.enabled}
                  value={draft[field] === null ? "" : String(draft[field])}
                  onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value === "" ? null : Number(e.target.value) }))}
                  data-testid={`days-${stage}`}
                >
                  <NativeSelectOption value="">{t("never")}</NativeSelectOption>
                  {SCHEDULE_CHOICES[field].map((days) => (
                    <NativeSelectOption key={days} value={String(days)}>
                      {before ? t("daysBefore", { days }) : t("daysAfter", { days })}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              }
            />
          ))}
        </SettingsRows>
      </SettingsSection>
      <SettingsSection title={t("clientsTitle")} description={t("clientsIntro")} testId="reminder-clients">
        <SettingsRows as="ul">
          {clients.length === 0 ? (
            <SettingsEmpty as="li">{t("noClients")}</SettingsEmpty>
          ) : (
            clients.map((c) => (
              <SettingsRow
                as="li"
                key={c.id}
                label={c.name}
                description={c.billingEmail ?? t("noEmail")}
                htmlFor={`client-${c.id}`}
                testId={`reminder-client-${c.id}`}
                control={<Switch id={`client-${c.id}`} aria-label={on[c.id] ? t("clientOn") : t("clientOff")} checked={on[c.id] ?? false} disabled={!canChangeClients || !c.hasProfile} onCheckedChange={(value) => toggleClient(c.id, value)} />}
              />
            ))
          )}
        </SettingsRows>
      </SettingsSection>
    </SettingsPage>
  );
}
