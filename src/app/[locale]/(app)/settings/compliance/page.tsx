// Pattern: docs/patterns/settings/compliance.md — Vanta document renewal settings and documents.
import { setRequestLocale } from "next-intl/server";
import { ComplianceSettingsView } from "@/components/shiftbook/compliance/settings";
import { complianceSettings } from "@/server/compliance/queries";
import { mayChangeComplianceSettings } from "@/server/compliance/service";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function ComplianceSettingsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const { view, today } = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    return { view: await complianceSettings(tx, actor, today), today };
  });
  return <ComplianceSettingsView view={view} today={today} canChange={mayChangeComplianceSettings(actor)} />;
}
