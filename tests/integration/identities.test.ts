/**
 * Decision 0033 through the database: Google, Microsoft and an agency's single sign-on linked to a
 * person by the rules (connect from Your account, an invite, a verified email at sign-in — with a code
 * from the mailbox first unless the provider hosts it), every link announced by email, the second
 * step after them, refusals (unverified, no member, suspended, another identity, another agency),
 * emailed codes (hashed, once, 10 minutes, five tries, counted as authenticator codes, capped per
 * person and address), "confirm it's you" by email for people with no password and no authenticator,
 * the agency's SSO settings (the secret sealed, private issuers refused, lookups capped), and the new
 * tables fenced by agency.
 */
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eventOf } from "../../src/server/activity/events";
import { appKey } from "../../src/server/auth/crypto";
import { DEMO_SSO_ISSUER } from "../../src/server/auth/demo-idp-config";
import {
  acceptInviteWithIdentity,
  CODES_PER_HOUR,
  confirmByEmailCode,
  connectIdentity,
  disconnectIdentity,
  finishLinkProof,
  identitiesOf,
  requestEmailCode,
  resendLinkProof,
  resolveIssuer,
  saveSsoSettings,
  sendConfirmCode,
  setSsoEnabled,
  signInWithIdentity,
  SSO_LOOKUPS_PER_ADDRESS,
  ssoConfigOf,
  ssoForEmail,
  ssoSettingsOf,
  verifyEmailCode,
  type CodeMailRender,
  type IdentityMail,
  type PendingLink,
} from "../../src/server/auth/identities";
import type { VerifiedIdentity } from "../../src/server/auth/oidc";
import { checkIssuer } from "../../src/server/auth/oidc-flow";
import {
  beginAuthenticatorSetup,
  changePassword,
  confirmAccess,
  confirmAuthenticator,
  confirmMethodOf,
  inviteMember,
  mustConfirm,
  readSession,
  redeemLink,
  setSuspended,
  verifySecondStep,
  type AuthDeps,
  type LinkMail,
} from "../../src/server/auth/service";
import { base32Decode, hotp, stepAt } from "../../src/server/auth/totp";
import { passkeyRegistrationOptions, relyingParty } from "../../src/server/auth/passkeys";
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
const codeMail: CodeMailRender = (code, _user, context) => ({ subject: `Your code (${context.purpose})`, text: `Your code: ${code} (${context.purpose}${context.provider ? ` ${context.provider}` : ""})`, html: `<p>${code}</p>` });
const mail: IdentityMail = { code: codeMail, linked: (i) => ({ subject: `${i.provider} connected`, text: `${i.provider} ${i.providerEmail ?? "-"} connected for ${i.name}; review ${i.accountUrl}`, html: "<p>connected</p>" }), baseUrl: "https://app.example" };
const linkIn = (m: OutgoingMail) => /sbau_[A-Za-z0-9_-]{43}/.exec(m.text)![0];
const codeIn = (m: OutgoingMail) => /\b(\d{6})\b/.exec(m.text)![1]!;
const lastCode = () => codeIn([...sent].reverse().find((m) => /Your code: \d{6}/.test(m.text))!);
const notices = (email: string) => sent.filter((m) => m.to.email === email && / connected$/.test(m.subject));
const wrongFor = (code: string) => (code === "000000" ? "111111" : "000000");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(DEMO_AGENCY.id, fn);
const LENA = { id: "", email: RECRUITERS[0].email };
const GOOGLE = "https://accounts.google.com";
/** Google, by default hosting the mailbox (a Workspace domain) whenever it vouches for the email. */
const google = (subject: string, email: string | null, emailVerified = true, mailboxProven = emailVerified): VerifiedIdentity => ({ issuer: GOOGLE, subject, email, emailVerified, mailboxProven, name: null });
const microsoft = (subject: string, email: string | null, emailVerified = false): VerifiedIdentity => ({ issuer: "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0", subject, email, emailVerified, mailboxProven: emailVerified, name: null });
const ADDRESS = "203.0.113.20";
const viaGoogle = (identity: VerifiedIdentity, over: Partial<Parameters<typeof signInWithIdentity>[1]> = {}) => signInWithIdentity(deps, { provider: "google", identity, sso: null, demoMode: false, userAgent: "test", address: ADDRESS, ...over }, mail);
const step = (ms: number) => (clock = new Date(clock.getTime() + ms));

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

/** Invite someone who joins with Google (no password, no authenticator); their user id and session token. */
async function joinedWithGoogle(email = "casey@agency.example") {
  const r = await inviteMember(deps, theOwner, { name: "Casey Rivera", email, role: "billing", locale: "en" }, render, "https://app.example");
  if (!r.ok) throw new Error(r.error);
  const joined = await acceptInviteWithIdentity(deps, linkIn(sent.at(-1)!), "google", google("g-casey", email), "t", mail);
  if (!joined.ok) throw new Error(joined.error);
  return { userId: r.userId, token: joined.token };
}

