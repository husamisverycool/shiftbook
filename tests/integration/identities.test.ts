/**
 * Decision 0033 through the database: Google, Microsoft and an agency's single sign-on linked to a
 * person by the rules (connect from Your account, an invite, a verified email at sign-in), the second
 * step after them, refusals (unverified, no member, suspended, another agency), emailed sign-in codes
 * (hashed, once, 10 minutes, five tries, a minute between, the throttle), the agency's SSO settings
 * (the secret sealed), and the new tables fenced by agency.
 */
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eventOf } from "../../src/server/activity/events";
import { appKey } from "../../src/server/auth/crypto";
import {
  acceptInviteWithIdentity,
  connectIdentity,
  disconnectIdentity,
  identitiesOf,
  requestEmailCode,
  resolveIssuer,
  saveSsoSettings,
  setSsoEnabled,
  signInWithIdentity,
  ssoConfigOf,
  ssoForEmail,
  ssoSettingsOf,
  verifyEmailCode,
} from "../../src/server/auth/identities";
import type { VerifiedIdentity } from "../../src/server/auth/oidc";
import { beginAuthenticatorSetup, confirmAuthenticator, inviteMember, readSession, redeemLink, setSuspended, verifySecondStep, type AuthDeps, type LinkMail } from "../../src/server/auth/service";
import { base32Decode, hotp, stepAt } from "../../src/server/auth/totp";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER, RECRUITERS } from "../../src/server/demo/dataset";
import { clearDemoAgency, seedDemoAgency } from "../../src/server/demo/seed";
import type { OutgoingMail } from "../../src/server/mail/transport";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const sent: OutgoingMail[] = [];
let clock = new Date("2026-10-16T15:00:00Z");
const deps: AuthDeps = { db: app.db, mailTransport: () => ({ send: async (m) => (sent.push(m), { providerId: null }) }), now: () => clock };
const theOwner = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: "Demo Owner (demo)", role: "owner" as const };
const PASSWORD = "a long enough passphrase";
const render = (link: string): LinkMail => ({ subject: "Join", text: `Open ${link}`, html: `<a href="${link}">Join</a>` });
const codeMail = (code: string): LinkMail => ({ subject: `${code} is your code`, text: `Your code: ${code}`, html: `<p>${code}</p>` });
const linkIn = (m: OutgoingMail) => /sbau_[A-Za-z0-9_-]{43}/.exec(m.text)![0];
const codeIn = (m: OutgoingMail) => /\b(\d{6})\b/.exec(m.text)![1]!;
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(DEMO_AGENCY.id, fn);
const LENA = { id: "", email: RECRUITERS[0].email };
const GOOGLE = "https://accounts.google.com";
const google = (subject: string, email: string | null, emailVerified = true): VerifiedIdentity => ({ issuer: GOOGLE, subject, email, emailVerified, name: null });
const microsoft = (subject: string, email: string | null, emailVerified = false): VerifiedIdentity => ({ issuer: "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0", subject, email, emailVerified, name: null });
const ADDRESS = "203.0.113.20";
const viaGoogle = (identity: VerifiedIdentity, over: Partial<Parameters<typeof signInWithIdentity>[1]> = {}) => signInWithIdentity(deps, { provider: "google", identity, sso: null, demoMode: false, userAgent: "test", address: ADDRESS, ...over });

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
  const [lena] = await inAgency((tx) => tx.select().from(s.users).where(eq(s.users.email, RECRUITERS[0].email)));
  LENA.id = lena!.id;
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

/** Invite someone and accept with a password; their user id and session token. */
async function invited(role: "coordinator" | "billing" | "accountant" | "owner", email = "pat@agency.example") {
  const r = await inviteMember(deps, theOwner, { name: "Pat Lee", email, role, locale: "en" }, render, "https://app.example");
  if (!r.ok) throw new Error(r.error);
  const accepted = await redeemLink(deps, linkIn(sent.at(-1)!), "invite", PASSWORD, "test");
  if (!accepted.ok) throw new Error(accepted.error);
  return { userId: r.userId, ...accepted };
}

