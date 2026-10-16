"use server";

/** The activity log's Load more (slice k step 3, decision 0028): the Owner and the accountant. */
import { parseActivityFilters } from "@/server/activity/filters";
import { activityPage, type ActivityPage } from "@/server/activity/queries";
import { withAgency } from "@/server/db";
import { actorAllowedTo } from "@/server/session";
import { agencyToday } from "@/server/settings";

export async function moreActivityAction(params: Record<string, string>, after: number): Promise<ActivityPage | null> {
  const actor = await actorAllowedTo("viewActivity");
  if (!Number.isSafeInteger(after) || after <= 0 || typeof params !== "object" || params === null) return null;
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => typeof v === "string"));
  return withAgency(actor.agencyId, async (tx) => activityPage(tx, parseActivityFilters(clean, await agencyToday(tx)), { after, withTotal: false }));
}
