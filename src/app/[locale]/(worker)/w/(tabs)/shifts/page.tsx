// Pattern: docs/patterns/w/shifts.md — Instawork My Shifts (Upcoming / Past / Cancelled; confirm; can't
// make it with a reason); Deputy offers: the signed-in worker's own shifts only.
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WorkerShifts } from "@/components/shiftbook/shifts-worker/worker-shifts";
import { workerShifts } from "@/server/schedule/queries";
import { expireOverdue } from "@/server/schedule/service";
import { agencyToday, agencyZone } from "@/server/settings";
import { asWorker, currentWorker } from "@/server/worker-app/session";
import { answerOfferAction, confirmShiftAction, declineShiftAction } from "../../shift-actions";

export const dynamic = "force-dynamic";

export default async function WorkerShiftsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const w = await currentWorker(locale);
  const t = await getTranslations("shiftsWorker");
  const { data, zone } = await asWorker(w, async (tx) => {
    await expireOverdue(tx);
    return { data: await workerShifts(tx, w.workerId, await agencyToday(tx)), zone: await agencyZone(tx) };
  });
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <WorkerShifts data={data} zone={zone} actions={{ confirm: confirmShiftAction, decline: declineShiftAction, answer: answerOfferAction }} />
    </>
  );
}