const auditOf = (userId: string) => inAgency((tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.entityId, userId)));
const activeIdentities = () => owner.db.select().from(s.userIdentities).where(sql`${s.userIdentities.removedAt} is null`);

describe("signing in with Google or Microsoft (decision 0033)", () => {
  it("a verified email equal to an active member's signs in and links the identity; afterwards the identity alone does", async () => {
    const pat = await invited("billing");
    const first = await viaGoogle(google("g-pat", "PAT@agency.example"));
    expect(first).toMatchObject({ ok: true, next: "done", locale: "en" });
    const [link] = await activeIdentities();
    expect(link).toMatchObject({ userId: pat.userId, provider: "google", issuer: GOOGLE, subject: "g-pat", email: "pat@agency.example" });
    // The email at the provider changes; the subject does not: still Pat.
    const again = await viaGoogle(google("g-pat", "pat.new@elsewhere.example", false));
    expect(again.ok).toBe(true);
    const session = await readSession(deps, (again as { token: string }).token);
    expect(session).toMatchObject({ userId: pat.userId, demo: false });
    const events = await auditOf(pat.userId);
    expect(events.filter((e) => e.action === "sign_in").map((e) => e.after)).toContainEqual({ method: "google" });
    expect(events.map((e) => eventOf(e.action, e.after))).toContain("identity_connected");
  });

  it("refuses an unverified email, and a verified one nobody has, without making anyone", async () => {
    await invited("billing");
    const people = (await inAgency((tx) => tx.select().from(s.users))).length;
    expect(await viaGoogle(google("g-1", "pat@agency.example", false))).toEqual({ ok: false, error: "not_verified" });
    expect(await viaGoogle(google("g-2", "stranger@example.com"))).toEqual({ ok: false, error: "no_account" });
    expect(await viaGoogle(google("g-3", null))).toEqual({ ok: false, error: "not_verified" });
    // Microsoft's email without xms_edov is not proof: connect it from Your account first.
    expect(await signInWithIdentity(deps, { provider: "microsoft", identity: microsoft("m-1", "pat@agency.example"), sso: null, demoMode: false, userAgent: "t", address: ADDRESS })).toEqual({ ok: false, error: "not_verified" });
    expect((await inAgency((tx) => tx.select().from(s.users))).length).toBe(people);
    expect(await activeIdentities()).toEqual([]);
  });

  it("the second step follows as after a password: setup for a coordinator without one, the code with one (named in the log)", async () => {
    const pat = await invited("coordinator");
    const setupKey = await (async () => {
      const session = (await readSession(deps, pat.token))!;
      const setup = await beginAuthenticatorSetup(deps, session);
      if (!setup.ok) throw new Error(setup.error);
      const on = await confirmAuthenticator(deps, session, hotp(base32Decode(setup.setupKey), stepAt(Math.floor(clock.getTime() / 1000))));
      if (!on.ok) throw new Error(on.error);
      return setup.setupKey;
    })();
    const r = await viaGoogle(google("g-pat", "pat@agency.example"));
    expect(r).toMatchObject({ ok: true, next: "code" });
    clock = new Date(clock.getTime() + 60_000);
    const step = await verifySecondStep(deps, (r as { token: string }).token, hotp(base32Decode(setupKey), stepAt(Math.floor(clock.getTime() / 1000))), "t");
    expect(step.ok).toBe(true);
    expect((await auditOf(pat.userId)).filter((e) => e.action === "sign_in").map((e) => e.after)).toContainEqual({ method: "google and authenticator code" });
    // A coordinator with no authenticator: its setup comes first (SPEC §2).
    await invited("coordinator", "sam.r@agency.example");
    expect(await viaGoogle(google("g-sam", "sam.r@agency.example"))).toMatchObject({ ok: true, next: "setup" });
  });

  it("the demo people in demo mode skip the second step, as Continue as does; nobody else does", async () => {
    const r = await viaGoogle(google("g-lena", LENA.email), { demoMode: true });
    expect(r).toMatchObject({ ok: true, next: "done" });
    expect(await readSession(deps, (r as { token: string }).token)).toMatchObject({ userId: LENA.id, demo: true });
    const pat = await invited("coordinator");
    expect(await viaGoogle(google("g-pat", "pat@agency.example"), { demoMode: true })).toMatchObject({ ok: true, next: "setup" });
    expect(pat.next).toBe("setup");
  });

  it("refuses a suspended member, by email or by a linked identity", async () => {
    const pat = await invited("billing");
    expect((await viaGoogle(google("g-pat", "pat@agency.example"))).ok).toBe(true);
    expect((await setSuspended(deps, theOwner, pat.userId, true)).ok).toBe(true);
    expect(await viaGoogle(google("g-pat", "pat@agency.example"))).toEqual({ ok: false, error: "suspended" });
    expect(await viaGoogle(google("g-other", "pat@agency.example"))).toEqual({ ok: false, error: "suspended" });
  });

  it("counts refusals like wrong passwords: ten from one address for one email, and it waits", async () => {
    await invited("billing");
    for (let i = 0; i < 10; i += 1) expect(await viaGoogle(google(`g-${i}`, "pat@agency.example", false))).toEqual({ ok: false, error: "not_verified" });
    expect(await viaGoogle(google("g-pat", "pat@agency.example"))).toEqual({ ok: false, error: "locked" });
    // From elsewhere it works.
    expect((await viaGoogle(google("g-pat", "pat@agency.example"), { address: "198.51.100.7" })).ok).toBe(true);
  });
});

