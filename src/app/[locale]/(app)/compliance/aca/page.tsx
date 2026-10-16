// Pattern: docs/patterns/compliance/aca.md — TempWorks ACA Employee Cycles; 26 C.F.R. § 54.4980H-3.
import { setRequestLocale } from "next-intl/server";
import { Aca } from "@/components/shiftbook/compliance/aca";
import { ComplianceFrame } from "@/components/shiftbook/compliance/frame";
import { ACA_SHOWS, type AcaShow } from "@/server/compliance/aca";
import { acaView } from "@/server/compliance/aca-data";
import { mayChangeComplianceSettings } from "@/server/compliance/service";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function AcaPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = currentActor();
  const sp = await props.searchParams;
  const show: AcaShow = (ACA_SHOWS as readonly string[]).includes(String(sp.show)) ? (sp.show as AcaShow) : "all";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const view = await withAgency(actor.agencyId, async (tx) => acaView(tx, await agencyToday(tx), { show, q }));
  return (
    <ComplianceFrame tab="aca" counts={null}>
      <Aca view={view} canChange={mayChangeComplianceSettings(actor)} />
    </ComplianceFrame>
  );
}
