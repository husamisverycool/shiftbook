// Pattern: docs/patterns/w/time.md — the Gusto mobile app's Time tab (clock in and out; the hours sent
// to the agency to review) and Square Team's timecards (each day's times and hours, the week's total).
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClockCard } from "@/components/shiftbook/worker-app/clock-card";
import { clock, dateRange, hoursMinutes, shortDate } from "@/components/shiftbook/format";
import { cn } from "@/lib/utils";
import { agencyToday, agencyZone } from "@/server/settings";
import { clockOf, hoursOf, type DayStatus } from "@/server/worker-app/service";
import { asWorker, currentWorker } from "@/server/worker-app/session";

export const dynamic = "force-dynamic";

const TONE: Record<DayStatus, string> = {
  waiting: "text-muted-foreground",
  approved: "text-emerald-700 dark:text-emerald-400",
  paid: "text-foreground",
  questioned: "text-amber-700 dark:text-amber-400",
};

export default async function WorkerTime(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const w = await currentWorker(locale);
  const t = await getTranslations("workerApp.time");
  const { weeks, clockView, zone } = await asWorker(w, async (tx) => ({ weeks: await hoursOf(tx, w.workerId), clockView: await clockOf(tx, w.workerId, await agencyToday(tx)), zone: await agencyZone(tx) }));
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <ClockCard clock={clockView} zone={zone} />
      {weeks.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="worker-hours-empty">
          {t("empty")}
        </p>
      ) : (
        weeks.map((week) => (
          <section key={week.periodId} className="flex flex-col" aria-labelledby={`week-${week.periodId}`} data-testid="worker-week-hours">
            <div className="flex items-baseline justify-between border-b pb-2">
              <h2 id={`week-${week.periodId}`} className="text-sm font-semibold">
                {dateRange(week.startsOn, week.endsOn, locale)}
              </h2>
              <span className="text-sm font-semibold tabular-nums">{t("total", { hours: hoursMinutes(week.minutes) })}</span>
            </div>
            <ul className="flex flex-col">
              {week.days.map((d) => (
                <li key={d.id} className="flex items-center gap-3 border-b py-3 text-sm last:border-b-0" data-testid="worker-day">
                  <span className="w-20 shrink-0 font-medium">{shortDate(d.date, locale)}</span>
                  <span className="min-w-0 flex-1 text-muted-foreground tabular-nums">
                    {d.inMinute !== null && d.outMinute !== null ? `${clock(d.inMinute, locale)} – ${clock(d.outMinute % 1440, locale)}` : ""}
                    {d.fromApp && <span className="ml-2 text-xs">· {t("fromApp")}</span>}
                  </span>
                  <span className="w-12 text-right tabular-nums">{hoursMinutes(d.minutes)}</span>
                  <span className={cn("w-28 text-right text-xs font-medium", TONE[d.status])} data-testid={`worker-day-${d.status}`}>
                    {t(`status.${d.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <p className="text-xs text-muted-foreground">{t("note")}</p>
    </>
  );
}
