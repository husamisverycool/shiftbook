// Pattern: docs/patterns/notifications.md — Linear's Inbox: the list, unread first or all, keyboard
// actions; each notice opens what it is about.
import { setRequestLocale } from "next-intl/server";
import { NotificationsView, type InboxRow } from "@/components/shiftbook/notifications/notifications-view";
import { withAgency } from "@/server/db";
import { inboxOf, noticeText } from "@/server/notifications/service";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function NotificationsPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const show = (await props.searchParams).show === "all" ? "all" : "unread";
  const actor = await currentActor();
  const items = await withAgency(actor.agencyId, (tx) => inboxOf(tx, actor.userId));
  const lang = locale === "es" ? "es" : "en";
  const rows: InboxRow[] = items.map((n) => ({ id: n.id, kind: n.kind, href: n.href, read: n.read, at: n.createdAt.toISOString(), ...noticeText(n.kind, n.params, lang) }));
  return <NotificationsView rows={rows} show={show} />;
}
