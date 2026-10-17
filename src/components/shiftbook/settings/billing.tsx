"use client";

// Pattern: docs/patterns/settings/billing.md (decision 0036) — Linear's Settings › Billing (the plan and
// its state, a failed or past-due charge shown, "nothing will be deleted"), Vercel's Settings › Billing
// (the billing cycle; an overdue team keeps its data), Stripe's Checkout and Customer Portal reached from
// buttons; laid out as Linear's settings (docs/patterns/_components/settings.md): a panel of rows, the
// actions in the panel's foot, the primary last.
import { LockIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { manageBillingAction, startSubscriptionAction } from "@/app/[locale]/(app)/settings/billing/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { PlanState } from "@/server/billing/access";
import type { BillingActionResult } from "@/server/billing/service";
import { useDateTime } from "../agency-zone";
import { EmptyState } from "../empty-state";
import { money } from "../format";
import { Page, PageHeader } from "../page";
import { SettingsFooter, SettingsPage, SettingsRow, SettingsRows, SettingsSection } from "../settings-panel";
import { Status, type Tone } from "../status";

export interface BillingViewProps {
  demo: boolean;
  plan: { state: PlanState; date: string | null; nextCharge: { amountCents: number | null; currency: string | null; on: string } | null; canStart: boolean; canManage: boolean };
  notice: "done" | "left" | null;
}

const TONE: Record<PlanState, Tone> = { demo: "success", active: "success", trialing: "info", free_days: "info", ending: "warning", past_due: "critical", unpaid: "critical", paused: "warning", incomplete: "warning", canceled: "neutral", none: "neutral", other_plan: "warning" };

/** Integer cents in the price's currency: US dollars as everywhere else; any other exactly, with its code. */
function priceText(cents: number, currency: string | null, locale: string): string {
  if (!currency || currency === "usd") return money(cents, locale);
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")} ${currency.toUpperCase()}`;
}

/** Not the Owner: the same state the other settings pages show a role they are not for (single sign-on). */
export function BillingNotForRole() {
  const t = useTranslations("billing");
  return (
    <Page>
      <PageHeader title={t("title")} />
      <EmptyState icon={LockIcon} title={t("notForRoleTitle")} description={t("ownerOnly")} testId="billing-not-allowed" />
    </Page>
  );
}

export function BillingSettingsView({ demo, plan, notice }: BillingViewProps) {
  const t = useTranslations("billing");
  const locale = useLocale();
  const dateTime = useDateTime();
  const [opening, open] = useTransition();
  const [pressed, setPressed] = useState<"start" | "manage" | null>(null);
  const day = (iso: string) => dateTime(iso, { date: "long", time: false });

  const go = (which: "start" | "manage", action: () => Promise<BillingActionResult>) => {
    setPressed(which);
    open(async () => {
      if (demo) {
        toast.info(t("demoPressed"));
        return;
      }
      let r: BillingActionResult;
      try {
        r = await action();
      } catch {
        toast.error(t("errors.generic"));
        return;
      }
      if (r.ok) {
        // Stripe's own page, in this tab; the transition stays pending while the browser leaves.
        window.location.assign(r.url);
        await new Promise(() => {});
      } else toast.error(t(`errors.${r.error}`));
    });
  };

  const charge = plan.nextCharge;
  const chargeLine = charge
    ? charge.amountCents !== null
      ? t("nextChargeAmount", { amount: priceText(charge.amountCents, charge.currency, locale), date: day(charge.on) })
      : t("nextChargeDate", { date: day(charge.on) })
    : plan.state === "active" || plan.state === "trialing"
      ? t("noCharge.none")
      : t(`noCharge.${plan.state === "canceled" ? "canceled" : plan.state}` as "noCharge.none");
  const showStart = demo || plan.canStart;
  const showManage = demo || plan.canManage;

  return (
    <SettingsPage
      context={t("eyebrow")}
      title={t("title")}
      description={
        <>
          <p>{t("body")}</p>
          {demo && <p>{t("demoNote")}</p>}
        </>
      }
    >
      {notice && (
        <Alert data-testid="billing-notice" role="status">
          <AlertDescription>{t(`notice.${notice}`)}</AlertDescription>
        </Alert>
      )}
      <SettingsSection title={t("plan")} testId="billing-plan">
        <SettingsRows
          footer={
            (showStart || showManage) && (
              <SettingsFooter note={t("footNote")}>
                {/* The two actions stay together at the right when the note takes the line (Linear's setup foot). */}
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {showManage && (
                    <Button variant="outline" size="sm" disabled={opening} onClick={() => go("manage", manageBillingAction)} data-testid="billing-manage">
                      {opening && pressed === "manage" ? t("opening") : t("manage")}
                    </Button>
                  )}
                  {showStart && (
                    <Button size="sm" disabled={opening} onClick={() => go("start", startSubscriptionAction)} data-testid="billing-start">
                      {opening && pressed === "start" ? t("opening") : t("start")}
                    </Button>
                  )}
                </div>
              </SettingsFooter>
            )
          }
        >
          <SettingsRow
            label={t("planName")}
            description={t(`line.${plan.state}`, { date: plan.date ? day(plan.date) : "" })}
            descriptionTestId="billing-state-line"
            control={
              <Status tone={TONE[plan.state]} data-testid="billing-status">
                {t(`status.${plan.state}`)}
              </Status>
            }
          />
          <SettingsRow label={t("nextCharge")} description={chargeLine} descriptionTestId="billing-next-charge" />
        </SettingsRows>
      </SettingsSection>
      <SettingsSection title={t("stops")}>
        <SettingsRows>
          <SettingsRow label={t("stopsTitle")} description={t("stopsBody")} />
        </SettingsRows>
      </SettingsSection>
    </SettingsPage>
  );
}
