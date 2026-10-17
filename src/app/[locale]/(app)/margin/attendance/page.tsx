// Pattern: docs/patterns/margin/attendance.md — Deputy Attendance & absence report (summary figures,
// per-site table, problem shifts; 15 minutes' tolerance); Instawork fill rate.
import { setRequestLocale } from "next-intl/server";
import { MarginAttendance } from "@/components/shiftbook/margin/attendance";
import { MarginFrame, NotForRole } from "@/components/shiftbook/margin/frame";
import { withAgency } from "@/server/db";
import { mayViewMargin } from "@/server/margin/service";
import { attendanceView } from "@/server/schedule/queries";
import { currentActor } from "@/server/session";
import { agencyToday, agencyZone } from "@/server/settings";

export const dynamic = "force-dynamic";

/** Minutes after midnight now, where the agency is. */
function minuteIn(zone: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return part("hour") * 60 + part("minute");
}

export default async function AttendancePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  if (!mayViewMargin(actor)) return <NotForRole />;
  const view = await withAgency(actor.agencyId, async (tx) => attendanceView(tx, await agencyToday(tx), minuteIn(await agencyZone(tx))));
  return (
    <MarginFrame tab="attendance" period={null} exports={[]}>
      <MarginAttendance view={view} />
    </MarginFrame>
  );
}
