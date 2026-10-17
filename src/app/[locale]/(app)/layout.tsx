// Pattern: docs/patterns/_layouts/app.md — Linear sidebar: workspace name on top, the areas as a
// list of links with the current one highlighted, G-then-key navigation and "?" for shortcuts.
import { eq } from "drizzle-orm";
import { setRequestLocale } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { AppSidebar } from "@/components/shiftbook/app-sidebar";
import { AbilitiesProvider } from "@/components/shiftbook/abilities";
import { AgencyZoneProvider } from "@/components/shiftbook/agency-zone";
import { PageFade } from "@/components/shiftbook/page-fade";
import { ConfirmAccessProvider } from "@/components/shiftbook/auth/confirm-access";
import { SignInNotice } from "@/components/shiftbook/auth/sign-in-notice";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { withAgency } from "@/server/db";
import { agencies } from "@/server/db/schema";
import { urgentCount } from "@/server/compliance/queries";
import { mayViewMargin } from "@/server/margin/service";
import { abilitiesOf } from "@/server/permissions";
import { changesPaused, confirmWith, currentActor } from "@/server/session";
import { agencyToday, agencyZone } from "@/server/settings";

export default async function AppLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const { agency, urgent, zone } = await withAgency(actor.agencyId, async (tx) => {
    const [agency] = await tx.select({ name: agencies.name }).from(agencies).where(eq(agencies.id, actor.agencyId));
    return { agency, urgent: await urgentCount(tx, actor.agencyId, await agencyToday(tx)), zone: await agencyZone(tx) };
  });
  const confirmMethod = await confirmWith();
  // While the subscription is not active, the screens hide every change, as for the accountant (decision 0036).
  const paused = await changesPaused(actor);
  return (
    <AbilitiesProvider abilities={abilitiesOf(actor, { changesPaused: paused })} paused={paused}>
      <AgencyZoneProvider zone={zone}>
        <ConfirmAccessProvider method={confirmMethod}>
          <SidebarProvider className="min-h-0">
            <AppSidebar agencyName={agency?.name ?? ""} person={{ name: actor.label, role: actor.role }} showMargin={mayViewMargin(actor)} complianceCount={urgent} />
            <SidebarInset className="min-w-0">
              <PageFade />
              <div className="flex items-center gap-2 border-b px-4 py-2 md:hidden">
                <SidebarTrigger />
                <span className="truncate text-sm font-medium">{agency?.name}</span>
              </div>
              {children}
              <Suspense>
                <SignInNotice />
              </Suspense>
            </SidebarInset>
          </SidebarProvider>
        </ConfirmAccessProvider>
      </AgencyZoneProvider>
    </AbilitiesProvider>
  );
}
