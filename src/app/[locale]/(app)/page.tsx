// Pattern: docs/patterns/home.md — Stripe Dashboard Home ("Today" with its figures, chart and right
// column; notifications; "Your overview" charts on a grey band) with Polaris's setup guide on top.
import { ArrowRightIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { PERIOD_TONE } from "@/components/shiftbook/convert/period-tone";
import { dateRange, hoursMinutes, money, numberLocale, shortDate } from "@/components/shiftbook/format";
import { BarChart, LineChart } from "@/components/shiftbook/home/charts";
import { GUIDE_COOKIE, SetupGuide, ShowGuide, type GuideStep } from "@/components/shiftbook/home/setup-guide";
import { KeyFigure } from "@/components/shiftbook/key-figures";
import { Page } from "@/components/shiftbook/page";
import { Status, type Tone } from "@/components/shiftbook/status";
import { Link } from "@/i18n/navigation";
import { withAgency } from "@/server/db";
import { homeView, SETUP_STEPS, type SetupStep } from "@/server/home/queries";
import { mayViewMargin } from "@/server/margin/service";
import { currentActor, isDemo } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const viewMargin = mayViewMargin(actor);
  const view = await withAgency(actor.agencyId, async (tx) => homeView(tx, actor.agencyId, await agencyToday(tx), { viewMargin }));
  const t = await getTranslations("home");
  const tl = await getTranslations("landing");
  const guideHidden = (await cookies()).get(GUIDE_COOKIE)?.value === "hidden";
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
  if (period) {
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

  const o = view.overview;
  const range = o ? dateRange(o.from, o.to, locale) : "";
  // Gridline values short, as Stripe's charts write them ("$1.5K").
  const compact = (cents: number) => new Intl.NumberFormat(numberLocale(locale), { style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(cents / 100);
  type Week = NonNullable<typeof o>["weeks"][number];
  const widgets: { key: string; title: string; total: number; previous: number; of: (w: Week) => number; full: (n: number) => string; axis: (n: number) => string }[] = o
    ? [
        { key: "billed", title: t("overview.billed"), total: o.weeks.reduce((n, w) => n + w.billedCents, 0), previous: o.previous.billedCents, of: (w) => w.billedCents, full: (n) => money(n, locale), axis: compact },
        { key: "margin", title: t("overview.margin"), total: o.weeks.reduce((n, w) => n + w.marginCents, 0), previous: o.previous.marginCents, of: (w) => w.marginCents, full: (n) => money(n, locale), axis: compact },
        { key: "hours", title: t("overview.hours"), total: o.weeks.reduce((n, w) => n + w.minutesPaid, 0), previous: o.previous.minutesPaid, of: (w) => w.minutesPaid, full: hoursMinutes, axis: (m) => `${Math.trunc(m / 60)}h` },
      ]
    : [];

  return (
    <Page className="gap-10">
      {showGuide && <SetupGuide steps={steps} demo={isDemo()} />}

      {/* Today (Stripe Home): a bold heading over a hairline; figures and a chart on the left; balances with View links on the right. */}
      <section aria-labelledby="today-title" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
          <h1 id="today-title" className="text-[28px] leading-9 font-bold tracking-tight">
            {t("today")}
          </h1>
          {actor.role === "owner" && guideHidden && <ShowGuide label={t("showGuide")} />}
        </div>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            {period ? (
              <>
                <div className="flex flex-wrap items-start gap-x-14 gap-y-4">
                  <KeyFigure label={t("todayHours")} value={hoursMinutes(view.today.minutes)} note={dateRange(period.startsOn, period.endsOn, locale)} testId="today-hours" />
                  <KeyFigure label={t("todayWorkers")} value={String(view.today.workers)} testId="today-workers" />
                  <div className="flex flex-col gap-1">
                    <span className="text-[13px] text-muted-foreground">{t("todayStatus")}</span>
                    <span className="flex h-8 items-center">
                      <Status tone={PERIOD_TONE[period.state] ?? "neutral"} size="lg" data-testid="today-status">
                        {tl(`runStatus.${period.state}`)}
                      </Status>
                    </span>
                  </div>
                </div>
                {view.today.days.length > 0 && (
                  <BarChart
                    points={view.today.days.map((d) => ({ label: new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d.date}T00:00:00Z`)), value: d.minutes }))}
                    format={(m) => (m === 0 ? "0" : `${Math.trunc(m / 60)}h`)}
                    caption={t("todayChart", { period: dateRange(period.startsOn, period.endsOn, locale) })}
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("todayNoPeriod")}</p>
            )}
          </div>
          <div className="flex flex-col divide-y">
            <div className="pb-5">
              <KeyFigure label={t("side.receivables")} value={money(view.receivables.openCents, locale)} note={t("side.invoices", { count: view.receivables.openInvoices })} action={{ label: t("side.view"), href: "/receivables" }} size="sm" testId="figure-open" />
            </div>
            <div className="py-5">
              <KeyFigure label={t("side.overdue")} value={money(view.receivables.overdueCents, locale)} note={t("side.invoices", { count: view.receivables.overdueInvoices })} action={{ label: t("side.view"), href: "/receivables" }} size="sm" testId="figure-overdue" />
            </div>
            <div className="pt-5">
              <KeyFigure label={t("side.compliance")} value={t("side.complianceValue", { overdue: view.compliance.overdue, soon: view.compliance.dueSoon })} action={{ label: t("side.view"), href: "/compliance" }} size="sm" testId="figure-compliance" />
            </div>
          </div>
        </div>
      </section>

      {/* Notifications, as Stripe Home surfaces them: one row each, with where to handle it. */}
      {rows.length > 0 && (
        <section aria-labelledby="attention-title" className="flex flex-col gap-3" data-testid="attention">
          <h2 id="attention-title" className="text-lg font-semibold">
            {t("attention.title")}
          </h2>
          <ul className="divide-y border-y">
            {rows.map((r) => (
              <li key={r.testId} data-testid={r.testId}>
                <Link href={r.href} className="group flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm outline-none focus-visible:bg-muted/50">
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

      {/* Your overview (Stripe Home): a bold heading, the date range as a pill, the charts as white cards on a grey band. */}
      {o && (
        <section aria-labelledby="overview-title" className="flex flex-col gap-4">
          <h2 id="overview-title" className="text-2xl font-bold tracking-tight">
            {t("overview.title")}
          </h2>
          <div>
            <span className="inline-flex h-7 items-center gap-2 rounded-full border px-3 text-[13px]">
              <span>{t("overview.range")}</span>
              <span className="h-3.5 w-px bg-border" aria-hidden />
              <span className="font-medium">{t("overview.rangeValue")}</span>
            </span>
          </div>
          <div className="grid gap-2 rounded-xl bg-muted/70 p-2 md:grid-cols-3">
            {widgets.map((w) => (
              <article key={w.key} className="flex flex-col gap-4 rounded-lg bg-card p-5 shadow-xs" data-testid={`overview-${w.key}`}>
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold">{w.title}</h3>
                  <span className="text-xl font-semibold tracking-tight tabular-nums">{w.full(w.total)}</span>
                  <span className="text-[13px] text-muted-foreground">{t("overview.previous", { value: w.full(w.previous) })}</span>
                </div>
                <LineChart points={o.weeks.map((x) => ({ label: shortDate(x.week, locale), value: w.of(x) }))} format={w.axis} caption={t("overview.chart", { title: w.title, range })} />
                <div className="flex justify-end border-t pt-3">
                  <Link href="/margin" className="text-[13px] font-medium underline-offset-4 hover:underline">
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
