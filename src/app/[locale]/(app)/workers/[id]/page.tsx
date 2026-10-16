// Pattern: docs/patterns/workers/[id].md — Toast Payroll employee profile (tabs; a section per
// subject with its own Edit; Retrieve SSN); Square's team member profile sections.
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { WorkerProfileView } from "@/components/shiftbook/workers/worker-profile";
import { withAgency } from "@/server/db";
import { can } from "@/server/permissions";
import { agencyToday } from "@/server/settings";
import { currentActor } from "@/server/session";
import { workerProfile } from "@/server/workers/queries";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WorkerPage(props: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();
  const actor = await currentActor();
  const view = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    // Who looked at the SSN is the Owner's to see (Retrieve SSN); the other roles' pages carry none of it.
    return { today, profile: await workerProfile(tx, id, today, { ssnActivity: can(actor, "revealSsn") }) };
  });
  if (!view.profile) notFound();
  return <WorkerProfileView profile={view.profile} today={view.today} />;
}