const auditOf = (userId: string) => inAgency((tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.entityId, userId)));
const activeIdentities = () => owner.db.select().from(s.userIdentities).where(sql`${s.userIdentities.removedAt} is null`);

describe("signing in with Google or Microsoft (decision 0033)", () => {
  it("a verified email the provider hosts signs in and links the identity, with a notice by email; afterwards the identity alone does", async () => {
    const pat = await invited("billing");
    sent.length = 0;
    const first = await viaGoogle(google("g-pat", "PAT@agency.example"));
    expect(first).toMatchObject({ ok: true, next: "done", locale: "en" });
    const [link] = await activeIdentities();
    expect(link).toMatchObject({ userId: pat.userId, provider: "google", issuer: GOOGLE, subject: "g-pat", email: "pat@agency.example" });
    // Review H2c: the person is told, with the way to their account.
    expect(notices("pat@agency.example").map((m) => m.text)).toEqual(["google pat@agency.example connected for Pat Lee; review https://app.example/en/settings/account"]);
    const again = await viaGoogle(google("g-pat", "pat.new@elsewhere.example", false));
    expect(again.ok).toBe(true);
    expect(await readSession(deps, (again as { token: string }).token)).toMatchObject({ userId: pat.userId, demo: false });
    expect(notices("pat@agency.example")).toHaveLength(1);
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
    expect(await signInWithIdentity(deps, { provider: "microsoft", identity: microsoft("m-1", "pat@agency.example"), sso: null, demoMode: false, userAgent: "t", address: ADDRESS }, mail)).toEqual({ ok: false, error: "not_verified" });
    expect((await inAgency((tx) => tx.select().from(s.users))).length).toBe(people);
    expect(await activeIdentities()).toEqual([]);
  });

  it("refuses sign-in when the person already has a different identity from that provider (review H2b)", async () => {
    await invited("billing");
    expect((await viaGoogle(google("g-pat", "pat@agency.example"))).ok).toBe(true);
    expect(await viaGoogle(google("g-pat-second", "pat@agency.example"))).toEqual({ ok: false, error: "other_identity" });
    expect((await activeIdentities()).map((i) => i.subject)).toEqual(["g-pat"]);
  });

  it("a first link the provider does not host waits for a code sent to the member's mailbox (review H2a)", async () => {
    const pat = await invited("billing");
    sent.length = 0;
    // A Google account made with an address Google does not host: Google verified it once, not now.
    const r = await viaGoogle(google("g-pat", "pat@agency.example", true, false));
    expect(r).toMatchObject({ ok: false, error: "proof", pending: { provider: "google", subject: "g-pat", userId: pat.userId, hint: "p***@agency.example" } });
    const link = (r as { pending: PendingLink }).pending;
    expect(await activeIdentities()).toEqual([]);
    expect(sent.map((m) => [m.to.email, m.text.replace(/\d{6}/, "######")])).toEqual([["pat@agency.example", "Your code: ###### (link google)"]]);
    const code = lastCode();
    // A link code is not a sign-in code, and the other way round.
    expect(await verifyEmailCode(deps, "pat@agency.example", code, "t", "198.51.100.1", false)).toEqual({ ok: false, error: "invalid" });
    expect(await finishLinkProof(deps, link, wrongFor(code), { userAgent: "t", address: ADDRESS, demoMode: false }, mail)).toEqual({ ok: false, error: "invalid" });
    const done = await finishLinkProof(deps, link, code, { userAgent: "t", address: ADDRESS, demoMode: false }, mail);
    expect(done).toMatchObject({ ok: true, next: "done" });
    expect((await activeIdentities()).map((i) => [i.userId, i.subject])).toEqual([[pat.userId, "g-pat"]]);
    expect(notices("pat@agency.example")).toHaveLength(1);
    // Used once.
    expect(await finishLinkProof(deps, link, code, { userAgent: "t", address: ADDRESS, demoMode: false }, mail)).toEqual({ ok: false, error: "invalid" });
  });

  it("a waiting link can have its code sent again, within the caps; only the newest code works", async () => {
    await invited("billing");
    const r = await viaGoogle(google("g-pat", "pat@agency.example", true, false));
    const first = (r as { pending: PendingLink }).pending;
    const firstCode = lastCode();
    expect(await resendLinkProof(deps, first, mail)).toBeNull(); // within the minute
    step(61_000);
    const second = (await resendLinkProof(deps, first, mail))!;
    expect(second.codeId).not.toBe(first.codeId);
    expect(await finishLinkProof(deps, first, firstCode, { userAgent: "t", address: ADDRESS, demoMode: false }, mail)).toEqual({ ok: false, error: "invalid" });
    expect((await finishLinkProof(deps, second, lastCode(), { userAgent: "t", address: ADDRESS, demoMode: false }, mail)).ok).toBe(true);
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
    step(60_000);
    const second = await verifySecondStep(deps, (r as { token: string }).token, hotp(base32Decode(setupKey), stepAt(Math.floor(clock.getTime() / 1000))), "t");
    expect(second.ok).toBe(true);
    expect((await auditOf(pat.userId)).filter((e) => e.action === "sign_in").map((e) => e.after)).toContainEqual({ method: "google and authenticator code" });
    await invited("coordinator", "sam.r@agency.example");
    expect(await viaGoogle(google("g-sam", "sam.r@agency.example"))).toMatchObject({ ok: true, next: "setup" });
  });

  it("the demo people in demo mode skip the second step, as Continue as does; nobody else does", async () => {
    const r = await viaGoogle(google("g-lena", LENA.email), { demoMode: true });
    expect(r).toMatchObject({ ok: true, next: "done" });
    expect(await readSession(deps, (r as { token: string }).token)).toMatchObject({ userId: LENA.id, demo: true });
    await invited("coordinator");
    expect(await viaGoogle(google("g-pat", "pat@agency.example"), { demoMode: true })).toMatchObject({ ok: true, next: "setup" });
  });

  it("refuses a suspended member, by email or by a linked identity", async () => {
    const pat = await invited("billing");
    expect((await viaGoogle(google("g-pat", "pat@agency.example"))).ok).toBe(true);
    expect((await setSuspended(deps, theOwner, pat.userId, true)).ok).toBe(true);
    expect(await viaGoogle(google("g-pat", "pat@agency.example"))).toEqual({ ok: false, error: "suspended" });
    expect(await viaGoogle(google("g-other", "pat@agency.example"))).toEqual({ ok: false, error: "suspended" });
  });

  it("counts refusals like wrong passwords, keyed by the identity (issuer and subject), not by whatever email it carries (review L2)", async () => {
    await invited("billing");
    // Ten refusals of one identity from one address: it waits, whatever email it then shows.
    for (let i = 0; i < 10; i += 1) expect(await viaGoogle(google("g-x", `x${i}@elsewhere.example`, false))).toEqual({ ok: false, error: "not_verified" });
    expect(await viaGoogle(google("g-x", "pat@agency.example"))).toEqual({ ok: false, error: "locked" });
    expect((await viaGoogle(google("g-x", "pat@agency.example"), { address: "198.51.100.7" })).ok).toBe(true);
    // Refusals of other identities carrying the same email do not lock this one out.
    for (let i = 0; i < 10; i += 1) await viaGoogle(google(`g-y${i}`, "nobody@example.com"));
    expect(await viaGoogle(google("g-z", "stranger@example.com"))).toEqual({ ok: false, error: "no_account" });
  });
});

