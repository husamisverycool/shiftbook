// Pattern: docs/patterns/sign-in.md — GitHub sign-in (password first, the code on its own page); Linear's
// list of ways in, for the demo people (decision K3).
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { SignInView, type SignInNotice } from "@/components/shiftbook/auth/sign-in";
import { signInMethods } from "@/server/auth/methods";
import { localePath, safeNext } from "@/server/auth/next-path";
import { nextStep } from "@/server/auth/service";
import { DEMO_PEOPLE } from "@/server/demo/people";
import { currentSession, isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

const NOTICES: SignInNotice[] = ["signed_out", "expired", "password_changed", "link_expired"];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SignInPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const query = await props.searchParams;
  const next = one(query.next) ?? null;
  // Already signed in: straight on (or to the step still to do).
  const session = await currentSession();
  if (session) {
    const step = nextStep(session);
    const keep = next ? `?next=${encodeURIComponent(safeNext(next))}` : "";
    if (step === "code") redirect(`/${locale}/sign-in/code${keep}`);
    if (step === "setup") redirect(`/${locale}/sign-in/setup${keep}`);
    redirect(localePath(locale, safeNext(next)));
  }
  const notice = NOTICES.find((n) => n === one(query.notice)) ?? null;
  const email = (one(query.email) ?? "").slice(0, 254);
  return <SignInView notice={notice} next={next} email={email} demoPeople={isDemo() ? DEMO_PEOPLE.map(({ id, name, role }) => ({ id, name, role })) : []} methods={signInMethods()} />;
}
