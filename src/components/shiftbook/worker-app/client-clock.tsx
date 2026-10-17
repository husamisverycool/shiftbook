"use client";

// Pattern: docs/patterns/clients/[id].md "Worker app clock-in" (slice t): Off, On, or On with location —
// a select that saves on change, as Linear's settings rows do (docs/patterns/_components/settings.md).
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { setClientWorkerClockAction } from "@/app/[locale]/(app)/workers/worker-app-actions";
import { NativeSelect } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import { useCan } from "../abilities";
import { Section } from "../page";

export function ClientClockSetting({ clientId, value }: { clientId: string; value: "off" | "on" | "location" }) {
  const t = useTranslations("workerAppAgency.clock");
  const te = useTranslations("workerAppAgency.phoneErrors");
  const id = useId();
  const router = useRouter();
  const mayChange = useCan()("placements");
  const [current, setCurrent] = useState(value);
  const [pending, start] = useTransition();
  return (
    <Section id={`${id}-title`} title={t("title")} testId="client-worker-clock">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      {mayChange ? (
        <NativeSelect
          aria-labelledby={`${id}-title`}
          value={current}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as typeof current;
            const before = current;
            setCurrent(next);
            start(async () => {
              const r = await setClientWorkerClockAction(clientId, next);
              if (!r.ok) {
                setCurrent(before);
                toast.error(te("generic"));
              } else router.refresh();
            });
          }}
          data-testid="client-worker-clock-select"
        >
          {(["off", "on", "location"] as const).map((v) => (
            <option key={v} value={v}>
              {t(v)}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <p className="text-sm">{t(current)}</p>
      )}
    </Section>
  );
}
