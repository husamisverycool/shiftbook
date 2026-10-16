// Pattern: docs/patterns/compliance.md — Vanta Tests page, Linear display options.
import { setRequestLocale } from "next-intl/server";
import { ComplianceFrame } from "@/components/shiftbook/compliance/frame";
import { ComplianceList } from "@/components/shiftbook/compliance/list";
import { complianceAsk } from "@/server/compliance/ask";
import { areaCounts, complianceItems, filterItems } from "@/server/compliance/queries";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function CompliancePage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = currentActor();
  const ask = complianceAsk(await props.searchParams);
  const { items, users } = await withAgency(actor.agencyId, async (tx) => complianceItems(tx, actor, await agencyToday(tx)));
  const shown = filterItems(items, ask, actor);
  const nextUpcoming = items.filter((i) => i.status === "upcoming").map((i) => i.dueOn).sort()[0] ?? null;
  const filtered = ask.area !== null || ask.jurisdiction !== null || ask.owner !== null || ask.q !== "" || ask.statuses.length > 0;
  return (
    <ComplianceFrame tab="list" counts={areaCounts(items)}>
      <ComplianceList items={shown} users={users} nextUpcoming={nextUpcoming} filtered={filtered} />
    </ComplianceFrame>
  );
}
