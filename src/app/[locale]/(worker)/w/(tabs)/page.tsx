// Pattern: docs/patterns/w.md — Square Team's Home (clock in first) and the Gusto mobile app's to-dos
// (onboarding first), this week's hours and the latest pay.
import { ChevronRightIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClockCard } from "@/components/shiftbook/worker-app/clock-card";
import { dateRange, hoursMinutes, money } from "@/components/shiftbook/format";
import { Link } from "@/i18n/navigation";
import { agencyToday, agencyZone } from "@/server/settings";
import { homeOf } from "@/server/worker-app/service";
import { asWorker, currentWorker } from "@/server/worker-app/session";

export const dynamic = "force-dynamic";

function Card({ title, children, action, testId }: { title: string; children: React.ReactNode; action?: { href: string; label: string }; testId: string }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-4" data-testid={testId}>
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
      {action && (
        <Link href={action.href} className="-mx-1 inline-flex items-center gap-1 self-start rounded-sm px-1 text-sm font-medium text-primary outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">
          {action.label}
          <ChevronRightIcon className="size-4" aria-hidden />
        </Link>
      )}
    </section>
  );
}

export default async function WorkerHome(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const w = await currentWorker(locale);
  const t = await getTranslations("workerApp.home");
  const { view, zone } = await asWorker(w, async (tx) => {
    const today = await agencyToday(tx);
    return { view: await homeOf(tx, w.workerId, today), zone: await agencyZone(tx) };
  });
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="worker-greeting">
        {t("greeting", { name: view.firstName })}
      </h1>
      {!view.onboarding.complete && (
        <Card title={t("onboardingTitle")} action={{ href: "/w/onboarding", label: t("onboardingAction") }} testId="worker-onboarding-card">
          <p className="text-base font-medium">{t("onboardingBody", { done: view.onboarding.done, total: view.onboarding.total })}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-foreground transition-[width] motion-state" style={{ width: `${(view.onboarding.done / view.onboarding.total) * 100}%` }} />
          </div>
        </Card>
      )}
      <ClockCard clock={view.clock} zone={zone} />
      <Card title={t("weekTitle")} action={{ href: "/w/time", label: t("seeHours") }} testId="worker-week">
        {view.thisWeek ? (
          <>
            <p className="text-3xl font-semibold tabular-nums">{hoursMinutes(view.thisWeek.minutes)}</p>
            <p className="text-sm text-muted-foreground">{t("weekOf", { range: dateRange(view.thisWeek.startsOn, view.thisWeek.endsOn, locale) })}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("weekEmpty")}</p>
        )}
      </Card>
      <Card title={t("payTitle")} action={view.latestPay ? { href: `/w/pay/${view.latestPay.runId}`, label: t("seePay") } : undefined} testId="worker-latest-pay">
        {view.latestPay ? (
          <>
            <p className="text-3xl font-semibold tabular-nums">{money(view.latestPay.grossCents, locale)}</p>
            <p className="text-sm text-muted-foreground">{t("weekOf", { range: dateRange(view.latestPay.startsOn, view.latestPay.endsOn, locale) })}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("payEmpty")}</p>
        )}
      </Card>
    </>
  );
}