describe("connecting from Your account (rule a) and disconnecting", () => {
  it("connects an identity whatever its email says, once per provider, with a notice; another person cannot take it; disconnect removes it", async () => {
    const pat = await invited("billing");
    const session = (await readSession(deps, pat.token))!;
    sent.length = 0;
    expect(await connectIdentity(deps, session, "microsoft", microsoft("m-pat", "p.lee@contoso.example"), { mail })).toEqual({ ok: true });
    expect(notices("pat@agency.example").map((m) => m.subject)).toEqual(["microsoft connected"]);
    expect(await identitiesOf(deps, pat.userId)).toMatchObject([{ provider: "microsoft", email: "p.lee@contoso.example" }]);
    expect((await signInWithIdentity(deps, { provider: "microsoft", identity: microsoft("m-pat", null), sso: null, demoMode: false, userAgent: "t", address: ADDRESS }, mail)).ok).toBe(true);
    expect(await connectIdentity(deps, session, "microsoft", microsoft("m-pat-2", null), { mail })).toEqual({ ok: false, error: "already" });
    const casey = await invited("accountant", "casey@agency.example");
    const caseySession = (await readSession(deps, casey.token))!;
    expect(await connectIdentity(deps, caseySession, "microsoft", microsoft("m-pat", null), { mail })).toEqual({ ok: false, error: "taken" });
    const [row] = await identitiesOf(deps, pat.userId);
    expect(await disconnectIdentity(deps, caseySession, row!.id)).toEqual({ ok: false, error: "not_found" });
    expect(await disconnectIdentity(deps, session, row!.id)).toEqual({ ok: true });
    expect(await identitiesOf(deps, pat.userId)).toEqual([]);
    expect(await signInWithIdentity(deps, { provider: "microsoft", identity: microsoft("m-pat", null), sso: null, demoMode: false, userAgent: "t", address: ADDRESS }, mail)).toEqual({ ok: false, error: "not_verified" });
    expect((await owner.db.select().from(s.userIdentities)).length).toBe(1);
    expect(await connectIdentity(deps, caseySession, "microsoft", microsoft("m-pat", null), { mail })).toEqual({ ok: true });
    const events = (await auditOf(pat.userId)).map((e) => eventOf(e.action, e.after));
    expect(events).toEqual(expect.arrayContaining(["identity_connected", "identity_disconnected"]));
  });

  it("asks a full session to confirm it's them when its confirmation is old", async () => {
    const pat = await invited("billing");
    step(20 * 60_000);
    const session = (await readSession(deps, pat.token))!;
    expect(await connectIdentity(deps, session, "google", google("g-pat", null), { mail })).toEqual({ ok: false, error: "confirm" });
  });
});

