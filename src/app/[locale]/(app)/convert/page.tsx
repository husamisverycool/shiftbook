// Pattern: docs/patterns/convert.md — Gusto payroll-run flow: landing list, then one step at a time
// (upload → review hours → exceptions → review totals → files) inside the step frame.
import { CircleAlertIcon, InfoIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { BusyNotice } from "@/components/shiftbook/convert/busy-notice";
import { ConvertFrame } from "@/components/shiftbook/convert/frame";
import { FilesStep } from "@/components/shiftbook/convert/files-step";
import { HoursGrid } from "@/components/shiftbook/convert/hours-grid";
import { Landing } from "@/components/shiftbook/convert/landing";
import { ExceptionsStep } from "@/components/shiftbook/convert/exceptions-step";
import { TotalsReview } from "@/components/shiftbook/convert/totals-review";
import { needsAttention, STEPS, type GridRow, type Step } from "@/components/shiftbook/convert/types";
import { UploadStep } from "@/components/shiftbook/convert/upload-step";
import { isDemo } from "@/server/session";
import { longDate } from "@/components/shiftbook/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { filesStep, getPeriod, hoursStep, latestRun, listPeriods, openCorrectionOf, totalsStep, uploadStep } from "@/server/convert/queries";
import { withAgency } from "@/server/db";
import { addressOf } from "@/server/inbound/address";
import { inboundDomain } from "@/server/inbound/config";
import { ensureAddress } from "@/server/inbound/service";
import { PeriodBusyError, periodState } from "@/server/run/period-lock";
import { scheduledWithoutHours } from "@/server/schedule/queries";
import { processQueuedDocuments } from "@/server/services";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function ConvertPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const sp = await props.searchParams;
  const actor = await currentActor();
  const inAgency = <T,>(fn: Parameters<typeof withAgency<T>>[1]) => withAgency(actor.agencyId, fn);

  const periodId = typeof sp.period === "string" ? sp.period : null;
  if (!periodId || !/^[0-9a-f-]{36}$/i.test(periodId)) {
    const periods = await inAgency((tx) => listPeriods(tx));
    return <Landing periods={periods} />;
  }
  const period = await inAgency((tx) => getPeriod(tx, periodId));
  if (!period) notFound();
  // Paid before Granite: nothing to convert here, so back to the list of periods.
  if ((await inAgency((tx) => periodState(tx, periodId))) === "history") redirect(`/${locale}/convert`);
  const run = await inAgency((tx) => latestRun(tx, periodId));
  const locked = run?.status === "exported" || run?.status === "closed";
  const asked = STEPS.find((s) => s === sp.step) ?? "upload";
  const step: Step = locked ? "files" : asked === "files" ? "totals" : asked;

  const t = await getTranslations("convert");
  const periodLine = t.rich("periodLine", { start: longDate(period.startsOn, locale), end: longDate(period.endsOn, locale), b: (chunks) => <b>{chunks}</b> });
  const frame = { periodId, step, locked, title: t(`steps.${step}`), periodLine };
  // A correction in progress says so on every step (slice e): only its differences are paid and billed.
  const correcting = locked ? null : await inAgency((tx) => openCorrectionOf(tx, periodId));
  const correctionAlert = correcting ? (
    <Alert data-testid="correction-banner">
      <InfoIcon />
      <AlertTitle>{t("correction.bannerTitle", { version: correcting.version, reason: correcting.reason })}</AlertTitle>
      <AlertDescription>{t("correction.bannerBody", { base: correcting.baseVersion })}</AlertDescription>
    </Alert>
  ) : null;

  if (step === "upload") {
    const domain = inboundDomain();
    const [documents, address] = await inAgency(async (tx) => [await uploadStep(tx, periodId), domain ? await ensureAddress(tx, actor.agencyId) : null] as const);
    const reading = documents.some((d) => (d.status === "received" || d.status === "reading") && !d.stuck);
    // Waiting uploads are read now; a reading cut off by a restart is picked up again.
    if (documents.some((d) => d.status === "received" || d.stuck)) after(() => processQueuedDocuments(actor).catch(() => undefined));
    return (
      <ConvertFrame {...frame} alerts={correctionAlert} forward={{ kind: "link", step: "hours", disabled: documents.length === 0 || reading }}>
        <UploadStep periodId={periodId} documents={documents} demo={isDemo()} forwardTo={address && domain ? addressOf(address.token, domain) : null} />
      </ConvertFrame>
    );
  }

  if (step === "hours") {
    const { rows, roster } = await inAgency((tx) => hoursStep(tx, periodId));
    const attention = rows.filter(needsAttention).length;
    return (
      <ConvertFrame
        {...frame}
        forward={{ kind: "computeTotals", disabled: attention > 0 || rows.length === 0 }}
        alerts={
          correctionAlert || attention > 0 ? (
            <>
              {correctionAlert}
              {attention > 0 && (
                <Alert variant="destructive" data-testid="hours-blocker">
                  <CircleAlertIcon />
                  <AlertTitle>{t("hours.blockersTitle", { count: attention })}</AlertTitle>
                </Alert>
              )}
            </>
          ) : null
        }
      >
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{t("hours.sectionTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("hours.sectionBody")}</p>
          </div>
          <HoursGrid periodId={periodId} rows={rows as GridRow[]} roster={roster} period={{ startsOn: period.startsOn, endsOn: period.endsOn }} initialQuery={typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined} />
        </section>
      </ConvertFrame>
    );
  }

  if (step === "exceptions" || step === "totals") {
    // Rules computed on the way (SPEC §11): the run is brought up to date every time.
    const data = await inAgency((tx) => totalsStep(tx, actor, periodId)).catch((error: unknown) => {
      if (error instanceof PeriodBusyError) return null;
      throw error;
    });
    // Someone else is changing the period, so the totals could not be brought up to date.
    if (!data) {
      return (
        <ConvertFrame {...frame} editHref={step === "totals"} forward={step === "totals" ? { kind: "approve", disabled: true, fingerprint: null } : { kind: "link", step: "totals", disabled: true }}>
          <BusyNotice />
        </ConvertFrame>
      );
    }
    // The files were created while this page loaded (another tab): show them.
    if (data.run.status === "exported") redirect(`/${locale}/convert?period=${periodId}&step=files`);
    const blocked = data.run.status === "blocked";
    // A blocked run never reaches Review totals (Gusto: calculate is disabled while blockers exist).
    if (step === "totals" && blocked) redirect(`/${locale}/convert?period=${periodId}&step=exceptions`);
    if (step === "exceptions") {
      // Confirmed shifts with no hours yet (slice u): a list, never blocking.
      const unworked = await inAgency((tx) => scheduledWithoutHours(tx, period.startsOn, period.endsOn));
      // Edit belongs to Review totals only (convert.md step 4); the trail leads back from here.
      return (
        <ConvertFrame {...frame} alerts={correctionAlert} forward={{ kind: "link", step: "totals", disabled: blocked }}>
          <ExceptionsStep periodId={periodId} data={data} locked={locked} scheduledNoHours={unworked} />
        </ConvertFrame>
      );
    }
    const approved = data.run.status === "approved";
    return (
      <ConvertFrame
        {...frame}
        editHref
        alerts={correctionAlert}
        forward={approved ? { kind: "createFiles", disabled: false, fingerprint: data.run.fingerprint } : { kind: "approve", disabled: !data.canApprove, fingerprint: data.run.fingerprint }}
      >
        <TotalsReview periodId={periodId} data={data} locked={locked} />
      </ConvertFrame>
    );
  }

  const files = await inAgency((tx) => filesStep(tx, actor, periodId));
  if (!files) notFound();
  return (
    <ConvertFrame {...frame} forward={null}>
      <FilesStep data={{ periodId, versions: files.versions, canCorrect: files.canCorrect }} />
    </ConvertFrame>
  );
}
