/**
 * Passkeys through the database (decision 0032): added only with the password or a code given for
 * that very passkey, the person emailed; signed in with as both steps; refused when removed,
 * suspended, replayed, expired, copied (counter), framed, without a user handle or from another site;
 * removing one ends the person's other sessions; the throttle never blocks a good signature and junk
 * never fills it; the caps on open challenges hold under concurrency; tenants stay apart; the demo's
 * passkey sessions are still the demo's; the demo reset clears them.
 */
import { randomBytes } from "node:crypto";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { digest, randomToken } from "../../src/server/auth/crypto";
import { addPasskey, CHALLENGE_MS, listPasskeys, passkeyRegistrationOptions, passkeySignIn, passkeySignInOptions, relyingParty, removePasskey } from "../../src/server/auth/passkeys";
import { beginAuthenticatorSetup, confirmAccess, confirmAuthenticator, demoSignIn, endSession, inviteMember, nextStep, readSession, redeemLink, setSuspended, signIn, type AuthDeps, type LinkMail } from "../../src/server/auth/service";
import { base32Decode, hotp, stepAt } from "../../src/server/auth/totp";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER } from "../../src/server/demo/dataset";
import { DEMO_PEOPLE } from "../../src/server/demo/people";
import { clearDemoAgency, seedDemoAgency } from "../../src/server/demo/seed";
import type { OutgoingMail } from "../../src/server/mail/transport";
import { SoftAuthenticator } from "../support/soft-authenticator";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const sent: OutgoingMail[] = [];
let clock = new Date("2026-10-16T15:00:00Z");
const deps: AuthDeps = { db: app.db, mailTransport: () => ({ send: async (m) => (sent.push(m), { providerId: null }) }), now: () => clock };
/** An agency that is not a demo: what live mode sees. */
const LIVE = { id: "5a1c0d4e-8b2f-4c3a-9d6e-7f8091a2b3c4", name: "Lakeside Staffing (test)", email: "office@lakeside.example" };
const LIVE_OWNER = { id: "6b2d1e5f-9c3a-4d4b-8e7f-8091a2b3c4d5", agencyId: LIVE.id, name: "Avery Lake (test)", email: "owner@lakeside.example", role: "owner" as const };
const liveOwner = { agencyId: LIVE.id, userId: LIVE_OWNER.id, label: LIVE_OWNER.name, role: "owner" as const };
const PASSWORD = "a long enough passphrase";
const rp = relyingParty("https://app.example");
const ORIGIN = "https://app.example";
const LENA = DEMO_PEOPLE.find((p) => p.role === "coordinator")!;
const render = (link: string): LinkMail => ({ subject: "Join", text: `Open ${link}`, html: `<a href="${link}">Join</a>` });
const linkIn = (m: OutgoingMail) => /sbau_[A-Za-z0-9_-]{43}/.exec(m.text)![0];
const later = (ms: number) => (clock = new Date(clock.getTime() + ms));
const inLive = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(LIVE.id, fn);
const inDemo = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(DEMO_AGENCY.id, fn);
const eventsOf = (agencyId: string, userId: string) => app.withAgency(agencyId, (tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "user"), eq(s.auditEvents.entityId, userId))).orderBy(s.auditEvents.id));
const reasons = (events: { action: string; after: unknown }[]) => events.filter((e) => e.action === "sign_in_failed").map((e) => (e.after as { reason: string }).reason);

