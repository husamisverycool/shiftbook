"use client";

// Pattern: docs/patterns/settings/agency.md — Gusto's company details (legal name, address, phone),
// in Linear's settings column (_components/settings.md): a form panel with Save in its foot, then the
// time zone row.
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveAgencyAction } from "@/app/[locale]/(app)/settings/agency/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { AgencyView } from "@/server/setup/agency";
import { ReadOnlyNote } from "../abilities";
import { SettingsField, SettingsFooter, SettingsPage, SettingsPanel, SettingsRow, SettingsRows, SettingsSection } from "../settings-panel";

export function AgencySettings({ view, zones, canChange }: { view: AgencyView; zones: readonly string[]; canChange: boolean }) {
  const t = useTranslations("agencySetup");
  const tc = useTranslations("common");
  const router = useRouter();
  const [name, setName] = useState(view.name);
  const [address, setAddress] = useState(view.addressLines.join("\n"));
  const [phone, setPhone] = useState(view.phone ?? "");
  const [email, setEmail] = useState(view.email ?? "");
  const [zone, setZone] = useState(view.timeZone ?? "");
  const [problems, setProblems] = useState<{ field: string; rule: string }[]>([]);
  const [pending, start] = useTransition();
  const problem = (field: string) => {
    const p = problems.find((x) => x.field === field);
    return p ? (
      <p id={`agency-${field}-error`} className="text-[13px] text-destructive">
        {t(`rules.${p.rule}` as never)}
      </p>
    ) : undefined;
  };
  const invalid = (field: string) => (problems.some((p) => p.field === field) ? { "aria-invalid": true, "aria-describedby": `agency-${field}-error` } : {});

  const save = () =>
    start(async () => {
      const r = await saveAgencyAction({
        name: name.trim(),
        addressLines: address
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
        phone: phone.trim() === "" ? null : phone.trim(),
        email: email.trim() === "" ? null : email.trim(),
        timeZone: zone,
      });
      if (r.ok) {
        setProblems([]);
        toast.success(t("saved"));
        router.refresh();
      } else if (r.error === "invalid") setProblems(r.problems);
      else toast.error(t("generic"));
    });

  return (
    <SettingsPage context={t("context")} title={t("title")} description={canChange ? undefined : <ReadOnlyNote text={t("readOnly")} />}>
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <SettingsSection title={t("detailsTitle")} description={t("detailsIntro")} testId="agency-details">
          <SettingsPanel
            footer={
              canChange ? (
                <SettingsFooter note={t("detailsNote")}>
                  <Button type="submit" size="sm" loading={pending} loadingLabel={tc("loading")} data-testid="agency-save">
                    {tc("save")}
                  </Button>
                </SettingsFooter>
              ) : undefined
            }
          >
            <SettingsField id="agency-name" label={t("field.name")} problem={problem("name")}>
              <Input id="agency-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canChange} maxLength={200} {...invalid("name")} data-testid="agency-name" />
            </SettingsField>
            <SettingsField id="agency-addressLines" label={t("field.address")} hint={t("field.addressHint")} problem={problem("addressLines")}>
              <Textarea id="agency-addressLines" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canChange} {...invalid("addressLines")} data-testid="agency-address" />
            </SettingsField>
            <div className="grid gap-4 sm:grid-cols-2">
              <SettingsField id="agency-phone" label={t("field.phone")} problem={problem("phone")}>
                <Input id="agency-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canChange} maxLength={25} {...invalid("phone")} data-testid="agency-phone" />
              </SettingsField>
              <SettingsField id="agency-email" label={t("field.email")} hint={t("field.emailHint")} problem={problem("email")}>
                <Input id="agency-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canChange} maxLength={254} {...invalid("email")} data-testid="agency-email" />
              </SettingsField>
            </div>
          </SettingsPanel>
        </SettingsSection>

        <SettingsSection title={t("zoneTitle")} description={t("zoneIntro")} testId="agency-zone">
          <SettingsRows>
            <SettingsRow
              label={t("field.timeZone")}
              description={problem("timeZone") ?? t("field.timeZoneHint")}
              htmlFor="agency-timeZone"
              control={
                <NativeSelect id="agency-timeZone" value={zone} onChange={(e) => setZone(e.target.value)} disabled={!canChange} {...invalid("timeZone")} data-testid="agency-time-zone">
                  <NativeSelectOption value="">{t("chooseZone")}</NativeSelectOption>
                  {zones.map((z) => (
                    <NativeSelectOption key={z} value={z}>
                      {t(`zones.${z.replace("/", "_")}` as never)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              }
            />
          </SettingsRows>
        </SettingsSection>
      </form>
    </SettingsPage>
  );
}
