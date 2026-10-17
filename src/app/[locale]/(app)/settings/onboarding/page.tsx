// Pattern: docs/patterns/settings/onboarding.md — Linear's settings layout for the policies workers
// acknowledge at onboarding (Rippling: an update rolls out to everyone); decision 0043.
import { setRequestLocale } from "next-intl/server";
import { OnboardingPoliciesView } from "@/components/shiftbook/settings/onboarding-policies";
import { withAgency } from "@/server/db";
import { can } from "@/server/permissions";
import { changesPaused, currentActor } from "@/server/session";
import { policiesView } from "@/server/worker-app/policies";

export const dynamic = "force-dynamic";

export default async function OnboardingSettingsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const paused = await changesPaused(actor);
  const view = await withAgency(actor.agencyId, (tx) => policiesView(tx));
  return <OnboardingPoliciesView view={view} canChange={can(actor, "onboardingPolicies") && !paused} />;
}
