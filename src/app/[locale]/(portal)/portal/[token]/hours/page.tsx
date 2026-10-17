// Pattern: docs/patterns/portal/[token]/hours.md — TempWorks WebCenter's timecard approvals: one row per
// period with a Review action; the approval page itself is approve/[token].
import { setRequestLocale } from "next-intl/server";
import { PortalHoursView } from "@/components/shiftbook/portal/sections";
import { portalSession } from "@/server/portal/request";
import { portalFailed, portalHours } from "@/server/portal/service";
import { approvalDeps } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function PortalHoursPage(props: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await props.params;
  setRequestLocale(locale);
  const session = await portalSession(token);
  if (session.state !== "active") return null;
  const requests = await portalHours(approvalDeps(""), token);
  if (portalFailed(requests)) return null;
  return <PortalHoursView token={token} requests={requests} agencyName={session.agency.name} />;
}
