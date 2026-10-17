/**
 * Who a provider's identity signs in as (decision 0033). Pure: the service reads the rows, this
 * decides, the service writes.
 *
 * - An identity is its issuer and subject; once linked it signs in as its person.
 * - Not linked: only a verified email equal to an active member's signs in, and links it (rule c).
 *   An unverified email is refused as such before anything is said about who has an account.
 * - The first link at sign-in needs a code sent to that mailbox now, unless the provider hosts the
 *   mailbox itself (Google for gmail.com or its Workspace domain; Microsoft with xms_edov) — review H2a.
 * - A person who already has a different identity from that provider is refused (review H2b): one
 *   connection per service (Vercel), and a second account is never added silently.
 * - Never a new member or agency; never a suspended member; an invite is accepted only on its page.
 * - An agency's own single sign-on signs in only the member who typed their email: by an identity
 *   linked to them, or by a verified email equal to theirs (review L6).
 */
import type { UserStatus } from "../db/schema";

export interface Person {
  userId: string;
  agencyId: string;
  status: UserStatus;
}

export type IdentityRefusal = "no_account" | "not_verified" | "suspended" | "other_identity";
export type IdentityDecision = { ok: true; userId: string; agencyId: string; link: boolean; proof: boolean } | { ok: false; reason: IdentityRefusal };

export function decideIdentitySignIn(input: {
  linked: Person | null;
  byEmail: Person | null;
  emailVerified: boolean;
  /** The provider hosts the mailbox (its word is proof of it now). */
  mailboxProven: boolean;
  /** The person the email names already has another identity from this provider. */
  byEmailHasProvider: boolean;
  sso: { agencyId: string; userId: string } | null;
}): IdentityDecision {
  const usable = (p: Person, link: boolean, proof: boolean): IdentityDecision => {
    if (p.status === "suspended") return { ok: false, reason: "suspended" };
    if (p.status !== "active") return { ok: false, reason: "no_account" };
    return { ok: true, userId: p.userId, agencyId: p.agencyId, link, proof };
  };
  if (input.linked) {
    if (input.sso && (input.linked.agencyId !== input.sso.agencyId || input.linked.userId !== input.sso.userId)) return { ok: false, reason: "no_account" };
    return usable(input.linked, false, false);
  }
  if (!input.emailVerified) return { ok: false, reason: "not_verified" };
  if (!input.byEmail) return { ok: false, reason: "no_account" };
  if (input.sso && (input.byEmail.agencyId !== input.sso.agencyId || input.byEmail.userId !== input.sso.userId)) return { ok: false, reason: "no_account" };
  if (input.byEmail.status !== "active") return usable(input.byEmail, true, false);
  if (input.byEmailHasProvider) return { ok: false, reason: "other_identity" };
  return usable(input.byEmail, true, !input.mailboxProven);
}
