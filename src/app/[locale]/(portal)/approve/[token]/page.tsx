// Pattern: docs/patterns/approve/[token].md — Bullhorn Time & Expense approval page (one period,
// workers by day, a day-by-day view per worker, dispute with a required comment, approve many);
// Upwork dispute form; Stripe hosted page for the expired and settled states.
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ApprovalPortal } from "@/components/shiftbook/approvals/approval-portal";
import { loadPortal } from "@/server/approvals/service";
import { approvalDeps } from "@/server/services";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal" });
  // A personal link: never indexed, never sent on as a referrer (decision 0013).
  return { title: t("metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function ApprovePage(props: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await props.params;
  setRequestLocale(locale);
  // Opening the page only reads; nothing is approved or used up (mail systems open links on their own).
  const view = await loadPortal(approvalDeps(""), token);
  return <ApprovalPortal view={view} token={token} />;
}
