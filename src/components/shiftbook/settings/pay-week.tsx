"use client";

// Pattern: docs/patterns/settings/payroll.md item 2b — Gusto's pay schedule names the day a pay period
// starts; one Linear settings row with the select at the right, saved when changed.
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setWorkweekAction } from "@/app/[locale]/(app)/settings/agency/actions";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import { SettingsRow, SettingsRows, SettingsSection } from "../settings-panel";

export function PayWeekSection({ day, changeable, canChange }: { day: number | null; changeable: boolean; canChange: boolean }) {
  const t = useTranslations("agencySetup.payWeek");
  const tg = useTranslations("agencySetup");
  const router = useRouter();
  const [value, setValue] = useState(day === null ? "" : String(day));
  const [pending, start] = useTransition();
  const change = (next: string) => {
    setValue(next);
    if (next === "") return;
    start(async () => {
      const r = await setWorkweekAction(Number(next));
      if (r.ok) {
        toast.success(t("saved"));
        router.refresh();
      } else {
        setValue(day === null ? "" : String(day));
        toast.error(r.error === "in_use" ? t("in_use") : tg("generic"));
      }
    });
  };
  return (
    <SettingsSection title={t("title")} description={t("intro")} testId="pay-week">
      <SettingsRows>
        <SettingsRow
          label={t("label")}
          description={changeable ? t("hint") : t("fixed")}
          htmlFor="pay-week-day"
          control={
            <NativeSelect id="pay-week-day" value={value} disabled={!canChange || !changeable || pending} onChange={(e) => change(e.target.value)} data-testid="pay-week-day">
              <NativeSelectOption value="">{t("choose")}</NativeSelectOption>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <NativeSelectOption key={d} value={String(d)}>
                  {t(`days.d${d}` as never)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          }
        />
      </SettingsRows>
    </SettingsSection>
  );
}
