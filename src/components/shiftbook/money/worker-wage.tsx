"use client";

// Pattern: docs/patterns/workers/[id].md (Earned wage access module) and money/wage-access.md: a
// Stripe detail-sidebar module — what is available of what was earned from unpaid hours.
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { money } from "../format";
import { RECORD_LINK, Section } from "../page";

export interface WorkerWage {
  enabled: boolean;
  earnedCents: number;
  availableCents: number;
}

export function WorkerWageAccess({ wage }: { wage: WorkerWage }) {
  const t = useTranslations("money.worker");
  const locale = useLocale();
  return (
    <Section id="worker-wage-access" title={t("title")} testId="worker-wage-access">
      <p className="text-sm">{wage.enabled ? t("line", { available: money(wage.availableCents, locale), earned: money(wage.earnedCents, locale) }) : t("off")}</p>
      <Link href="/money/wage-access" className={`${RECORD_LINK} w-fit text-sm`}>
        {t("open")}
      </Link>
    </Section>
  );
}