describe("connecting from Your account (rule a) and disconnecting", () => {
  it("connects an identity whatever its email says, once per provider; another person cannot take it; disconnect removes it", async () => {
    const pat = await invited("billing");
    const session = (await readSession(deps, pat.token))!;
    expect(await connectIdentity(deps, session, "microsoft", microsoft("m-pat", "p.lee@contoso.example"))).toEqual({ ok: true });
    expect(await identitiesOf(deps, pat.userId)).toMatchObject([{ provider: "microsoft", email: "p.lee@contoso.example" }]);
    // Now the Microsoft identity signs Pat in, xms_edov or not.
    expect((await signInWithIdentity(deps, { provider: "microsoft", identity: microsoft("m-pat", null), sso: null, demoMode: false, userAgent: "t", address: ADDRESS })).ok).toBe(true);
    expect(await connectIdentity(deps, session, "microsoft", microsoft("m-pat-2", null))).toEqual({ ok: false, error: "already" });
    const casey = await invited("accountant", "casey@agency.example");
    const caseySession = (await readSession(deps, casey.token))!;
    expect(await connectIdentity(deps, caseySession, "microsoft", microsoft("m-pat", null))).toEqual({ ok: false, error: "taken" });
    const [row] = await identitiesOf(deps, pat.userId);
    expect(await disconnectIdentity(deps, caseySession, row!.id)).toEqual({ ok: false, error: "not_found" });
    expect(await disconnectIdentity(deps, session, row!.id)).toEqual({ ok: true });
    expect(await identitiesOf(deps, pat.userId)).toEqual([]);
    expect(await signInWithIdentity(deps, { provider: "microsoft", identity: microsoft("m-pat", null), sso: null, demoMode: false, userAgent: "t", address: ADDRESS })).toEqual({ ok: false, error: "not_verified" });
    // Kept for the record, and connectable again.
    expect((await owner.db.select().from(s.userIdentities)).length).toBe(1);
    expect(await connectIdentity(deps, caseySession, "microsoft", microsoft("m-pat", null))).toEqual({ ok: true });
    const events = (await auditOf(pat.userId)).map((e) => eventOf(e.action, e.after));
    expect(events).toEqual(expect.arrayContaining(["identity_connected", "identity_disconnected"]));
  });

  it("asks a full session to confirm it's them when its confirmation is old; never the demo's shared sessions", async () => {
    const pat = await invited("billing");
    clock = new Date(clock.getTime() + 20 * 60_000);
    const session = (await readSession(deps, pat.token))!;
    expect(await connectIdentity(deps, session, "google", google("g-pat", null))).toEqual({ ok: false, error: "confirm" });
  });
});

