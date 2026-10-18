/**
 * Slice (k) step 1 (decisions K1–K3) through the database: invites, passwords, the second step,
 * recovery codes, the lock, resets, roles, suspension, sessions, the demo's "Continue as", and the
 * sign-in tables fenced by agency unless a transaction is in sign-in mode.
 */
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hotp, stepAt, base32Decode } from "../../src/server/auth/totp";
import {
  beginAuthenticatorSetup,
  cancelInvite,
  changePassword,
  changeRole,
  confirmAuthenticator,
  demoSignIn,
  endSession,
  inviteMember,
  linkFor,
  listMembers,
  readSession,
  replaceRecoveryCodes,
  requestPasswordReset,
  setAccent,
  setLanguage,
  setSuspended,
  signIn,
  redeemLink,
  verifySecondStep,
  confirmAccess,
  rotateSession,
  verifyResetCode,
  demoMailCopies,
  accountOf,
  firstOwnerInvite,
  IDLE_MS,
  type AuthDeps,
  type LinkMail,
} from "../../src/server/auth/service";
import type { OutgoingMail } from "../../src/server/mail/transport";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER } from "../../src/server/demo/dataset";
import { clearDemoAgency, seedDemoAgency } from "../../src/server/demo/seed";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const sent: OutgoingMail[] = [];
let clock = new Date("2026-10-16T15:00:00Z");
const deps: AuthDeps = { db: app.db, mailTransport: () => ({ send: async (m) => (sent.push(m), { providerId: null }) }), now: () => clock };
const theOwner = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: "Demo Owner (demo)", role: "owner" as const };
const PASSWORD = "a long enough passphrase";
const render = (link: string): LinkMail => ({ subject: "Join", text: `Open ${link}`, html: `<a href="${link}">Join</a>` });
const linkIn = (m: OutgoingMail) => /sbau_[A-Za-z0-9_-]{43}/.exec(m.text)![0];
const codeAt = (setupKey: string, at = clock) => hotp(base32Decode(setupKey), stepAt(Math.floor(at.getTime() / 1000)));
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(DEMO_AGENCY.id, fn);

