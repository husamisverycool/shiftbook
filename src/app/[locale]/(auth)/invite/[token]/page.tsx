// Pattern: docs/patterns/invite/[token].md — Stripe's emailed team invite (10 days); GitHub's invitation
// (the role; two-factor first when the organization requires it).
import { setRequestLocale } from "next-intl/server";
import { InviteView, LinkGone } from "@/components/shiftbook/auth/links";
import { authDeps } from "@/server/auth/deps";
import { linkFor } from "@/server/auth/service";

export const dynamic = "force-dynamic";

export default async function InvitePage(props: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await props.params;
  setRequestLocale(locale);
  const link = await linkFor(authDeps(), token, "invite");
  if (!link) return <LinkGone kind="invite" />;
  return <InviteView token={token} invite={{ agencyName: link.agencyName, byLabel: link.byLabel, role: link.role, email: link.email }} />;
}
