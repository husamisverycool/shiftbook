// Pattern: docs/patterns/sign-in/reset/[token].md — GitHub's reset link: the code first when two-factor is
// on, then the new password twice.
import { cookies } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import { LinkGone, NewPasswordView } from "@/components/shiftbook/auth/links";
import { RESET_PROOF_COOKIE } from "@/server/auth/cookie";
import { authDeps } from "@/server/auth/deps";
import { linkFor } from "@/server/auth/service";

export const dynamic = "force-dynamic";

export default async function NewPasswordPage(props: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await props.params;
  setRequestLocale(locale);
  // A browser that already gave the code (its proof cookie) goes straight to the new password.
  const link = await linkFor(authDeps(), token, "reset", (await cookies()).get(RESET_PROOF_COOKIE)?.value ?? null);
  if (!link) return <LinkGone kind="reset" />;
  return <NewPasswordView token={token} email={link.email} needsCode={link.needsCode} />;
}
