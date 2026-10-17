// Pattern: docs/patterns/w/onboarding.md — Gusto's self-onboarding steps under Rippling's checklist.
import { setRequestLocale } from "next-intl/server";
import { Onboarding } from "@/components/shiftbook/worker-app/onboarding";
import { agencyToday } from "@/server/settings";
import { onboardingOf } from "@/server/worker-app/service";
import { asWorker, currentWorker } from "@/server/worker-app/session";

export const dynamic = "force-dynamic";

export default async function WorkerOnboarding(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const w = await currentWorker(locale);
  const view = await asWorker(w, async (tx) => onboardingOf(tx, w.workerId, await agencyToday(tx)));
  return <Onboarding view={view} />;
}
