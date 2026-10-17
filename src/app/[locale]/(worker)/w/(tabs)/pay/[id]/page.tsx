// Pattern: docs/patterns/w/pay/[id].md — the Gusto pay stub: the pay period with the agency and the
// worker; earnings by type with rate, hours and current amount; gross pay with the year to date; the PDF.
import { ChevronLeftIcon, DownloadIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatRate } from "@shiftbook/rules";
import { buttonVariants } from "@/components/ui/button";
import { dateRange, hoursMinutes, money } from "@/components/shiftbook/format";
import { Link } from "@/i18n/navigation";
import { payStubOf } from "@/server/worker-app/service";
import { asWorker, currentWorker } from "@/server/worker-app/session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WorkerStub(props: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();
  const w = await currentWorker(locale);
  const t = await getTranslations("workerApp.pay");
  const te = await getTranslations("invoice.earning");
  const stub = await asWorker(w, (tx) => payStubOf(tx, w.workerId, id));
  if (!stub) notFound();
  const range = dateRange(stub.startsOn, stub.endsOn, locale);
  return (
    <>
      <Link href="/w/pay" className="-ml-1 inline-flex items-center gap-1 self-start rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
        <ChevronLeftIcon className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">
          {range}
          {stub.correction && <span className="ml-2 text-sm font-normal text-muted-foreground">{t("correction")}</span>}
        </h1>
        <p className="text-4xl font-semibold tabular-nums" data-testid="worker-stub-gross">
          {money(stub.grossCents, locale)}
        </p>
      </div>
      <section className="flex flex-col gap-2" aria-labelledby="stub-period">
        <h2 id="stub-period" className="border-b pb-2 text-sm font-semibold">
          {t("period")}
        </h2>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("agency")}</dt>
          <dd>{stub.agency.name}</dd>
          <dt className="text-muted-foreground">{t("worker")}</dt>
          <dd>{stub.worker.name}</dd>
          <dt className="text-muted-foreground">{t("dates")}</dt>
          <dd>{range}</dd>
        </dl>
      </section>
      <section className="flex flex-col gap-2" aria-labelledby="stub-earnings">
        <h2 id="stub-earnings" className="border-b pb-2 text-sm font-semibold">
          {t("earnings")}
        </h2>
        <table className="w-full text-sm" data-testid="worker-stub-lines">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 font-medium">{t("description")}</th>
              <th className="py-1 text-right font-medium">{t("rate")}</th>
              <th className="py-1 text-right font-medium">{t("hours")}</th>
              <th className="py-1 text-right font-medium">{t("current")}</th>
            </tr>
          </thead>
          <tbody>
            {stub.lines.map((l, n) => (
              <tr key={n} className="border-b last:border-b-0">
                <td className="py-2">{te(l.type)}</td>
                <td className="py-2 text-right tabular-nums">{formatRate(l.rate)}</td>
                <td className="py-2 text-right tabular-nums">{hoursMinutes(l.minutes)}</td>
                <td className="py-2 text-right tabular-nums">{money(l.amountCents, locale)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td className="py-2">{t("gross")}</td>
              <td colSpan={2} className="py-2 text-right text-xs font-normal text-muted-foreground">
                {t("ytd")} {money(stub.ytdCents, locale)}
              </td>
              <td className="py-2 text-right tabular-nums">{money(stub.grossCents, locale)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
      <p className="text-xs text-muted-foreground">{t("note")}</p>
      <a href={`/api/w/pay-stub/${stub.runId}?locale=${locale}`} download className={buttonVariants({ variant: "outline", className: "self-start" })} data-testid="worker-stub-pdf">
        <DownloadIcon />
        {t("download")}
      </a>
    </>
  );
}
