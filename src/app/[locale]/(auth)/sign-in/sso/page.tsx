// Pattern: docs/patterns/sign-in/sso.md — Notion's single sign-on by work email, Linear's "Continue with
// SAML SSO", Stripe's sign-in from its own page (decision 0033).
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { SsoSignInView } from "@/components/shiftbook/auth/sso-sign-in";
import { localePath, safeNext } from "@/server/auth/next-path";
import { currentSession } from "@/server/session";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SsoSignInPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const query = await props.searchParams;
  const next = one(query.next) ?? null;
  if (await currentSession()) redirect(next ? `/${locale}/sign-in?next=${encodeURIComponent(safeNext(next))}` : localePath(locale, "/"));
  return <SsoSignInView email={(one(query.email) ?? "").slice(0, 254)} next={next} />;
}
