// Pattern: docs/patterns/settings/activity.md — Stripe Workbench events (list and details); GitHub's
// audit log filters and export; Vercel's previous and next.
import { setRequestLocale } from "next-intl/server";
import { ActivityView, NotForActivity } from "@/components/shiftbook/activity/activity-view";
import { parseActivityFilters } from "@/server/activity/filters";
import { activityEvent, activityOptions, activityPage, activityRecord, activityZone, mayViewActivity } from "@/server/activity/queries";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function ActivityPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  if (!mayViewActivity(actor)) return <NotForActivity />;
  const params = await props.searchParams;
  const view = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    const filters = parseActivityFilters(params, today);
    const page = await activityPage(tx, filters);
    // The event a copied link points at, even when it is further down the list.
    const asked = Number(Array.isArray(params.event) ? params.event[0] : params.event);
    const selected = Number.isSafeInteger(asked) && asked > 0 ? (page.events.find((e) => e.id === asked) ?? (await activityEvent(tx, asked))) : null;
    return { today, filters, page, selected, options: await activityOptions(tx), record: filters.record ? await activityRecord(tx, filters.record) : null, zone: await activityZone(tx) };
  });
  // A new page of events (other filters, or Refresh finding new ones) starts the list afresh.
  return <ActivityView key={`${JSON.stringify(view.filters)}:${view.page.events[0]?.id ?? 0}:${view.page.total}`} {...view} />;
}
