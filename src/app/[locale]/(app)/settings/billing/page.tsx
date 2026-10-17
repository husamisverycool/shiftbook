// Pattern: docs/patterns/settings/billing.md (decision 0036) — Linear's Settings › Billing and Vercel's
// (the plan's state, the next charge, a failed payment shown; nothing deleted when it stops), with
// Stripe's Checkout and Customer Portal behind its two buttons. The Owner's page; the demo never calls
// Stripe.
import { setRequestLocale } from "next-intl/server";
import { BillingNotForRole, BillingSettingsView } from "@/components/shiftbook/settings/billing";
import { planView } from "@/server/billing/access";
import { billingDeps } from "@/server/billing/deps";
import { agencyStanding, syncFromCheckout } from "@/server/billing/service";
import { db } from "@/server/db";
import { can } from "@/server/permissions";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function BillingSettingsPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  // The Owner's page: everyone else gets the same "not for your role" state as other settings.
  if (!can(actor, "billing")) return <BillingNotForRole />;
  const query = await props.searchParams;
  const checkout = one(query.checkout);
  const session = one(query.session);
  // Back from Stripe's checkout: read the session back so the page is right before the webhook arrives.
  if (checkout === "done" && session) await syncFromCheckout(billingDeps(), actor, session);
  const now = new Date();
  const { demo, billing } = await agencyStanding({ db, now: () => now }, actor.agencyId);
  const plan = planView({ demo, billing, now });
  const subscribed = plan.state === "active" || plan.state === "trialing";
  const notice = checkout === "left" ? "left" : checkout === "done" && !subscribed ? "done" : null;
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return (
    <BillingSettingsView
      demo={demo}
      notice={demo ? null : notice}
      plan={{ state: plan.state, date: iso(plan.date), nextCharge: plan.nextCharge && { ...plan.nextCharge, on: plan.nextCharge.on.toISOString() }, canStart: plan.canStart, canManage: plan.canManage }}
    />
  );
}
