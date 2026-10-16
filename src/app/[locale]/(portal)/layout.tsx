// Pattern: docs/patterns/_layouts/portal.md — Stripe hosted invoice page frame: a page a client opens
// from an email, with no agency navigation. The page draws the frame itself (agency name and
// contact details come from its link).
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

export default async function PortalLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <div className="flex min-h-svh flex-col">{children}</div>;
}
