// Pattern: docs/patterns/sign-up/[token].md (decision 0036) — the invite page's "Set your password" (GitHub:
// the password twice, then two-factor before access); the authenticator setup follows (SPEC §2).
import { setRequestLocale } from "next-intl/server";
import { SignUpFinishView, SignUpLinkGone } from "@/components/shiftbook/auth/sign-up";
import { signupFor } from "@/server/auth/signup";
import { signupDeps } from "@/server/auth/signup-deps";
import { isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function SignUpFinishPage(props: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await props.params;
  setRequestLocale(locale);
  // The demo makes no agencies: no link of its own works.
  const info = isDemo() ? null : await signupFor(signupDeps(), token);
  if (!info) return <SignUpLinkGone />;
  return <SignUpFinishView token={token} info={{ email: info.email, agencyName: info.agencyName }} />;
}
