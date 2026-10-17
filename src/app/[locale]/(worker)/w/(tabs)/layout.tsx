// Pattern: docs/patterns/_layouts/worker-w-tabs.md — the Gusto mobile app's frame (tabs at the bottom,
// the profile at the top right); the signed-in worker or the sign-in screen.
import { eq } from "drizzle-orm";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { WorkerFrame } from "@/components/shiftbook/worker-app/frame";
import * as s from "@/server/db/schema";
import { workerShifts } from "@/server/schedule/queries";
import { agencyToday } from "@/server/settings";
import { unreadForWorker } from "@/server/worker-app/service";
import { asWorker, currentWorker } from "@/server/worker-app/session";

export default async function WorkerTabsLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const w = await currentWorker(locale);
  const { agency, unread, shiftsWaiting } = await asWorker(w, async (tx) => {
    const [agency] = await tx.select({ name: s.agencies.name }).from(s.agencies).where(eq(s.agencies.id, w.agencyId));
    return { agency, unread: await unreadForWorker(tx, w.workerId), shiftsWaiting: (await workerShifts(tx, w.workerId, await agencyToday(tx))).needsAnswer };
  });
  const initials = `${w.firstName.slice(0, 1)}${w.lastName.slice(0, 1)}`.toUpperCase();
  return (
    <WorkerFrame agencyName={agency?.name ?? ""} initials={initials} unread={unread} shiftsWaiting={shiftsWaiting}>
      {children}
    </WorkerFrame>
  );
}
