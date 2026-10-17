// Pattern: docs/patterns/portal/[token]/request.md — Instawork's booking wizard, one step at a time;
// TempWorks's order requests listed with their status.
import { setRequestLocale } from "next-intl/server";
import { PortalRequestView } from "@/components/shiftbook/portal/request";
import { portalSession } from "@/server/portal/request";
import { portalFailed, portalRequests } from "@/server/portal/service";
import { approvalDeps } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function PortalRequestPage(props: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await props.params;
  setRequestLocale(locale);
  const session = await portalSession(token);
  if (session.state !== "active") return null;
  const view = await portalRequests(approvalDeps(""), token);
  if (portalFailed(view)) return null;
  return <PortalRequestView token={token} requests={view.requests} worksites={view.worksites} agencyName={session.agency.name} today={session.today} />;
}
