// Pattern: docs/patterns/schedule.md — When I Work Scheduler (grid, OpenShifts row, counters, shift
// dialog); Deputy Schedule (Publish with a count, three-step publish, status bar, confirmation lifecycle).
import { setRequestLocale } from "next-intl/server";
import { ScheduleView } from "@/components/shiftbook/schedule/schedule-view";
import { withAgency } from "@/server/db";
import { weekView } from "@/server/schedule/queries";
import { expireOverdue } from "@/server/schedule/service";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function SchedulePage(props: { params: Promise<{ locale: string }>; searchParams: Promise<{ week?: string; client?: string; by?: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const ask = await props.searchParams;
  const actor = await currentActor();
  const { view, today } = await withAgency(actor.agencyId, async (tx) => {
    // No answer by the deadline: open again before anyone reads the week (Deputy).
    await expireOverdue(tx);
    const today = await agencyToday(tx);
    return { view: await weekView(tx, today, { week: ask.week, clientId: ask.client ?? null }), today };
  });
  const by = ask.by === "jobOrder" || ask.by === "worksite" ? ask.by : "worker";
  return <ScheduleView view={view} today={today} by={by} />;
}
