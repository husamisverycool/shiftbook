/**
 * Passkeys (decision 0032), the pure judge: options, registration and sign-in checked with a software
 * authenticator — the right site and RP ID, user verification, single-use and expiring challenges, a
 * removed passkey, a member who is not active, a counter that went backwards.
 */
import { describe, expect, it } from "vitest";
import { SoftAuthenticator } from "../../../tests/support/soft-authenticator";
import {
  addressGroup,
  CHALLENGE_MS,
  challengeOf,
  defaultPasskeyName,
  judgeRegistration,
  judgeSignIn,
  registrationOptionsFor,
  relyingParty,
  signInOptionsFor,
  userHandleOf,
  type ChallengeRow,
  type StoredPasskey,
} from "./passkeys";

const rp = relyingParty("https://app.example/");
const ORIGIN = "https://app.example";
const NOW = new Date("2026-10-16T15:00:00Z");
const PERSON = { id: "6f1c2c1e-0b7e-4a39-9a51-3d2f2b8f6a10", email: "pat@agency.example", name: "Pat Lee" };
const OTHER = "0d9a3f52-6a43-4f5e-8f6c-1b2a3c4d5e6f";
const open = (purpose: ChallengeRow["purpose"], userId: string | null): ChallengeRow => ({ purpose, userId, expiresAt: new Date(NOW.getTime() + CHALLENGE_MS), usedAt: null });

/** A passkey registered through the judge, as the database would keep it. */
async function registered(device = new SoftAuthenticator()): Promise<{ device: SoftAuthenticator; stored: StoredPasskey }> {
  const options = await registrationOptionsFor(rp, PERSON, []);
  const response = device.create(options, { origin: ORIGIN });
  const r = await judgeRegistration({ response, challengeRow: open("register", PERSON.id), userId: PERSON.id, rp, now: NOW });
  if (!r.ok) throw new Error(r.reason);
  return { device, stored: { id: "pk1", userId: PERSON.id, agencyId: "agency", credentialId: r.passkey.credentialId, publicKey: r.passkey.publicKey, counter: r.passkey.counter, transports: r.passkey.transports, removedAt: null } };
}

