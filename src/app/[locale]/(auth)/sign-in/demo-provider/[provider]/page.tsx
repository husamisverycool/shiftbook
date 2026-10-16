// Pattern: docs/patterns/sign-in/demo-provider/[provider].md — the demo's stand-in for a provider's
// sign-in step (OpenID Connect Core §3.1.2.4), Shiftbook's own plain page; demo mode only (decision 0033).
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { DemoProviderView } from "@/components/shiftbook/auth/demo-provider";
import { DEMO_IDP_ACCOUNTS, isDemoProvider, openAuthorize } from "@/server/auth/demo-idp";
import { isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function DemoProviderPage(props: { params: Promise<{ locale: string; provider: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale, provider } = await props.params;
  setRequestLocale(locale);
  if (!isDemo() || !isDemoProvider(provider)) notFound();
  const raw = (await props.searchParams).request;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const asked = openAuthorize(value, new Date());
  return <DemoProviderView provider={provider} request={asked && asked.provider === provider ? value! : null} accounts={DEMO_IDP_ACCOUNTS} />;
}
