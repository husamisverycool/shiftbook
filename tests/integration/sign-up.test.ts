/**
 * Decision 0036 through the database: an agency signs itself up — the email proved by a one-time link,
 * the password set, the Owner's authenticator next — and ends up as scripts/create-agency.ts makes one.
 * The same answer whatever the email; throttles per email and per address; a link works once, for 24
 * hours; the app role can make an agency only by spending such a link.
 */
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { completeSignup, requestSignup, SIGNUP_LINK_HOURS, signupFor, type SignupDeps, type SignupRender } from "../../src/server/auth/signup";
import { beginAuthenticatorSetup, confirmAuthenticator, firstOwnerInvite, inviteMember, listMembers, nextStep, readSession, signIn, type AuthDeps, type LinkMail } from "../../src/server/auth/service";
import { base32Decode, hotp, stepAt } from "../../src/server/auth/totp";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER } from "../../src/server/demo/dataset";
import { clearDemoAgency, seedDemoAgency } from "../../src/server/demo/seed";
import type { OutgoingMail } from "../../src/server/mail/transport";
import { databaseError, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const sent: OutgoingMail[] = [];
// The database's own now() also checks a link's age, so the test clock starts at the real time.
let clock = new Date();
const deps: SignupDeps = { db: app.db, mail: { send: async (m) => (sent.push(m), { providerId: null }) }, now: () => clock };
const authDeps: AuthDeps = { db: app.db, mailTransport: () => deps.mail, now: () => clock };
const PASSWORD = "a long enough passphrase";
const BASE = "https://app.example";
const render: SignupRender = {
  link: (link, who) => ({ subject: `Finish (${who.locale})`, text: `Open ${link}`, html: `<a href="${link}">Finish</a>` }),
  existing: (links) => ({ subject: "You already have an account", text: `Sign in at ${links.signIn} or reset at ${links.reset}`, html: "<p>Already</p>" }),
};
const linkIn = (m: OutgoingMail) => /sbau_[A-Za-z0-9_-]{43}/.exec(m.text)?.[0] ?? null;
const codeAt = (setupKey: string, at = clock) => hotp(base32Decode(setupKey), stepAt(Math.floor(at.getTime() / 1000)));
let n = 0;
/** A fresh address each test: emails are unique across agencies. */
const fresh = (who = "owner") => `${who}.${Date.now()}.${(n += 1)}@new-agency.example`;
const theOwner = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: "Demo Owner (demo)", role: "owner" as const };
const input = (email: string, over: Partial<{ name: string; agencyName: string; locale: string }> = {}) => ({ email, name: "Robin Vega", agencyName: "Harbor Light Staffing", locale: "en", ...over });

