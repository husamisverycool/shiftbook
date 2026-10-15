// Pattern: docs/patterns/_layouts/app.md — Linear sidebar: workspace name on top, the areas as a
// list of links with the current one highlighted, G-then-key navigation and "?" for shortcuts.
import { eq } from "drizzle-orm";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/shiftbook/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { withAgency } from "@/server/db";
import { agencies } from "@/server/db/schema";
import { currentActor } from "@/server/session";

export default async function AppLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = currentActor();
  const [agency] = await withAgency(actor.agencyId, (tx) => tx.select({ name: agencies.name }).from(agencies).where(eq(agencies.id, actor.agencyId)));
  return (
    <SidebarProvider className="min-h-0">
      <AppSidebar agencyName={agency?.name ?? ""} />
      <SidebarInset>
        <div className="flex items-center gap-2 border-b px-4 py-2 md:hidden">
          <SidebarTrigger />
          <span className="truncate text-sm font-medium">{agency?.name}</span>
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
