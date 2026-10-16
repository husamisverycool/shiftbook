// Pattern: docs/patterns/invite/[token].md — Stripe's emailed team invite (10 days); GitHub's invitation
// (the role; two-factor first when the organization requires it); Join with Google / Microsoft (decision 0033).
import { setRequestLocale } from "next-intl/server";
import { InviteView, LinkGone } from "@/components/shiftbook/auth/links";
import { authDeps } from "@/server/auth/deps";
import { providerOffered } from "@/server/auth/oidc-flow";
import { linkFor } from "@/server/auth/service";

export const dynamic = "force-dynamic";

const NOTICES = ["provider_failed", "not_verified", "email_mismatch", "taken"] as const;

export default async function InvitePage(props: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale, token } = await props.params;
  setRequestLocale(locale);
  const link = await linkFor(authDeps(), token, "invite");
  if (!link) return <LinkGone kind="invite" />;
  const raw = (await props.searchParams).notice;
  const notice = NOTICES.find((n) => n === (Array.isArray(raw) ? raw[0] : raw)) ?? null;
  return (
    <InviteView
      token={token}
      invite={{ agencyName: link.agencyName, byLabel: link.byLabel, role: link.role, email: link.email }}
      providers={{ google: providerOffered("google"), microsoft: providerOffered("microsoft") }}
      notice={notice}
    />
  );
}
