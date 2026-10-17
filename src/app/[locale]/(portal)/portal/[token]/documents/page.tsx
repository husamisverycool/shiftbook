// Pattern: docs/patterns/portal/[token]/documents.md — Avionté client portal Documents; Stripe portal
// History rows (one line per item, the action at the right).
import { setRequestLocale } from "next-intl/server";
import { PortalDocumentsView } from "@/components/shiftbook/portal/sections";
import { portalSession } from "@/server/portal/request";
import { portalDocuments, portalFailed } from "@/server/portal/service";
import { approvalDeps } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function PortalDocumentsPage(props: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await props.params;
  setRequestLocale(locale);
  const session = await portalSession(token);
  if (session.state !== "active") return null;
  const documents = await portalDocuments(approvalDeps(""), token);
  if (portalFailed(documents)) return null;
  return <PortalDocumentsView token={token} documents={documents} agencyName={session.agency.name} />;
}
