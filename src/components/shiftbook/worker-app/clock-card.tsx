"use client";

// Pattern: docs/patterns/w.md item 3 and w/time.md — Square Team's Home and Gusto's Time tab: Clock in
// for the current assignment; while clocked in, since when and Clock out. Location only when the
// client asks for it (the browser asks the worker first).
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { clockInAction, clockOutAction } from "@/app/[locale]/(worker)/w/actions";
import { Button } from "@/components/ui/button";
import type { ClockView } from "@/server/worker-app/service";

type Loc = { lat: number; lng: number; accuracyM: number } | null;

function locate(): Promise<Loc> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

export function ClockCard({ clock, zone }: { clock: ClockView; zone: string }) {
  const t = useTranslations("workerApp.clock");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState(clock.choices[0]?.assignmentId ?? "");
  const [error, setError] = useState<string | null>(null);
  if (!clock.open && clock.choices.length === 0) return null;
  const choice = clock.choices.find((c) => c.assignmentId === chosen) ?? clock.choices[0];
  const needsLocation = clock.open ? clock.open.needsLocation : Boolean(choice?.needsLocation);
  const time = (d: Date) => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: zone }).format(d);

  const act = () =>
    start(async () => {
      setError(null);
      const loc = needsLocation ? await locate() : null;
      const r = clock.open ? await clockOutAction(locale, loc) : await clockInAction(locale, choice!.assignmentId, loc);
      if (!r.ok) setError(t(`errors.${r.error}`));
      else if (clock.open) toast.success(t("done"));
    });

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4" aria-labelledby="clock-title" data-testid="worker-clock">
      <div className="flex flex-col gap-1">
        <h2 id="clock-title" className="text-sm font-medium text-muted-foreground">
          {clock.open ? t("working") : t("title")}
        </h2>
        {clock.open ? (
          <>
            <p className="text-2xl font-semibold tabular-nums" data-testid="worker-clock-since">
              {t("since", { time: time(new Date(clock.open.since)) })}
            </p>
            <p className="text-sm text-muted-foreground">{t("at", { position: clock.open.position, client: clock.open.clientName })}</p>
          </>
        ) : clock.choices.length === 1 ? (
          <p className="text-base font-medium">{t("at", { position: choice!.position, client: choice!.clientName })}</p>
        ) : (
          <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("title")}>
            {clock.choices.map((c) => (
              <label key={c.assignmentId} className="flex items-center gap-2 text-sm">
                <input type="radio" name="assignment" value={c.assignmentId} checked={chosen === c.assignmentId} onChange={() => setChosen(c.assignmentId)} className="size-4 accent-foreground" />
                {t("at", { position: c.position, client: c.clientName })}
              </label>
            ))}
          </div>
        )}
      </div>
      {needsLocation && <p className="text-xs text-muted-foreground">{t("locationNote")}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid="worker-clock-error">
          {error}
        </p>
      )}
      <Button size="lg" variant={clock.open ? "outline" : "default"} className="h-11 w-full" onClick={act} disabled={pending} loading={pending} data-testid={clock.open ? "worker-clock-out" : "worker-clock-in"}>
        {clock.open ? t("out") : t("in")}
      </Button>
    </section>
  );
}
