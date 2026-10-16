// Pattern: docs/patterns/compliance/calendar.md — Google Calendar views and keys; Outlook on the web.
import { isIsoDate, type Weekday } from "@shiftbook/rules";
import { setRequestLocale } from "next-intl/server";
import { ComplianceCalendar, type CalendarView } from "@/components/shiftbook/compliance/calendar";
import { ComplianceFrame } from "@/components/shiftbook/compliance/frame";
import { complianceAsk } from "@/server/compliance/ask";
import { areaCounts, complianceItems, filterItems } from "@/server/compliance/queries";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";
import { agencyToday, settingOn } from "@/server/settings";

export const dynamic = "force-dynamic";

const VIEWS: CalendarView[] = ["month", "week", "agenda"];

export default async function ComplianceCalendarPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const sp = await props.searchParams;
  const ask = complianceAsk(sp);
  const { items, today, startsOn } = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    const v = await settingOn<number>(tx, "workweek_starts_on", today);
    return { ...(await complianceItems(tx, actor, today)), today, startsOn: (typeof v === "number" ? v : 1) as Weekday };
  });
  const view = VIEWS.find((v) => v === sp.view) ?? "month";
  const date = typeof sp.date === "string" && isIsoDate(sp.date) ? sp.date : today;
  const shown = filterItems(items, ask, actor);
  const nextDue = shown.filter((i) => i.dueOn >= today).map((i) => i.dueOn).sort()[0] ?? null;
  return (
    <ComplianceFrame tab="calendar" counts={areaCounts(items)}>
      <ComplianceCalendar items={shown} view={view} date={date} today={today} startsOn={startsOn} nextDue={nextDue} />
    </ComplianceFrame>
  );
}
