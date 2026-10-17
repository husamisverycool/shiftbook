// Pattern: docs/patterns/_layouts/portal-portal-token.md — Stripe's customer portal: the business's
// name and the portal's sections in a left column; the section on the right. A link that does not
// work shows one notice in the portal frame instead (Stripe hosted page states; decision 0013).
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { PortalNotice } from "@/components/shiftbook/portal/notice";
import { PortalShell } from "@/components/shiftbook/portal/shell";
import { portalSession } from "@/server/portal/request";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "clientPortal" });
  // A personal link: never indexed, never sent on as a referrer (decision 0013).
  return { title: t("metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function PortalLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const view = await portalSession(token);
  if (view.state !== "active") return <PortalNotice view={view} token={token} />;
  return (
    <PortalShell token={token} agency={view.agency} clientName={view.clientName} contact={view.contact} expiresAt={view.expiresAt}>
      {children}
    </PortalShell>
  );
}