beforeEach(async () => {
  sent.length = 0;
  clock = new Date("2026-10-16T15:00:00Z");
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await owner.db.delete(s.sessions);
  await owner.db.delete(s.signInFailures);
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

/** Set up an authenticator in this session; returns the setup key and the session token that holds afterwards. */
async function withAuthenticator(token: string): Promise<{ setupKey: string; token: string; recoveryCodes: string[] }> {
  const session = (await readSession(deps, token))!;
  const setup = await beginAuthenticatorSetup(deps, session);
  if (!setup.ok) throw new Error(setup.error);
  const on = await confirmAuthenticator(deps, session, codeAt(setup.setupKey));
  if (!on.ok) throw new Error(on.error);
  return { setupKey: setup.setupKey, token, recoveryCodes: on.recoveryCodes };
}

/** Invite someone, accept with a password; returns their session token and user id. */
async function invited(role: "coordinator" | "billing" | "accountant" | "owner", email = "pat@agency.example") {
  const r = await inviteMember(deps, theOwner, { name: "Pat Lee", email, role, locale: "en" }, render, "https://app.example");
  if (!r.ok) throw new Error(r.error);
  const accepted = await redeemLink(deps, linkIn(sent.at(-1)!), "invite", PASSWORD, "test");
  if (!accepted.ok) throw new Error(accepted.error);
  return { userId: r.userId, ...accepted };
}

describe("while changes are paused, a role change only lowers rights (decision 0036, security review)", () => {
  it("an Owner may move someone to a role with fewer rights, never to one with more", async () => {
    const pat = await invited("owner", "pat.paused@agency.example");
    const session = (await readSession(deps, pat.token))!;
    expect(session.role).toBe("owner");
    expect(await changeRole(deps, theOwner, pat.userId, "coordinator", { onlyFewerRights: true })).toEqual({ ok: true });
    // Coordinator → accountant adds reading the margin and the whole log: not fewer rights.
    expect(await changeRole(deps, theOwner, pat.userId, "accountant", { onlyFewerRights: true })).toEqual({ ok: false, error: "paused" });
    expect(await changeRole(deps, theOwner, pat.userId, "owner", { onlyFewerRights: true })).toEqual({ ok: false, error: "paused" });
    expect((await listMembers(deps, DEMO_AGENCY.id)).find((m) => m.id === pat.userId)!.role).toBe("coordinator");
    // Not paused: any role, as before.
    expect(await changeRole(deps, theOwner, pat.userId, "accountant")).toEqual({ ok: true });
  });
});

describe("sign-in through the database", () => {
  it("an invite: Owner only, one email in one agency, a working link sent once; accepted with a 15-character password", async () => {
    expect(await inviteMember(deps, { ...theOwner, role: "coordinator" }, { name: "Pat", email: "pat@agency.example", role: "billing", locale: "en" }, render, "https://app.example")).toEqual({ ok: false, error: "not_allowed" });
    expect(await inviteMember(deps, theOwner, { name: "Pat", email: "not an email", role: "billing", locale: "en" }, render, "https://app.example")).toEqual({ ok: false, error: "invalid_email" });
    expect(await inviteMember(deps, theOwner, { name: "Pat", email: DEMO_OWNER.email.toUpperCase(), role: "billing", locale: "en" }, render, "https://app.example")).toEqual({ ok: false, error: "email_taken" });
    const r = await inviteMember(deps, theOwner, { name: "Pat Lee", email: "Pat@Agency.example", role: "billing", locale: "es" }, render, "https://app.example");
    expect(r.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toMatch(/https:\/\/app\.example\/es\/invite\/sbau_/);
    // The kept copy hides the link.
    const [kept] = await inAgency((tx) => tx.select().from(s.emailMessages).where(eq(s.emailMessages.kind, "invite")));
    expect([kept!.textBody, kept!.status]).toEqual(["Open https://app.example/es/invite/[sign-in link hidden]", "sent"]);
    const token = linkIn(sent[0]!);
    expect(await linkFor(deps, token, "invite")).toMatchObject({ name: "Pat Lee", email: "pat@agency.example", role: "billing", locale: "es" });
    expect(await redeemLink(deps, token, "invite", "too short", "test")).toEqual({ ok: false, error: "too_short" });
    const ok = await redeemLink(deps, token, "invite", PASSWORD, "test");
    expect(ok).toMatchObject({ ok: true, next: "done", locale: "es" });
    // Once used, the link is dead.
    expect(await linkFor(deps, token, "invite")).toBeNull();
    expect((await listMembers(deps, DEMO_AGENCY.id)).find((m) => m.email === "pat@agency.example")).toMatchObject({ status: "active", role: "billing", hasAuthenticator: false });
  });

  it("a coordinator must set up the code: shown the setup key, a code from it turns it on with ten recovery codes, and the next sign-in asks for it", async () => {
    const pat = await invited("coordinator");
    expect(pat.next).toBe("setup");
    let session = (await readSession(deps, pat.token))!;
    expect(session.secondStepAt).toBeNull();
    const setup = await beginAuthenticatorSetup(deps, session);
    if (!setup.ok) throw new Error(setup.error);
    const { setupKey, uri } = setup;
    expect(uri).toContain("otpauth://totp/Granite%3Apat%40agency.example");
    expect(await confirmAuthenticator(deps, session, "000000")).toEqual({ ok: false, error: "invalid" });
    const turnedOn = await confirmAuthenticator(deps, session, codeAt(setupKey));
    if (!turnedOn.ok) throw new Error(turnedOn.error);
    expect(turnedOn.recoveryCodes).toHaveLength(10);
    // The half session has passed its step; leaving the codes puts it under a fresh token.
    expect((await readSession(deps, pat.token))!.secondStepAt).not.toBeNull();
    const rotated = (await rotateSession(deps, pat.token, "test"))!;
    expect(await readSession(deps, pat.token)).toBeNull();
    session = (await readSession(deps, rotated))!;
    expect(session.secondStepAt).not.toBeNull();

    // Sign out, sign in: password, then the code (not the one just used: a new step).
    await endSession(deps, rotated);
    expect(await readSession(deps, rotated)).toBeNull();
    clock = new Date(clock.getTime() + 60_000);
    const first = await signIn(deps, "PAT@agency.example ", PASSWORD, "test");
    if (!first.ok) throw new Error(first.error);
    expect(first.next).toBe("code");
    expect((await readSession(deps, first.token))!.secondStepAt).toBeNull();
    expect(await verifySecondStep(deps, first.token, "123456", "test")).toEqual({ ok: false, error: "invalid" });
    const second = await verifySecondStep(deps, first.token, codeAt(setupKey), "test");
    if (!second.ok) throw new Error(second.error);
    // The half-signed-in token is replaced.
    expect(await readSession(deps, first.token)).toBeNull();
    expect((await readSession(deps, second.token))!.secondStepAt).not.toBeNull();
    // The same code again (replay) is refused; a recovery code works once.
    const again = await signIn(deps, "pat@agency.example", PASSWORD, "test");
    if (!again.ok) throw new Error(again.error);
    expect(await verifySecondStep(deps, again.token, codeAt(setupKey), "test")).toEqual({ ok: false, error: "invalid" });
    const byRecovery = await verifySecondStep(deps, again.token, turnedOn.recoveryCodes[0]!, "test");
    expect(byRecovery).toMatchObject({ ok: true, recoveryLeft: 9 });
    const third = await signIn(deps, "pat@agency.example", PASSWORD, "test");
    if (!third.ok) throw new Error(third.error);
    expect(await verifySecondStep(deps, third.token, turnedOn.recoveryCodes[0]!, "test")).toEqual({ ok: false, error: "invalid" });
    // New recovery codes end the old ones.
    const fresh = await replaceRecoveryCodes(deps, (await readSession(deps, (byRecovery as { token: string }).token))!);
    if (!fresh.ok) throw new Error(fresh.error);
    expect(fresh.recoveryCodes).toHaveLength(10);
    expect(await verifySecondStep(deps, third.token, turnedOn.recoveryCodes[1]!, "test")).toEqual({ ok: false, error: "invalid" });
    // The log tells it.
    const events = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "user"), eq(s.auditEvents.entityId, pat.userId))));
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(["create", "update", "sign_in", "sign_out", "sign_in_failed"]));
  });

  it("ten wrong passwords for one email from one address wait 15 minutes, unknown emails alike; another address still signs in; 100 in a day lock the password", async () => {
    await invited("billing");
    const here = "203.0.113.5";
    for (let i = 0; i < 10; i += 1) expect(await signIn(deps, "pat@agency.example", "wrong password here", "test", here)).toEqual({ ok: false, error: "invalid" });
    expect(await signIn(deps, "pat@agency.example", PASSWORD, "test", here)).toEqual({ ok: false, error: "locked" });
    // A stranger elsewhere cannot lock the person out.
    expect(await signIn(deps, "pat@agency.example", PASSWORD, "test", "198.51.100.7")).toMatchObject({ ok: true });
    // An unknown email answers the same, wrong and then waiting.
    for (let i = 0; i < 10; i += 1) expect(await signIn(deps, "nobody@agency.example", "wrong password here", "test", here)).toEqual({ ok: false, error: "invalid" });
    expect(await signIn(deps, "nobody@agency.example", PASSWORD, "test", here)).toEqual({ ok: false, error: "locked" });
    clock = new Date(clock.getTime() + 16 * 60_000);
    expect(await signIn(deps, "pat@agency.example", PASSWORD, "test", here)).toMatchObject({ ok: true, next: "done" });
    // Per person: the hundredth wrong password in a day locks the password for an hour, from anywhere.
    const [login] = await owner.db.select().from(s.userLogins).where(eq(s.userLogins.email, "pat@agency.example"));
    await owner.db.update(s.userLogins).set({ failedCount: 99, failedSince: clock }).where(eq(s.userLogins.userId, login!.userId));
    expect(await signIn(deps, "pat@agency.example", "wrong password here", "test", "192.0.2.1")).toEqual({ ok: false, error: "locked" });
    expect(await signIn(deps, "pat@agency.example", PASSWORD, "test", "192.0.2.2")).toEqual({ ok: false, error: "locked" });
    clock = new Date(clock.getTime() + 61 * 60_000);
    expect(await signIn(deps, "pat@agency.example", PASSWORD, "test", "192.0.2.2")).toMatchObject({ ok: true });
  }, 120_000);

  it("wrong codes are counted apart: a right password never clears them; five end a half session; ten in 15 minutes lock the code", async () => {
    const pat = await invited("coordinator");
    const { setupKey, token } = await withAuthenticator(pat.token);
    await endSession(deps, token);
    clock = new Date(clock.getTime() + 60_000);
    const half = async () => {
      const r = await signIn(deps, "pat@agency.example", PASSWORD, "test");
      if (!r.ok || r.next !== "code") throw new Error("expected the code step");
      return r.token;
    };
    let h = await half();
    for (let i = 0; i < 4; i += 1) expect(await verifySecondStep(deps, h, "000000", "test")).toEqual({ ok: false, error: "invalid" });
    // The fifth wrong code ends the half session: the password again.
    expect(await verifySecondStep(deps, h, "000000", "test")).toEqual({ ok: false, error: "expired" });
    expect(await readSession(deps, h)).toBeNull();
    // A right password does not clear the five: five more lock the code.
    h = await half();
    for (let i = 0; i < 4; i += 1) expect(await verifySecondStep(deps, h, "000000", "test")).toEqual({ ok: false, error: "invalid" });
    expect(await verifySecondStep(deps, h, "000000", "test")).toEqual({ ok: false, error: "locked" });
    h = await half();
    expect(await verifySecondStep(deps, h, codeAt(setupKey), "test")).toEqual({ ok: false, error: "locked" });
    clock = new Date(clock.getTime() + 16 * 60_000);
    h = await half();
    expect(await verifySecondStep(deps, h, codeAt(setupKey), "test")).toMatchObject({ ok: true });
  }, 120_000);

  it("a code lock never locks out for good: a recovery code still works during it, and the day lock starts the count over", async () => {
    const pat = await invited("coordinator");
    const { recoveryCodes, token } = await withAuthenticator(pat.token);
    await endSession(deps, token);
    const [login] = await owner.db.select().from(s.userLogins).where(eq(s.userLogins.email, "pat@agency.example"));
    // 99 wrong codes in a row already; the hundredth locks codes for a day.
    await owner.db.update(s.userLogins).set({ codeFailuresInRow: 99 }).where(eq(s.userLogins.userId, login!.userId));
    clock = new Date(clock.getTime() + 60_000);
    const first = await signIn(deps, "pat@agency.example", PASSWORD, "test");
    if (!first.ok) throw new Error(first.error);
    expect(await verifySecondStep(deps, first.token, "000000", "test")).toEqual({ ok: false, error: "locked" });
    const [locked] = await owner.db.select().from(s.userLogins).where(eq(s.userLogins.userId, login!.userId));
    expect(locked!.codeFailuresInRow).toBe(0);
    expect(locked!.codeLockedUntil!.getTime()).toBe(clock.getTime() + 24 * 60 * 60_000);
    // Six-digit codes wait; a recovery code gets the person in.
    expect(await verifySecondStep(deps, first.token, "123456", "test")).toEqual({ ok: false, error: "locked" });
    expect(await verifySecondStep(deps, first.token, recoveryCodes[0]!, "test")).toMatchObject({ ok: true, recoveryLeft: 9 });
  }, 120_000);

  it("with no known address there is no email-wide block (anyone could use it against the owner of the email); the person's day lock still counts", async () => {
    await invited("billing");
    for (let i = 0; i < 12; i += 1) expect(await signIn(deps, "pat@agency.example", "wrong password here", "test", null)).toEqual({ ok: false, error: "invalid" });
    expect(await signIn(deps, "pat@agency.example", PASSWORD, "test", null)).toMatchObject({ ok: true });
    expect(await owner.db.select().from(s.signInFailures)).toEqual([]);
  }, 120_000);

  it("tries made at the same moment count one by one, and a code or a recovery code works once even when sent twice at once", async () => {
    const pat = await invited("coordinator");
    const { setupKey, token, recoveryCodes } = await withAuthenticator(pat.token);
    await endSession(deps, token);
    clock = new Date(clock.getTime() + 60_000);
    const half = async () => {
      const r = await signIn(deps, "pat@agency.example", PASSWORD, "test");
      if (!r.ok) throw new Error(r.error);
      return r.token;
    };
    const [a, b, c] = [await half(), await half(), await half()];
    await Promise.all([a, b, c].map((x) => verifySecondStep(deps, x, "000000", "test")));
    const [counted] = await owner.db.select().from(s.userLogins).where(eq(s.userLogins.email, "pat@agency.example"));
    expect(counted!.codeFailedCount).toBe(3);
    const both = await Promise.all([verifySecondStep(deps, a, codeAt(setupKey), "test"), verifySecondStep(deps, b, codeAt(setupKey), "test")]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    const [d, e] = [await half(), await half()];
    const twice = await Promise.all([verifySecondStep(deps, d, recoveryCodes[0]!, "test"), verifySecondStep(deps, e, recoveryCodes[0]!, "test")]);
    expect(twice.filter((r) => r.ok)).toHaveLength(1);
  }, 120_000);

  it("a session must confirm it's them (password or code, in the last 15 minutes) before replacing the authenticator or the recovery codes", async () => {
    const pat = await invited("coordinator");
    const { setupKey, token } = await withAuthenticator(pat.token);
    let session = (await readSession(deps, token))!;
    // Just confirmed by the setup: no question yet.
    const now1 = await beginAuthenticatorSetup(deps, session);
    expect(now1.ok).toBe(true);
    clock = new Date(clock.getTime() + 16 * 60_000);
    session = (await readSession(deps, token))!;
    expect(await beginAuthenticatorSetup(deps, session)).toEqual({ ok: false, error: "confirm" });
    expect(await replaceRecoveryCodes(deps, session)).toEqual({ ok: false, error: "confirm" });
    expect(await confirmAccess(deps, session, "000000")).toEqual({ ok: false, error: "invalid" });
    expect(await confirmAccess(deps, session, codeAt(setupKey))).toEqual({ ok: true });
    session = (await readSession(deps, token))!;
    expect((await beginAuthenticatorSetup(deps, session)).ok).toBe(true);
    expect((await replaceRecoveryCodes(deps, session)).ok).toBe(true);
    // A half session still owing its code can never set one up.
    const half = await signIn(deps, "pat@agency.example", PASSWORD, "test");
    if (!half.ok) throw new Error(half.error);
    expect(await beginAuthenticatorSetup(deps, (await readSession(deps, half.token))!)).toEqual({ ok: false, error: "expired" });
    // Someone with only a password confirms with it.
    const sam = await invited("billing", "sam@agency.example");
    clock = new Date(clock.getTime() + 16 * 60_000);
    const samSession = (await readSession(deps, sam.token))!;
    expect(await beginAuthenticatorSetup(deps, samSession)).toEqual({ ok: false, error: "confirm" });
    expect(await confirmAccess(deps, samSession, "not the password")).toEqual({ ok: false, error: "invalid" });
    expect(await confirmAccess(deps, samSession, PASSWORD)).toEqual({ ok: true });
    expect((await beginAuthenticatorSetup(deps, (await readSession(deps, sam.token))!)).ok).toBe(true);
    // The demo's shared sessions are never asked.
    const demo = await demoSignIn(deps, DEMO_AGENCY.id, DEMO_OWNER.id, "test");
    if (!demo.ok) throw new Error("demo");
    clock = new Date(clock.getTime() + 60 * 60_000);
    expect((await beginAuthenticatorSetup(deps, (await readSession(deps, demo.token))!)).ok).toBe(true);
  }, 120_000);

  it("two Owners demoting each other at the same moment never leave the agency without one", async () => {
    const pat = await invited("owner");
    const patAsOwner = { agencyId: DEMO_AGENCY.id, userId: pat.userId, label: "Pat Lee", role: "owner" as const };
    const both = await Promise.all([changeRole(deps, theOwner, pat.userId, "billing"), changeRole(deps, patAsOwner, DEMO_OWNER.id, "billing")]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.filter((r) => !r.ok)).toEqual([{ ok: false, error: "last_owner" }]);
    const owners = (await listMembers(deps, DEMO_AGENCY.id)).filter((m) => m.role === "owner" && m.status === "active");
    expect(owners).toHaveLength(1);
  }, 60_000);

  it("a password reset: the same answer for any email, a one-hour link, every session ended", async () => {
    const pat = await invited("billing");
    sent.length = 0;
    await requestPasswordReset(deps, "nobody@agency.example", render, "https://app.example");
    expect(sent).toHaveLength(0);
    const jobs: (() => Promise<unknown>)[] = [];
    await requestPasswordReset(deps, "pat@agency.example", render, "https://app.example", (job) => jobs.push(job));
    // Sent after the response, so an existing account answers as fast as an unknown one.
    expect(sent).toHaveLength(0);
    await Promise.all(jobs.map((job) => job()));
    expect(sent).toHaveLength(1);
    const token = linkIn(sent[0]!);
    clock = new Date(clock.getTime() + 61 * 60_000);
    expect(await redeemLink(deps, token, "reset", "a brand new passphrase", "test")).toEqual({ ok: false, error: "expired" });
    clock = new Date("2026-10-16T15:00:00Z");
    expect(await redeemLink(deps, token, "reset", "a brand new passphrase", "test")).toMatchObject({ ok: true });
    expect(await readSession(deps, pat.token)).toBeNull();
    expect(await signIn(deps, "pat@agency.example", PASSWORD, "test")).toEqual({ ok: false, error: "invalid" });
    expect(await signIn(deps, "pat@agency.example", "a brand new passphrase", "test")).toMatchObject({ ok: true });
  }, 60_000);

  it("a reset for someone with an authenticator asks the code before the new password (GitHub's order), and counts wrong codes", async () => {
    const pat = await invited("coordinator");
    const { setupKey } = await withAuthenticator(pat.token);
    expect(await accountOf(deps, pat.userId)).toMatchObject({ hasPassword: true, recoveryCodesLeft: 10 });
    sent.length = 0;
    await requestPasswordReset(deps, "pat@agency.example", render, "https://app.example");
    const token = linkIn(sent[0]!);
    expect(await linkFor(deps, token, "reset")).toMatchObject({ needsCode: true, email: "pat@agency.example" });
    // Email alone is not enough: the password does not change.
    expect(await redeemLink(deps, token, "reset", "a brand new passphrase", "test")).toEqual({ ok: false, error: "code_needed" });
    expect(await verifyResetCode(deps, token, "000000")).toEqual({ ok: false, error: "invalid" });
    clock = new Date(clock.getTime() + 60_000);
    const given = await verifyResetCode(deps, token, codeAt(setupKey));
    if (!given.ok) throw new Error(given.error);
    // Only the browser that gave the code (its proof) goes on to the password.
    expect(await linkFor(deps, token, "reset")).toMatchObject({ needsCode: true });
    expect(await linkFor(deps, token, "reset", given.proof)).toMatchObject({ needsCode: false });
    expect(await redeemLink(deps, token, "reset", "a brand new passphrase", "test")).toEqual({ ok: false, error: "code_needed" });
    expect(await redeemLink(deps, token, "reset", "a brand new passphrase", "test", "sbau_not-the-proof")).toEqual({ ok: false, error: "code_needed" });
    // With the code given, the new password signs them straight in.
    expect(await redeemLink(deps, token, "reset", "a brand new passphrase", "test", given.proof)).toMatchObject({ ok: true, next: "done" });
    expect(await verifyResetCode(deps, token, codeAt(setupKey))).toEqual({ ok: false, error: "expired" });
  }, 60_000);

  it("the demo keeps a copy of invite and reset emails, link included, only for a demo agency", async () => {
    const r = await inviteMember(deps, theOwner, { name: "Pat Lee", email: "pat@agency.example", role: "billing", locale: "en" }, render, "https://app.example");
    if (!r.ok) throw new Error(r.error);
    // The test transport is not the demo mailbox: put the copy there as the demo transport would.
    const [mail] = await inAgency((tx) => tx.select().from(s.emailMessages).where(eq(s.emailMessages.kind, "invite")));
    await inAgency((tx) => tx.insert(s.demoMailbox).values({ agencyId: DEMO_AGENCY.id, emailMessageId: mail!.id, toEmail: "pat@agency.example", subject: "Join", textBody: sent[0]!.text, htmlBody: sent[0]!.html }));
    const copies = await demoMailCopies(deps, DEMO_AGENCY.id, "invite", ["PAT@agency.example"]);
    expect(copies.get("pat@agency.example")).toMatch(/\/invite\/sbau_/);
    await owner.db.update(s.agencies).set({ isDemo: false }).where(eq(s.agencies.id, DEMO_AGENCY.id));
    try {
      expect((await demoMailCopies(deps, DEMO_AGENCY.id, "invite", ["pat@agency.example"])).size).toBe(0);
    } finally {
      await owner.db.update(s.agencies).set({ isDemo: true }).where(eq(s.agencies.id, DEMO_AGENCY.id));
    }
  });

  it("a new agency's first Owner: invited with a link handed to the person running the script, once", async () => {
    const [agency] = await owner.db.insert(s.agencies).values({ name: "Second Agency (test)", isDemo: false }).returning();
    try {
      const r = await firstOwnerInvite(deps, agency!.id, { name: "Avery Stone", email: "avery@second.example", locale: "es" }, "https://app.example");
      if (!r.ok) throw new Error(r.error);
      expect(r.link).toMatch(/^https:\/\/app\.example\/es\/invite\/sbau_/);
      expect(sent).toHaveLength(0);
      expect(await firstOwnerInvite(deps, agency!.id, { name: "Someone Else", email: "else@second.example", locale: "en" }, "https://app.example")).toEqual({ ok: false, error: "has_owner" });
      const joined = await redeemLink(deps, r.link.split("/invite/")[1]!, "invite", PASSWORD, "test");
      expect(joined).toMatchObject({ ok: true, next: "setup", locale: "es" });
      // The new agency's people are not the demo's.
      expect((await listMembers(deps, agency!.id)).map((m) => m.email)).toEqual(["avery@second.example"]);
      expect((await listMembers(deps, DEMO_AGENCY.id)).some((m) => m.email === "avery@second.example")).toBe(false);
    } finally {
      await owner.db.delete(s.sessions).where(eq(s.sessions.agencyId, agency!.id));
      await owner.db.delete(s.authTokens).where(eq(s.authTokens.agencyId, agency!.id));
      await owner.db.delete(s.userLogins).where(eq(s.userLogins.agencyId, agency!.id));
      // The agency and its log stay (the log is append-only); its people go.
      await owner.db.delete(s.users).where(eq(s.users.agencyId, agency!.id));
    }
  }, 60_000);

  it("changing a password needs the current one and ends the other sessions", async () => {
    const pat = await invited("accountant");
    const other = await signIn(deps, "pat@agency.example", PASSWORD, "test");
    const session = (await readSession(deps, pat.token))!;
    expect(await changePassword(deps, session, "not the password", "another long passphrase")).toEqual({ ok: false, error: "wrong_password" });
    const [counted] = await owner.db.select().from(s.userLogins).where(eq(s.userLogins.email, "pat@agency.example"));
    expect(counted!.failedCount).toBe(1);
    expect(await changePassword(deps, session, PASSWORD, "pat@agency.example")).toEqual({ ok: false, error: "is_email" });
    expect(await changePassword(deps, session, PASSWORD, "another long passphrase")).toEqual({ ok: true });
    expect(await readSession(deps, (other as { token: string }).token)).toBeNull();
    expect(await readSession(deps, pat.token)).not.toBeNull();
  }, 60_000);

  it("roles and suspension: the Owner only; never the last Owner or oneself; a role that needs the code asks for it; suspension ends sessions at once", async () => {
    const pat = await invited("billing");
    expect(await changeRole(deps, { ...theOwner, role: "billing" }, pat.userId, "owner")).toEqual({ ok: false, error: "not_allowed" });
    expect(await changeRole(deps, theOwner, DEMO_OWNER.id, "billing")).toEqual({ ok: false, error: "last_owner" });
    expect(await setSuspended(deps, theOwner, DEMO_OWNER.id, true)).toEqual({ ok: false, error: "self" });
    expect(await changeRole(deps, theOwner, pat.userId, "coordinator")).toEqual({ ok: true });
    // The role now needs the code: the person signs in again, to a short setup session.
    expect(await readSession(deps, pat.token)).toBeNull();
    const again = await signIn(deps, "pat@agency.example", PASSWORD, "test");
    expect(again).toMatchObject({ ok: true, next: "setup" });
    expect(await setSuspended(deps, theOwner, pat.userId, true)).toEqual({ ok: true });
    expect(await readSession(deps, (again as { token: string }).token)).toBeNull();
    expect(await signIn(deps, "pat@agency.example", PASSWORD, "test")).toEqual({ ok: false, error: "invalid" });
    expect(await setSuspended(deps, theOwner, pat.userId, false)).toEqual({ ok: true });
    expect(await signIn(deps, "pat@agency.example", PASSWORD, "test")).toMatchObject({ ok: true, next: "setup" });
  }, 60_000);

  it("an invite not yet accepted can be withdrawn; its link stops working", async () => {
    const r = await inviteMember(deps, theOwner, { name: "Sam Ray", email: "sam.ray@agency.example", role: "billing", locale: "en" }, render, "https://app.example");
    if (!r.ok) throw new Error(r.error);
    const token = linkIn(sent[0]!);
    expect(await cancelInvite(deps, theOwner, r.userId)).toEqual({ ok: true });
    expect(await linkFor(deps, token, "invite")).toBeNull();
    expect((await listMembers(deps, DEMO_AGENCY.id)).some((m) => m.email === "sam.ray@agency.example")).toBe(false);
  });

  it("sessions end after 12 idle hours, and the demo's Continue as works only for a demo agency, its second step counted", async () => {
    const demo = await demoSignIn(deps, DEMO_AGENCY.id, DEMO_OWNER.id, "test");
    if (!demo.ok) throw new Error("demo sign-in refused");
    expect(await readSession(deps, demo.token)).toMatchObject({ role: "owner", demo: true, name: "Demo Owner" });
    expect((await readSession(deps, demo.token))!.secondStepAt).not.toBeNull();
    const session = (await readSession(deps, demo.token))!;
    expect(await setLanguage(deps, session, "es")).toBe(true);
    expect((await readSession(deps, demo.token))!.locale).toBe("es");
    clock = new Date(clock.getTime() + IDLE_MS + 60_000);
    expect(await readSession(deps, demo.token)).toBeNull();
    const fresh = await demoSignIn(deps, DEMO_AGENCY.id, DEMO_OWNER.id, "test");
    if (!fresh.ok) throw new Error("demo sign-in refused");
    await owner.db.update(s.agencies).set({ isDemo: false }).where(eq(s.agencies.id, DEMO_AGENCY.id));
    try {
      expect(await demoSignIn(deps, DEMO_AGENCY.id, DEMO_OWNER.id, "test")).toEqual({ ok: false });
      expect(await readSession(deps, fresh.token)).toBeNull();
    } finally {
      await owner.db.update(s.agencies).set({ isDemo: true }).where(eq(s.agencies.id, DEMO_AGENCY.id));
    }
  });

  it("decision 0046: each person keeps their own accent colour; only the four colours are taken", async () => {
    const demo = await demoSignIn(deps, DEMO_AGENCY.id, DEMO_OWNER.id, "test");
    if (!demo.ok) throw new Error("demo sign-in refused");
    const session = (await readSession(deps, demo.token))!;
    expect(session.accent).toBe("indigo");
    expect(await setAccent(deps, session, "teal")).toBe(true);
    expect((await readSession(deps, demo.token))!.accent).toBe("teal");
    expect(await setAccent(deps, session, "red")).toBe(false);
    expect((await readSession(deps, demo.token))!.accent).toBe("teal");
    // Another person in the same agency keeps the default.
    const others = await owner.db.select({ accent: s.users.accent }).from(s.users).where(and(eq(s.users.agencyId, DEMO_AGENCY.id), sql`${s.users.id} <> ${DEMO_OWNER.id}`));
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((u) => u.accent === "indigo")).toBe(true);
  });

  it("the sign-in tables are fenced by agency: an ordinary transaction sees only its own agency's rows, none without one", async () => {
    await invited("billing");
    const other = await owner.db.insert(s.agencies).values({ name: "Other agency (test)" }).returning();
    try {
      const seenOutside = await app.db.transaction(async (tx) => tx.select().from(s.userLogins));
      expect(seenOutside).toEqual([]);
      const seenByOther = await app.withAgency(other[0]!.id, (tx) => tx.select().from(s.userLogins));
      expect(seenByOther).toEqual([]);
      const seenByOwn = await inAgency((tx) => tx.select().from(s.userLogins));
      expect(seenByOwn.map((l) => l.email)).toEqual(["pat@agency.example"]);
      const sessionsOutside = await app.db.transaction(async (tx) => tx.select().from(s.sessions));
      expect(sessionsOutside).toEqual([]);
      // Sign-in mode is a transaction-local switch.
      const after = await app.db.transaction(async (tx) => (await tx.execute<{ v: string | null }>(sql`select current_setting('app.auth', true) as v`))[0]!.v);
      expect(after === null || after === "").toBe(true);
    } finally {
      await owner.db.delete(s.agencies).where(eq(s.agencies.id, other[0]!.id));
    }
  });
});
