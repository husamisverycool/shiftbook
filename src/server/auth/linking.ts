/**
 * Who a provider's identity signs in as (decision 0033). Pure: the service reads the rows, this
 * decides, the service writes.
 *
 * - An identity is its issuer and subject; once linked it signs in as its person.
 * - Not linked: only a verified email equal to an active member's signs in, and links it (rule c).
 *   An unverified email is refused as such before anything is said about who has an account.
 * - Never a new member or agency; never a suspended member; an invite is accepted only on its page.
 * - An agency's own single sign-on signs in only that agency's people: an identity linked there, or
 *   the member who typed their email, by a verified email equal to theirs.
 */
import type { UserStatus } from "../db/schema";

export interface Person {
  userId: string;
  agencyId: string;
  status: UserStatus;
}

export type IdentityRefusal = "no_account" | "not_verified" | "suspended";
export type IdentityDecision = { ok: true; userId: string; agencyId: string; link: boolean } | { ok: false; reason: IdentityRefusal };

export function decideIdentitySignIn(input: { linked: Person | null; byEmail: Person | null; emailVerified: boolean; sso: { agencyId: string; userId: string } | null }): IdentityDecision {
  const usable = (p: Person, link: boolean): IdentityDecision => {
    if (p.status === "suspended") return { ok: false, reason: "suspended" };
    if (p.status !== "active") return { ok: false, reason: "no_account" };
    return { ok: true, userId: p.userId, agencyId: p.agencyId, link };
  };
  if (input.linked) {
    if (input.sso && input.linked.agencyId !== input.sso.agencyId) return { ok: false, reason: "no_account" };
    return usable(input.linked, false);
  }
  if (!input.emailVerified) return { ok: false, reason: "not_verified" };
  if (!input.byEmail) return { ok: false, reason: "no_account" };
  if (input.sso && (input.byEmail.agencyId !== input.sso.agencyId || input.byEmail.userId !== input.sso.userId)) return { ok: false, reason: "no_account" };
  return usable(input.byEmail, true);
}
