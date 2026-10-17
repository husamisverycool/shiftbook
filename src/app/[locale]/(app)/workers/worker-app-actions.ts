"use server";

/**
 * The worker profile's Onboarding and Messages tabs (slice t; docs/patterns/workers/[id].md): the
 * mobile number, the onboarding link by text, messages, the Owner's audited look at a signed form, and
 * a client's clock-in setting. Each names who may do it.
 */
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { appKey } from "@/server/auth/crypto";
import { db, withAgency } from "@/server/db";
import { requestOrigin } from "@/server/request-info";
import { linkBaseUrl } from "@/server/services";
import { actorAllowedTo, mustConfirmNow } from "@/server/session";
import { FORM_KINDS, formGrantSubject, recordFormOpened, sendAgencyMessage, sendOnboardingLink, setClientWorkerClock, setWorkerPhone, type FormKind } from "@/server/worker-app/agency";
import { deliverSms, smsTransport } from "@/server/worker-app/sms";
import { translator } from "@/server/worker-app/translate";
import { fileGrant } from "@/server/workers/file-grant";

const id = z.uuid();
const refresh = () => revalidatePath("/[locale]/(app)/workers/[id]", "page");
type Fail<E extends string> = { ok: false; error: E };

export async function setWorkerPhoneAction(workerId: string, phone: string): Promise<{ ok: true } | Fail<"invalid" | "taken" | "generic" | "not_found" | "not_allowed" | "owner_required" | "confirm">> {
  const actor = await actorAllowedTo("workerApp");
  if (!id.safeParse(workerId).success) return { ok: false, error: "not_found" };
  const confirmedRecently = !(await mustConfirmNow());
  const r = await withAgency(actor.agencyId, async (tx) => {
    const [w] = await tx.query.workers.findMany({ where: (t, { eq }) => eq(t.id, workerId), columns: { preferredLanguage: true }, limit: 1 });
    const t = await getTranslations({ locale: w?.preferredLanguage === "es" ? "es" : "en", namespace: "workerAppSms" });
    return setWorkerPhone(tx, actor, workerId, String(phone ?? "").slice(0, 40), { confirmedRecently, oldNumberText: (agency) => t("phoneChanged", { agency }), now: new Date() });
  });
  refresh();
  if (!r.ok) return { ok: false, error: r.error === "no_phone" ? "generic" : r.error };
  if (r.notify) await deliverSms(db, smsTransport(), actor.agencyId, r.notify);
  return { ok: true };
}

export async function sendOnboardingLinkAction(workerId: string): Promise<{ ok: true } | Fail<"no_phone" | "generic" | "not_found" | "not_allowed">> {
  const actor = await actorAllowedTo("workerApp");
  if (!id.safeParse(workerId).success) return { ok: false, error: "not_found" };
  const base = linkBaseUrl(await requestOrigin());
  const r = await withAgency(actor.agencyId, async (tx) => {
    const [w] = await tx.query.workers.findMany({ where: (t, { eq }) => eq(t.id, workerId), columns: { preferredLanguage: true }, limit: 1 });
    const lang = w?.preferredLanguage === "es" ? "es" : "en";
    const t = await getTranslations({ locale: lang, namespace: "workerAppSms" });
    return { lang, result: await sendOnboardingLink(tx, actor, workerId, (agency) => t("invite", { agency, url: `${base}/${lang}/w/sign-in` }), new Date()) };
  });
  refresh();
  if (!r.result.ok) return { ok: false, error: r.result.error === "no_phone" || r.result.error === "not_found" || r.result.error === "not_allowed" ? r.result.error : "generic" };
  const sent = await deliverSms(db, smsTransport(), actor.agencyId, r.result.sms);
  return sent ? { ok: true } : { ok: false, error: "generic" };
}

export async function sendAgencyMessageAction(workerId: string, body: string): Promise<{ ok: true } | Fail<"empty" | "too_long" | "generic">> {
  const actor = await actorAllowedTo("workerApp");
  if (!id.safeParse(workerId).success) return { ok: false, error: "generic" };
  const writer = (await getLocale()) === "es" ? "es" : "en";
  const r = await withAgency(actor.agencyId, (tx) => sendAgencyMessage(tx, actor, workerId, String(body ?? "").slice(0, 4000), writer, translator()));
  refresh();
  if (r.ok) return r;
  return { ok: false, error: r.error === "empty" || r.error === "too_long" ? r.error : "generic" };
}

/** The Owner opens a signed form: a reason first (recorded), then the address, briefly (decision 0027's grant). */
export async function openWorkerFormAction(workerId: string, kind: string, reason: string): Promise<{ ok: true; url: string } | Fail<"confirm" | "reason_required" | "not_allowed" | "not_found">> {
  const actor = await actorAllowedTo("revealSsn");
  if (!id.safeParse(workerId).success || !(FORM_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "not_found" };
  if (await mustConfirmNow()) return { ok: false, error: "confirm" };
  const r = await withAgency(actor.agencyId, (tx) => recordFormOpened(tx, actor, workerId, kind as FormKind, String(reason ?? "")));
  if (!r.ok) return { ok: false, error: r.error === "reason_required" || r.error === "not_allowed" || r.error === "confirm" ? r.error : "not_found" };
  refresh();
  const grant = fileGrant(appKey(), formGrantSubject(workerId, kind as FormKind), actor.userId, Math.floor(Date.now() / 1000));
  return { ok: true, url: `/api/files/worker-form/${workerId}?kind=${kind}&locale=${await getLocale()}&expires=${grant.expires}&signature=${grant.signature}` };
}

export async function setClientWorkerClockAction(clientId: string, value: string): Promise<{ ok: true } | Fail<"invalid" | "not_found" | "not_allowed">> {
  const actor = await actorAllowedTo("placements");
  const r = await withAgency(actor.agencyId, (tx) => setClientWorkerClock(tx, actor, clientId, String(value)));
  revalidatePath("/[locale]/(app)/clients/[id]", "page");
  if (r.ok) return r;
  return { ok: false, error: r.error === "invalid" ? "invalid" : r.error === "not_allowed" ? "not_allowed" : "not_found" };
}