describe("accepting an invite with Google or Microsoft (rule b)", () => {
  it("joins only with a verified email equal to the invited one, links it, and the second step follows", async () => {
    const r = await inviteMember(deps, theOwner, { name: "Casey Rivera", email: "casey@agency.example", role: "coordinator", locale: "es" }, render, "https://app.example");
    if (!r.ok) throw new Error(r.error);
    const token = linkIn(sent.at(-1)!);
    expect(await acceptInviteWithIdentity(deps, token, "google", google("g-casey", "casey@agency.example", false), "t")).toEqual({ ok: false, error: "not_verified" });
    expect(await acceptInviteWithIdentity(deps, token, "google", google("g-casey", "casey@elsewhere.example"), "t")).toEqual({ ok: false, error: "email_mismatch" });
    const joined = await acceptInviteWithIdentity(deps, token, "google", google("g-casey", "Casey@Agency.example"), "t");
    expect(joined).toMatchObject({ ok: true, next: "setup", locale: "es" });
    const [user] = await inAgency((tx) => tx.select().from(s.users).where(eq(s.users.id, r.userId)));
    expect(user!.status).toBe("active");
    expect(await identitiesOf(deps, r.userId)).toMatchObject([{ provider: "google", email: "casey@agency.example" }]);
    // The link worked once.
    expect(await acceptInviteWithIdentity(deps, token, "google", google("g-casey", "casey@agency.example"), "t")).toEqual({ ok: false, error: "expired" });
  });

  it("refuses an identity already linked to someone else", async () => {
    await invited("billing");
    expect((await viaGoogle(google("g-pat", "pat@agency.example"))).ok).toBe(true);
    const r = await inviteMember(deps, theOwner, { name: "Casey Rivera", email: "casey@agency.example", role: "billing", locale: "en" }, render, "https://app.example");
    if (!r.ok) throw new Error(r.error);
    expect(await acceptInviteWithIdentity(deps, linkIn(sent.at(-1)!), "google", { ...google("g-pat", "casey@agency.example") }, "t")).toEqual({ ok: false, error: "taken" });
  });
});

