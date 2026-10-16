// Pattern: docs/patterns/compliance/workers-comp.md — Patriot Workers' Comp Wages report; NCRB Rule 2-C-2-a.
import { isIsoDate } from "@shiftbook/rules";
import { setRequestLocale } from "next-intl/server";
import { ComplianceFrame } from "@/components/shiftbook/compliance/frame";
import { WorkersCompPacket } from "@/components/shiftbook/compliance/workers-comp";
import { packetRange, wcPacketView } from "@/server/compliance/documents";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function WorkersCompPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = currentActor();
  const sp = await props.searchParams;
  const view = await withAgency(actor.agencyId, async (tx) => {
    const range = await packetRange(tx, await agencyToday(tx));
    const from = typeof sp.from === "string" && isIsoDate(sp.from) ? sp.from : range.from;
    const to = typeof sp.to === "string" && isIsoDate(sp.to) && sp.to >= from ? sp.to : range.to;
    return wcPacketView(tx, { from, to, order: sp.order === "class" ? "class" : "state" });
  });
  return (
    <ComplianceFrame tab="workersComp" counts={null}>
      <WorkersCompPacket view={view} />
    </ComplianceFrame>
  );
}
