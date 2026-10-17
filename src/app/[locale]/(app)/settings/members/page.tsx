// Pattern: docs/patterns/settings/members.md — Linear Members (filters, row overflow: change role,
// suspend); Stripe Add member (roles explained; invites expire after 10 days).
import { setRequestLocale } from "next-intl/server";
import { MembersView } from "@/components/shiftbook/settings/members";
import { authDeps } from "@/server/auth/deps";
import { demoMailCopies, listMembers } from "@/server/auth/service";
import { can } from "@/server/permissions";
import { changesPaused, currentActor, isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function MembersPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const canManage = can(actor, "members");
  const deps = authDeps();
  const members = await listMembers(deps, actor.agencyId);
  const invited = members.filter((m) => m.status === "invited").map((m) => m.email);
  const copies = canManage && isDemo() ? await demoMailCopies(deps, actor.agencyId, "invite", invited) : new Map<string, string>();
  return (
    <MembersView
      me={actor.userId}
      canManage={canManage}
      paused={canManage && (await changesPaused(actor))}
      now={new Date().toISOString()}
      members={members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        status: m.status,
        hasAuthenticator: m.hasAuthenticator,
        lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
        inviteExpiresAt: m.inviteExpiresAt?.toISOString() ?? null,
        demoCopy: copies.get(m.email.toLowerCase()) ?? null,
      }))}
    />
  );
}
