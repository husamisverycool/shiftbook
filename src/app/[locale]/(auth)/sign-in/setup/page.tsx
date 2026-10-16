// Pattern: docs/patterns/sign-in/setup.md — GitHub's two-factor setup, required before the app opens for
// the Owner and Coordinators (SPEC §2).
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { SetupView } from "@/components/shiftbook/auth/setup-page";
import { localePath, safeNext } from "@/server/auth/next-path";
import { nextStep } from "@/server/auth/service";
import { currentSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function SetupPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const raw = (await props.searchParams).next;
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw);
  const session = await currentSession();
  if (!session) redirect(`/${locale}/sign-in?notice=expired`);
  const step = nextStep(session);
  if (step === "code") redirect(`/${locale}/sign-in/code?next=${encodeURIComponent(next)}`);
  if (step === "done") redirect(localePath(locale, next));
  return <SetupView email={session.email} next={next} />;
}