beforeEach(async () => {
  sent.length = 0;
  clock = new Date("2026-10-16T15:00:00Z");
  if ((await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id))).length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  if ((await owner.db.select().from(s.agencies).where(eq(s.agencies.id, LIVE.id))).length === 0) await owner.db.insert(s.agencies).values(LIVE);
  await owner.db.delete(s.sessions);
  await owner.db.delete(s.signInFailures);
  await owner.db.delete(s.webauthnChallenges);
  // The live agency's people go (their logins, links and passkeys with them); its Owner comes back.
  await owner.db.delete(s.users).where(eq(s.users.agencyId, LIVE.id));
  await owner.db.insert(s.users).values(LIVE_OWNER);
  await inDemo(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

/** Someone invited to the live agency with a role, joined with a password; their (possibly half) session. */
async function invited(role: "coordinator" | "billing", email = "pat@agency.example") {
  const r = await inviteMember(deps, liveOwner, { name: "Pat Lee", email, role, locale: "en" }, render, "https://app.example");
  if (!r.ok) throw new Error(r.error);
  const accepted = await redeemLink(deps, linkIn(sent.at(-1)!), "invite", PASSWORD, "test");
  if (!accepted.ok) throw new Error(accepted.error);
  sent.length = 0;
  return { userId: r.userId, token: accepted.token, next: accepted.next };
}

/** A passkey added in this session, with the password or code given for it (none for the demo's sessions). */
async function withPasskey(token: string, o: { device?: SoftAuthenticator; secret?: string | null; locale?: string } = {}) {
  const device = o.device ?? new SoftAuthenticator();
  const session = (await readSession(deps, token))!;
  const options = await passkeyRegistrationOptions(deps, session, rp, o.secret ?? null);
  if (!options.ok) throw new Error(options.error);
  const added = await addPasskey(deps, session, device.create(options.options, { origin: ORIGIN }), rp, { locale: o.locale });
  if (!added.ok) throw new Error(added.error);
  return { device, passkey: added.passkey };
}

/** One passkey sign-in ceremony from this device. */
async function passkeyIn(device: SoftAuthenticator, o: { origin?: string; counter?: number; address?: string | null; withoutUserHandle?: boolean } = {}) {
  const options = await passkeySignInOptions(deps, rp, o.address ?? null);
  if (!options.ok) throw new Error(options.error);
  const response = device.get(options.options, { origin: o.origin ?? ORIGIN, counter: o.counter, withoutUserHandle: o.withoutUserHandle });
  return { response, result: await passkeySignIn(deps, response, rp, "test", o.address ?? null) };
}

describe("adding a passkey", () => {
  it("takes the password given for it, every time, even straight after signing in; the person is emailed", async () => {
    const pat = await invited("billing");
    const session = (await readSession(deps, pat.token))!;
    // Signed in a moment ago, yet not confirmed for this: a stolen session cannot add one.
    expect(await passkeyRegistrationOptions(deps, session, rp, null)).toEqual({ ok: false, error: "confirm" });
    expect(await passkeyRegistrationOptions(deps, session, rp, "not the password at all")).toEqual({ ok: false, error: "invalid" });
    const options = await passkeyRegistrationOptions(deps, session, rp, PASSWORD);
    if (!options.ok) throw new Error(options.error);
    const added = await addPasskey(deps, session, new SoftAuthenticator().create(options.options, { origin: ORIGIN }), rp);
    if (!added.ok) throw new Error(added.error);
    // That confirmation was spent on that passkey: the next one asks again.
    expect(await passkeyRegistrationOptions(deps, session, rp, null)).toEqual({ ok: false, error: "confirm" });

    // One email to the person, in their language, kept with its text.
    expect(sent.map((m) => [m.to.email, m.subject])).toEqual([["pat@agency.example", "A passkey was added to your Tabulado account"]]);
    expect(sent[0]!.text).toContain("“Synced passkey”");
    expect(sent[0]!.text).toContain("https://app.example/en/settings/account");
    const kept = await inLive((tx) => tx.select().from(s.emailMessages).where(eq(s.emailMessages.kind, "passkey_added")));
    expect(kept.map((k) => [k.toEmail, k.status])).toEqual([["pat@agency.example", "sent"]]);

    const events = await eventsOf(LIVE.id, pat.userId);
    expect(events.filter((e) => e.action === "sign_in_failed").map((e) => e.after)).toEqual([{ step: "confirm", locked: false }]);
    expect(events.filter((e) => e.action === "passkey_added").map((e) => e.after)).toEqual([{ passkey: added.passkey.id, name: "Synced passkey", synced: true }]);
  });

  it("a coordinator gives a code for it, then signs in with it as both steps; counter, last use and the log kept", async () => {
    const pat = await invited("coordinator");
    expect(pat.next).toBe("setup");
    // A half session (the authenticator a coordinator needs is still owed) cannot add one.
    expect(await passkeyRegistrationOptions(deps, (await readSession(deps, pat.token))!, rp, PASSWORD)).toEqual({ ok: false, error: "expired" });
    const setup = await beginAuthenticatorSetup(deps, (await readSession(deps, pat.token))!);
    if (!setup.ok) throw new Error(setup.error);
    const code = () => hotp(base32Decode(setup.setupKey), stepAt(Math.floor(clock.getTime() / 1000)));
    if (!(await confirmAuthenticator(deps, (await readSession(deps, pat.token))!, code())).ok) throw new Error("setup");
    later(60_000);
    const { device, passkey } = await withPasskey(pat.token, { secret: code() });
    expect(passkey).toMatchObject({ name: "Synced passkey", deviceType: "multiDevice", backedUp: true, lastUsedAt: null });
    expect((await listPasskeys(deps, { userId: pat.userId, agencyId: LIVE.id })).map((p) => p.name)).toEqual(["Synced passkey"]);
    const [kept] = await owner.db.select().from(s.passkeys).where(eq(s.passkeys.userId, pat.userId));
    expect(kept!.publicKey).toBeInstanceOf(Uint8Array);
    expect(kept!.transports).toEqual(["hybrid", "internal"]);
    expect((await owner.db.select().from(s.webauthnChallenges)).every((c) => /^[0-9a-f]{64}$/.test(c.challengeHash))).toBe(true);
    await endSession(deps, pat.token);

    // The password still asks the code; the passkey is both steps, in an ordinary (not demo) session.
    later(60_000);
    expect(await signIn(deps, "pat@agency.example", PASSWORD, "test")).toMatchObject({ ok: true, next: "code" });
    const { response, result } = await passkeyIn(device);
    if (!result.ok) throw new Error(result.error);
    const session = (await readSession(deps, result.token))!;
    expect(session).toMatchObject({ userId: pat.userId, agencyId: LIVE.id, role: "coordinator", demo: false });
    expect(nextStep(session)).toBe("done");
    const [used] = await owner.db.select().from(s.passkeys).where(eq(s.passkeys.userId, pat.userId));
    expect(used!.lastUsedAt).toEqual(clock);
    // The same response again: its challenge was spent.
    expect(await passkeySignIn(deps, response, rp, "test")).toEqual({ ok: false, error: "invalid" });

    const events = await eventsOf(LIVE.id, pat.userId);
    expect(events.filter((e) => e.action === "sign_in").map((e) => e.after)).toContainEqual({ method: "passkey", passkey: passkey.id });
    expect(reasons(events)).toEqual(["challenge"]);
    expect(JSON.stringify(events)).not.toContain(kept!.credentialId);
  });

  it("refuses a passkey made without user verification, inside another site's frame, or for someone else's challenge", async () => {
    const pat = await invited("billing");
    const session = (await readSession(deps, pat.token))!;
    const ask = async () => {
      const r = await passkeyRegistrationOptions(deps, session, rp, PASSWORD);
      if (!r.ok) throw new Error(r.error);
      return r.options;
    };
    const options = await ask();
    expect(await addPasskey(deps, session, new SoftAuthenticator({ userVerified: false, synced: true, counts: false }).create(options, { origin: ORIGIN }), rp)).toEqual({ ok: false, error: "invalid" });
    // That challenge is spent, refused or not.
    expect(await addPasskey(deps, session, new SoftAuthenticator().create(options, { origin: ORIGIN }), rp)).toEqual({ ok: false, error: "invalid" });
    expect(await addPasskey(deps, session, new SoftAuthenticator().create(await ask(), { origin: ORIGIN, crossOrigin: true }), rp)).toEqual({ ok: false, error: "invalid" });
    // Pat's challenge cannot add a passkey to the demo coordinator.
    const fresh = await ask();
    const demo = await demoSignIn(deps, DEMO_AGENCY.id, LENA.id, "test");
    if (!demo.ok) throw new Error("demo");
    expect(await addPasskey(deps, (await readSession(deps, demo.token))!, new SoftAuthenticator().create(fresh, { origin: ORIGIN }), rp)).toEqual({ ok: false, error: "invalid" });
    expect(await owner.db.select().from(s.passkeys)).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("at most 20 passkeys a person (removed ones aside)", async () => {
    const demo = await demoSignIn(deps, DEMO_AGENCY.id, LENA.id, "test");
    if (!demo.ok) throw new Error("demo");
    const session = (await readSession(deps, demo.token))!;
    const options = await passkeyRegistrationOptions(deps, session, rp, null);
    if (!options.ok) throw new Error(options.error);
    // Twenty there already (made directly here).
    const rows = Array.from({ length: 20 }, (_, i) => ({ agencyId: DEMO_AGENCY.id, userId: LENA.id, credentialId: randomBytes(16).toString("base64url"), publicKey: new Uint8Array(randomBytes(77)), deviceType: "multiDevice" as const, name: `Passkey ${i + 1}` }));
    const inserted = await owner.db.insert(s.passkeys).values(rows).returning({ id: s.passkeys.id });
    expect(await addPasskey(deps, session, new SoftAuthenticator().create(options.options, { origin: ORIGIN }), rp)).toEqual({ ok: false, error: "too_many" });
    expect(await passkeyRegistrationOptions(deps, session, rp, null)).toEqual({ ok: false, error: "too_many" });
    await owner.db.update(s.passkeys).set({ removedAt: clock }).where(eq(s.passkeys.id, inserted[0]!.id));
    expect((await passkeyRegistrationOptions(deps, session, rp, null)).ok).toBe(true);
  });
});

describe("the demo's passkeys", () => {
  it("the demo coordinator adds one in the shared demo session (never asked) and is in with it: a demo session, no authenticator needed", async () => {
    const demo = await demoSignIn(deps, DEMO_AGENCY.id, LENA.id, "test");
    if (!demo.ok) throw new Error("demo");
    later(60 * 60_000);
    const { device, passkey } = await withPasskey(demo.token);
    expect(passkey.name).toBe("Synced passkey");
    // The notice goes to the demo person's address (the demo mailbox in demo mode).
    expect(sent.map((m) => m.to.email)).toEqual(["lena@cedarrow.example.com"]);
    await endSession(deps, demo.token);
    const { result } = await passkeyIn(device);
    if (!result.ok) throw new Error(result.error);
    const session = (await readSession(deps, result.token))!;
    expect(session).toMatchObject({ userId: LENA.id, demo: true, hasAuthenticator: false });
    expect(nextStep(session)).toBe("done");
    const again = await withPasskey(result.token);
    expect(again.passkey.name).toBe("Synced passkey 2");
    // Named in the language of the page she is on (a demo visitor may browse in Spanish).
    expect((await withPasskey(result.token, { locale: "es" })).passkey.name).toBe("Llave de acceso sincronizada");
  });

  it("the demo Owner's passkey session is marked (demo) in the log", async () => {
    // Other test files sign the demo Owner in too: only this test's events are compared.
    const earlier = (await eventsOf(DEMO_AGENCY.id, DEMO_OWNER.id)).length;
    const demo = await demoSignIn(deps, DEMO_AGENCY.id, DEMO_OWNER.id, "test");
    if (!demo.ok) throw new Error("demo");
    const { device } = await withPasskey(demo.token);
    const { result } = await passkeyIn(device);
    if (!result.ok) throw new Error(result.error);
    expect((await readSession(deps, result.token))!.demo).toBe(true);
    const signIns = (await eventsOf(DEMO_AGENCY.id, DEMO_OWNER.id)).slice(earlier).filter((e) => e.action === "sign_in");
    expect(signIns.map((e) => [e.actorLabel, (e.after as { method: string }).method])).toEqual([
      ["Demo Owner (demo)", "demo"],
      ["Demo Owner (demo)", "passkey"],
    ]);
  });
});

describe("removing and refusing", () => {
  it("removing needs confirmation and ends the person's other sessions; removed, suspended and copied passkeys are refused, a copy flagged", async () => {
    const pat = await invited("billing");
    const counting = new SoftAuthenticator({ userVerified: true, synced: false, counts: true });
    const { device, passkey } = await withPasskey(pat.token, { device: counting, secret: PASSWORD });
    expect(passkey.name).toBe("Passkey on one device");
    expect((await passkeyIn(device, { counter: 3 })).result.ok).toBe(true);
    // A copy of the authenticator answers with a counter that did not go up.
    expect((await passkeyIn(device, { counter: 3 })).result).toEqual({ ok: false, error: "invalid" });
    expect((await passkeyIn(device, { counter: 2 })).result).toEqual({ ok: false, error: "invalid" });
    expect((await passkeyIn(device, { counter: 4 })).result.ok).toBe(true);

    // Suspended: refused; active again: in.
    expect(await setSuspended(deps, liveOwner, pat.userId, true)).toEqual({ ok: true });
    expect((await passkeyIn(device, { counter: 5 })).result).toEqual({ ok: false, error: "invalid" });
    expect(await setSuspended(deps, liveOwner, pat.userId, false)).toEqual({ ok: true });
    const here = (await passkeyIn(device, { counter: 6 })).result;
    if (!here.ok) throw new Error(here.error);
    const elsewhere = await signIn(deps, "pat@agency.example", PASSWORD, "another browser");
    if (!elsewhere.ok) throw new Error(elsewhere.error);

    // Removing: confirmation after 15 minutes; someone else's id is not found.
    later(16 * 60_000);
    const stale = (await readSession(deps, here.token))!;
    expect(await removePasskey(deps, stale, passkey.id)).toEqual({ ok: false, error: "confirm" });
    expect(await confirmAccess(deps, stale, PASSWORD)).toEqual({ ok: true });
    const fresh = (await readSession(deps, here.token))!;
    expect(await removePasskey(deps, fresh, "00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, error: "not_found" });
    expect(await removePasskey(deps, fresh, "not an id")).toEqual({ ok: false, error: "not_found" });
    expect(await removePasskey(deps, fresh, passkey.id)).toEqual({ ok: true });
    expect(await removePasskey(deps, fresh, passkey.id)).toEqual({ ok: false, error: "not_found" });
    // The other browser is signed out; this one goes on.
    expect(await readSession(deps, elsewhere.token)).toBeNull();
    expect(await readSession(deps, here.token)).not.toBeNull();
    expect(await listPasskeys(deps, { userId: pat.userId, agencyId: LIVE.id })).toEqual([]);
    expect((await passkeyIn(device, { counter: 7 })).result).toEqual({ ok: false, error: "invalid" });

    const events = await eventsOf(LIVE.id, pat.userId);
    expect(reasons(events)).toEqual(["counter", "counter", "member_inactive", "removed"]);
    expect(events.filter((e) => e.action === "passkey_clone_suspected").map((e) => e.after)).toEqual([
      { passkey: passkey.id, counterKept: 3, counterGiven: 3 },
      { passkey: passkey.id, counterKept: 3, counterGiven: 2 },
    ]);
    expect(events.filter((e) => e.action === "passkey_removed").map((e) => e.before)).toEqual([{ passkey: passkey.id, name: "Passkey on one device" }]);
    expect(events.filter((e) => e.action === "sign_in" && (e.after as { method: string }).method === "passkey")).toHaveLength(3);
  });

  it("refuses another site, an expired or an add-passkey challenge, and a response without its user handle", async () => {
    const pat = await invited("billing");
    const { device } = await withPasskey(pat.token, { secret: PASSWORD });
    expect((await passkeyIn(device, { origin: "https://app.example.evil.example" })).result).toEqual({ ok: false, error: "invalid" });
    const options = await passkeySignInOptions(deps, rp, null);
    if (!options.ok) throw new Error(options.error);
    const response = device.get(options.options, { origin: ORIGIN });
    later(CHALLENGE_MS + 1000);
    expect(await passkeySignIn(deps, response, rp, "test")).toEqual({ ok: false, error: "invalid" });
    // A challenge made to add a passkey does not sign anyone in.
    const register = await passkeyRegistrationOptions(deps, (await readSession(deps, pat.token))!, rp, PASSWORD);
    if (!register.ok) throw new Error(register.error);
    const crossed = device.get({ challenge: register.options.challenge, rpId: rp.id }, { origin: ORIGIN });
    expect(await passkeySignIn(deps, crossed, rp, "test")).toEqual({ ok: false, error: "invalid" });
    expect((await passkeyIn(device, { withoutUserHandle: true })).result).toEqual({ ok: false, error: "invalid" });
    expect(reasons(await eventsOf(LIVE.id, pat.userId))).toEqual(["invalid", "challenge", "challenge", "user_handle"]);
  });

  it("two verifications of the same response at once: exactly one signs in", async () => {
    const pat = await invited("billing");
    const { device } = await withPasskey(pat.token, { secret: PASSWORD });
    const options = await passkeySignInOptions(deps, rp, null);
    if (!options.ok) throw new Error(options.error);
    const response = device.get(options.options, { origin: ORIGIN });
    const both = await Promise.all([passkeySignIn(deps, response, rp, "a"), passkeySignIn(deps, response, rp, "b")]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.filter((r) => !r.ok)).toEqual([{ ok: false, error: "invalid" }]);
    expect(await owner.db.select().from(s.sessions).where(and(eq(s.sessions.userId, pat.userId), isNull(s.sessions.endedAt), sql`${s.sessions.userAgent} in ('a', 'b')`))).toHaveLength(1);
  });
});

describe("the throttle and the caps", () => {
  it("refusals of a known passkey from one address count; a good signature is never blocked; unknown passkeys never count", async () => {
    const pat = await invited("billing");
    const { device } = await withPasskey(pat.token, { secret: PASSWORD });
    const here = "203.0.113.5";
    for (let i = 0; i < 10; i += 1) expect((await passkeyIn(device, { origin: "https://evil.example", address: here })).result).toEqual({ ok: false, error: "invalid" });
    expect((await passkeyIn(device, { origin: "https://evil.example", address: here })).result).toEqual({ ok: false, error: "locked" });
    // The person's own good signature from that same address still signs in.
    expect((await passkeyIn(device, { address: here })).result.ok).toBe(true);
    // Ten logged; the ones refused while locked are not (the log is not flooded).
    expect(reasons(await eventsOf(LIVE.id, pat.userId))).toEqual(Array(10).fill("invalid"));

    // Junk (passkeys nobody added) from another address: refused, never counted.
    const junk = "198.51.100.9";
    const stranger = new SoftAuthenticator();
    stranger.create({ challenge: "x", rp: { id: rp.id, name: rp.name }, user: { id: "AAAAAAAAAAAAAAAAAAAAAA", name: "x", displayName: "x" }, pubKeyCredParams: [{ type: "public-key", alg: -7 }] }, { origin: ORIGIN });
    const counted = (await owner.db.select().from(s.signInFailures)).length;
    for (let i = 0; i < 15; i += 1) expect((await passkeyIn(stranger, { address: junk })).result).toEqual({ ok: false, error: "invalid" });
    expect((await owner.db.select().from(s.signInFailures)).length).toBe(counted);
    // Nor do they touch the password throttle of that address.
    expect(await signIn(deps, "pat@agency.example", PASSWORD, "test", junk)).toMatchObject({ ok: true });
  });

  it("open sign-in challenges: 20 per address (an IPv6 /64 is one), counted and made in one step", async () => {
    const here = "203.0.113.6";
    const results = await Promise.all(Array.from({ length: 25 }, () => passkeySignInOptions(deps, rp, here)));
    expect(results.filter((r) => r.ok)).toHaveLength(20);
    expect(results.filter((r) => !r.ok)).toEqual(Array(5).fill({ ok: false, error: "locked" }));
    for (let i = 1; i <= 20; i += 1) expect((await passkeySignInOptions(deps, rp, `2001:db8:1:2::${i.toString(16)}`)).ok).toBe(true);
    expect(await passkeySignInOptions(deps, rp, "2001:db8:1:2:ffff::1")).toEqual({ ok: false, error: "locked" });
    expect((await passkeySignInOptions(deps, rp, "2001:db8:1:3::1")).ok).toBe(true);
    // Five minutes on, those have lapsed.
    later(CHALLENGE_MS + 1000);
    expect((await passkeySignInOptions(deps, rp, here)).ok).toBe(true);
  });

  it("10,000 open sign-in challenges in all, whatever the address (unknown ones too); lapsed ones go a batch at a time", async () => {
    await owner.db.execute(sql`
      insert into webauthn_challenges (purpose, challenge_hash, created_at, expires_at)
      select 'sign_in', md5(g::text) || md5((g + 1000000)::text), ${clock.toISOString()}::timestamptz, ${new Date(clock.getTime() + CHALLENGE_MS).toISOString()}::timestamptz
      from generate_series(1, 9999) g`);
    expect((await passkeySignInOptions(deps, rp, null)).ok).toBe(true);
    expect(await passkeySignInOptions(deps, rp, null)).toEqual({ ok: false, error: "locked" });
    expect(await passkeySignInOptions(deps, rp, "192.0.2.44")).toEqual({ ok: false, error: "locked" });
    later(CHALLENGE_MS + 1000);
    expect((await passkeySignInOptions(deps, rp, null)).ok).toBe(true);
    const lapsed = await owner.db.select({ n: sql<number>`count(*)::int` }).from(s.webauthnChallenges).where(lt(s.webauthnChallenges.expiresAt, clock));
    // One request cleared one batch, not all ten thousand.
    expect(lapsed[0]!.n).toBe(10_000 - 500);
  });
});

describe("tenants", () => {
  it("a passkey signs in only its own person in its own agency, even with the same email in two agencies", async () => {
    const pat = await invited("billing");
    const live = await withPasskey(pat.token, { secret: PASSWORD });
    // The same email, a person of the demo agency (no login of their own), with a demo session made
    // here (anyone else with neither a password nor an authenticator gives an emailed code to add one).
    const twinId = "7c3e2f60-ad4b-4e5c-9f80-91a2b3c4d5e6";
    await owner.db.insert(s.users).values({ id: twinId, agencyId: DEMO_AGENCY.id, name: "Pat Lee (demo)", email: "pat@agency.example", role: "billing" });
    const token = randomToken();
    await owner.db.insert(s.sessions).values({ agencyId: DEMO_AGENCY.id, userId: twinId, tokenHash: digest(token), demo: true, secondStepAt: clock, confirmedAt: clock, createdAt: clock, lastSeenAt: clock, expiresAt: new Date(clock.getTime() + 3_600_000) });
    const twin = await withPasskey(token);

    const a = (await passkeyIn(live.device)).result;
    const b = (await passkeyIn(twin.device)).result;
    if (!a.ok || !b.ok) throw new Error("sign-in");
    expect(await readSession(deps, a.token)).toMatchObject({ agencyId: LIVE.id, userId: pat.userId });
    expect(await readSession(deps, b.token)).toMatchObject({ agencyId: DEMO_AGENCY.id, userId: twinId });
    // The twin's passkey answering with Pat's user handle is refused.
    const options = await passkeySignInOptions(deps, rp, null);
    if (!options.ok) throw new Error(options.error);
    const response = twin.device.get(options.options, { origin: ORIGIN });
    const patHandle = live.device.get(options.options, { origin: ORIGIN }).response.userHandle;
    expect(await passkeySignIn(deps, { ...response, response: { ...response.response, userHandle: patHandle } }, rp, "test")).toEqual({ ok: false, error: "invalid" });
    // Each agency sees only its own.
    expect((await inLive((tx) => tx.select().from(s.passkeys))).map((p) => p.userId)).toEqual([pat.userId]);
    expect((await inDemo((tx) => tx.select().from(s.passkeys))).map((p) => p.userId)).toEqual([twinId]);
  });

  it("keeps passkeys and challenges inside their agency unless in sign-in mode; the demo reset clears the demo's", async () => {
    const demo = await demoSignIn(deps, DEMO_AGENCY.id, LENA.id, "test");
    if (!demo.ok) throw new Error("demo");
    await withPasskey(demo.token);
    await inLive(async (tx) => {
      expect(await tx.select().from(s.passkeys)).toHaveLength(0);
      expect(await tx.select().from(s.webauthnChallenges)).toHaveLength(0);
      expect(await tx.update(s.passkeys).set({ removedAt: new Date() }).returning()).toHaveLength(0);
    });
    expect(await app.db.select().from(s.passkeys)).toHaveLength(0);
    await inDemo(async (tx) => expect(await tx.select().from(s.passkeys)).toHaveLength(1));
    await app.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.auth', 'on', true)`);
      expect(await tx.select().from(s.passkeys)).toHaveLength(1);
    });
    // The demo reset seeds the demo people again: their passkeys go with them.
    await inDemo(async (tx) => {
      await clearDemoAgency(tx);
      await seedDemoAgency(tx);
    });
    expect(await owner.db.select().from(s.passkeys)).toHaveLength(0);
  });
});