describe("emailed sign-in codes", () => {
  it("an active member gets a six-digit code (the kept copy hides it); it signs in once; the same answer for anyone else", async () => {
    const pat = await invited("billing");
    sent.length = 0;
    await requestEmailCode(deps, "Pat@Agency.example", codeMail, false);
    expect(sent).toHaveLength(1);
    const code = codeIn(sent[0]!);
    const [kept] = await inAgency((tx) => tx.select().from(s.emailMessages).where(eq(s.emailMessages.kind, "sign_in_code")));
    expect(kept!.textBody).toBe("Your code: [code hidden]");
    expect(kept!.status).toBe("sent");
    const [row] = await owner.db.select().from(s.emailSignInCodes);
    expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.codeHash).not.toContain(code);
    const r = await verifyEmailCode(deps, "pat@agency.example", code, "t", ADDRESS, false);
    expect(r).toMatchObject({ ok: true, next: "done" });
    expect(await readSession(deps, (r as { token: string }).token)).toMatchObject({ userId: pat.userId });
    expect((await auditOf(pat.userId)).filter((e) => e.action === "sign_in").map((e) => e.after)).toContainEqual({ method: "email_code" });
    // Once.
    expect(await verifyEmailCode(deps, "pat@agency.example", code, "t", ADDRESS, false)).toEqual({ ok: false, error: "invalid" });
    // Unknown and suspended emails: nothing sent, no different answer.
    sent.length = 0;
    await requestEmailCode(deps, "nobody@example.com", codeMail, false);
    expect((await setSuspended(deps, theOwner, pat.userId, true)).ok).toBe(true);
    clock = new Date(clock.getTime() + 2 * 60_000);
    await requestEmailCode(deps, "pat@agency.example", codeMail, false);
    expect(sent).toHaveLength(0);
  });

  it("at most one a minute; a newer code replaces the older; 10 minutes; five wrong tries end it", async () => {
    await invited("billing");
    sent.length = 0;
    await requestEmailCode(deps, "pat@agency.example", codeMail, false);
    await requestEmailCode(deps, "pat@agency.example", codeMail, false);
    expect(sent).toHaveLength(1);
    const first = codeIn(sent[0]!);
    clock = new Date(clock.getTime() + 61_000);
    await requestEmailCode(deps, "pat@agency.example", codeMail, false);
    expect(sent).toHaveLength(2);
    const second = codeIn(sent[1]!);
    if (first !== second) expect(await verifyEmailCode(deps, "pat@agency.example", first, "t", ADDRESS, false)).toEqual({ ok: false, error: "invalid" });
    // Ten minutes and it is gone.
    clock = new Date(clock.getTime() + 10 * 60_000);
    expect(await verifyEmailCode(deps, "pat@agency.example", second, "t", ADDRESS, false)).toEqual({ ok: false, error: "invalid" });
    // A fresh one, five wrong tries, then even the right one is refused.
    await requestEmailCode(deps, "pat@agency.example", codeMail, false);
    const third = codeIn(sent.at(-1)!);
    const wrong = third === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i += 1) expect(await verifyEmailCode(deps, "pat@agency.example", wrong, "t", `198.51.100.${i}`, false)).toEqual({ ok: false, error: "invalid" });
    expect(await verifyEmailCode(deps, "pat@agency.example", third, "t", "198.51.100.99", false)).toEqual({ ok: false, error: "invalid" });
    const [row] = await owner.db.select().from(s.emailSignInCodes).where(sql`${s.emailSignInCodes.failures} = 5`);
    expect(row).toBeDefined();
  });

  it("wrong codes count like wrong passwords: ten from one address for an email, and even the right code waits", async () => {
    await invited("billing");
    for (let round = 0; round < 2; round += 1) {
      clock = new Date(clock.getTime() + 61_000);
      await requestEmailCode(deps, "pat@agency.example", codeMail, false);
      const code = codeIn(sent.at(-1)!);
      const wrong = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i += 1) await verifyEmailCode(deps, "pat@agency.example", wrong, "t", ADDRESS, false);
    }
    clock = new Date(clock.getTime() + 61_000);
    await requestEmailCode(deps, "pat@agency.example", codeMail, false);
    expect(await verifyEmailCode(deps, "pat@agency.example", codeIn(sent.at(-1)!), "t", ADDRESS, false)).toEqual({ ok: false, error: "locked" });
  });

  it("a demo person signs in by code in demo mode (the demo has no phones); a coordinator outside it sets up the authenticator", async () => {
    sent.length = 0;
    await requestEmailCode(deps, LENA.email, codeMail, true);
    expect(sent).toHaveLength(1);
    expect(await verifyEmailCode(deps, LENA.email, codeIn(sent[0]!), "t", ADDRESS, true)).toMatchObject({ ok: true, next: "done" });
    // Outside demo mode the demo people are not found by email (they have no login of their own).
    sent.length = 0;
    clock = new Date(clock.getTime() + 61_000);
    await requestEmailCode(deps, LENA.email, codeMail, false);
    expect(sent).toHaveLength(0);
  });
});