describe("\"confirm it's you\" for a person with no password and no authenticator (review L3)", () => {
  it("adding a passkey takes a code emailed to them for that passkey (decisions 0032 and 0033)", async () => {
    const casey = await joinedWithGoogle();
    const session = (await readSession(deps, casey.token))!;
    const rp = relyingParty("https://app.example");
    // Straight after signing in, yet not confirmed for this: a stolen session cannot leave a passkey.
    expect(await passkeyRegistrationOptions(deps, session, rp, null)).toEqual({ ok: false, error: "confirm" });
    sent.length = 0;
    expect(await sendConfirmCode(deps, session, codeMail)).toEqual({ ok: true });
    const code = lastCode();
    expect(await passkeyRegistrationOptions(deps, session, rp, wrongFor(code))).toEqual({ ok: false, error: "invalid" });
    expect((await passkeyRegistrationOptions(deps, session, rp, code)).ok).toBe(true);
  });

  it("is asked of them too, and answered only by a code sent to their email", async () => {
    const casey = await joinedWithGoogle();
    step(20 * 60_000);
    const session = (await readSession(deps, casey.token))!;
    expect(await mustConfirm(deps, session)).toBe(true);
    expect(await confirmMethodOf(deps, session)).toBe("email");
    // Nothing else confirms it (before, anything did).
    expect(await confirmAccess(deps, session, "anything at all")).toEqual({ ok: false, error: "invalid" });
    expect(await connectIdentity(deps, session, "microsoft", microsoft("m-casey", null), { mail })).toEqual({ ok: false, error: "confirm" });
    expect(await disconnectIdentity(deps, session, (await identitiesOf(deps, casey.userId))[0]!.id)).toEqual({ ok: false, error: "confirm" });
    expect(await changePassword(deps, session, "", PASSWORD)).toEqual({ ok: false, error: "confirm" });
    sent.length = 0;
    expect(await sendConfirmCode(deps, session, codeMail)).toEqual({ ok: true });
    expect(sent[0]!.text).toMatch(/\(confirm\)$/);
    const code = lastCode();
    expect(await confirmByEmailCode(deps, session, wrongFor(code))).toEqual({ ok: false, error: "invalid" });
    expect(await confirmByEmailCode(deps, session, code)).toEqual({ ok: true });
    const confirmed = (await readSession(deps, casey.token))!;
    expect(await mustConfirm(deps, confirmed)).toBe(false);
    expect(await connectIdentity(deps, confirmed, "microsoft", microsoft("m-casey", null), { mail })).toEqual({ ok: true });
    expect(await changePassword(deps, confirmed, "", PASSWORD)).toEqual({ ok: true });
  });
});

describe("accepting an invite with Google or Microsoft (rule b)", () => {
  it("joins only with a verified email equal to the invited one, links it with a notice, and the second step follows", async () => {
    const r = await inviteMember(deps, theOwner, { name: "Casey Rivera", email: "casey@agency.example", role: "coordinator", locale: "es" }, render, "https://app.example");
    if (!r.ok) throw new Error(r.error);
    const token = linkIn(sent.at(-1)!);
    expect(await acceptInviteWithIdentity(deps, token, "google", google("g-casey", "casey@agency.example", false), "t", mail)).toEqual({ ok: false, error: "not_verified" });
    expect(await acceptInviteWithIdentity(deps, token, "google", google("g-casey", "casey@elsewhere.example"), "t", mail)).toEqual({ ok: false, error: "email_mismatch" });
    // The invite came to that mailbox: no code is needed even when Google does not host it.
    const joined = await acceptInviteWithIdentity(deps, token, "google", google("g-casey", "Casey@Agency.example", true, false), "t", mail);
    expect(joined).toMatchObject({ ok: true, next: "setup", locale: "es" });
    const [user] = await inAgency((tx) => tx.select().from(s.users).where(eq(s.users.id, r.userId)));
    expect(user!.status).toBe("active");
    expect(await identitiesOf(deps, r.userId)).toMatchObject([{ provider: "google", email: "casey@agency.example" }]);
    expect(notices("casey@agency.example").map((m) => m.text)).toEqual(["google casey@agency.example connected for Casey Rivera; review https://app.example/es/settings/account"]);
    expect(await acceptInviteWithIdentity(deps, token, "google", google("g-casey", "casey@agency.example"), "t", mail)).toEqual({ ok: false, error: "expired" });
  });

  it("refuses an identity already linked to someone else", async () => {
    await invited("billing");
    expect((await viaGoogle(google("g-pat", "pat@agency.example"))).ok).toBe(true);
    const r = await inviteMember(deps, theOwner, { name: "Casey Rivera", email: "casey@agency.example", role: "billing", locale: "en" }, render, "https://app.example");
    if (!r.ok) throw new Error(r.error);
    expect(await acceptInviteWithIdentity(deps, linkIn(sent.at(-1)!), "google", google("g-pat", "casey@agency.example"), "t", mail)).toEqual({ ok: false, error: "taken" });
  });
});

