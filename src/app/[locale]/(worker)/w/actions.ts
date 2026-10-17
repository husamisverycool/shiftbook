"use server";

/**
 * The worker app's actions (slice t): sign-in by text-message code, the demo's Continue as, onboarding
 * steps, clock in and out, messages, the language, sign-out. Every change runs fenced to the
 * signed-in worker (src/server/worker-app/fence.ts).
 */
import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEMO_AGENCY } from "@/server/demo/dataset";
import { db } from "@/server/db";
import { requestSender } from "@/server/request-info";
import { agencyToday } from "@/server/settings";
import { isDemo } from "@/server/session";
import { auditBy } from "@/server/audit";
import * as s from "@/server/db/schema";
import { chooseWorkerAgency, demoCodeText, demoWorkerSignIn, endWorkerSession, requestWorkerCode, verifyWorkerCode, WORKER_SESSION_MS } from "@/server/worker-app/auth";
import { STEPS, type Step } from "@/server/worker-app/forms";
import { clockIn, clockOut, postMessage, saveStep, type ClockError } from "@/server/worker-app/service";
import { asWorker, currentWorker, WORKER_COOKIE, workerDeps } from "@/server/worker-app/session";
import { translator } from "@/server/worker-app/translate";
import { eq } from "drizzle-orm";

type Locale = "en" | "es";
const localeOf = (v: unknown): Locale => (v === "es" ? "es" : "en");

async function setCookie(token: string) {
  (await cookies()).set(WORKER_COOKIE, token, { httpOnly: true, secure: !isDemo() || process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: Math.floor(WORKER_SESSION_MS / 1000) });
}

/** After signing in, the app opens in the worker's own language (SPEC §27). */
async function openApp(workerId: string, agencyId: string): Promise<never> {
  const lang = await asWorker({ agencyId, workerId }, async (tx) => (await tx.select({ l: s.workers.preferredLanguage }).from(s.workers).where(eq(s.workers.id, workerId)))[0]?.l);
  redirect(`/${localeOf(lang)}/w`);
}

export async function requestCodeAction(locale: string, phone: string): Promise<{ ok: true; demoCopy: string | null } | { ok: false; error: "invalid" | "throttled" }> {
  const tSms = await getTranslations({ locale: localeOf(locale), namespace: "workerAppSms" });
  const { ipAddress } = await requestSender();
  const r = await requestWorkerCode(workerDeps(), typeof phone === "string" ? phone.slice(0, 40) : "", (code) => tSms("code", { code }), ipAddress, isDemo() ? {} : { later: (job) => after(job) });
  if (!r.ok) return r;
  return { ok: true, demoCopy: isDemo() ? await demoCodeText({ db }, DEMO_AGENCY.id, r.phone) : null };
}

export async function verifyCodeAction(input: { phone: string; code: string }): Promise<{ ok: false; error: "invalid" | "throttled" } | { ok: true; choice: string; agencies: { workerId: string; agencyName: string }[] }> {
  const { ipAddress, userAgent } = await requestSender();
  const r = await verifyWorkerCode(workerDeps(), String(input?.phone ?? "").slice(0, 40), String(input?.code ?? "").slice(0, 20), userAgent, ipAddress);
  if (!r.ok) return r;
  if (r.kind === "choose") return { ok: true, choice: r.choice, agencies: r.agencies };
  await setCookie(r.token);
  return openApp(r.workerId, r.agencyId);
}

export async function chooseAgencyAction(choice: string, workerId: string): Promise<{ ok: false }> {
  const { userAgent } = await requestSender();
  const r = await chooseWorkerAgency(workerDeps(), String(choice), String(workerId), userAgent);
  if (!r.ok) return r;
  await setCookie(r.token);
  return openApp(r.workerId, r.agencyId);
}

export async function demoWorkerAction(workerId: string): Promise<{ ok: false }> {
  if (!isDemo()) return { ok: false };
  const { userAgent } = await requestSender();
  const r = await demoWorkerSignIn({ db }, DEMO_AGENCY.id, String(workerId), userAgent);
  if (!r.ok) return r;
  await setCookie(r.token);
  return openApp(String(workerId), DEMO_AGENCY.id);
}

