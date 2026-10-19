"use client";

// Pattern: docs/patterns/w.md item 6 — earned pay the worker can request (the agency's wage-access
// rules; the CFPB's "covered EWA" terms in the request dialog); no money moves in Tabulado.
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { Availability, WageAccessRules } from "@/server/money/wage-access";
import { requestMyWageAccessAction } from "@/app/[locale]/(worker)/w/wage-actions";
import { money } from "../format";
import { RequestDialog } from "../money/wage-access";

export function WageCard({ workerId, workerName, availability, rules }: { workerId: string; workerName: string; availability: Availability; rules: WageAccessRules }) {
  const t = useTranslations("workerApp.home");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const available = availability.availableCents;
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-4" data-testid="worker-wage-card">
      <h2 className="text-sm font-medium text-muted-foreground">{t("wageTitle")}</h2>
      <p className="text-3xl font-semibold tabular-nums" data-testid="worker-wage-available">
        {money(available, locale)}
      </p>
      <p className="text-sm text-muted-foreground">{t("wageBody", { earned: money(availability.earnedCents, locale) })}</p>
      <p className="text-[13px] text-muted-foreground" data-testid="worker-wage-note">
        {t("wageNote")}
      </p>
      {available >= 100 && (
        <Button variant="outline" className="self-start" onClick={() => setOpen(true)} data-testid="worker-wage-request">
          {t("wageRequest")}
        </Button>
      )}
      {open && (
        <RequestDialog
          row={{ workerId, workerName, availability }}
          rules={rules}
          title={t("wageDialogTitle")}
          send={requestMyWageAccessAction}
          onClose={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
