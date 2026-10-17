// Pattern: docs/patterns/settings/holidays.md — Gusto's holiday pay policy, a client's own policy
// winning on its work (Bullhorn), laid out as Linear's settings.
import { setRequestLocale } from "next-intl/server";
import { HolidaySettings } from "@/components/shiftbook/settings/holidays";
import { holidayPolicies } from "@/server/catalog/holidays";
import { withAgency } from "@/server/db";
import { can } from "@/server/permissions";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function HolidaysPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const view = await withAgency(actor.agencyId, (tx) => holidayPolicies(tx));
  return <HolidaySettings view={view} canChange={can(actor, "settings")} />;
}
