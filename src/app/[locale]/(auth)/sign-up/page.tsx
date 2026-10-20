// Pattern: docs/patterns/sign-up.md (decision 0036) — Stripe's "Create your account" (labelled fields, the
// button full width, "Already have an account? Sign in"); Linear's and Vercel's email step. Live mode only:
// the demo says it uses its own made-up agency and points to "Continue as".
import { setRequestLocale } from "next-intl/server";
import { SignUpView } from "@/components/shiftbook/auth/sign-up";
import { billingConfig } from "@/server/billing/config";
import { isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function SignUpPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<{ email?: string | string[] }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  // The website's email field (slice aa, Mercury's and Ramp's hero form) carries the address here.
  const asked = (await props.searchParams).email;
  const email = typeof asked === "string" && asked.length <= 254 && /^[^\s@<>]+@[^\s@<>]+$/.test(asked) ? asked : "";
  return <SignUpView demo={isDemo()} trialDays={isDemo() ? 0 : billingConfig().trialDays} initialEmail={email} />;
}
