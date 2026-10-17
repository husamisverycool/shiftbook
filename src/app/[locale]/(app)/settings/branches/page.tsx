// Pattern: docs/patterns/settings/branches.md — Gusto's company locations as Linear's settings list.
import { setRequestLocale } from "next-intl/server";
import { BranchesSettings } from "@/components/shiftbook/settings/branches";
import { withAgency } from "@/server/db";
import { can } from "@/server/permissions";
import { listBranches } from "@/server/setup/agency";
import { changesPaused, currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function BranchesSettingsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const paused = await changesPaused(actor);
  const rows = await withAgency(actor.agencyId, (tx) => listBranches(tx));
  return <BranchesSettings rows={rows} canChange={can(actor, "settings") && !paused} />;
}
