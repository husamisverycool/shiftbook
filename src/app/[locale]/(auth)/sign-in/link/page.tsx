// Pattern: docs/patterns/sign-in/link.md — GitHub's device verification (an emailed code, the address
// hinted, typed in the browser) and Slack's binding of an existing account to SSO by email (decision
// 0033, review H2a).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { LinkProofView } from "@/components/shiftbook/auth/link-proof";
import { authDeps } from "@/server/auth/deps";
import { demoCodeCopyFor } from "@/server/auth/identities";
import { LINK_COOKIE, openLink } from "@/server/auth/oidc-callback";
import { isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function LinkProofPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const waiting = openLink((await cookies()).get(LINK_COOKIE)?.value, new Date());
  if (!waiting) redirect(`/${locale}/sign-in?notice=expired`);
  const demoCopy = isDemo() ? await demoCodeCopyFor(authDeps(), waiting.link.userId, waiting.link.agencyId) : null;
  return <LinkProofView provider={waiting.link.provider} hint={waiting.link.hint} demoCopy={demoCopy} />;
}
