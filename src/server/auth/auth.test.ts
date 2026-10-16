import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appKey, digest, randomToken, sameText, seal, unseal } from "./crypto";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { newRecoveryCodes, unusedCodes, spendRecoveryCode } from "./recovery";
import { base32Decode, base32Encode, hotp, otpauthUri, stepAt, verifyTotp } from "./totp";

describe("six-digit codes (RFC 4226, RFC 6238)", () => {
  // The RFCs' own test secret: the ASCII digits "12345678901234567890".
  const secret = Buffer.from("12345678901234567890", "ascii");

  it("HOTP matches RFC 4226 Appendix D for counters 0 to 9", () => {
    expect(Array.from({ length: 10 }, (_, i) => hotp(secret, i))).toEqual(["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"]);
  });

  it("TOTP matches RFC 6238 Appendix B (SHA-1, 8 digits)", () => {
    const at = (t: number) => hotp(secret, stepAt(t), 8);
    expect([59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000].map(at)).toEqual(["94287082", "07081804", "14050471", "89005924", "69279037", "65353130"]);
  });

  it("accepts the current step and one either side, never a step used before, only six digits", () => {
    const t = 1_800_000_000;
    const now = stepAt(t);
    expect(verifyTotp(secret, hotp(secret, now), t, null)).toBe(now);
    expect(verifyTotp(secret, hotp(secret, now - 1), t, null)).toBe(now - 1);
    expect(verifyTotp(secret, hotp(secret, now + 1), t, null)).toBe(now + 1);
    expect(verifyTotp(secret, hotp(secret, now - 2), t, null)).toBeNull();
    // Replay: the step just used, or an earlier one, is refused.
    expect(verifyTotp(secret, hotp(secret, now), t, now)).toBeNull();
    expect(verifyTotp(secret, hotp(secret, now - 1), t, now - 1)).toBeNull();
    expect(verifyTotp(secret, "12345", t, null)).toBeNull();
    expect(verifyTotp(secret, `${hotp(secret, now).slice(0, 3)} ${hotp(secret, now).slice(3)}`, t, null)).toBe(now);
  });

  it("base32 as RFC 4648 section 10 writes it (no padding), and back", () => {
    expect(["", "f", "fo", "foo", "foob", "fooba", "foobar"].map((s) => base32Encode(Buffer.from(s)))).toEqual(["", "MY", "MZXQ", "MZXW6", "MZXW6YQ", "MZXW6YTB", "MZXW6YTBOI"]);
    expect(base32Decode("mzxw 6ytb-oi").toString()).toBe("foobar");
    const s = randomBytes(20);
    expect(base32Decode(base32Encode(s)).equals(s)).toBe(true);
  });

  it("the authenticator link names the issuer and the account", () => {
    expect(otpauthUri("Shiftbook", "owner@agency.example", Buffer.from("foobar"))).toBe("otpauth://totp/Shiftbook%3Aowner%40agency.example?secret=MZXW6YTBOI&issuer=Shiftbook&algorithm=SHA1&digits=6&period=30");
  });
});

describe("passwords (OWASP scrypt; NIST SP 800-63B-4 lengths)", () => {
  it("hashes with a salt and checks in constant time", async () => {
    const a = await hashPassword("correct horse battery staple");
    const b = await hashPassword("correct horse battery staple");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(await verifyPassword("correct horse battery staple", a)).toBe(true);
    expect(await verifyPassword("correct horse battery stapl", a)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "plain")).toBe(false);
  }, 20_000);

  it("at least 15 characters, at most 128, not the email, not one character repeated; no composition rules", () => {
    expect(passwordProblem("short pass", "a@b.example")).toBe("too_short");
    expect(passwordProblem("x".repeat(129), "a@b.example")).toBe("too_long");
    expect(passwordProblem("aaaaaaaaaaaaaaaaaaaa", "a@b.example")).toBe("one_character");
    expect(passwordProblem("Someone@Agency.example", "someone@agency.example")).toBe("is_email");
    expect(passwordProblem("all lowercase words here", "a@b.example")).toBeNull();
    expect(passwordProblem("pájaro azul y río largo", "a@b.example")).toBeNull();
  });
});

describe("recovery codes", () => {
  it("ten codes shown once, stored as digests, each used once", () => {
    const { codes, stored } = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    expect(JSON.stringify(stored)).not.toContain(codes[0]!.replace("-", ""));
    const at = new Date("2026-10-16T12:00:00Z");
    const after = spendRecoveryCode(stored, codes[3]!.toLowerCase().replace("-", " "), at)!;
    expect(unusedCodes(after)).toBe(9);
    expect(spendRecoveryCode(after, codes[3]!, at)).toBeNull();
    expect(spendRecoveryCode(after, "AAAAA-AAAAA", at)).toBeNull();
  });
});

describe("sealed secrets and tokens", () => {
  it("AES-256-GCM: opens with the same key and place, never with another", () => {
    const key = randomBytes(32);
    const s = seal(Buffer.from("secret"), key, "user:1");
    expect(unseal(s, key, "user:1").toString()).toBe("secret");
    expect(() => unseal(s, key, "user:2")).toThrow();
    expect(() => unseal(s, randomBytes(32), "user:1")).toThrow();
    expect(() => unseal({ ...s, data: Buffer.from("x").toString("base64") }, key, "user:1")).toThrow();
  });

  it("the demo key is stable and 32 bytes; tokens are random and stored as digests", () => {
    expect(appKey().length).toBe(32);
    expect(appKey().equals(appKey())).toBe(true);
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(t);
    expect(digest(t)).toMatch(/^[0-9a-f]{64}$/);
    expect([sameText("abc", "abc"), sameText("abc", "abd"), sameText("abc", "abcd")]).toEqual([true, false, false]);
  });
});
