"use client";

// Pattern: docs/patterns/convert.md — States: a load failure shows an error alert with a retry
// action (Gusto "processing failed" with recalculate).
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ConvertError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>{t("convert.errors.generic")}</AlertTitle>
        <AlertDescription>
          <Button size="sm" variant="outline" className="mt-2" onClick={reset}>
            {t("common.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
