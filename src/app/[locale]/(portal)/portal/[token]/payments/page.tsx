// Pattern: docs/patterns/portal/[token]/payments.md — Avionté client portal Payments, each expanded to
// the invoices it settled; a remittance for each payment.
import { setRequestLocale } from "next-intl/server";
import { PortalPaymentsView } from "@/components/shiftbook/portal/sections";
import { portalSession } from "@/server/portal/request";
import { portalFailed, portalPayments } from "@/server/portal/service";
import { approvalDeps } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function PortalPaymentsPage(props: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await props.params;
  setRequestLocale(locale);
  const session = await portalSession(token);
  if (session.state !== "active") return null;
  const payments = await portalPayments(approvalDeps(""), token);
  if (portalFailed(payments)) return null;
  return <PortalPaymentsView token={token} payments={payments} agencyName={session.agency.name} />;
}
