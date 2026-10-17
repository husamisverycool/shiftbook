/**
 * Who a provider's identity signs in as (decision 0033, rules a–c): linked identities first; an
 * unlinked one only with a verified email equal to an active member's; never a new member; never a
 * suspended one; an agency's own single sign-on only for its own people.
 */
import { describe, expect, it } from "vitest";
import { decideIdentitySignIn, type Person } from "./linking";

const A = "00000000-0000-4000-a000-00000000000a";
const B = "00000000-0000-4000-a000-00000000000b";
const lena: Person = { userId: "u-lena", agencyId: A, status: "active" };
const pat: Person = { userId: "u-pat", agencyId: B, status: "active" };
const verified = (byEmail: Person | null, over: Partial<Parameters<typeof decideIdentitySignIn>[0]> = {}) => decideIdentitySignIn({ linked: null, byEmail, emailVerified: true, mailboxProven: true, byEmailHasProvider: false, sso: null, ...over });
const linkedTo = (linked: Person, over: Partial<Parameters<typeof decideIdentitySignIn>[0]> = {}) => decideIdentitySignIn({ linked, byEmail: null, emailVerified: false, mailboxProven: false, byEmailHasProvider: false, sso: null, ...over });

describe("decideIdentitySignIn", () => {
  it("a linked identity signs in as its person, without linking again", () => {
    expect(linkedTo(lena)).toEqual({ ok: true, userId: "u-lena", agencyId: A, link: false, proof: false });
    // The linked person wins over whoever the email names now (the email can change; the subject cannot).
    expect(linkedTo(lena, { byEmail: pat, emailVerified: true })).toEqual({ ok: true, userId: "u-lena", agencyId: A, link: false, proof: false });
  });

  it("an unlinked identity signs in, and is linked, only with a verified email equal to an active member's (rule c)", () => {
    expect(verified(lena)).toEqual({ ok: true, userId: "u-lena", agencyId: A, link: true, proof: false });
  });

  it("the first link needs an emailed code unless the provider hosts that mailbox (review H2a)", () => {
    expect(verified(lena, { mailboxProven: false })).toEqual({ ok: true, userId: "u-lena", agencyId: A, link: true, proof: true });
  });

  it("refuses when the person already has a different identity from that provider (review H2b)", () => {
    expect(verified(lena, { byEmailHasProvider: true })).toEqual({ ok: false, reason: "other_identity" });
    expect(verified(lena, { byEmailHasProvider: true, mailboxProven: false })).toEqual({ ok: false, reason: "other_identity" });
  });

  it("an unverified email is refused as such, before saying whether anyone has it", () => {
    expect(verified(lena, { emailVerified: false })).toEqual({ ok: false, reason: "not_verified" });
    expect(verified(null, { emailVerified: false })).toEqual({ ok: false, reason: "not_verified" });
  });

  it("never makes a member: a verified email nobody has is refused", () => {
    expect(verified(null)).toEqual({ ok: false, reason: "no_account" });
  });

  it("refuses a suspended member, linked or by email, and an invite not yet accepted", () => {
    expect(linkedTo({ ...lena, status: "suspended" })).toEqual({ ok: false, reason: "suspended" });
    expect(verified({ ...lena, status: "suspended" })).toEqual({ ok: false, reason: "suspended" });
    expect(verified({ ...lena, status: "invited" })).toEqual({ ok: false, reason: "no_account" });
  });

  it("an agency's single sign-on signs in only that agency's people: linked there, or the member who typed their email", () => {
    const sso = { agencyId: A, userId: "u-lena" };
    expect(linkedTo(lena, { sso })).toEqual({ ok: true, userId: "u-lena", agencyId: A, link: false, proof: false });
    // Linked to someone in another agency: that agency's provider cannot sign them in.
    expect(linkedTo(pat, { sso })).toEqual({ ok: false, reason: "no_account" });
    // Linked to someone else in the same agency: not the member who typed their email (review L6).
    expect(linkedTo({ userId: "u-sam", agencyId: A, status: "active" }, { sso })).toEqual({ ok: false, reason: "no_account" });
    expect(verified(lena, { sso, mailboxProven: false })).toEqual({ ok: true, userId: "u-lena", agencyId: A, link: true, proof: true });
    // A verified email of someone else (even in the same agency) is not the member who asked.
    expect(verified({ userId: "u-sam", agencyId: A, status: "active" }, { sso })).toEqual({ ok: false, reason: "no_account" });
    expect(verified(pat, { sso: { agencyId: A, userId: "u-pat" } })).toEqual({ ok: false, reason: "no_account" });
  });
});
