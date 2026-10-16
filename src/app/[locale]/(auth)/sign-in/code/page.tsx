// Pattern: docs/patterns/sign-in/code.md — GitHub's two-factor step after the password.
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { CodeView } from "@/components/shiftbook/auth/code";
import { localePath, safeNext } from "@/server/auth/next-path";
import { nextStep } from "@/server/auth/service";
import { currentSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function CodePage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const raw = (await props.searchParams).next;
  const next = (Array.isArray(raw) ? raw[0] : raw) ?? null;
  const session = await currentSession();
  if (!session) redirect(`/${locale}/sign-in?notice=expired`);
  const step = nextStep(session);
  if (step === "setup") redirect(`/${locale}/sign-in/setup${next ? `?next=${encodeURIComponent(safeNext(next))}` : ""}`);
  if (step === "done") redirect(localePath(locale, safeNext(next)));
  return <CodeView next={next} />;
}
