// Pattern: docs/patterns/portal/[token].md — Stripe's customer portal overview with Stripe Home's
// figures; Avionté client portal Home counters with View links.
import { setRequestLocale } from "next-intl/server";
import { PortalOverviewView } from "@/components/shiftbook/portal/sections";
import { portalSession } from "@/server/portal/request";
import { portalFailed, portalOverview } from "@/server/portal/service";
import { approvalDeps } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function PortalOverviewPage(props: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await props.params;
  setRequestLocale(locale);
  const session = await portalSession(token);
  if (session.state !== "active") return null;
  const view = await portalOverview(approvalDeps(""), token, session.today);
  if (portalFailed(view)) return null;
  return <PortalOverviewView token={token} view={view} agencyName={session.agency.name} />;
}
