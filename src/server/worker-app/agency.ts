/**
 * The agency's side of the worker app (slice t; docs/patterns/workers/[id].md "Onboarding and
 * messages"): a worker's mobile number, the onboarding link sent by text (Gusto's "Send and
 * continue"), the onboarding checklist as the agency sees it, the message thread, a client's
 * clock-in setting, and the Owner's look at a signed form (with a reason, as a worker's file opens).
 */
import { and, eq, isNull, ne } from "drizzle-orm";
import { audit } from "../audit";
import { appKey } from "../auth/crypto";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { can } from "../permissions";
import type { Actor } from "../session";
import { maskPhone, phoneIndex, readPhone } from "./phone";
import { onboardingOf, postMessage, threadOf, type OnboardingView, type ThreadMessage } from "./service";
import { recordSms, type OutgoingSms } from "./sms";
import type { Lang, Translator } from "./translate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type AgencyError = "not_allowed" | "not_found" | "invalid" | "taken" | "no_phone";

async function workerRow(tx: Tx, id: string) {
  if (!UUID.test(id)) return null;
  const [w] = await tx.select().from(s.workers).where(eq(s.workers.id, id)).for("update");
  return w ?? null;
}

/** The worker's mobile number (US); refused when another worker in the agency has it. */
export async function setWorkerPhone(tx: Tx, actor: Actor, workerId: string, text: string): Promise<{ ok: true } | { ok: false; error: AgencyError }> {
  if (!can(actor, "workerApp")) return { ok: false, error: "not_allowed" };
  const w = await workerRow(tx, workerId);
  if (!w) return { ok: false, error: "not_found" };
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed === "") {
    if (!w.phone) return { ok: true };
    await tx.update(s.workers).set({ phone: null, phoneIndex: null }).where(eq(s.workers.id, w.id));
    await audit(tx, actor, [{ action: "update", entityType: "worker", entityId: w.id, before: { phone: maskPhone(w.phone) }, after: { phone: null } }]);
    return { ok: true };
  }
  const phone = readPhone(trimmed);
  if (!phone) return { ok: false, error: "invalid" };
  if (phone === w.phone) return { ok: true };
  const index = phoneIndex(phone, appKey());
  const [other] = await tx.select({ id: s.workers.id }).from(s.workers).where(and(eq(s.workers.phoneIndex, index), ne(s.workers.id, w.id)));
  if (other) return { ok: false, error: "taken" };
  await tx.update(s.workers).set({ phone, phoneIndex: index }).where(eq(s.workers.id, w.id));
  await audit(tx, actor, [{ action: "update", entityType: "worker", entityId: w.id, before: { phone: w.phone ? maskPhone(w.phone) : null }, after: { phone: maskPhone(phone) } }]);
  return { ok: true };
}

/** Gusto's "Send and continue": a text with the worker app's address, to sign in and onboard. */
export async function sendOnboardingLink(tx: Tx, actor: Actor, workerId: string, text: (agencyName: string) => string, now: Date): Promise<{ ok: true; sms: OutgoingSms } | { ok: false; error: AgencyError }> {
  if (!can(actor, "workerApp")) return { ok: false, error: "not_allowed" };
  const w = await workerRow(tx, workerId);
  if (!w) return { ok: false, error: "not_found" };
  if (!w.phone) return { ok: false, error: "no_phone" };
  const [agency] = await tx.select({ name: s.agencies.name }).from(s.agencies);
  const body = text(agency?.name ?? "");
  const sms = await recordSms(tx, { agencyId: actor.agencyId, kind: "onboarding_invite", to: w.phone, workerId: w.id, text: body, kept: body });
  await tx
    .insert(s.workerOnboarding)
    .values({ workerId: w.id, agencyId: actor.agencyId, invitedAt: now, invitedByLabel: actor.label })
    .onConflictDoUpdate({ target: s.workerOnboarding.workerId, set: { invitedAt: now, invitedByLabel: actor.label, updatedAt: now } });
  await audit(tx, actor, [{ action: "create", entityType: "worker", entityId: w.id, after: { onboardingLink: "sent", to: maskPhone(w.phone) } }]);
  return { ok: true, sms };
}

export interface AgencyWorkerApp {
  phone: string | null;
  invitedAt: Date | null;
  invitedBy: string | null;
  onboarding: OnboardingView;
  thread: ThreadMessage[];
  unread: number;
  workerLanguage: string;
}