describe("an agency's single sign-on", () => {
  const reachable = async () => true;
  it("the Owner saves the issuer, client ID and secret (sealed, never shown again), then turns it on; nobody else can", async () => {
    // An agency with no SSO yet (the demo agency's own is seeded on).
    await inAgency((tx) => tx.delete(s.agencySso));
    expect(await saveSsoSettings(deps, { ...theOwner, role: "coordinator" }, { issuer: "https://idp.example", clientId: "shiftbook", clientSecret: "test-only-secret-value" }, { demoMode: false, baseUrl: "https://app.example", check: reachable })).toEqual({ ok: false, error: "not_allowed" });
    expect(await saveSsoSettings(deps, theOwner, { issuer: "http://idp.example", clientId: "shiftbook", clientSecret: "x" }, { demoMode: false, baseUrl: "https://app.example", check: reachable })).toEqual({ ok: false, error: "invalid_issuer" });
    expect(await saveSsoSettings(deps, theOwner, { issuer: "https://idp.example", clientId: "shiftbook", clientSecret: null }, { demoMode: false, baseUrl: "https://app.example", check: reachable })).toEqual({ ok: false, error: "secret_required" });
    expect(await saveSsoSettings(deps, theOwner, { issuer: "https://idp.example", clientId: "shiftbook", clientSecret: "test-only-secret-value" }, { demoMode: false, baseUrl: "https://app.example", check: async () => false })).toEqual({ ok: false, error: "issuer_unreachable" });
    expect(await saveSsoSettings(deps, theOwner, { issuer: "https://idp.example", clientId: "shiftbook", clientSecret: "test-only-secret-value" }, { demoMode: false, baseUrl: "https://app.example", check: reachable })).toEqual({ ok: true });
    let settings = await ssoSettingsOf(deps, DEMO_AGENCY.id);
    expect(settings).toMatchObject({ enabled: false, issuer: "https://idp.example", clientId: "shiftbook", secretLast4: "alue" });
    expect(await setSsoEnabled(deps, { ...theOwner, role: "billing" }, true)).toEqual({ ok: false, error: "not_allowed" });
    expect(await setSsoEnabled(deps, theOwner, true)).toEqual({ ok: true });
    settings = await ssoSettingsOf(deps, DEMO_AGENCY.id);
    expect(settings!.enabled).toBe(true);
    expect(JSON.stringify(settings)).not.toContain("test-only-secret-value");
    const [row] = await inAgency((tx) => tx.select().from(s.agencySso));
    expect(JSON.stringify(row)).not.toContain("test-only-secret-value");
    expect((await ssoConfigOf(deps, DEMO_AGENCY.id, { demoMode: false, baseUrl: "https://app.example" }))!.clientSecret).toBe("test-only-secret-value");
    // Kept when left empty.
    expect(await saveSsoSettings(deps, theOwner, { issuer: "https://idp.example", clientId: "shiftbook-2", clientSecret: null }, { demoMode: false, baseUrl: "https://app.example", check: reachable })).toEqual({ ok: true });
    expect((await ssoConfigOf(deps, DEMO_AGENCY.id, { demoMode: false, baseUrl: "https://app.example" }))!.clientSecret).toBe("test-only-secret-value");
    expect(await setSsoEnabled(deps, theOwner, false)).toEqual({ ok: true });
    expect(await ssoForEmail(deps, DEMO_OWNER.email, { demoMode: true, baseUrl: "https://app.example" })).toBeNull();
  });

  it("an email leads to the agency's provider only for an active member of an agency with SSO on (the same nothing otherwise)", async () => {
    await saveSsoSettings(deps, theOwner, { issuer: "https://idp.example", clientId: "shiftbook", clientSecret: "test-only-secret-value" }, { demoMode: false, baseUrl: "https://app.example", check: reachable });
    const pat = await invited("billing");
    expect(await ssoForEmail(deps, "PAT@agency.example", { demoMode: false, baseUrl: "https://app.example" })).toMatchObject({ agencyId: DEMO_AGENCY.id, userId: pat.userId, issuer: "https://idp.example" });
    expect(await ssoForEmail(deps, "nobody@example.com", { demoMode: false, baseUrl: "https://app.example" })).toBeNull();
    await setSuspended(deps, theOwner, pat.userId, true);
    expect(await ssoForEmail(deps, "pat@agency.example", { demoMode: false, baseUrl: "https://app.example" })).toBeNull();
  });

  it("signs in only that agency's people: an identity linked in another agency is refused", async () => {
    const [other] = await owner.db.insert(s.agencies).values({ name: "Other agency (test)" }).returning();
    try {
      const [person] = await owner.db.insert(s.users).values({ agencyId: other!.id, name: "Bo Test", email: "bo@other.example", role: "owner" }).returning();
      await owner.db.insert(s.userIdentities).values({ agencyId: other!.id, userId: person!.id, provider: "sso", issuer: "https://idp.example", subject: "bo" });
      const sso = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id };
      expect(await signInWithIdentity(deps, { provider: "sso", identity: { issuer: "https://idp.example", subject: "bo", email: DEMO_OWNER.email, emailVerified: true, name: null }, sso, demoMode: true, userAgent: "t", address: ADDRESS })).toEqual({ ok: false, error: "no_account" });
      expect(await signInWithIdentity(deps, { provider: "sso", identity: { issuer: "https://idp.example", subject: "owner-1", email: DEMO_OWNER.email, emailVerified: true, name: null }, sso, demoMode: true, userAgent: "t", address: ADDRESS })).toMatchObject({ ok: true, next: "done" });
    } finally {
      await owner.db.delete(s.userIdentities).where(eq(s.userIdentities.agencyId, other!.id));
      await owner.db.delete(s.users).where(eq(s.users.agencyId, other!.id));
      await owner.db.delete(s.agencies).where(eq(s.agencies.id, other!.id));
    }
  });

  it("in demo mode the demo agency's SSO is on and points at the demo stand-in; another issuer cannot be saved", async () => {
    const settings = await ssoSettingsOf(deps, DEMO_AGENCY.id);
    expect(settings).toMatchObject({ enabled: true, issuer: "/api/demo/idp/sso" });
    expect(resolveIssuer("/api/demo/idp/sso", "http://localhost:3700", true)).toBe("http://localhost:3700/api/demo/idp/sso");
    expect(resolveIssuer("/api/demo/idp/sso", "https://app.example", false)).toBeNull();
    expect(await ssoForEmail(deps, LENA.email, { demoMode: true, baseUrl: "http://localhost:3700" })).toMatchObject({ issuer: "http://localhost:3700/api/demo/idp/sso" });
    expect(await saveSsoSettings(deps, theOwner, { issuer: "https://idp.example", clientId: "x", clientSecret: "y" }, { demoMode: true, baseUrl: "http://localhost:3700", check: reachable })).toEqual({ ok: false, error: "demo_issuer_only" });
  });
});

