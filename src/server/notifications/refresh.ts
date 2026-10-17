/**
 * The app's side of the notification sweep (slice r): when someone opens a page, the agency's notices
 * are brought up to date at most once a minute, new ones are emailed after the page is sent, and the
 * person's unread count is returned for the sidebar's badge (Linear's Inbox badge).
 */
import { after } from "next/server";
import { withAgency } from "../db";
import { linkBaseUrl, mailTransport } from "../services";
import type { Actor } from "../session";
import { emailNotices, syncNotifications, unreadCount } from "./service";

const SWEEP_EVERY_MS = 60_000;
const globalForSweep = globalThis as unknown as { notificationSweeps?: Map<string, number> };
const lastSweep = (globalForSweep.notificationSweeps ??= new Map<string, number>());

export async function refreshNotifications(actor: Pick<Actor, "agencyId" | "userId">, requestOrigin: string | null): Promise<number> {
  const now = Date.now();
  if ((lastSweep.get(actor.agencyId) ?? 0) <= now - SWEEP_EVERY_MS) {
    lastSweep.set(actor.agencyId, now);
    try {
      const made = await withAgency(actor.agencyId, (tx) => syncNotifications(tx, actor.agencyId));
      if (made.length > 0) {
        let baseUrl: string | null = null;
        try {
          baseUrl = linkBaseUrl(requestOrigin);
        } catch {
          baseUrl = null;
        }
        after(() => emailNotices({ mailTransport, baseUrl }, withAgency, actor.agencyId, made));
      }
    } catch (error) {
      // A sweep that fails never stops the page; the next one tries again.
      lastSweep.delete(actor.agencyId);
      console.error("notification sweep failed:", error instanceof Error ? error.message : String(error));
    }
  }
  return withAgency(actor.agencyId, (tx) => unreadCount(tx, actor.userId));
}
