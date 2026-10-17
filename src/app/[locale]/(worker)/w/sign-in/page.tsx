// Pattern: docs/patterns/w/sign-in.md — the worker app's sign-in: a mobile number and a texted
// six-digit code (decision 0033's emailed code, by text); the demo offers its workers to continue as.
// The frame is the agency sign-in's (docs/patterns/_layouts/auth.md): one narrow column, the mark on top.
import { inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AuthLanguage } from "@/components/shiftbook/auth/auth-header";
import { BrandMark } from "@/components/shiftbook/brand-mark";
import { WorkerSignIn } from "@/components/shiftbook/worker-app/sign-in";
import { withAgency } from "@/server/db";
import * as s from "@/server/db/schema";
import { DEMO_AGENCY } from "@/server/demo/dataset";
import { workerId } from "@/server/demo/seed";
import { isDemo } from "@/server/session";
import { DEMO_APP_WORKERS } from "@/server/worker-app/demo";
import { currentWorkerSession } from "@/server/worker-app/session";

export const dynamic = "force-dynamic";

export default async function WorkerSignInPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const signedIn = await currentWorkerSession();
  if (signedIn) redirect(`/${signedIn.preferredLanguage === "es" ? "es" : "en"}/w`);
  const demoWorkers = isDemo()
    ? await withAgency(DEMO_AGENCY.id, async (tx) => {
        const ids = DEMO_APP_WORKERS.map((k) => workerId(k));
        const rows = await tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers).where(inArray(s.workers.id, ids));
        return ids.flatMap((id) => rows.filter((r) => r.id === id).map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}` })));
      })
    : [];
  return (
    <div className="flex min-h-[calc(100svh-var(--banner-height,0px))] flex-col bg-sidebar">
      <main className="mx-auto flex w-full max-w-[22rem] min-w-0 flex-1 flex-col gap-6 px-4 pt-[min(14vh,7rem)] pb-12">
        <div className="flex justify-center">
          <BrandMark size="lg" />
        </div>
        <WorkerSignIn demoWorkers={demoWorkers} />
      </main>
      <footer className="px-4 pb-8">
        <Suspense>
          <AuthLanguage />
        </Suspense>
      </footer>
    </div>
  );
}
