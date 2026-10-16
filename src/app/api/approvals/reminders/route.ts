import { timingSafeEqual } from "node:crypto";
import { agenciesWithOpenRequests, sweepReminders } from "@/server/approvals/service";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { approvalDeps } from "@/server/services";

export const dynamic = "force-dynamic";

/** Compares bytes, so a header with characters of other lengths is simply not equal (never an error). */
function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * The host's scheduler calls this every 15 minutes (research part 2 §6) with
 * "Authorization: Bearer <CRON_SECRET>". Each due reminder is sent once, however often it runs.
 */
export async function GET(request: Request): Promise<Response> {
  if (!env.cronSecret) return new Response("Not found", { status: 404 });
  if (!same(request.headers.get("authorization") ?? "", `Bearer ${env.cronSecret}`)) return new Response("Unauthorized", { status: 401 });
  if (!env.appUrl) return new Response("SHIFTBOOK_APP_URL is not set", { status: 503 });
  const deps = approvalDeps(env.appUrl);
  let sent = 0;
  let failed = 0;
  let agencyErrors = 0;
  for (const agencyId of await agenciesWithOpenRequests(db)) {
    // One agency's problem never stops the others' reminders.
    try {
      const r = await sweepReminders(deps, agencyId);
      sent += r.sent;
      failed += r.failed;
    } catch (error) {
      agencyErrors += 1;
      console.error(`reminder sweep failed for agency ${agencyId}:`, error instanceof Error ? error.message : String(error));
    }
  }
  return Response.json({ sent, failed, agencyErrors });
}
