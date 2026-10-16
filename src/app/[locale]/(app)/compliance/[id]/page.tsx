// Pattern: docs/patterns/compliance/[id].md — Drata control detail, Vanta test detail and documents.
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ObligationView, type DetailTab } from "@/components/shiftbook/compliance/detail";
import { obligationDetail } from "@/server/compliance/queries";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABS: DetailTab[] = ["overview", "evidence", "history", "notes"];

export default async function ObligationPage(props: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();
  const sp = await props.searchParams;
  const tab = TABS.find((x) => x === sp.tab) ?? "overview";
  const actor = currentActor();
  const { d, today } = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    return { d: await obligationDetail(tx, actor, id, today), today };
  });
  if (!d) notFound();
  return <ObligationView d={d} tab={tab} today={today} />;
}