export async function workerSignOutAction(locale: string): Promise<never> {
  const jar = await cookies();
  await endWorkerSession({ db }, jar.get(WORKER_COOKIE)?.value);
  jar.delete(WORKER_COOKIE);
  redirect(`/${localeOf(locale)}/w/sign-in`);
}

const refresh = () => revalidatePath("/[locale]/w", "layout");

export async function saveStepAction(locale: string, step: string, answers: Record<string, string>): Promise<{ ok: true; next: Step | null } | { ok: false; field: string }> {
  const w = await currentWorker(localeOf(locale));
  if (!(STEPS as readonly string[]).includes(step)) return { ok: false, field: "step" };
  const clean = Object.fromEntries(Object.entries(answers && typeof answers === "object" ? answers : {}).filter(([k, v]) => /^[A-Za-z_]{1,40}$/.test(k) && typeof v === "string").map(([k, v]) => [k, (v as string).slice(0, 300)]));
  const { ipAddress, userAgent } = await requestSender();
  const now = new Date();
  const r = await asWorker(w, async (tx) => saveStep(tx, w, step as Step, clean, { today: await agencyToday(tx, now), now, address: ipAddress, userAgent }));
  refresh();
  if (!r.ok) return r;
  const i = STEPS.indexOf(step as Step);
  return { ok: true, next: STEPS[i + 1] ?? null };
}

const Location = z.object({ lat: z.number(), lng: z.number(), accuracyM: z.number() }).strict().nullable();

export async function clockInAction(locale: string, assignmentId: string, location: unknown): Promise<{ ok: true } | { ok: false; error: ClockError | "generic" }> {
  const w = await currentWorker(localeOf(locale));
  const loc = Location.safeParse(location ?? null);
  if (!z.uuid().safeParse(assignmentId).success || !loc.success) return { ok: false, error: "generic" };
  const now = new Date();
  const r = await asWorker(w, async (tx) => clockIn(tx, w, assignmentId, loc.data, await agencyToday(tx, now), now));
  refresh();
  return r;
}

export async function clockOutAction(locale: string, location: unknown): Promise<{ ok: true } | { ok: false; error: ClockError | "generic" }> {
  const w = await currentWorker(localeOf(locale));
  const loc = Location.safeParse(location ?? null);
  if (!loc.success) return { ok: false, error: "generic" };
  const r = await asWorker(w, (tx) => clockOut(tx, w, loc.data, new Date()));
  refresh();
  return r.ok ? { ok: true } : r;
}

export async function sendWorkerMessageAction(locale: string, body: string): Promise<{ ok: true } | { ok: false; error: "empty" | "too_long" | "generic" }> {
  const w = await currentWorker(localeOf(locale));
  const lang = localeOf(locale);
  const r = await asWorker(w, (tx) => postMessage(tx, { agencyId: w.agencyId, workerId: w.workerId, sender: "worker", authorLabel: `${w.firstName} ${w.lastName}`, authorUserId: null, body: String(body ?? "").slice(0, 4000), bodyLocale: lang, otherLocale: "en" }, translator()));
  refresh();
  return r.ok ? { ok: true } : r;
}

/** The worker's language: the app and the agency's translations both follow it. */
export async function setWorkerLanguageAction(locale: string, next: string): Promise<never> {
  const w = await currentWorker(localeOf(locale));
  const lang = localeOf(next);
  await asWorker(w, async (tx) => {
    await tx.update(s.workers).set({ preferredLanguage: lang }).where(eq(s.workers.id, w.workerId));
    await auditBy(tx, { agencyId: w.agencyId, userId: null, label: w.label }, [{ action: "update", entityType: "worker", entityId: w.workerId, before: { preferredLanguage: w.preferredLanguage }, after: { preferredLanguage: lang } }]);
  });
  redirect(`/${lang}/w/more`);
}
