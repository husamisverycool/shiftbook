// Pattern: docs/patterns/sign-in/email.md — Linear's "Continue with Email" and Vercel's emailed six-digit
// code (decision 0033).
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { EmailCodeView } from "@/components/shiftbook/auth/email-code";
import { localePath, safeNext } from "@/server/auth/next-path";
import { currentSession } from "@/server/session";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function EmailCodePage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const query = await props.searchParams;
  const next = one(query.next) ?? null;
  // Already signed in: the sign-in page sends them on (or to the step still to do).
  if (await currentSession()) redirect(next ? `/${locale}/sign-in?next=${encodeURIComponent(safeNext(next))}` : localePath(locale, "/"));
  return <EmailCodeView email={(one(query.email) ?? "").slice(0, 254)} next={next} />;
}
