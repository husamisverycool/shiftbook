// Pattern: docs/patterns/w/messages.md — a WhatsApp chat with the agency: the agency's name as the
// title, the thread with translations, the field and Send at the bottom. Opening it reads the messages.
import { eq } from "drizzle-orm";
import { setRequestLocale } from "next-intl/server";
import { WorkerThread } from "@/components/shiftbook/worker-app/worker-thread";
import * as s from "@/server/db/schema";
import { agencyZone } from "@/server/settings";
import { markReadByWorker, threadOf } from "@/server/worker-app/service";
import { asWorker, currentWorker } from "@/server/worker-app/session";

export const dynamic = "force-dynamic";

export default async function WorkerMessages(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const w = await currentWorker(locale);
  const { agency, thread, zone } = await asWorker(w, async (tx) => {
    const [agency] = await tx.select({ name: s.agencies.name }).from(s.agencies).where(eq(s.agencies.id, w.agencyId));
    const thread = await threadOf(tx, w.workerId);
    await markReadByWorker(tx, w.workerId, new Date());
    return { agency, thread, zone: await agencyZone(tx) };
  });
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{agency?.name}</h1>
      <WorkerThread messages={thread} zone={zone} />
    </>
  );
}
