// Pattern: docs/patterns/w/pay.md — the Gusto mobile app's Pay tab: the year's gross so far, then each
// paid week with its pay; one opens its stub.
import { ChevronRightIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { dateRange, money } from "@/components/shiftbook/format";
import { Link } from "@/i18n/navigation";
import { payStubsOf } from "@/server/worker-app/service";
import { asWorker, currentWorker } from "@/server/worker-app/session";

export const dynamic = "force-dynamic";

export default async function WorkerPay(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const w = await currentWorker(locale);
  const t = await getTranslations("workerApp.pay");
  const pay = await asWorker(w, (tx) => payStubsOf(tx, w.workerId));
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      {pay.year && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{t("year", { year: pay.year })}</p>
          <p className="text-3xl font-semibold tabular-nums" data-testid="worker-pay-year">
            {money(pay.yearCents, locale)}
          </p>
        </div>
      )}
      {pay.stubs.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="worker-pay-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col border-y">
          {pay.stubs.map((s) => (
            <li key={s.runId} className="border-b last:border-b-0">
              <Link href={`/w/pay/${s.runId}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-4 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50" data-testid="worker-stub">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{dateRange(s.startsOn, s.endsOn, locale)}</span>
                  {s.correction && <span className="block text-xs text-muted-foreground">{t("correction")}</span>}
                </span>
                <span className="text-sm font-semibold tabular-nums">{money(s.grossCents, locale)}</span>
                <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("note")}</p>
    </>
  );
}
