// Pattern: docs/patterns/shifts-preview.md — Instawork My Shifts; Deputy upcoming shifts and offers.
// Demo only: the worker app's Shifts screen, seen as one demo worker, until the worker app (slice t)
// mounts it for the signed-in worker.
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WorkerPicker } from "@/components/shiftbook/shifts-worker/worker-picker";
import { WorkerShifts } from "@/components/shiftbook/shifts-worker/worker-shifts";
import { Page, PageHeader } from "@/components/shiftbook/page";
import { withAgency } from "@/server/db";
import * as s from "@/server/db/schema";
import { env } from "@/server/env";
import { workerShifts } from "@/server/schedule/queries";
import { expireOverdue } from "@/server/schedule/service";
import { currentActor } from "@/server/session";
import { agencyToday, agencyZone } from "@/server/settings";
import { answerOfferAsWorkerAction, confirmAsWorkerAction, declineAsWorkerAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ShiftsPreviewPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<{ worker?: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  if (env.mode !== "demo") notFound();
  const ask = await props.searchParams;
  const actor = await currentActor();
  const t = await getTranslations("shiftsWorker");
  const { workers, chosen, data, zone } = await withAgency(actor.agencyId, async (tx) => {
    await expireOverdue(tx);
    const today = await agencyToday(tx);
    // The workers with something to see: a published shift or an offer.
    const withShifts = await tx.selectDistinct({ id: s.shifts.workerId }).from(s.shifts).where(and(inArray(s.shifts.state, ["assigned", "awaiting", "confirmed"])));
    const offered = await tx.selectDistinct({ id: s.shiftOffers.workerId }).from(s.shiftOffers).where(eq(s.shiftOffers.status, "offered"));
    const ids = [...new Set([...withShifts, ...offered].map((r) => r.id).filter((x): x is string => !!x))];
    const workers =
      ids.length === 0
        ? []
        : await tx
            .select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName })
            .from(s.workers)
            .where(or(inArray(s.workers.id, ids)))
            .orderBy(asc(s.workers.lastName), asc(s.workers.firstName));
    const chosen = workers.find((w) => w.id === ask.worker)?.id ?? workers[0]?.id ?? null;
    return { workers: workers.map((w) => ({ id: w.id, name: `${w.firstName} ${w.lastName}` })), chosen, data: chosen ? await workerShifts(tx, chosen, today) : null, zone: await agencyZone(tx) };
  });
  return (
    <Page width="narrow">
      <PageHeader title={t("title")} description={t("previewNote")} actions={workers.length > 0 ? <WorkerPicker workers={workers} chosen={chosen} /> : undefined} />
      {data && chosen ? (
        <WorkerShifts
          data={data}
          zone={zone}
          actions={{ confirm: confirmAsWorkerAction.bind(null, chosen), decline: declineAsWorkerAction.bind(null, chosen), answer: answerOfferAsWorkerAction.bind(null, chosen) }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t("empty.upcoming")}</p>
      )}
    </Page>
  );
}