beforeEach(async () => {
  sent.length = 0;
  clock = new Date();
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await owner.db.delete(s.signInFailures);
  await owner.db.delete(s.signupRequests);
  await app.withAgency(DEMO_AGENCY.id, async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("an agency signs itself up (decision 0036)", () => {
  it("email, name and agency → a link → the password → the Owner's authenticator → the agency, as the script makes it", async () => {
    const email = fresh();
    expect(await requestSignup(deps, input(email.toUpperCase(), { locale: "es" }), "203.0.113.7", render, BASE)).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to.email).toBe(email);
    expect(sent[0]!.fromName).toBe("Tabulado");
    // Nothing the requester typed goes into the email, not even the To line's display name (security review).
    expect(sent[0]!.to).toEqual({ email, name: null });
    expect(JSON.stringify(sent[0])).not.toContain("Robin Vega");
    expect(sent[0]!.text).toMatch(new RegExp(`^Open ${BASE}/es/sign-up/sbau_`));
    const token = linkIn(sent[0]!)!;
    // Only the link's digest is kept, with when it was sent.
    const [kept] = await owner.db.select().from(s.signupRequests).where(eq(s.signupRequests.email, email));
    expect(kept).toMatchObject({ name: "Robin Vega", agencyName: "Harbor Light Staffing", locale: "es", usedAt: null });
    expect(kept!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(kept)).not.toContain(token);
    expect(kept!.sentAt).not.toBeNull();
    expect(kept!.expiresAt.getTime() - clock.getTime()).toBe(SIGNUP_LINK_HOURS * 60 * 60 * 1000);

    expect(await signupFor(deps, token)).toEqual({ email, name: "Robin Vega", agencyName: "Harbor Light Staffing", locale: "es" });
    const done = await completeSignup(deps, token, PASSWORD, "test", { trialDays: 14 });
    if (!done.ok) throw new Error(done.error);
    expect(done).toMatchObject({ next: "setup", locale: "es" });

    // A half session: the Owner sets up the authenticator before the app opens (SPEC §2).
    const half = (await readSession(authDeps, done.token))!;
    expect(half).toMatchObject({ role: "owner", name: "Robin Vega", email, locale: "es", secondStepAt: null, hasAuthenticator: false });
    expect(nextStep(half)).toBe("setup");
    const setup = await beginAuthenticatorSetup(authDeps, half);
    if (!setup.ok) throw new Error(setup.error);
    const on = await confirmAuthenticator(authDeps, half, codeAt(setup.setupKey));
    expect(on.ok).toBe(true);
    expect(nextStep((await readSession(authDeps, done.token))!)).toBe("done");

    // The agency: not a demo, the name typed; its only member the active Owner with an authenticator.
    const agencyId = half.agencyId;
    const [agency] = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, agencyId));
    expect(agency).toMatchObject({ name: "Harbor Light Staffing", isDemo: false });
    expect(await listMembers(authDeps, agencyId)).toEqual([expect.objectContaining({ name: "Robin Vega", email, role: "owner", status: "active", hasAuthenticator: true })]);
    // Its billing row: 14 free days from now, no Stripe customer yet.
    const [billing] = await owner.db.select().from(s.agencySubscriptions).where(eq(s.agencySubscriptions.agencyId, agencyId));
    expect(billing).toMatchObject({ stripeCustomerId: null, status: null });
    expect(billing!.trialEndsAt!.getTime() - clock.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
    // The agency's log: the agency, its Owner and its billing made by the sign-up.
    const log = await owner.db.select().from(s.auditEvents).where(eq(s.auditEvents.agencyId, agencyId));
    expect(log.map((e) => `${e.action} ${e.entityType}`)).toEqual(expect.arrayContaining(["create agency", "create user", "create subscription", "sign_in user"]));
    expect(log.find((e) => e.entityType === "agency")!.after).toMatchObject({ name: "Harbor Light Staffing", via: "sign-up" });
    // The request records the agency it made.
    const [used] = await owner.db.select().from(s.signupRequests).where(eq(s.signupRequests.email, email));
    expect(used).toMatchObject({ createdAgencyId: agencyId });
    expect(used!.usedAt).not.toBeNull();

    // Signing in later: the password, then the code.
    clock = new Date(clock.getTime() + 60_000);
    const again = await signIn(authDeps, email, PASSWORD, "test");
    expect(again).toMatchObject({ ok: true, next: "code" });
  });

  it("the script's agency and a signed-up one are made by the same code: an Owner, a login, a billing row", async () => {
    const [made] = await owner.db.insert(s.agencies).values({ name: "Script Agency (test)" }).returning();
    const trialEndsAt = new Date(clock.getTime() + 7 * 24 * 60 * 60 * 1000);
    const r = await firstOwnerInvite(authDeps, made!.id, { name: "Sam Ortiz", email: fresh("script"), locale: "en" }, BASE, { trialEndsAt });
    expect(r.ok).toBe(true);
    const [billing] = await owner.db.select().from(s.agencySubscriptions).where(eq(s.agencySubscriptions.agencyId, made!.id));
    expect(billing!.trialEndsAt).toEqual(trialEndsAt);
    expect((await listMembers(authDeps, made!.id)).map((m) => [m.role, m.status])).toEqual([["owner", "invited"]]);
  });

  it("no enumeration: an email that already signs in gets the same answer, a note instead of a link, and no agency", async () => {
    // Someone with a Tabulado login (invited to the demo agency).
    const member = fresh("member");
    const invited = await inviteMember(authDeps, theOwner, { name: "Pat Lee", email: member, role: "billing", locale: "en" }, (link): LinkMail => ({ subject: "Join", text: link, html: link }), BASE);
    if (!invited.ok) throw new Error(invited.error);
    sent.length = 0;
    const before = await owner.db.select({ n: sql<number>`count(*)::int` }).from(s.agencies);
    const known = await requestSignup(deps, input(member.toUpperCase()), "203.0.113.8", render, BASE);
    const unknown = await requestSignup(deps, input(fresh()), "203.0.113.8", render, BASE);
    expect(known).toEqual(unknown);
    expect(sent).toHaveLength(2);
    const note = sent.find((m) => m.to.email === member)!;
    expect(note.subject).toBe("You already have an account");
    expect(linkIn(note)).toBeNull();
    expect(note.text).toContain(`${BASE}/en/sign-in`);
    expect(note.text).toContain(`${BASE}/en/sign-in/reset`);
    expect(await owner.db.select().from(s.signupRequests).where(eq(s.signupRequests.email, member))).toHaveLength(0);
    // The agency whose member it is sees the attempt in its log.
    const [attempt] = await owner.db.select().from(s.auditEvents).where(and(eq(s.auditEvents.agencyId, DEMO_AGENCY.id), eq(s.auditEvents.action, "refuse"), eq(s.auditEvents.entityId, invited.userId)));
    expect(attempt!.after).toMatchObject({ signUp: "this email already signs in" });
    const after = await owner.db.select({ n: sql<number>`count(*)::int` }).from(s.agencies);
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  it("throttles: 3 an hour for one email (known or not), 10 an hour from one address; an hour later it works again", async () => {
    const email = fresh();
    for (let i = 0; i < 3; i++) expect(await requestSignup(deps, input(email), `198.51.100.${i}`, render, BASE)).toEqual({ ok: true });
    expect(await requestSignup(deps, input(email), "198.51.100.9", render, BASE)).toEqual({ ok: false, error: "too_many" });
    const member = fresh("member");
    await inviteMember(authDeps, theOwner, { name: "Pat Lee", email: member, role: "billing", locale: "en" }, (link): LinkMail => ({ subject: "Join", text: link, html: link }), BASE);
    sent.length = 0;
    for (let i = 0; i < 3; i++) await requestSignup(deps, input(member), `198.51.101.${i}`, render, BASE);
    expect(await requestSignup(deps, input(member), "198.51.101.9", render, BASE)).toEqual({ ok: false, error: "too_many" });
    expect(sent).toHaveLength(3);

    for (let i = 0; i < 10; i++) expect(await requestSignup(deps, input(fresh(`a${i}`)), "192.0.2.50", render, BASE)).toEqual({ ok: true });
    expect(await requestSignup(deps, input(fresh("a11")), "192.0.2.50", render, BASE)).toEqual({ ok: false, error: "too_many" });
    // Without a known address (no trusted proxy recorded one), the email's own limit still holds.
    expect(await requestSignup(deps, input(fresh("noaddr")), null, render, BASE)).toEqual({ ok: true });

    clock = new Date(clock.getTime() + 61 * 60 * 1000);
    expect(await requestSignup(deps, input(email), "198.51.100.9", render, BASE)).toEqual({ ok: true });
    expect(await requestSignup(deps, input(fresh("a12")), "192.0.2.50", render, BASE)).toEqual({ ok: true });
  });

  it("a link works once; a newer request replaces the older; a wrong password keeps it", async () => {
    const email = fresh();
    await requestSignup(deps, input(email), "203.0.113.9", render, BASE);
    const first = linkIn(sent[0]!)!;
    await requestSignup(deps, input(email, { agencyName: "Harbor Light Staffing LLC" }), "203.0.113.9", render, BASE);
    const second = linkIn(sent[1]!)!;
    expect(await signupFor(deps, first)).toBeNull();
    expect(await completeSignup(deps, first, PASSWORD, "test", { trialDays: 0 })).toEqual({ ok: false, error: "expired" });
    expect(await completeSignup(deps, second, "too short", "test", { trialDays: 0 })).toEqual({ ok: false, error: "too_short" });
    expect(await completeSignup(deps, second, email, "test", { trialDays: 0 })).toEqual({ ok: false, error: "is_email" });
    const ok = await completeSignup(deps, second, PASSWORD, "test", { trialDays: 0 });
    expect(ok.ok).toBe(true);
    expect(await completeSignup(deps, second, PASSWORD, "test", { trialDays: 0 })).toEqual({ ok: false, error: "expired" });
    expect(await signupFor(deps, second)).toBeNull();
    // No free days configured: none recorded.
    const session = (await readSession(authDeps, (ok as { token: string }).token))!;
    const [billing] = await owner.db.select().from(s.agencySubscriptions).where(eq(s.agencySubscriptions.agencyId, session.agencyId));
    expect(billing!.trialEndsAt).toBeNull();
    expect((await owner.db.select().from(s.agencies).where(eq(s.agencies.id, session.agencyId)))[0]!.name).toBe("Harbor Light Staffing LLC");
  });

  it("a link expires after 24 hours (the service's clock and the database's own)", async () => {
    const email = fresh();
    await requestSignup(deps, input(email), "203.0.113.10", render, BASE);
    const token = linkIn(sent[0]!)!;
    clock = new Date(clock.getTime() + (SIGNUP_LINK_HOURS * 60 + 1) * 60 * 1000);
    expect(await signupFor(deps, token)).toBeNull();
    expect(await completeSignup(deps, token, PASSWORD, "test", { trialDays: 0 })).toEqual({ ok: false, error: "expired" });
    // The definer function checks the time itself: an expired row makes no agency even if asked directly.
    await owner.db.update(s.signupRequests).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(s.signupRequests.email, email));
    const rows = await app.db.execute<{ id: string | null }>(sql`select signup_create_agency(${token}) as id`);
    expect(rows[0]!.id).toBeNull();
  });

  it("an email that signs up somewhere meanwhile (an invite accepted) is refused at the end, and no agency is made", async () => {
    const email = fresh();
    await requestSignup(deps, input(email), "203.0.113.11", render, BASE);
    const token = linkIn(sent[0]!)!;
    const invited = await inviteMember(authDeps, theOwner, { name: "Robin Vega", email, role: "billing", locale: "en" }, (link): LinkMail => ({ subject: "Join", text: link, html: link }), BASE);
    expect(invited.ok).toBe(true);
    const before = await owner.db.select({ n: sql<number>`count(*)::int` }).from(s.agencies);
    expect(await completeSignup(deps, token, PASSWORD, "test", { trialDays: 0 })).toEqual({ ok: false, error: "email_taken" });
    const after = await owner.db.select({ n: sql<number>`count(*)::int` }).from(s.agencies);
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  it("refuses a malformed request before anything is kept or sent", async () => {
    expect(await requestSignup(deps, input("not an email"), null, render, BASE)).toEqual({ ok: false, error: "invalid_email" });
    expect(await requestSignup(deps, input(fresh(), { name: "  " }), null, render, BASE)).toEqual({ ok: false, error: "invalid_name" });
    expect(await requestSignup(deps, input(fresh(), { agencyName: "x".repeat(201) }), null, render, BASE)).toEqual({ ok: false, error: "invalid_agency_name" });
    expect(sent).toHaveLength(0);
    expect(await owner.db.select().from(s.signupRequests)).toHaveLength(0);
    expect(await signupFor(deps, "sbau_not-a-real-token")).toBeNull();
  });

  it("the app role still cannot make an agency directly, nor see sign-up requests outside sign-in mode", async () => {
    expect(await databaseError(app.db.insert(s.agencies).values({ name: "Sneaky" }))).toMatch(/permission denied/);
    expect((await app.db.execute<{ id: string | null }>(sql`select signup_create_agency(${"0".repeat(64)}) as id`))[0]!.id).toBeNull();
    expect((await app.db.execute<{ id: string | null }>(sql`select signup_create_agency(${"sbau_" + "A".repeat(43)}) as id`))[0]!.id).toBeNull();
    await requestSignup(deps, input(fresh()), null, render, BASE);
    expect(await app.db.select().from(s.signupRequests)).toHaveLength(0);
    expect(await app.withAgency(DEMO_AGENCY.id, (tx) => tx.select().from(s.signupRequests))).toHaveLength(0);
  });

  it("a send that fails is recorded, and the answer is still the same", async () => {
    const failing: SignupDeps = { ...deps, mail: { send: async () => { throw new Error("mail service down"); } } };
    const email = fresh();
    expect(await requestSignup(failing, input(email), null, render, BASE)).toEqual({ ok: true });
    const [kept] = await owner.db.select().from(s.signupRequests).where(eq(s.signupRequests.email, email));
    expect(kept!.sentAt).toBeNull();
    expect(kept!.sendFailedAt).not.toBeNull();
  });
});

describe("sign-up hardening (decision 0036, security review)", () => {
  it("the throttle holds under parallel requests: exactly 3 for one email, exactly 10 from one address", async () => {
    const email = fresh("race");
    const same = await Promise.all(Array.from({ length: 8 }, (_, i) => requestSignup(deps, input(email), `198.51.100.${100 + i}`, render, BASE)));
    expect(same.filter((r) => r.ok)).toHaveLength(3);
    const many = await Promise.all(Array.from({ length: 16 }, (_, i) => requestSignup(deps, input(fresh(`race${i}`)), "192.0.2.77", render, BASE)));
    expect(many.filter((r) => r.ok)).toHaveLength(10);
  });

  it("an IPv6 visitor is counted by its /64: other addresses in it share the limit", async () => {
    for (let i = 1; i <= 10; i++) expect(await requestSignup(deps, input(fresh(`v6${i}`)), `2001:db8:5:6::${i.toString(16)}`, render, BASE)).toEqual({ ok: true });
    expect(await requestSignup(deps, input(fresh("v6x")), "2001:db8:5:6:ffff::1", render, BASE)).toEqual({ ok: false, error: "too_many" });
    expect(await requestSignup(deps, input(fresh("v6y")), "2001:db8:5:7::1", render, BASE)).toEqual({ ok: true });
  });

  it("only a real link makes an agency: the function wants the raw token (its digest does nothing), and a used request cannot be made new", async () => {
    const email = fresh();
    await requestSignup(deps, input(email), null, render, BASE);
    const token = linkIn(sent[0]!)!;
    const [kept] = await owner.db.select().from(s.signupRequests).where(eq(s.signupRequests.email, email));
    // Knowing the stored digest is not enough.
    expect((await app.db.execute<{ id: string | null }>(sql`select signup_create_agency(${kept!.tokenHash}) as id`))[0]!.id).toBeNull();
    const done = await completeSignup(deps, token, PASSWORD, "test", { trialDays: 0 });
    expect(done.ok).toBe(true);
    // The app role may not delete requests, set the agency a request made, or make a used request unused.
    const inSignInMode = <T>(fn: Parameters<typeof app.db.transaction<T>>[0]) =>
      app.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.auth', 'on', true)`);
        return fn(tx);
      });
    expect(await databaseError(inSignInMode((tx) => tx.delete(s.signupRequests).where(eq(s.signupRequests.email, email))))).toMatch(/permission denied/);
    expect(await databaseError(inSignInMode((tx) => tx.update(s.signupRequests).set({ createdAgencyId: DEMO_AGENCY.id }).where(eq(s.signupRequests.email, email))))).toMatch(/permission denied/);
    expect(await databaseError(inSignInMode((tx) => tx.update(s.signupRequests).set({ usedAt: null }).where(eq(s.signupRequests.email, email))))).toMatch(/stays used/);
    expect((await app.db.execute<{ id: string | null }>(sql`select signup_create_agency(${token}) as id`))[0]!.id).toBeNull();
  });
});