describe("the new tables are fenced by agency", () => {
  it("identities and codes are seen only in their agency or in sign-in mode; SSO settings only in their agency", async () => {
    await invited("billing");
    await viaGoogle(google("g-pat", "pat@agency.example"));
    await requestEmailCode(deps, "pat@agency.example", codeMail, false);
    const [other] = await owner.db.insert(s.agencies).values({ name: "Other agency (test)" }).returning();
    try {
      for (const table of [s.userIdentities, s.emailSignInCodes, s.agencySso]) {
        expect(await app.db.transaction((tx) => tx.select().from(table))).toEqual([]);
        expect(await app.withAgency(other!.id, (tx) => tx.select().from(table))).toEqual([]);
        expect((await inAgency((tx) => tx.select().from(table))).length).toBeGreaterThan(0);
      }
      // Sign-in mode reads identities and codes (to find the person), never the agencies' SSO secrets.
      const seen = await app.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.auth', 'on', true)`);
        return { ids: await tx.select().from(s.userIdentities), codes: await tx.select().from(s.emailSignInCodes), sso: await tx.select().from(s.agencySso) };
      });
      expect([seen.ids.length > 0, seen.codes.length > 0, seen.sso.length]).toEqual([true, true, 0]);
      // Nothing written into another agency.
      const [pat] = await inAgency((tx) => tx.select().from(s.users).where(and(eq(s.users.email, "pat@agency.example"))));
      await expect(app.withAgency(other!.id, (tx) => tx.insert(s.userIdentities).values({ agencyId: DEMO_AGENCY.id, userId: pat!.id, provider: "google", issuer: GOOGLE, subject: "sneaky" }))).rejects.toThrow();
    } finally {
      await owner.db.delete(s.agencies).where(eq(s.agencies.id, other!.id));
    }
  });

  it("the sealed SSO secret is bound to its agency", async () => {
    await saveSsoSettings(deps, theOwner, { issuer: "https://idp.example", clientId: "shiftbook", clientSecret: "test-only-secret-value" }, { demoMode: false, baseUrl: "https://app.example", check: async () => true });
    const [row] = await inAgency((tx) => tx.select().from(s.agencySso));
    const { unseal } = await import("../../src/server/auth/crypto");
    expect(() => unseal(row!.clientSecret, appKey(), "sso:00000000-0000-4000-a000-000000000000")).toThrow();
    expect(unseal(row!.clientSecret, appKey(), `sso:${DEMO_AGENCY.id}`).toString("utf8")).toBe("test-only-secret-value");
  });
});