describe("the visitor's address, as the caps and the throttle count it", () => {
  it("is an IPv4 address as it is, an IPv6 address's /64 network, an IPv4-mapped IPv6 address's IPv4", () => {
    expect(addressGroup("203.0.113.5")).toBe("203.0.113.5");
    expect(addressGroup("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
    expect(addressGroup("2001:0DB8:0001:0002::9")).toBe("2001:db8:1:2::/64");
    expect(addressGroup("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(addressGroup("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(addressGroup("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(addressGroup("::1")).toBe("0:0:0:0::/64");
  });
});

describe("the site a passkey belongs to", () => {
  it("is the base URL's hostname and origin", () => {
    expect(relyingParty("https://app.example/")).toEqual({ id: "app.example", origin: "https://app.example", name: "Tabulado" });
    expect(relyingParty("http://localhost:3600")).toEqual({ id: "localhost", origin: "http://localhost:3600", name: "Tabulado" });
  });
});

describe("adding a passkey", () => {
  it("asks for a discoverable, user-verified passkey, not one the person already has, with no attestation", async () => {
    const options = await registrationOptionsFor(rp, PERSON, [{ credentialId: "AAAAAAAAAAAAAAAAAAAAAA", transports: ["internal"] }]);
    expect(options.rp).toEqual({ id: "app.example", name: "Tabulado" });
    expect(options.user).toEqual({ id: userHandleOf(PERSON.id), name: PERSON.email, displayName: PERSON.name });
    expect(options.authenticatorSelection).toMatchObject({ residentKey: "required", requireResidentKey: true, userVerification: "required" });
    expect(options.attestation).toBe("none");
    expect(options.excludeCredentials).toEqual([{ id: "AAAAAAAAAAAAAAAAAAAAAA", type: "public-key", transports: ["internal"] }]);
    expect(options.timeout).toBe(CHALLENGE_MS);
    expect(options.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The user handle is the person's id as 16 bytes: no name, no email.
    expect(Buffer.from(userHandleOf(PERSON.id), "base64url").toString("hex")).toBe(PERSON.id.replaceAll("-", ""));
  });

  it("accepts a user-verified passkey from this site and keeps its key, counter, transports and device type", async () => {
    const options = await registrationOptionsFor(rp, PERSON, []);
    const response = new SoftAuthenticator().create(options, { origin: ORIGIN });
    expect(challengeOf(response)).toBe(options.challenge);
    const r = await judgeRegistration({ response, challengeRow: open("register", PERSON.id), userId: PERSON.id, rp, now: NOW });
    expect(r).toMatchObject({ ok: true, passkey: { credentialId: response.id, counter: 0, transports: ["hybrid", "internal"], deviceType: "multiDevice", backedUp: true } });
    expect(r.ok && r.passkey.publicKey.length).toBeGreaterThan(60);
  });

  it("refuses another site, another RP ID, and a device that did not check it was the person", async () => {
    const options = await registrationOptionsFor(rp, PERSON, []);
    const judge = (response: Parameters<typeof judgeRegistration>[0]["response"]) => judgeRegistration({ response, challengeRow: open("register", PERSON.id), userId: PERSON.id, rp, now: NOW });
    expect(await judge(new SoftAuthenticator().create(options, { origin: "https://app.example.evil.example" }))).toMatchObject({ ok: false, reason: "invalid" });
    expect(await judge(new SoftAuthenticator().create(options, { origin: ORIGIN, rpId: "evil.example" }))).toMatchObject({ ok: false, reason: "invalid" });
    expect(await judge(new SoftAuthenticator().create(options, { origin: ORIGIN, userVerified: false }))).toMatchObject({ ok: false, reason: "no_user_verification" });
    // Made inside a frame from another site.
    expect(await judge(new SoftAuthenticator().create(options, { origin: ORIGIN, crossOrigin: true }))).toMatchObject({ ok: false, reason: "cross_origin" });
  });

  it("refuses a challenge used before, expired, for someone else or for signing in", async () => {
    const options = await registrationOptionsFor(rp, PERSON, []);
    const response = new SoftAuthenticator().create(options, { origin: ORIGIN });
    const judge = (challengeRow: ChallengeRow | undefined, now = NOW) => judgeRegistration({ response, challengeRow, userId: PERSON.id, rp, now });
    expect(await judge({ ...open("register", PERSON.id), usedAt: NOW })).toMatchObject({ ok: false, reason: "challenge" });
    expect(await judge(open("register", PERSON.id), new Date(NOW.getTime() + CHALLENGE_MS + 1))).toMatchObject({ ok: false, reason: "challenge" });
    expect(await judge(open("register", OTHER))).toMatchObject({ ok: false, reason: "challenge" });
    expect(await judge(open("sign_in", null))).toMatchObject({ ok: false, reason: "challenge" });
    expect(await judge(undefined)).toMatchObject({ ok: false, reason: "challenge" });
  });

  it("names a passkey after its device type, in the person's language, numbered when the name is taken", () => {
    expect(defaultPasskeyName("multiDevice", "en", [])).toBe("Synced passkey");
    expect(defaultPasskeyName("singleDevice", "en", [])).toBe("Passkey on one device");
    expect(defaultPasskeyName("multiDevice", "es", [])).toBe("Llave de acceso sincronizada");
    expect(defaultPasskeyName("multiDevice", "en", ["Synced passkey"])).toBe("Synced passkey 2");
    expect(defaultPasskeyName("multiDevice", "en", ["Synced passkey", "Synced passkey 2"])).toBe("Synced passkey 3");
  });
});

describe("signing in with a passkey", () => {
  it("asks any of the site's passkeys (no list: the device offers its own), user verification required", async () => {
    const options = await signInOptionsFor(rp);
    expect(options).toMatchObject({ rpId: "app.example", userVerification: "required", timeout: CHALLENGE_MS });
    expect(options.allowCredentials ?? []).toEqual([]);
    expect(options.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("accepts the person's passkey from this site, the device having checked it was them", async () => {
    const { device, stored } = await registered();
    const options = await signInOptionsFor(rp);
    const response = device.get(options, { origin: ORIGIN });
    expect(challengeOf(response)).toBe(options.challenge);
    expect(await judgeSignIn({ response, challengeRow: open("sign_in", null), passkey: stored, member: { status: "active" }, rp, now: NOW })).toEqual({ ok: true, counter: 0, deviceType: "multiDevice", backedUp: true });
  });

  it("refuses another site, another RP ID, no user verification, another key, a handle naming someone else", async () => {
    const { device, stored } = await registered();
    const options = await signInOptionsFor(rp);
    const judge = (response: Parameters<typeof judgeSignIn>[0]["response"], passkey: StoredPasskey | undefined = stored) => judgeSignIn({ response, challengeRow: open("sign_in", null), passkey, member: { status: "active" }, rp, now: NOW });
    expect(await judge(device.get(options, { origin: "https://evil.example" }))).toMatchObject({ ok: false, reason: "invalid" });
    expect(await judge(device.get(options, { origin: ORIGIN, rpId: "evil.example" }))).toMatchObject({ ok: false, reason: "invalid" });
    expect(await judge(device.get(options, { origin: ORIGIN, userVerified: false }))).toMatchObject({ ok: false, reason: "no_user_verification" });
    // A signature by a key other than the stored one.
    const impostor = await registered();
    expect(await judge({ ...impostor.device.get(options, { origin: ORIGIN }), id: stored.credentialId, rawId: stored.credentialId })).toMatchObject({ ok: false, reason: "invalid" });
    const response = device.get(options, { origin: ORIGIN });
    expect(await judge({ ...response, response: { ...response.response, userHandle: userHandleOf(OTHER) } })).toMatchObject({ ok: false, reason: "user_handle" });
    // A discoverable passkey always returns its user handle: one without is refused.
    expect(await judge(device.get(options, { origin: ORIGIN, withoutUserHandle: true }))).toMatchObject({ ok: false, reason: "user_handle" });
    // Asked from inside a frame from another site.
    expect(await judge(device.get(options, { origin: ORIGIN, crossOrigin: true }))).toMatchObject({ ok: false, reason: "cross_origin" });
    // No passkey with that id, or the one found is another.
    expect(await judgeSignIn({ response, challengeRow: open("sign_in", null), passkey: undefined, member: { status: "active" }, rp, now: NOW })).toMatchObject({ ok: false, reason: "unknown_passkey" });
    expect(await judge(response, { ...stored, credentialId: "another" })).toMatchObject({ ok: false, reason: "unknown_passkey" });
  });

  it("refuses a replayed or expired challenge", async () => {
    const { device, stored } = await registered();
    const options = await signInOptionsFor(rp);
    const response = device.get(options, { origin: ORIGIN });
    const judge = (challengeRow: ChallengeRow | undefined, now = NOW) => judgeSignIn({ response, challengeRow, passkey: stored, member: { status: "active" }, rp, now });
    expect(await judge({ ...open("sign_in", null), usedAt: NOW })).toMatchObject({ ok: false, reason: "challenge" });
    expect(await judge(open("sign_in", null), new Date(NOW.getTime() + CHALLENGE_MS + 1))).toMatchObject({ ok: false, reason: "challenge" });
    expect(await judge(open("register", PERSON.id))).toMatchObject({ ok: false, reason: "challenge" });
    expect(await judge(undefined)).toMatchObject({ ok: false, reason: "challenge" });
  });

  it("refuses a removed passkey and a member who is suspended, invited or gone", async () => {
    const { device, stored } = await registered();
    const options = await signInOptionsFor(rp);
    const response = device.get(options, { origin: ORIGIN });
    const judge = (passkey: StoredPasskey, member: { status: "active" | "invited" | "suspended" } | undefined) => judgeSignIn({ response, challengeRow: open("sign_in", null), passkey, member, rp, now: NOW });
    expect(await judge({ ...stored, removedAt: NOW }, { status: "active" })).toMatchObject({ ok: false, reason: "removed" });
    expect(await judge(stored, { status: "suspended" })).toMatchObject({ ok: false, reason: "member_inactive" });
    expect(await judge(stored, { status: "invited" })).toMatchObject({ ok: false, reason: "member_inactive" });
    expect(await judge(stored, undefined)).toMatchObject({ ok: false, reason: "member_inactive" });
  });

  it("refuses a counter that did not go up (a copied authenticator); a counter that stays 0 is a synced passkey", async () => {
    const { device, stored } = await registered(new SoftAuthenticator({ userVerified: true, synced: false, counts: true }));
    const options = await signInOptionsFor(rp);
    const judge = (counter: number, storedCounter: number) => judgeSignIn({ response: device.get(options, { origin: ORIGIN, counter }), challengeRow: open("sign_in", null), passkey: { ...stored, counter: storedCounter }, member: { status: "active" }, rp, now: NOW });
    expect(await judge(6, 5)).toEqual({ ok: true, counter: 6, deviceType: "singleDevice", backedUp: false });
    expect(await judge(3, 5)).toMatchObject({ ok: false, reason: "counter" });
    expect(await judge(5, 5)).toMatchObject({ ok: false, reason: "counter" });
    expect(await judge(0, 5)).toMatchObject({ ok: false, reason: "counter" });
    expect(await judge(0, 0)).toMatchObject({ ok: true, counter: 0 });
  });

  it("reads a response's challenge, or nothing from a malformed one", () => {
    const data = (json: string) => ({ response: { clientDataJSON: Buffer.from(json).toString("base64url") } });
    expect(challengeOf(data(JSON.stringify({ type: "webauthn.get", challenge: "abc_-123" })))).toBe("abc_-123");
    expect(challengeOf(data("not json"))).toBeNull();
    expect(challengeOf(data(JSON.stringify({ challenge: 42 })))).toBeNull();
    expect(challengeOf({ response: { clientDataJSON: "" } })).toBeNull();
  });
});
