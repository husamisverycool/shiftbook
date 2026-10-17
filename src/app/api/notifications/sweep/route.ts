import { timingSafeEqual } from "node:crypto";
import { sweepReminders } from "@/server/collections/service";
import { db, withAgency } from "@/server/db";
import { env } from "@/server/env";
import { agenciesToSweep, emailNotices, syncNotifications } from "@/server/notifications/service";
import { mailTransport } from "@/server/services";
import { documentStore } from "@/server/storage";

export const dynamic = "force-dynamic";

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Slice r: the host's scheduler calls this (with "Authorization: Bearer <CRON_SECRET>", as the
 * approval reminders route, decision 0013). For each agency: its notices are brought up to date and
 * emailed to who keeps email on (Linear), and its collection reminders due today are sent once each
 * (Stripe's automatic reminders). One agency's problem never stops the others.
 */
export async function GET(request: Request): Promise<Response> {
  if (!env.cronSecret) return new Response("Not found", { status: 404 });
  if (!same(request.headers.get("authorization") ?? "", `Bearer ${env.cronSecret}`)) return new Response("Unauthorized", { status: 401 });
  if (!env.appUrl) return new Response("SHIFTBOOK_APP_URL is not set", { status: 503 });
  let notices = 0;
  let emailed = 0;
  let reminders = 0;
  let failed = 0;
  let agencyErrors = 0;
  for (const agencyId of await agenciesToSweep(db)) {
    try {
      const made = await withAgency(agencyId, (tx) => syncNotifications(tx, agencyId));
      notices += made.length;
      emailed += await emailNotices({ mailTransport, baseUrl: env.appUrl }, withAgency, agencyId, made);
      const r = await sweepReminders({ withAgency, store: documentStore, mailTransport }, agencyId);
      reminders += r.sent;
      failed += r.failed;
    } catch (error) {
      agencyErrors += 1;
      console.error(`sweep failed for agency ${agencyId}:`, error instanceof Error ? error.message : String(error));
    }
  }
  return Response.json({ notices, emailed, reminders, failed, agencyErrors });
}
