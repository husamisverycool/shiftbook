// Pattern: docs/patterns/home.md, "Billing banner" (decision 0036) — Polaris's banner: a page-wide message
// at the top of the page, outside the sections; a heading, one or two plain sentences and one action; not
// dismissible while it must be acted on. Vercel: an overdue account keeps its data but cannot change things.
import { CircleAlertIcon, InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export type BillingBannerProps =
  | { kind: "paused"; reason: "none" | "past_due" | "unpaid" | "paused" | "incomplete" | "incomplete_expired" | "canceled"; owner: boolean; tried: boolean }
  | { kind: "trial_ending"; date: string };

export function BillingBanner(props: BillingBannerProps) {
  const t = useTranslations("billingBanner");
  if (props.kind === "trial_ending")
    return (
      <Alert role="status" className="gap-1 px-4 py-3" data-testid="billing-banner-trial">
        <InfoIcon />
        <AlertTitle>{t("trialTitle", { date: props.date })}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2 text-foreground/80">
          <p>{t("trialBody")}</p>
          <Link href="/settings/billing" className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="billing-banner-start">
            {t("trialAction")}
          </Link>
        </AlertDescription>
      </Alert>
    );
  return (
    <Alert variant="destructive" className="gap-1 border-destructive/40 px-4 py-3" data-testid="billing-banner-paused">
      <CircleAlertIcon />
      <AlertTitle>{t("pausedTitle")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <p>
          {props.tried && <>{t("tried")} </>}
          {t(`why.${props.reason}`)} {t("kept")}
          {!props.owner && <> {t("others")}</>}
        </p>
        {props.owner && (
          <Link href="/settings/billing" className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="billing-banner-go">
            {t("owner")}
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}