describe("emailed sign-in codes", () => {
  it("an active member gets a six-digit code (the kept copy hides it); it signs in once; the same answer for anyone else", async () => {
    const pat = await invited("billing");
    sent.length = 0;
    await requestEmailCode(deps, "Pat@Agency.example", codeMail, false, { address: ADDRESS });
    expect(sent).toHaveLength(1);
    const code = codeIn(sent[0]!);
    const [kept] = await inAgency((tx) => tx.select().from(s.emailMessages).where(eq(s.emailMessages.kind, "sign_in_code")));
    expect([kept!.textBody, kept!.status]).toEqual(["Your code: [code hidden] (sign_in)", "sent"]);
    const [row] = await owner.db.select().from(s.emailSignInCodes);
    expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.purpose).toBe("sign_in");
    const r = await verifyEmailCode(deps, "pat@agency.example", code, "t", ADDRESS, false);
    expect(r).toMatchObject({ ok: true, next: "done" });
    expect(await readSession(deps, (r as { token: string }).token)).toMatchObject({ userId: pat.userId });
    expect((await auditOf(pat.userId)).filter((e) => e.action === "sign_in").map((e) => e.after)).toContainEqual({ method: "email_code" });
    expect(await verifyEmailCode(deps, "pat@agency.example", code, "t", ADDRESS, false)).toEqual({ ok: false, error: "invalid" });
    sent.length = 0;
    await requestEmailCode(deps, "nobody@example.com", codeMail, false, { address: ADDRESS });
    expect((await setSuspended(deps, theOwner, pat.userId, true)).ok).toBe(true);
    step(2 * 60_000);
    await requestEmailCode(deps, "pat@agency.example", codeMail, false, { address: ADDRESS });
    expect(sent).toHaveLength(0);
  });

  it("at most one a minute; a newer code replaces the older; 10 minutes; five wrong tries end it", async () => {
    await invited("billing");
    sent.length = 0;
    await requestEmailCode(deps, "pat@agency.example", codeMail, false);
    await requestEmailCode(deps, "pat@agency.example", codeMail, false);
    expect(sent).toHaveLength(1);
    const first = codeIn(sent[0]!);
    step(61_000);
    await requestEmailCode(deps, "pat@agency.example", codeMail, false);
    expect(sent).toHaveLength(2);
    const second = codeIn(sent[1]!);
    if (first !== second) expect(await verifyEmailCode(deps, "pat@agency.example", first, "t", ADDRESS, false)).toEqual({ ok: false, error: "invalid" });
    step(10 * 60_000);
    expect(await verifyEmailCode(deps, "pat@agency.example", second, "t", ADDRESS, false)).toEqual({ ok: false, error: "invalid" });
    await requestEmailCode(deps, "pat@agency.example", codeMail, false);
    const third = codeIn(sent.at(-1)!);
    for (let i = 0; i < 5; i += 1) expect(await verifyEmailCode(deps, "pat@agency.example", wrongFor(third), "t", `198.51.100.${i}`, false)).toEqual({ ok: false, error: "invalid" });
    expect(await verifyEmailCode(deps, "pat@agency.example", third, "t", "198.51.100.99", false)).toEqual({ ok: false, error: "invalid" });
  });

  it("wrong codes count as wrong authenticator codes (review M1): ten lock codes, even the right one, and never the password's count", async () => {
    const pat = await invited("billing");
    // From ten different addresses (so the address throttle never steps in): only the person's own count.
    for (let round = 0; round < 2; round += 1) {
      step(61_000);
      await requestEmailCode(deps, "pat@agency.example", codeMail, false);
      for (let i = 0; i < 5; i += 1) await verifyEmailCode(deps, "pat@agency.example", wrongFor(lastCode()), "t", `198.51.100.${round * 5 + i}`, false);
    }
    const [login] = await owner.db.select().from(s.userLogins).where(eq(s.userLogins.userId, pat.userId));
    expect(login!.codeLockedUntil!.getTime()).toBeGreaterThan(clock.getTime());
    expect(login!.failedCount).toBe(0);
    step(61_000);
    await requestEmailCode(deps, "pat@agency.example", codeMail, false);
    expect(await verifyEmailCode(deps, "pat@agency.example", lastCode(), "t", "198.51.100.77", false)).toEqual({ ok: false, error: "locked" });
    // Past the lock the right code works.
    step(16 * 60_000);
    await requestEmailCode(deps, "pat@agency.example", codeMail, false);
    expect((await verifyEmailCode(deps, "pat@agency.example", lastCode(), "t", "198.51.100.78", false)).ok).toBe(true);
  });

  it("also counts in the address throttle, as wrong passwords do (here a demo person, who has no login of their own to count on)", async () => {
    for (let round = 0; round < 2; round += 1) {
      step(61_000);
      await requestEmailCode(deps, LENA.email, codeMail, true);
      for (let i = 0; i < 5; i += 1) await verifyEmailCode(deps, LENA.email, wrongFor(lastCode()), "t", ADDRESS, true);
    }
    step(61_000);
    await requestEmailCode(deps, LENA.email, codeMail, true);
    const code = lastCode();
    expect(await verifyEmailCode(deps, LENA.email, code, "t", ADDRESS, true)).toEqual({ ok: false, error: "locked" });
    expect((await verifyEmailCode(deps, LENA.email, code, "t", "198.51.100.5", true)).ok).toBe(true);
  });

  it("caps codes per person (five an hour, ten a day) without voiding the pending one, and requests per address (review M1)", async () => {
    await invited("billing");
    sent.length = 0;
    for (let i = 0; i < CODES_PER_HOUR; i += 1) {
      await requestEmailCode(deps, "pat@agency.example", codeMail, false);
      step(61_000);
    }
    expect(sent).toHaveLength(CODES_PER_HOUR);
    const pending = lastCode();
    // A sixth within the hour: nothing sent, and the pending code still works.
    await requestEmailCode(deps, "pat@agency.example", codeMail, false);
    expect(sent).toHaveLength(CODES_PER_HOUR);
    expect((await verifyEmailCode(deps, "pat@agency.example", pending, "t", ADDRESS, false)).ok).toBe(true);
    // Per address: thirty requests an hour, whoever they are for.
    step(2 * 60 * 60_000);
    sent.length = 0;
    for (let i = 0; i < 30; i += 1) await requestEmailCode(deps, `nobody${i}@example.com`, codeMail, false, { address: "198.51.100.200" });
    await requestEmailCode(deps, "pat@agency.example", codeMail, false, { address: "198.51.100.200" });
    expect(sent).toHaveLength(0);
    await requestEmailCode(deps, "pat@agency.example", codeMail, false, { address: "198.51.100.201" });
    expect(sent).toHaveLength(1);
  });

  it("in live mode does all its work after the response, and leaves no record for an unknown address (review L1)", async () => {
    await invited("billing");
    sent.length = 0;
    const jobs: (() => Promise<unknown>)[] = [];
    const before = (await inAgency((tx) => tx.select().from(s.auditEvents))).length;
    await requestEmailCode(deps, "pat@agency.example", codeMail, false, { address: ADDRESS, later: (job) => jobs.push(job) });
    await requestEmailCode(deps, "nobody@example.com", codeMail, false, { address: ADDRESS, later: (job) => jobs.push(job) });
    expect([jobs.length, sent.length, (await owner.db.select().from(s.emailSignInCodes)).length]).toEqual([2, 0, 0]);
    for (const job of jobs) await job();
    expect(sent.map((m) => m.to.email)).toEqual(["pat@agency.example"]);
    expect((await inAgency((tx) => tx.select().from(s.auditEvents))).length).toBe(before + 1);
  });

  it("a demo person signs in by code in demo mode (the demo has no phones); outside it the demo people are not found by email", async () => {
    sent.length = 0;
    await requestEmailCode(deps, LENA.email, codeMail, true);
    expect(sent).toHaveLength(1);
    expect(await verifyEmailCode(deps, LENA.email, codeIn(sent[0]!), "t", ADDRESS, true)).toMatchObject({ ok: true, next: "done" });
    sent.length = 0;
    step(61_000);
    await requestEmailCode(deps, LENA.email, codeMail, false);
    expect(sent).toHaveLength(0);
  });
});

