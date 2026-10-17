// Pattern: docs/patterns/portal/[token]/invoices.md — TempWorks WebCenter Invoices (Unpaid / Paid,
// a side panel with previous and next), Avionté's columns, Stripe's hosted invoice page downloads.
import { setRequestLocale } from "next-intl/server";
import { PortalInvoicesView } from "@/components/shiftbook/portal/sections";
import { portalSession } from "@/server/portal/request";
import { portalFailed, portalInvoices } from "@/server/portal/service";
import { approvalDeps } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function PortalInvoicesPage(props: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ show?: string; open?: string }> }) {
  const { locale, token } = await props.params;
  const { show, open } = await props.searchParams;
  setRequestLocale(locale);
  const session = await portalSession(token);
  if (session.state !== "active") return null;
  const invoices = await portalInvoices(approvalDeps(""), token, session.today);
  if (portalFailed(invoices)) return null;
  const filter = show === "paid" || show === "all" ? show : "unpaid";
  return <PortalInvoicesView token={token} invoices={invoices} filter={filter} openId={typeof open === "string" ? open : null} agencyName={session.agency.name} />;
}
