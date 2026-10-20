// Pattern: docs/patterns/welcome.md — Gusto's one-question onboarding screens with Mercury's progress bar
// and Linear's skippable invite step: where the agency is, its payroll system, its team. Each answer goes
// to the agency's real settings through Settings' own actions.
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { WelcomeView } from "@/components/shiftbook/welcome/welcome";
import { withAgency } from "@/server/db";
import { currentSetting, payrollTarget, TARGET_KEY } from "@/server/payroll/settings";
import { agencyView, TIME_ZONES } from "@/server/setup/agency";
import { currentActor, currentSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function WelcomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = await currentActor();
  if (actor.role !== "owner") redirect(`/${locale}`);
  const session = await currentSession();
  const { agency, target, targetId } = await withAgency(actor.agencyId, async (tx) => ({ agency: await agencyView(tx, actor.agencyId), target: await payrollTarget(tx), targetId: (await currentSetting(tx, TARGET_KEY))?.id ?? null }));
  return (
    <WelcomeView
      zones={[...TIME_ZONES]}
      agency={{ name: agency.name, addressLines: agency.addressLines, phone: agency.phone, email: agency.email ?? session?.email ?? null, timeZone: agency.timeZone, workweekStartsOn: agency.workweekStartsOn, workweekChangeable: agency.workweekChangeable }}
      target={target}
      targetId={targetId}
    />
  );
}
