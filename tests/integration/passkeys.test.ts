/**
 * Passkeys through the database (decision 0032): added after confirming it's you, signed in with as
 * both steps, refused when removed, suspended, replayed, expired, copied (counter) or from another
 * site; the throttle; the cap on open sign-in challenges; the log; row-level security; the demo reset.
 */
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
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
const theOwner = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: "Demo Owner (demo)", role: "owner" as const };
const PASSWORD = "a long enough passphrase";
const rp = relyingParty("https://app.example");
const ORIGIN = "https://app.example";
const LENA = DEMO_PEOPLE.find((p) => p.role === "coordinator")!;
const render = (link: string): LinkMail => ({ subject: "Join", text: `Open ${link}`, html: `<a href="${link}">Join</a>` });
const linkIn = (m: OutgoingMail) => /sbau_[A-Za-z0-9_-]{43}/.exec(m.text)![0];
const later = (ms: number) => (clock = new Date(clock.getTime() + ms));
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(DEMO_AGENCY.id, fn);
const eventsOf = (userId: string) => inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "user"), eq(s.auditEvents.entityId, userId))).orderBy(s.auditEvents.id));

beforeEach(async () => {
  sent.length = 0;
  clock = new Date("2026-10-16T15:00:00Z");
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await owner.db.delete(s.sessions);
  await owner.db.delete(s.signInFailures);
  await owner.db.delete(s.webauthnChallenges);
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

/** Someone invited with a role, joined with a password; their (possibly half) session token. */
async function invited(role: "coordinator" | "billing", email = "pat@agency.example") {
  const r = await inviteMember(deps, theOwner, { name: "Pat Lee", email, role, locale: "en" }, render, "https://app.example");
  if (!r.ok) throw new Error(r.error);
  const accepted = await redeemLink(deps, linkIn(sent.at(-1)!), "invite", PASSWORD, "test");
  if (!accepted.ok) throw new Error(accepted.error);
  return { userId: r.userId, token: accepted.token, next: accepted.next };
}

/** A passkey added in this session (already confirmed); the device that holds it. */
async function withPasskey(token: string, device = new SoftAuthenticator(), locale?: string) {
  const session = (await readSession(deps, token))!;
  const options = await passkeyRegistrationOptions(deps, session, rp);
  if (!options.ok) throw new Error(options.error);
  const added = await addPasskey(deps, session, device.create(options.options, { origin: ORIGIN }), rp, locale);
  if (!added.ok) throw new Error(added.error);
  return { device, passkey: added.passkey };
}

/** One passkey sign-in ceremony from this device. */
async function passkeyIn(device: SoftAuthenticator, o: { origin?: string; counter?: number; address?: string | null } = {}) {
  const options = await passkeySignInOptions(deps, rp, o.address ?? null);
  if (!options.ok) throw new Error(options.error);
  const response = device.get(options.options, { origin: o.origin ?? ORIGIN, counter: o.counter });
  return { response, result: await passkeySignIn(deps, response, rp, "test", o.address ?? null) };
}

describe("passkeys through the database", () => {
  it("a coordinator adds one after confirming it's them, then signs in with it as both steps; counter, last use and the log kept", async () => {
    const pat = await invited("coordinator");
    expect(pat.next).toBe("setup");
    // A half session (the authenticator a coordinator needs is still owed) cannot add one.
    expect(await passkeyRegistrationOptions(deps, (await readSession(deps, pat.token))!, rp)).toEqual({ ok: false, error: "expired" });
    const setup = await beginAuthenticatorSetup(deps, (await readSession(deps, pat.token))!);
    if (!setup.ok) throw new Error(setup.error);
    const code = (at: Date) => hotp(base32Decode(setup.setupKey), stepAt(Math.floor(at.getTime() / 1000)));
    if (!(await confirmAuthenticator(deps, (await readSession(deps, pat.token))!, code(clock))).ok) throw new Error("setup");

    // More than 15 minutes later, "confirm it's you" comes first (GitHub asks before "Add a passkey").
    later(16 * 60_000);
    expect(await passkeyRegistrationOptions(deps, (await readSession(deps, pat.token))!, rp)).toEqual({ ok: false, error: "confirm" });
    expect(await confirmAccess(deps, (await readSession(deps, pat.token))!, code(clock))).toEqual({ ok: true });
    const { device, passkey } = await withPasskey(pat.token);
    expect(passkey).toMatchObject({ name: "Synced passkey", deviceType: "multiDevice", backedUp: true, lastUsedAt: null });
    expect((await listPasskeys(deps, { userId: pat.userId, agencyId: DEMO_AGENCY.id })).map((p) => p.name)).toEqual(["Synced passkey"]);
    // The key is kept as bytes, the challenge only as its digest.
    const [kept] = await owner.db.select().from(s.passkeys).where(eq(s.passkeys.userId, pat.userId));
    expect(kept!.publicKey).toBeInstanceOf(Uint8Array);
    expect(kept!.publicKey.length).toBeGreaterThan(60);
    expect(kept!.transports).toEqual(["hybrid", "internal"]);
    const challenges = await owner.db.select().from(s.webauthnChallenges);
    expect(challenges.every((c) => /^[0-9a-f]{64}$/.test(c.challengeHash))).toBe(true);
    await endSession(deps, pat.token);

    // The password still asks the code; the passkey is both steps.
    later(60_000);
    const byPassword = await signIn(deps, "pat@agency.example", PASSWORD, "test");
    expect(byPassword).toMatchObject({ ok: true, next: "code" });
    const { response, result } = await passkeyIn(device);
    if (!result.ok) throw new Error(result.error);
    expect(result.locale).toBe("en");
    const session = (await readSession(deps, result.token))!;
    expect(session).toMatchObject({ userId: pat.userId, role: "coordinator", demo: false });
    expect(session.secondStepAt).not.toBeNull();
    expect(nextStep(session)).toBe("done");
    const [used] = await owner.db.select().from(s.passkeys).where(eq(s.passkeys.userId, pat.userId));
    expect(used!.lastUsedAt).toEqual(clock);

    // The same response again: its challenge was spent.
    expect(await passkeySignIn(deps, response, rp, "test")).toEqual({ ok: false, error: "invalid" });

    const events = await eventsOf(pat.userId);
    expect(events.filter((e) => e.action === "passkey_added").map((e) => e.after)).toEqual([{ passkey: passkey.id, name: "Synced passkey", synced: true }]);
    expect(events.filter((e) => e.action === "sign_in").map((e) => e.after)).toContainEqual({ method: "passkey", passkey: passkey.id });
    expect(events.filter((e) => e.action === "sign_in_failed").map((e) => e.after)).toContainEqual({ step: "passkey", reason: "challenge", passkey: passkey.id });
    // Nothing in the log holds a credential id or a key.
    expect(JSON.stringify(events)).not.toContain(kept!.credentialId);
  });

  it("the demo coordinator adds one in the shared demo session (never asked to confirm) and is in with it, no authenticator needed", async () => {
    const demo = await demoSignIn(deps, DEMO_AGENCY.id, LENA.id, "test");
    if (!demo.ok) throw new Error("demo");
    later(60 * 60_000);
    const { device, passkey } = await withPasskey(demo.token);
    expect(passkey.name).toBe("Synced passkey");
    await endSession(deps, demo.token);
    const { result } = await passkeyIn(device);
    if (!result.ok) throw new Error(result.error);
    const session = (await readSession(deps, result.token))!;
    expect(session).toMatchObject({ userId: LENA.id, demo: false, hasAuthenticator: false });
    expect(nextStep(session)).toBe("done");
    // The signed-out demo session is gone; in the passkey's session a second passkey gets a name of its own.
    expect(await readSession(deps, demo.token)).toBeNull();
    const again = await withPasskey(result.token);
    expect(again.passkey.name).toBe("Synced passkey 2");
    // Named in the language of the page she is on (a demo visitor may browse in Spanish).
    expect((await withPasskey(result.token, new SoftAuthenticator(), "es")).passkey.name).toBe("Llave de acceso sincronizada");
  });

  it("refuses a passkey made without user verification, or for someone else's challenge", async () => {
    const pat = await invited("billing");
    const session = (await readSession(deps, pat.token))!;
    const options = await passkeyRegistrationOptions(deps, session, rp);
    if (!options.ok) throw new Error(options.error);
    const lazy = new SoftAuthenticator({ userVerified: false, synced: true, counts: false });
    expect(await addPasskey(deps, session, lazy.create(options.options, { origin: ORIGIN }), rp)).toEqual({ ok: false, error: "invalid" });
    // That challenge is spent, refused or not.
    expect(await addPasskey(deps, session, new SoftAuthenticator().create(options.options, { origin: ORIGIN }), rp)).toEqual({ ok: false, error: "invalid" });
    // Pat's challenge cannot add a passkey to the demo coordinator.
    const fresh = await passkeyRegistrationOptions(deps, session, rp);
    if (!fresh.ok) throw new Error(fresh.error);
    const demo = await demoSignIn(deps, DEMO_AGENCY.id, LENA.id, "test");
    if (!demo.ok) throw new Error("demo");
    expect(await addPasskey(deps, (await readSession(deps, demo.token))!, new SoftAuthenticator().create(fresh.options, { origin: ORIGIN }), rp)).toEqual({ ok: false, error: "invalid" });
    expect(await owner.db.select().from(s.passkeys)).toHaveLength(0);
  });

  it("removing needs confirmation; a removed passkey, a suspended member and a counter that went back are refused and logged", async () => {
    const pat = await invited("billing");
    const counting = new SoftAuthenticator({ userVerified: true, synced: false, counts: true });
    const { device, passkey } = await withPasskey(pat.token, counting);
    expect(passkey.name).toBe("Passkey on one device");
    expect((await passkeyIn(device, { counter: 3 })).result.ok).toBe(true);
    // A copy of the authenticator answers with a counter that did not go up.
    expect((await passkeyIn(device, { counter: 3 })).result).toEqual({ ok: false, error: "invalid" });
    expect((await passkeyIn(device, { counter: 2 })).result).toEqual({ ok: false, error: "invalid" });
    expect((await passkeyIn(device, { counter: 4 })).result.ok).toBe(true);

    // Suspended: refused; active again: in.
    expect(await setSuspended(deps, theOwner, pat.userId, true)).toEqual({ ok: true });
    expect((await passkeyIn(device, { counter: 5 })).result).toEqual({ ok: false, error: "invalid" });
    expect(await setSuspended(deps, theOwner, pat.userId, false)).toEqual({ ok: true });
    const back = (await passkeyIn(device, { counter: 6 })).result;
    if (!back.ok) throw new Error(back.error);

    // Removing: confirmation after 15 minutes; someone else's id is not found.
    later(16 * 60_000);
    const stale = (await readSession(deps, back.token))!;
    expect(await removePasskey(deps, stale, passkey.id)).toEqual({ ok: false, error: "confirm" });
    expect(await confirmAccess(deps, stale, PASSWORD)).toEqual({ ok: true });
    const fresh = (await readSession(deps, back.token))!;
    expect(await removePasskey(deps, fresh, "00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, error: "not_found" });
    expect(await removePasskey(deps, fresh, "not an id")).toEqual({ ok: false, error: "not_found" });
    expect(await removePasskey(deps, fresh, passkey.id)).toEqual({ ok: true });
    expect(await removePasskey(deps, fresh, passkey.id)).toEqual({ ok: false, error: "not_found" });
    expect(await listPasskeys(deps, { userId: pat.userId, agencyId: DEMO_AGENCY.id })).toEqual([]);
    expect((await passkeyIn(device, { counter: 7 })).result).toEqual({ ok: false, error: "invalid" });

    const events = await eventsOf(pat.userId);
    expect(events.filter((e) => e.action === "sign_in_failed").map((e) => (e.after as { reason: string }).reason)).toEqual(["counter", "counter", "member_inactive", "removed"]);
    expect(events.filter((e) => e.action === "passkey_removed").map((e) => e.before)).toEqual([{ passkey: passkey.id, name: "Passkey on one device" }]);
    expect(events.filter((e) => e.action === "sign_in" && (e.after as { method: string }).method === "passkey")).toHaveLength(3);
  });

  it("refuses another site and an expired challenge; ten refusals from one address make it wait 15 minutes", async () => {
    const pat = await invited("billing");
    const { device } = await withPasskey(pat.token);
    expect((await passkeyIn(device, { origin: "https://app.example.evil.example" })).result).toEqual({ ok: false, error: "invalid" });
    // An expired challenge.
    const options = await passkeySignInOptions(deps, rp, null);
    if (!options.ok) throw new Error(options.error);
    const response = device.get(options.options, { origin: ORIGIN });
    later(CHALLENGE_MS + 1000);
    expect(await passkeySignIn(deps, response, rp, "test")).toEqual({ ok: false, error: "invalid" });
    // Expired challenges are swept when new ones are made.
    await passkeySignInOptions(deps, rp, null);
    expect((await owner.db.select().from(s.webauthnChallenges)).every((c) => c.expiresAt > clock)).toBe(true);

    const here = "203.0.113.5";
    for (let i = 0; i < 10; i += 1) expect((await passkeyIn(device, { origin: "https://evil.example", address: here })).result).toEqual({ ok: false, error: "invalid" });
    expect((await passkeyIn(device, { address: here })).result).toEqual({ ok: false, error: "locked" });
    // Elsewhere, and later, it works; a success clears this passkey's count from that address.
    expect((await passkeyIn(device, { address: "198.51.100.7" })).result.ok).toBe(true);
    later(16 * 60_000);
    expect((await passkeyIn(device, { address: here })).result.ok).toBe(true);
    const events = await eventsOf(pat.userId);
    expect(events.filter((e) => e.action === "sign_in_failed").map((e) => (e.after as { reason: string }).reason)).toEqual(["invalid", "challenge", ...Array(10).fill("invalid")]);
  });

  it("at most 20 open sign-in challenges per address; an unknown passkey answers like any refusal", async () => {
    const here = "203.0.113.6";
    for (let i = 0; i < 20; i += 1) expect((await passkeySignInOptions(deps, rp, here)).ok).toBe(true);
    expect(await passkeySignInOptions(deps, rp, here)).toEqual({ ok: false, error: "locked" });
    expect((await passkeySignInOptions(deps, rp, "198.51.100.8")).ok).toBe(true);
    expect((await passkeySignInOptions(deps, rp, null)).ok).toBe(true);
    // Five minutes on, those have lapsed.
    later(CHALLENGE_MS + 1000);
    expect((await passkeySignInOptions(deps, rp, here)).ok).toBe(true);
    // A passkey nobody added.
    const stranger = new SoftAuthenticator();
    const reg = await passkeySignInOptions(deps, rp, null);
    if (!reg.ok) throw new Error(reg.error);
    stranger.create({ challenge: "x", rp: { id: rp.id, name: rp.name }, user: { id: "AAAAAAAAAAAAAAAAAAAAAA", name: "x", displayName: "x" }, pubKeyCredParams: [{ type: "public-key", alg: -7 }] }, { origin: ORIGIN });
    expect(await passkeySignIn(deps, stranger.get(reg.options, { origin: ORIGIN }), rp, "test")).toEqual({ ok: false, error: "invalid" });
  });

  it("keeps passkeys and challenges inside their agency unless in sign-in mode; the demo reset clears the demo's", async () => {
    const demo = await demoSignIn(deps, DEMO_AGENCY.id, LENA.id, "test");
    if (!demo.ok) throw new Error("demo");
    await withPasskey(demo.token);
    const [other] = await owner.db.insert(s.agencies).values({ name: "Other agency (test)" }).returning();
    await app.withAgency(other!.id, async (tx) => {
      expect(await tx.select().from(s.passkeys)).toHaveLength(0);
      expect(await tx.select().from(s.webauthnChallenges)).toHaveLength(0);
      expect(await tx.update(s.passkeys).set({ removedAt: new Date() }).returning()).toHaveLength(0);
    });
    expect(await app.db.select().from(s.passkeys)).toHaveLength(0);
    await inAgency(async (tx) => expect(await tx.select().from(s.passkeys)).toHaveLength(1));
    await app.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.auth', 'on', true)`);
      expect(await tx.select().from(s.passkeys)).toHaveLength(1);
    });
    // The demo reset seeds the demo people again: their passkeys go with them.
    await inAgency(async (tx) => {
      await clearDemoAgency(tx);
      await seedDemoAgency(tx);
    });
    expect(await owner.db.select().from(s.passkeys)).toHaveLength(0);
  });
});
