"use client";

// Pattern: docs/patterns/convert.md — States: a load failure shows an error alert with a retry
// action (Gusto "processing failed" with recalculate). Same alert as the step's error state, with
// the reason it could not load: someone else is changing the period.
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

export function BusyNotice() {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Alert variant="destructive" data-testid="period-busy">
      <CircleAlertIcon />
      <AlertTitle>{t("convert.errors.busy")}</AlertTitle>
      <AlertDescription>
        <Button size="sm" variant="outline" className="mt-2" disabled={pending} onClick={() => start(() => router.refresh())} loading={pending} loadingLabel={t("common.loading")}>
          {t("common.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
