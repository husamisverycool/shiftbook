"use server";

/** The agency's people (slice k, decisions K1 and K4): invites, roles and suspensions — the Owner only. */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authDeps } from "@/server/auth/deps";
import { renderInviteEmail } from "@/server/auth/emails";
import { cancelInvite, changeRole, demoMailCopies, inviteMember, resendInvite, setSuspended, type MemberError } from "@/server/auth/service";
import { withAgency } from "@/server/db";
import { ROLES } from "@/server/permissions";
import { requestOrigin } from "@/server/request-info";
import { linkBaseUrl } from "@/server/services";
import { actorAllowedTo, changesPaused, isDemo, mustConfirmNow, type Actor } from "@/server/session";
import { settingOn } from "@/server/settings";

export type MemberResult = { ok: true; demoCopy?: string | null } | { ok: false; error: MemberError | "generic" | "confirm" };

const id = z.uuid();
const InviteSchema = z.object({ name: z.string().max(200), email: z.string().max(320), role: z.enum(ROLES), locale: z.enum(["en", "es"]) }).strict();
const refresh = () => revalidatePath("/[locale]/(app)/settings/members", "page");

/** The invite email, dated in the agency's time zone. */
async function renderer(actor: Actor) {
  const zone = await withAgency(actor.agencyId, async (tx) => settingOn<unknown>(tx, "time_zone", new Date().toISOString().slice(0, 10)));
  const timeZone = typeof zone === "string" ? zone : "UTC";
  return (link: string, invite: Parameters<typeof renderInviteEmail>[1]) => renderInviteEmail(link, invite, timeZone);
}

/** Demo only: the copy the demo mailbox kept, so the invite can be opened (decision K3). */
async function demoCopy(actor: Actor, email: string): Promise<string | null> {
  if (!isDemo()) return null;
  return (await demoMailCopies(authDeps(), actor.agencyId, "invite", [email])).get(email.trim().toLowerCase()) ?? null;
}

export async function inviteAction(input: unknown): Promise<MemberResult> {
  const actor = await actorAllowedTo("members");
  // Changing the agency's people needs the Owner to have confirmed it's them recently (GitHub's sudo mode).
  if (await mustConfirmNow()) return { ok: false, error: "confirm" };
  const parsed = InviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.path[0] === "email" ? "invalid_email" : parsed.error.issues[0]?.path[0] === "role" ? "invalid_role" : "invalid_name" };
  const r = await inviteMember(authDeps(), actor, parsed.data, await renderer(actor), linkBaseUrl(await requestOrigin()));
  refresh();
  return r.ok ? { ok: true, demoCopy: await demoCopy(actor, parsed.data.email) } : r;
}

export async function resendInviteAction(userId: string, email: string): Promise<MemberResult> {
  const actor = await actorAllowedTo("members");
  // Changing the agency's people needs the Owner to have confirmed it's them recently (GitHub's sudo mode).
  if (await mustConfirmNow()) return { ok: false, error: "confirm" };
  if (!id.safeParse(userId).success || typeof email !== "string") return { ok: false, error: "not_found" };
  const r = await resendInvite(authDeps(), actor, userId, await renderer(actor), linkBaseUrl(await requestOrigin()));
  refresh();
  return r.ok ? { ok: true, demoCopy: await demoCopy(actor, email) } : r;
}

export async function cancelInviteAction(userId: string): Promise<MemberResult> {
  // Taking access away works even while changes are paused (decision 0036, security review).
  const actor = await actorAllowedTo("members", { whilePaused: { kind: "cancel_invite" } });
  // Changing the agency's people needs the Owner to have confirmed it's them recently (GitHub's sudo mode).
  if (await mustConfirmNow()) return { ok: false, error: "confirm" };
  if (!id.safeParse(userId).success) return { ok: false, error: "not_found" };
  const r = await cancelInvite(authDeps(), actor, userId);
  refresh();
  return r;
}

export async function changeRoleAction(userId: string, role: string): Promise<MemberResult> {
  // While changes are paused, only a role with fewer rights (decision 0036, security review): the service
  // judges it against the person's role under the members lock.
  const actor = await actorAllowedTo("members", { whilePaused: { kind: "role_lowered_only" } });
  // Changing the agency's people needs the Owner to have confirmed it's them recently (GitHub's sudo mode).
  if (await mustConfirmNow()) return { ok: false, error: "confirm" };
  if (!id.safeParse(userId).success) return { ok: false, error: "not_found" };
  if (!(ROLES as readonly string[]).includes(role)) return { ok: false, error: "invalid_role" };
  const r = await changeRole(authDeps(), actor, userId, role as (typeof ROLES)[number], { onlyFewerRights: await changesPaused(actor) });
  refresh();
  return r;
}

export async function setSuspendedAction(userId: string, suspended: boolean): Promise<MemberResult> {
  // Suspending takes access away and works even while changes are paused; restoring does not (decision 0036).
  const actor = await actorAllowedTo("members", { whilePaused: { kind: suspended === true ? "suspend" : "restore" } });
  // Changing the agency's people needs the Owner to have confirmed it's them recently (GitHub's sudo mode).
  if (await mustConfirmNow()) return { ok: false, error: "confirm" };
  if (!id.safeParse(userId).success || typeof suspended !== "boolean") return { ok: false, error: "not_found" };
  const r = await setSuspended(authDeps(), actor, userId, suspended);
  refresh();
  return r;
}
