// Pattern: docs/patterns/settings/notifications.md — Linear: Account › Notifications (notices always
// reach the inbox; email switched per kind).
import { eq } from "drizzle-orm";
import { setRequestLocale } from "next-intl/server";
import { NotificationSettingsView } from "@/components/shiftbook/notifications/notification-settings";
import { withAgency } from "@/server/db";
import { users } from "@/server/db/schema";
import { emailSettingsOf } from "@/server/notifications/service";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const { settings, email } = await withAgency(actor.agencyId, async (tx) => {
    const [me] = await tx.select({ email: users.email }).from(users).where(eq(users.id, actor.userId));
    return { settings: await emailSettingsOf(tx, actor.userId, actor.role), email: me?.email ?? "" };
  });
  return <NotificationSettingsView settings={settings} email={email} />;
}
