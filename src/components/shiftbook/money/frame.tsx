"use client";

// Pattern: docs/patterns/money.md — the Money area's header (decision 0029, Stripe: a large title with
// the page's buttons at the right) and its underline tabs; under them the plain line every money page
// carries, Stripe Capital's disclosure discipline: no money moves in this version.
import { InfoIcon, LockIcon, SettingsIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "../empty-state";
import { Page, PageHeader, PageTabs } from "../page";

export type MoneyTab = "handoffs" | "payroll" | "wageAccess" | "funding" | "insurance";

const TABS: { tab: MoneyTab; href: string }[] = [
  { tab: "handoffs", href: "/money" },
  { tab: "payroll", href: "/money/payroll" },
  { tab: "wageAccess", href: "/money/wage-access" },
  { tab: "funding", href: "/money/funding" },
  { tab: "insurance", href: "/money/insurance" },
];

/** The plain line on every money page: nothing moves; a licensed partner would act on the record. */
export function NoMoneyMoves() {
  const t = useTranslations("money");
  return (
    <Alert data-testid="no-money-moves">
      <InfoIcon />
      <AlertDescription>{t("noMoneyMoves")}</AlertDescription>
    </Alert>
  );
}

export function MoneyFrame({ tab, children }: { tab: MoneyTab; children: ReactNode }) {
  const t = useTranslations("money");
  return (
    <Page>
      <PageHeader
        title={t("title")}
        actions={
          <Link href="/settings/money" className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="money-settings-link">
            <SettingsIcon />
            {t("settingsLink")}
          </Link>
        }
        tabs={<PageTabs label={t("tabsLabel")} current={tab} tabs={TABS.map((x) => ({ key: x.tab, label: t(`tabs.${x.tab}`), href: x.href, testId: `money-tab-${x.tab}` }))} />}
      />
      <NoMoneyMoves />
      {children}
    </Page>
  );
}

/** The Money area is the Owner's (the "money" permission; money review B5), as Margin is for its roles. */
export function MoneyNotForRole() {
  const t = useTranslations("money");
  return (
    <Page>
      <PageHeader title={t("title")} />
      <EmptyState icon={LockIcon} title={t("notForRoleTitle")} description={t("notForRole")} testId="money-not-allowed" />
    </Page>
  );
}