/** The Onboarding and Messages tabs of a worker's profile. */
export async function workerAppOf(tx: Tx, workerId: string, today: string): Promise<AgencyWorkerApp | null> {
  if (!UUID.test(workerId)) return null;
  const [w] = await tx.select({ phone: s.workers.phone, language: s.workers.preferredLanguage }).from(s.workers).where(eq(s.workers.id, workerId));
  if (!w) return null;
  const [row] = await tx.select({ invitedAt: s.workerOnboarding.invitedAt, invitedBy: s.workerOnboarding.invitedByLabel }).from(s.workerOnboarding).where(eq(s.workerOnboarding.workerId, workerId));
  const thread = await threadOf(tx, workerId);
  return {
    phone: w.phone ? maskPhone(w.phone) : null,
    invitedAt: row?.invitedAt ?? null,
    invitedBy: row?.invitedBy ?? null,
    onboarding: await onboardingOf(tx, workerId, today),
    thread,
    unread: thread.filter((m) => m.sender === "worker").length === 0 ? 0 : (await tx.select({ id: s.workerMessages.id }).from(s.workerMessages).where(and(eq(s.workerMessages.workerId, workerId), eq(s.workerMessages.sender, "worker"), isNull(s.workerMessages.readByAgencyAt)))).length,
    workerLanguage: w.language,
  };
}

export async function markReadByAgency(tx: Tx, actor: Actor, workerId: string, now: Date): Promise<void> {
  if (!can(actor, "workerApp") || !UUID.test(workerId)) return;
  await tx.update(s.workerMessages).set({ readByAgencyAt: now }).where(and(eq(s.workerMessages.workerId, workerId), eq(s.workerMessages.sender, "worker"), isNull(s.workerMessages.readByAgencyAt)));
}

/** The agency writes to the worker, in the writer's language; the worker gets a translation in theirs. */
export async function sendAgencyMessage(tx: Tx, actor: Actor, workerId: string, body: string, writerLocale: Lang, translator: Translator): Promise<{ ok: true } | { ok: false; error: AgencyError | "empty" | "too_long" }> {
  if (!can(actor, "workerApp")) return { ok: false, error: "not_allowed" };
  const w = await workerRow(tx, workerId);
  if (!w) return { ok: false, error: "not_found" };
  const r = await postMessage(tx, { agencyId: actor.agencyId, workerId: w.id, sender: "agency", authorLabel: actor.label, authorUserId: actor.userId, body, bodyLocale: writerLocale, otherLocale: w.preferredLanguage === "es" ? "es" : "en" }, translator);
  if (!r.ok) return r;
  await audit(tx, actor, [{ action: "create", entityType: "worker_message", entityId: r.id, after: { workerId: w.id } }]);
  return { ok: true };
}

/** Whether a client's workers may clock in from the app (and with their location). */
export async function setClientWorkerClock(tx: Tx, actor: Actor, clientId: string, value: string): Promise<{ ok: true } | { ok: false; error: AgencyError }> {
  if (!can(actor, "placements")) return { ok: false, error: "not_allowed" };
  if (!UUID.test(clientId)) return { ok: false, error: "not_found" };
  if (value !== "off" && value !== "on" && value !== "location") return { ok: false, error: "invalid" };
  const [c] = await tx.select({ id: s.clients.id, workerClock: s.clients.workerClock }).from(s.clients).where(eq(s.clients.id, clientId)).for("update");
  if (!c) return { ok: false, error: "not_found" };
  if (c.workerClock === value) return { ok: true };
  await tx.update(s.clients).set({ workerClock: value }).where(eq(s.clients.id, c.id));
  await audit(tx, actor, [{ action: "update", entityType: "client", entityId: c.id, before: { workerClock: c.workerClock }, after: { workerClock: value } }]);
  return { ok: true };
}

export const FORM_KINDS = ["w4", "i9", "deposit"] as const;
export type FormKind = (typeof FORM_KINDS)[number];

/** The file grant's subject for a form (decision 0027's grant): never a worker file's link id, so neither opens the other. */
export const formGrantSubject = (workerId: string, kind: FormKind) => `form:${workerId}:${kind}`;

/** The Owner opens a signed form (it holds bank details and the I-9's numbers): a reason, recorded. */
export async function recordFormOpened(tx: Tx, actor: Actor, workerId: string, kind: FormKind, reason: string): Promise<{ ok: true } | { ok: false; error: AgencyError | "reason_required" }> {
  if (!can(actor, "revealSsn")) return { ok: false, error: "not_allowed" };
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length < 3 || why.length > 300 || /\d{3}[-\s]?\d{2}[-\s]?\d{4}/.test(why)) return { ok: false, error: "reason_required" };
  const w = await workerRow(tx, workerId);
  if (!w) return { ok: false, error: "not_found" };
  await audit(tx, actor, [{ action: "reveal", entityType: "worker", entityId: w.id, after: { form: kind }, reason: why }]);
  return { ok: true };
}