describe("an agency's single sign-on", () => {
  const ok = async () => "ok" as const;
  const save = (input: { issuer: string; clientId: string; clientSecret: string | null }, check: () => Promise<"ok" | "private" | "unreachable"> = ok, by: Parameters<typeof saveSsoSettings>[1] = theOwner) => saveSsoSettings(deps, by, input, { demoMode: false, check });

  it("the Owner saves the issuer, client ID and secret (sealed, never shown again), then turns it on; nobody else can", async () => {
    await inAgency((tx) => tx.delete(s.agencySso));
    expect(await save({ issuer: "https://idp.example", clientId: "shiftbook", clientSecret: "test-only-secret-value" }, ok, { ...theOwner, role: "coordinator" })).toEqual({ ok: false, error: "not_allowed" });
    expect(await save({ issuer: "http://idp.example", clientId: "shiftbook", clientSecret: "test-only-secret-value" })).toEqual({ ok: false, error: "invalid_issuer" });
    expect(await save({ issuer: "https://idp.example:8443", clientId: "shiftbook", clientSecret: "test-only-secret-value" })).toEqual({ ok: false, error: "invalid_issuer" });
    expect(await save({ issuer: "https://idp.example", clientId: "shiftbook", clientSecret: null })).toEqual({ ok: false, error: "secret_required" });
    // Review L5: a short secret is refused.
    expect(await save({ issuer: "https://idp.example", clientId: "shiftbook", clientSecret: "too-short" })).toEqual({ ok: false, error: "secret_too_short" });
    expect(await save({ issuer: "https://idp.example", clientId: "shiftbook", clientSecret: "test-only-secret-value" }, async () => "unreachable")).toEqual({ ok: false, error: "issuer_unreachable" });
    expect(await save({ issuer: "https://idp.example", clientId: "shiftbook", clientSecret: "test-only-secret-value" })).toEqual({ ok: true });
    let settings = await ssoSettingsOf(deps, DEMO_AGENCY.id);
    expect(settings).toMatchObject({ enabled: false, issuer: "https://idp.example", clientId: "shiftbook", secretLast4: "alue" });
    expect(await setSsoEnabled(deps, { ...theOwner, role: "billing" }, true)).toEqual({ ok: false, error: "not_allowed" });
    expect(await setSsoEnabled(deps, theOwner, true)).toEqual({ ok: true });
    settings = await ssoSettingsOf(deps, DEMO_AGENCY.id);
    expect(settings!.enabled).toBe(true);
    expect(JSON.stringify(settings)).not.toContain("test-only-secret-value");
    const [row] = await inAgency((tx) => tx.select().from(s.agencySso));
    expect(JSON.stringify(row)).not.toContain("test-only-secret-value");
    expect((await ssoConfigOf(deps, DEMO_AGENCY.id, { demoMode: false }))!.clientSecret).toBe("test-only-secret-value");
    expect(await save({ issuer: "https://idp.example", clientId: "shiftbook-2", clientSecret: null })).toEqual({ ok: true });
    expect((await ssoConfigOf(deps, DEMO_AGENCY.id, { demoMode: false }))!.clientSecret).toBe("test-only-secret-value");
    expect(await setSsoEnabled(deps, theOwner, false)).toEqual({ ok: true });
    expect(await ssoForEmail(deps, DEMO_OWNER.email, { demoMode: true, address: null })).toEqual({ ok: false, error: "not_set_up" });
  });

  it("refuses an issuer at an IP address or one that resolves to a private address (review M2)", async () => {
    for (const issuer of ["https://10.0.0.5", "https://169.254.169.254/oidc", "https://[::1]", "https://127.0.0.1"]) expect([issuer, await save({ issuer, clientId: "x", clientSecret: "test-only-secret-value" })]).toEqual([issuer, { ok: false, error: "issuer_private" }]);
    expect(await save({ issuer: "https://idp.internal.example", clientId: "x", clientSecret: "test-only-secret-value" }, async () => "private")).toEqual({ ok: false, error: "issuer_private" });
    // The check itself, outside the demo, with a resolver standing in for DNS: never a connection.
    expect(await checkIssuer("https://10.0.0.5", { demoMode: false })).toBe("private");
    expect(await checkIssuer("https://idp.internal.example", { demoMode: false, resolver: async () => [{ address: "10.1.2.3", family: 4 }] })).toBe("private");
    expect(await checkIssuer("https://idp.rebinding.example", { demoMode: false, resolver: async () => [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }] })).toBe("private");
    expect(await checkIssuer("http://idp.example", { demoMode: false })).toBe("private");
    // In the demo only the stand-in, in-process.
    expect(await checkIssuer(DEMO_SSO_ISSUER, { demoMode: true })).toBe("ok");
    expect(await checkIssuer("https://idp.example", { demoMode: true })).toBe("unreachable");
  });

  it("an email leads to the agency's provider only for an active member of an agency with SSO on; lookups are capped per address (review L1)", async () => {
    await save({ issuer: "https://idp.example", clientId: "shiftbook", clientSecret: "test-only-secret-value" });
    const pat = await invited("billing");
    expect(await ssoForEmail(deps, "PAT@agency.example", { demoMode: false, address: null })).toMatchObject({ ok: true, agencyId: DEMO_AGENCY.id, userId: pat.userId, issuer: "https://idp.example" });
    expect(await ssoForEmail(deps, "nobody@example.com", { demoMode: false, address: null })).toEqual({ ok: false, error: "not_set_up" });
    for (let i = 0; i < SSO_LOOKUPS_PER_ADDRESS; i += 1) await ssoForEmail(deps, `n${i}@example.com`, { demoMode: false, address: ADDRESS });
    expect(await ssoForEmail(deps, "pat@agency.example", { demoMode: false, address: ADDRESS })).toEqual({ ok: false, error: "locked" });
    expect((await ssoForEmail(deps, "pat@agency.example", { demoMode: false, address: "198.51.100.9" })).ok).toBe(true);
    await setSuspended(deps, theOwner, pat.userId, true);
    expect(await ssoForEmail(deps, "pat@agency.example", { demoMode: false, address: null })).toEqual({ ok: false, error: "not_set_up" });
  });

  it("signs in only the member who asked: an identity linked in another agency, or to someone else here, is refused", async () => {
    const [other] = await owner.db.insert(s.agencies).values({ name: "Other agency (test)" }).returning();
    try {
      const [person] = await owner.db.insert(s.users).values({ agencyId: other!.id, name: "Bo Test", email: "bo@other.example", role: "owner" }).returning();
      await owner.db.insert(s.userIdentities).values({ agencyId: other!.id, userId: person!.id, provider: "sso", issuer: "https://idp.example", subject: "bo" });
      await owner.db.insert(s.userIdentities).values({ agencyId: DEMO_AGENCY.id, userId: LENA.id, provider: "sso", issuer: "https://idp.example", subject: "lena" });
      const sso = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id };
      const viaSso = (subject: string) => signInWithIdentity(deps, { provider: "sso", identity: { issuer: "https://idp.example", subject, email: DEMO_OWNER.email, emailVerified: true, mailboxProven: false, name: null }, sso, demoMode: true, userAgent: "t", address: ADDRESS }, mail);
      expect(await viaSso("bo")).toEqual({ ok: false, error: "no_account" });
      expect(await viaSso("lena")).toEqual({ ok: false, error: "no_account" });
      // The member who asked, by a verified email: the first link needs the code from their mailbox.
      sent.length = 0;
      const r = await viaSso("owner-1");
      expect(r).toMatchObject({ ok: false, error: "proof", pending: { userId: DEMO_OWNER.id } });
      expect(sent.map((m) => m.to.email)).toEqual([DEMO_OWNER.email]);
      expect(await finishLinkProof(deps, (r as { pending: PendingLink }).pending, lastCode(), { userAgent: "t", address: ADDRESS, demoMode: true }, mail)).toMatchObject({ ok: true, next: "done" });
    } finally {
      await owner.db.delete(s.userIdentities).where(eq(s.userIdentities.agencyId, other!.id));
      await owner.db.delete(s.users).where(eq(s.users.agencyId, other!.id));
      await owner.db.delete(s.agencies).where(eq(s.agencies.id, other!.id));
    }
  });

  it("in demo mode the demo agency's SSO is on and points at the demo stand-in; another issuer cannot be saved, and never resolves outside the demo", async () => {
    expect(await ssoSettingsOf(deps, DEMO_AGENCY.id)).toMatchObject({ enabled: true, issuer: DEMO_SSO_ISSUER });
    expect(resolveIssuer(DEMO_SSO_ISSUER, true)).toBe(DEMO_SSO_ISSUER);
    expect(resolveIssuer(DEMO_SSO_ISSUER, false)).toBeNull();
    expect(resolveIssuer("https://idp.example", true)).toBeNull();
    expect(await ssoForEmail(deps, LENA.email, { demoMode: true, address: null })).toMatchObject({ ok: true, issuer: DEMO_SSO_ISSUER });
    expect(await saveSsoSettings(deps, theOwner, { issuer: "https://idp.example", clientId: "x", clientSecret: "test-only-secret-value" }, { demoMode: true, check: ok })).toEqual({ ok: false, error: "demo_issuer_only" });
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
      const seen = await app.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.auth', 'on', true)`);
        return { ids: await tx.select().from(s.userIdentities), codes: await tx.select().from(s.emailSignInCodes), sso: await tx.select().from(s.agencySso) };
      });
      expect([seen.ids.length > 0, seen.codes.length > 0, seen.sso.length]).toEqual([true, true, 0]);
      const [pat] = await inAgency((tx) => tx.select().from(s.users).where(and(eq(s.users.email, "pat@agency.example"))));
      await expect(app.withAgency(other!.id, (tx) => tx.insert(s.userIdentities).values({ agencyId: DEMO_AGENCY.id, userId: pat!.id, provider: "google", issuer: GOOGLE, subject: "sneaky" }))).rejects.toThrow();
    } finally {
      await owner.db.delete(s.agencies).where(eq(s.agencies.id, other!.id));
    }
  });

  it("the sealed SSO secret is bound to its agency", async () => {
    await saveSsoSettings(deps, theOwner, { issuer: "https://idp.example", clientId: "shiftbook", clientSecret: "test-only-secret-value" }, { demoMode: false, check: async () => "ok" });
    const [row] = await inAgency((tx) => tx.select().from(s.agencySso));
    const { unseal } = await import("../../src/server/auth/crypto");
    expect(() => unseal(row!.clientSecret, appKey(), "sso:00000000-0000-4000-a000-000000000000")).toThrow();
    expect(unseal(row!.clientSecret, appKey(), `sso:${DEMO_AGENCY.id}`).toString("utf8")).toBe("test-only-secret-value");
  });
});
