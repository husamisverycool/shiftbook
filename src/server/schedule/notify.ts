/**
 * Telling workers their schedule is published (slice u's publish, Deputy step 3; SPEC §27 item 7): a
 * message in the worker app's thread, in the worker's own language, and a text message to their phone
 * (sent after the transaction commits; the demo keeps it in its outbox and sends nothing).
 */
import { inArray } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import type { Actor } from "../session";
import { postMessage } from "../worker-app/service";
import { recordSms, type OutgoingSms } from "../worker-app/sms";

export type Lang = "en" | "es";

/** The words for each language: the thread's message, and the text message (null: no text). */
export type PublishWords = (lang: Lang) => { message: string; sms: string | null };

export async function tellWorkersOfPublish(tx: Tx, actor: Actor, workerIds: readonly string[], words: PublishWords): Promise<OutgoingSms[]> {
  if (workerIds.length === 0) return [];
  const workers = await tx.select({ id: s.workers.id, phone: s.workers.phone, language: s.workers.preferredLanguage }).from(s.workers).where(inArray(s.workers.id, [...workerIds]));
  const texts: OutgoingSms[] = [];
  for (const w of workers) {
    const lang: Lang = w.language === "es" ? "es" : "en";
    const { message, sms } = words(lang);
    // Written in the worker's own language, so there is nothing to translate.
    const r = await postMessage(tx, { agencyId: actor.agencyId, workerId: w.id, sender: "agency", authorLabel: actor.label, authorUserId: actor.userId, body: message, bodyLocale: lang, otherLocale: lang }, { translation: null });
    if (r.ok) await audit(tx, actor, [{ action: "create", entityType: "worker_message", entityId: r.id, after: { workerId: w.id, schedulePublished: true } }]);
    if (sms && w.phone) texts.push(await recordSms(tx, { agencyId: actor.agencyId, kind: "schedule", to: w.phone, workerId: w.id, text: sms, kept: sms }));
  }
  return texts;
}
