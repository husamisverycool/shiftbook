// Pattern: docs/patterns/home.md — Stripe Dashboard Home ("Today" with its figures, the line of the
// period so far and the right column of balances; notifications; "Your overview" with its date range
// and its cards on a grey band) with Polaris's setup guide on top; Polaris's banner above everything when
// the agency's subscription needs attention (decision 0036).
import { ArrowRightIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { PERIOD_TONE } from "@/components/shiftbook/convert/period-tone";
import { axisMoney, dateRange, dateTime, hoursMinutes, listDate, money, shortDate } from "@/components/shiftbook/format";
import { runningTotals } from "@/components/shiftbook/chart-axis";
import { LineChart, TodayChart } from "@/components/shiftbook/home/charts";
import { BillingBanner, type BillingBannerProps } from "@/components/shiftbook/home/billing-banner";
import { GUIDE_COOKIE, SetupGuide, ShowGuide, type GuideStep } from "@/components/shiftbook/home/setup-guide";
import { KeyFigure } from "@/components/shiftbook/key-figures";
import { NavPill } from "@/components/shiftbook/list-controls";
import { Page } from "@/components/shiftbook/page";
import { Status, type Tone } from "@/components/shiftbook/status";
import { Link } from "@/i18n/navigation";
import { freeDaysEndingSoon } from "@/server/billing/access";
import { withAgency } from "@/server/db";
import { homeView, SETUP_STEPS, type SetupStep } from "@/server/home/queries";
import { mayViewMargin } from "@/server/margin/service";
import { agencyStandingNow, currentActor, isDemo } from "@/server/session";
import { agencyToday, agencyZone } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function HomePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ weeks?: string; notice?: string }> }) {
  const { locale } = await params;
  const { weeks, notice } = await searchParams;
  setRequestLocale(locale);
  const actor = await currentActor();
  const viewMargin = mayViewMargin(actor);
  const { view, today, zone } = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    return { view: await homeView(tx, actor.agencyId, today, { viewMargin, weeks }), today, zone: await agencyZone(tx) };
  });
  const t = await getTranslations("home");
  const tl = await getTranslations("landing");
  const tm = await getTranslations("margin");
  const guideHidden = (await cookies()).get(GUIDE_COOKIE)?.value === "hidden";
  // The subscription (decision 0036): paused changes for everyone; the free days' last week for the Owner.
  const billing = await agencyStandingNow(actor.agencyId);
  const trialEnds = actor.role === "owner" ? freeDaysEndingSoon({ ...billing, now: new Date() }) : null;
  const banner: BillingBannerProps | null = !billing.standing.changes
    ? { kind: "paused", reason: billing.standing.reason, owner: actor.role === "owner", tried: notice === "changes_paused" }
    : trialEnds
      ? { kind: "trial_ending", date: dateTime(trialEnds, locale, zone, { date: "long", time: false }) }
      : null;
  // The Owner sets up the agency and is the one person who can do every step (decision 0029).
  const showGuide = actor.role === "owner" && !guideHidden;

  const period = view.period;
  const periodHref = period ? { pathname: "/convert", query: { period: period.id, step: period.state === "exported" || period.state === "closed" ? "files" : period.state === "blocked" ? "exceptions" : period.state === "ready" || period.state === "approved" ? "totals" : "upload" } } : "/convert";
  const hrefs: Record<SetupStep, GuideStep["href"]> = {
    payroll: "/settings/payroll",
    placements: "/job-orders",
    convert: period ? { pathname: "/convert", query: { period: period.id, step: "upload" } } : "/convert",
    approval: "/approvals",
    files: periodHref,
    bank: "/bank",
    ssn: "/workers",
  };
  const steps: GuideStep[] = SETUP_STEPS.map((key) => ({ key, done: view.steps[key], href: hrefs[key] }));

  // What needs someone now, most urgent first (Stripe Home "surfaces important notifications").
  const rows: { tone: Tone; status: string; text: ReactNode; href: GuideStep["href"]; action: string; testId: string }[] = [];
  // A week whose files are made needs no one; every other state of it does.
  if (period && period.state !== "exported" && period.state !== "closed") {
    rows.push({
      tone: PERIOD_TONE[period.state] ?? "neutral",
      status: tl(`runStatus.${period.state}`),
      text: t(`attention.period.${period.state}`, { period: dateRange(period.startsOn, period.endsOn, locale), count: period.problems }),
      href: periodHref,
      action: t(`attention.periodAction.${period.state}`),
      testId: "attention-period",
    });
  }
  const a = view.approvals;
  if (a.disputed > 0) rows.push({ tone: "critical", status: t("attention.status.disputed"), text: t("attention.disputed", { count: a.disputed }), href: "/approvals", action: t("attention.open.approvals"), testId: "attention-disputed" });
  if (view.compliance.overdue > 0) rows.push({ tone: "critical", status: t("attention.status.overdue"), text: t("attention.dutiesOverdue", { count: view.compliance.overdue }), href: { pathname: "/compliance", query: { status: "overdue" } }, action: t("attention.open.compliance"), testId: "attention-duties-overdue" });
  if (view.receivables.overdueInvoices > 0)
    rows.push({ tone: "critical", status: t("attention.status.overdue"), text: t("attention.invoicesOverdue", { count: view.receivables.overdueInvoices, amount: money(view.receivables.overdueCents, locale) }), href: "/receivables", action: t("attention.open.receivables"), testId: "attention-invoices-overdue" });
  if (a.toSend > 0) rows.push({ tone: "warning", status: t("attention.status.toSend"), text: t("attention.toSend", { count: a.toSend }), href: "/approvals", action: t("attention.open.approvals"), testId: "attention-approvals-to-send" });
  if (view.compliance.dueSoon > 0) rows.push({ tone: "warning", status: t("attention.status.dueSoon"), text: t("attention.dutiesDueSoon", { count: view.compliance.dueSoon }), href: { pathname: "/compliance", query: { status: "due_soon" } }, action: t("attention.open.compliance"), testId: "attention-duties-due-soon" });
  if (view.bankToMatch > 0) rows.push({ tone: "info", status: t("attention.status.toMatch"), text: t("attention.bank", { count: view.bankToMatch }), href: "/bank", action: t("attention.open.bank"), testId: "attention-bank" });
  if (a.waiting > 0) rows.push({ tone: "info", status: t("attention.status.waiting"), text: t("attention.waiting", { count: a.waiting }), href: "/approvals", action: t("attention.open.approvals"), testId: "attention-approvals-waiting" });

  // Today's line: the hours so far through the period, day by day (Stripe's Today line of the day so far).
  const days = view.today.days;
  const totals = runningTotals(days.map((d) => d.minutes));
  const through = days.reduce((last, d, i) => (d.minutes > 0 ? i : last), -1);
  const dayLabel = (iso: string) => shortDate(iso, locale);
  const previous = view.today.previous;

  const o = view.overview;
  const range = o ? dateRange(o.from, o.to, locale) : "";
  // Gridline values short, as Stripe's charts write them ("$1.5K", "$1.0K"), and hours with their unit ("0h", "500h").
  const hoursAxis = (ticks: number[]) => ticks.map((m) => `${Math.trunc(m / 60)}h`);
  type Week = NonNullable<typeof o>["weeks"][number];
  const widgets: { key: string; title: string; of: (w: Week) => number; full: (n: number) => string; axis: (ticks: number[]) => string[]; unit: number }[] = [
    { key: "billed", title: t("overview.billed"), of: (w) => w.billedCents, full: (n) => money(n, locale), axis: axisMoney, unit: 100 },
    { key: "margin", title: t("overview.margin"), of: (w) => w.marginCents, full: (n) => money(n, locale), axis: axisMoney, unit: 100 },
    { key: "hours", title: t("overview.hours"), of: (w) => w.minutesPaid, full: hoursMinutes, axis: hoursAxis, unit: 60 },
  ];
  const updated = dateTime(new Date(), locale, zone, { date: false });
  const moreHref = o && o.preset !== 13 ? { pathname: "/margin", query: { weeks: String(o.preset) } } : "/margin";

  return (
    <Page className="gap-14">
      {banner && <BillingBanner {...banner} />}
      {showGuide && <SetupGuide steps={steps} demo={isDemo()} />}

      {/* Today (Stripe Home): the heading over a hairline; the figures and the line of the period so far on
          the left; a right column of balances, each with View, between hairlines that reach past its text. */}
      <section aria-labelledby="today-title" className="flex flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
          <h1 id="today-title" className="text-[28px] leading-9 font-bold tracking-tight">
            {t("today")}
          </h1>
          {actor.role === "owner" && guideHidden && <ShowGuide label={t("showGuide")} />}
        </div>
        <div className="grid gap-x-6 gap-y-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            {period ? (
              <>
                <div className="flex flex-wrap gap-x-10 gap-y-4">
                  <KeyFigure size="sm" className="min-w-32" label={t("todayHours")} value={hoursMinutes(view.today.minutes)} note={dateRange(period.startsOn, period.endsOn, locale, today)} testId="today-hours" />
                  {previous && (
                    // The comparison in the secondary colour, as Stripe's "Yesterday" figure.
                    <KeyFigure size="sm" className="min-w-32" label={t("todayPrevious")} value={<span className="text-foreground/60">{hoursMinutes(previous.minutes)}</span>} note={dateRange(previous.startsOn, previous.endsOn, locale, today)} testId="today-previous" />
                  )}
                  <KeyFigure size="sm" className="min-w-32" label={t("todayWorkers")} value={String(view.today.workers)} testId="today-workers" />
                  <div className="flex min-w-32 flex-col">
                    <span className="text-sm text-foreground/70">{t("todayStatus")}</span>
                    <span className="mt-1 flex h-7 items-center">
                      <Status tone={PERIOD_TONE[period.state] ?? "neutral"} size="lg" data-testid="today-status">
                        {tl(`runStatus.${period.state}`)}
                      </Status>
                    </span>
                  </div>
                </div>
                {days.length > 0 && (
                  <TodayChart
                    totals={totals}
                    through={through}
                    first={dayLabel(days[0]!.date)}
                    last={dayLabel(days.at(-1)!.date)}
                    note={t("todayNote")}
                    caption={t("todayChart", { period: dateRange(period.startsOn, period.endsOn, locale) })}
                    table={{ head: [t("todayDay"), t("todayDayHours"), t("todaySoFar")], rows: days.map((d, i) => [dayLabel(d.date), hoursMinutes(d.minutes), hoursMinutes(totals[i]!)]) }}
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("todayNoPeriod")}</p>
            )}
          </div>
          <div className="flex flex-col divide-y">
            <div className="pb-8 lg:pl-5">
              <KeyFigure size="sm" label={t("side.receivables")} value={money(view.receivables.openCents, locale)} note={t("side.invoices", { count: view.receivables.openInvoices })} action={{ label: t("side.view"), href: "/receivables" }} testId="figure-open" />
            </div>
            <div className="py-6 pb-8 lg:pl-5">
              <KeyFigure size="sm" label={t("side.overdue")} value={money(view.receivables.overdueCents, locale)} note={t("side.invoices", { count: view.receivables.overdueInvoices })} action={{ label: t("side.view"), href: "/receivables" }} testId="figure-overdue" />
            </div>
            <div className="pt-6 lg:pl-5">
              <KeyFigure size="sm" label={t("side.compliance")} value={t("side.complianceValue", { overdue: view.compliance.overdue, soon: view.compliance.dueSoon })} action={{ label: t("side.view"), href: "/compliance" }} testId="figure-compliance" />
            </div>
          </div>
        </div>
      </section>

      {/* Notifications, as Stripe Home surfaces them: one row each, with where to handle it. */}
      {rows.length > 0 && (
        <section aria-labelledby="attention-title" className="flex flex-col gap-4" data-testid="attention">
          <h2 id="attention-title" className="text-[28px] leading-9 font-bold tracking-tight">
            {t("attention.title")}
          </h2>
          <ul className="divide-y border-y">
            {rows.map((r) => (
              <li key={r.testId} data-testid={r.testId}>
                <Link href={r.href} className="group flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm outline-none hover:bg-muted/40 focus-visible:bg-muted/50">
                  <Status tone={r.tone}>{r.status}</Status>
                  <span className="min-w-0 flex-1">{r.text}</span>
                  <span className="inline-flex items-center gap-1 font-medium group-hover:underline">
                    {r.action}
                    <ArrowRightIcon className="size-4" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Your overview (Stripe Home): the bold heading, the date range as a pill, then the cards on a light
          grey band — each its title, the figure, the period before, the line over gridlines with the
          period before dashed, the first and last weeks, then when it was worked out and View more. */}
      {o && (
        <section aria-labelledby="overview-title" className="flex flex-col gap-5">
          <h2 id="overview-title" className="text-[28px] leading-9 font-bold tracking-tight">
            {t("overview.title")}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <NavPill
              label={t("overview.range")}
              current={String(o.preset)}
              testId="overview-range"
              options={(["4", "13", "52"] as const).map((w) => ({ value: w, label: tm(`presets.${w}`), href: w === "13" ? "/" : { pathname: "/", query: { weeks: w } }, testId: `overview-range-${w}` }))}
            />
          </div>
          <div className="grid gap-2 rounded-xl bg-muted/70 p-2 md:grid-cols-3">
            {widgets.map((w) => (
              <article key={w.key} className="flex flex-col rounded-lg bg-card p-5 shadow-xs" data-testid={`overview-${w.key}`}>
                <h3 className="text-sm font-semibold">{w.title}</h3>
                <span className="mt-1 text-xl leading-7 font-bold tabular-nums">{w.full(o.weeks.reduce((n, x) => n + w.of(x), 0))}</span>
                <span className="text-sm text-foreground/70">{t("overview.previous", { value: w.full(o.previous[w.key === "billed" ? "billedCents" : w.key === "margin" ? "marginCents" : "minutesPaid"]) })}</span>
                <div className="mt-7">
                  <LineChart points={o.weeks.map((x) => ({ label: listDate(x.week, locale, today), value: w.of(x) }))} previous={o.previousWeeks.map(w.of)} axis={w.axis} format={w.full} unit={w.unit} caption={t("overview.chart", { title: w.title, range })} />
                </div>
                {/* The card's foot with no rule above it, as Stripe's overview cards end. */}
                <div className="mt-6 flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground/70">{t("overview.updated", { time: updated })}</span>
                  <Link href={moreHref} className="font-medium underline-offset-4 hover:underline">
                    {t("overview.viewMore")}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}
