/**
 * The OpenID Connect client (decision 0033): every refusal OpenID Connect Core §3.1.3.7 asks of an ID
 * token, with keys made here for each run (never kept anywhere), PKCE (RFC 7636), the discovery
 * document, the code exchange and the sealed request cookie.
 */
import { randomBytes } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK, type JWTPayload } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  authorizationUrl,
  exchangeCode,
  GOOGLE_ISSUERS,
  identityOf,
  newAuthRequest,
  OidcError,
  openRequest,
  parseDiscovery,
  pkceChallenge,
  sealRequest,
  verifyIdToken,
  type Discovery,
  type IssuerRule,
  type OidcClient,
} from "./oidc";

const NOW = new Date("2026-10-16T15:00:00Z");
const nowS = Math.floor(NOW.getTime() / 1000);
const CLIENT = "client-123.apps.example";
const NONCE = "n-0S6_WzA2Mj";
const GOOGLE: IssuerRule = { kind: "exact", values: GOOGLE_ISSUERS };
const TENANT = "72f988bf-86f1-41af-91ab-2d7cd011db47";
const MICROSOFT: IssuerRule = { kind: "tenant", template: "https://login.microsoftonline.com/{tenantid}/v2.0" };

let rsa: CryptoKeyPair;
let ec: CryptoKeyPair;
let stranger: CryptoKeyPair;
let rsa384: CryptoKeyPair;
let jwks: ReturnType<typeof createLocalJWKSet>;
let rsaJwk: JWK;

beforeAll(async () => {
  rsa = await generateKeyPair("RS256", { extractable: true });
  ec = await generateKeyPair("ES256", { extractable: true });
  stranger = await generateKeyPair("RS256", { extractable: true });
  rsa384 = await generateKeyPair("RS384", { extractable: true });
  rsaJwk = { ...(await exportJWK(rsa.publicKey)), kid: "rsa-1", use: "sig" };
  const ecJwk = { ...(await exportJWK(ec.publicKey)), kid: "ec-1", alg: "ES256", use: "sig" };
  // Published without "alg", so only the allow-list stands between an RS384 token and acceptance.
  const rsa384Jwk = { ...(await exportJWK(rsa384.publicKey)), kid: "rsa-384", use: "sig" };
  jwks = createLocalJWKSet({ keys: [rsaJwk, ecJwk, rsa384Jwk] });
});

const base = (over: JWTPayload = {}): JWTPayload => ({ iss: "https://accounts.google.com", aud: CLIENT, sub: "1098765432101234567", iat: nowS - 5, exp: nowS + 600, nonce: NONCE, email: "lena@example.com", email_verified: true, ...over });

async function signed(payload: JWTPayload, opts: { alg?: string; key?: CryptoKey | Uint8Array; kid?: string } = {}): Promise<string> {
  const alg = opts.alg ?? "RS256";
  const jwt = new SignJWT(payload).setProtectedHeader({ alg, kid: opts.kid ?? (alg.startsWith("ES") ? "ec-1" : "rsa-1"), typ: "JWT" });
  return jwt.sign(opts.key ?? (alg.startsWith("ES") ? ec.privateKey : rsa.privateKey));
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const verify = (token: string, over: Partial<Parameters<typeof verifyIdToken>[1]> = {}) => verifyIdToken(token, { keys: jwks, issuer: GOOGLE, clientId: CLIENT, nonce: NONCE, now: NOW, ...over });
async function refused(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (error) {
    expect(error).toBeInstanceOf(OidcError);
    return (error as OidcError).reason;
  }
  throw new Error("expected a refusal");
}

describe("ID token verification (OpenID Connect Core §3.1.3.7)", () => {
  it("accepts a token signed RS256 or ES256 by the issuer's key, and reads the identity from it", async () => {
    const claims = await verify(await signed(base()));
    expect(identityOf("google", claims)).toEqual({ issuer: "https://accounts.google.com", subject: "1098765432101234567", email: "lena@example.com", emailVerified: true, name: null });
    expect((await verify(await signed(base(), { alg: "ES256" }))).sub).toBe("1098765432101234567");
  });

  it("refuses an unsigned token (alg none)", async () => {
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64(base())}.`;
    expect(await refused(verify(none))).toBe("signature");
  });

  it("refuses HS256, including the public key used as a shared secret (algorithm confusion)", async () => {
    expect(await refused(verify(await signed(base(), { alg: "HS256", key: randomBytes(32) })))).toBe("signature");
    const publicBytes = new TextEncoder().encode(JSON.stringify(rsaJwk));
    expect(await refused(verify(await signed(base(), { alg: "HS256", key: publicBytes })))).toBe("signature");
  });

  it("refuses an algorithm outside the allow-list even with the right key (RS384)", async () => {
    expect(await refused(verify(await signed(base(), { alg: "RS384", key: rsa384.privateKey, kid: "rsa-384" })))).toBe("signature");
  });

  it("refuses a signature by a key the issuer did not publish, and a token changed after signing", async () => {
    expect(await refused(verify(await signed(base(), { key: stranger.privateKey })))).toBe("signature");
    const [h, , sig] = (await signed(base())).split(".");
    expect(await refused(verify(`${h}.${b64(base({ email: "owner@example.com" }))}.${sig}`))).toBe("signature");
  });

  it("checks the issuer: Google's two spellings, nothing else", async () => {
    expect((await verify(await signed(base({ iss: "accounts.google.com" })))).iss).toBe("accounts.google.com");
    expect(await refused(verify(await signed(base({ iss: "https://accounts.google.com.example" }))))).toBe("issuer");
    expect(await refused(verify(await signed(base({ iss: undefined }))))).toBe("issuer");
  });

  it("checks a Microsoft issuer against the token's own tenant (tid), which must be a GUID", async () => {
    const ms = (over: JWTPayload) => signed(base({ iss: `https://login.microsoftonline.com/${TENANT}/v2.0`, tid: TENANT, ...over }));
    expect((await verify(await ms({}), { issuer: MICROSOFT })).tid).toBe(TENANT);
    expect(await refused(verify(await ms({ tid: "9188040d-6c67-4c5b-b112-36a304b66dad" }), { issuer: MICROSOFT }))).toBe("issuer");
    expect(await refused(verify(await ms({ tid: undefined }), { issuer: MICROSOFT }))).toBe("issuer");
    expect(await refused(verify(await ms({ iss: "https://login.microsoftonline.com/x/v2.0", tid: "x" }), { issuer: MICROSOFT }))).toBe("issuer");
    expect(await refused(verify(await ms({ iss: "https://login.microsoftonline.com/{tenantid}/v2.0", tid: "{tenantid}" }), { issuer: MICROSOFT }))).toBe("issuer");
  });

  it("checks the audience is exactly this client, and azp when present", async () => {
    expect(await refused(verify(await signed(base({ aud: "someone-else" }))))).toBe("audience");
    expect(await refused(verify(await signed(base({ aud: [CLIENT, "someone-else"], azp: CLIENT }))))).toBe("audience");
    expect(await refused(verify(await signed(base({ azp: "someone-else" }))))).toBe("audience");
    expect((await verify(await signed(base({ aud: [CLIENT], azp: CLIENT })))).azp).toBe(CLIENT);
  });

  it("checks exp, nbf and iat with 60 seconds of skew; exp and iat must be there", async () => {
    expect((await verify(await signed(base({ exp: nowS - 30 })))).sub).toBeTruthy();
    expect(await refused(verify(await signed(base({ exp: nowS - 61 }))))).toBe("expired");
    expect(await refused(verify(await signed(base({ exp: undefined }))))).toBe("claims");
    expect(await refused(verify(await signed(base({ nbf: nowS + 120 }))))).toBe("claims");
    expect(await refused(verify(await signed(base({ iat: nowS + 120 }))))).toBe("claims");
    expect(await refused(verify(await signed(base({ iat: nowS - 12 * 60 }))))).toBe("expired");
    expect(await refused(verify(await signed(base({ iat: undefined }))))).toBe("claims");
  });

  it("checks the nonce is the one this browser's request sent", async () => {
    expect(await refused(verify(await signed(base({ nonce: "another" }))))).toBe("nonce");
    expect(await refused(verify(await signed(base({ nonce: undefined }))))).toBe("nonce");
  });

  it("needs a subject", async () => {
    expect(await refused(verify(await signed(base({ sub: undefined }))))).toBe("claims");
    expect(await refused(verify(await signed(base({ sub: "" }))))).toBe("claims");
  });

  it("refuses something that is not a JWT at all", async () => {
    expect(await refused(verify("not.a.token"))).toBe("signature");
    expect(await refused(verify(""))).toBe("signature");
  });
});

describe("what counts as a verified email (decision 0033)", () => {
  it("Google: email_verified true; Microsoft: only xms_edov true; an agency's provider: email_verified true", () => {
    expect(identityOf("google", { iss: "https://accounts.google.com", sub: "1", email: "A@Example.com", email_verified: true }).email).toBe("a@example.com");
    expect(identityOf("google", { iss: "x", sub: "1", email: "a@example.com", email_verified: false }).emailVerified).toBe(false);
    expect(identityOf("google", { iss: "x", sub: "1", email: "a@example.com" }).emailVerified).toBe(false);
    // Microsoft's email claim is not proof of anything without xms_edov.
    expect(identityOf("microsoft", { iss: "x", sub: "1", email: "a@example.com", email_verified: true }).emailVerified).toBe(false);
    expect(identityOf("microsoft", { iss: "x", sub: "1", email: "a@example.com", xms_edov: true }).emailVerified).toBe(true);
    expect(identityOf("microsoft", { iss: "x", sub: "1", email: "a@example.com", xms_edov: false }).emailVerified).toBe(false);
    expect(identityOf("sso", { iss: "x", sub: "1", email: "a@example.com", email_verified: true }).emailVerified).toBe(true);
    expect(identityOf("sso", { iss: "x", sub: "1", email: "a@example.com", email_verified: "yes" }).emailVerified).toBe(false);
    // No email: never verified.
    expect(identityOf("google", { iss: "x", sub: "1", email_verified: true })).toMatchObject({ email: null, emailVerified: false });
  });
});

describe("the request: PKCE, state and nonce, the authorization address", () => {
  it("makes the S256 challenge of RFC 7636 Appendix B", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("makes a fresh random state, nonce and verifier each time", () => {
    const a = newAuthRequest();
    const b = newAuthRequest();
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
  });

  it("asks for a code with openid, email and profile, the state, nonce and S256 challenge", () => {
    const d: Discovery = { issuer: "https://accounts.google.com", authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth", tokenEndpoint: "https://oauth2.googleapis.com/token", jwksUri: "https://www.googleapis.com/oauth2/v3/certs" };
    const client: OidcClient = { provider: "google", discoveryUrl: "https://accounts.google.com/.well-known/openid-configuration", discoveryIssuer: "https://accounts.google.com", issuer: GOOGLE, clientId: CLIENT, clientSecret: "test-only", allowHttp: false };
    const url = new URL(authorizationUrl(d, client, { redirectUri: "https://app.example/api/auth/oidc/google/callback", state: "s1", nonce: "n1", verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", locale: "es", loginHint: "lena@example.com" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: CLIENT,
      redirect_uri: "https://app.example/api/auth/oidc/google/callback",
      scope: "openid email profile",
      state: "s1",
      nonce: "n1",
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      code_challenge_method: "S256",
      ui_locales: "es",
      login_hint: "lena@example.com",
    });
  });
});

describe("the discovery document", () => {
  const doc = { issuer: "https://idp.example", authorization_endpoint: "https://idp.example/authorize", token_endpoint: "https://idp.example/token", jwks_uri: "https://idp.example/keys" };
  it("reads the endpoints, and refuses one that is missing, not https, or for another issuer", () => {
    expect(parseDiscovery(doc, { allowHttp: false, expectedIssuer: "https://idp.example" })).toEqual({ issuer: "https://idp.example", authorizationEndpoint: "https://idp.example/authorize", tokenEndpoint: "https://idp.example/token", jwksUri: "https://idp.example/keys" });
    expect(() => parseDiscovery({ ...doc, jwks_uri: undefined }, { allowHttp: false })).toThrow(OidcError);
    expect(() => parseDiscovery({ ...doc, token_endpoint: "http://idp.example/token" }, { allowHttp: false })).toThrow(OidcError);
    expect(() => parseDiscovery(doc, { allowHttp: false, expectedIssuer: "https://other.example" })).toThrow(OidcError);
    expect(() => parseDiscovery("nonsense", { allowHttp: false })).toThrow(OidcError);
    // The demo's stand-in runs on the app itself, over plain http locally.
    expect(parseDiscovery({ ...doc, token_endpoint: "http://localhost:3000/token" }, { allowHttp: true }).tokenEndpoint).toBe("http://localhost:3000/token");
  });
});

describe("the code exchange", () => {
  const d: Discovery = { issuer: "https://idp.example", authorizationEndpoint: "https://idp.example/authorize", tokenEndpoint: "https://idp.example/token", jwksUri: "https://idp.example/keys" };
  const client: OidcClient = { provider: "sso", discoveryUrl: "https://idp.example/.well-known/openid-configuration", discoveryIssuer: "https://idp.example", issuer: { kind: "exact", values: ["https://idp.example"] }, clientId: CLIENT, clientSecret: "test-only-secret", allowHttp: false };
  it("posts the code, the verifier and the client's credentials, and returns the ID token", async () => {
    let seen: { url: string; body: string; method: string } | null = null;
    const fetchFn = (async (url: string | URL, init?: RequestInit) => {
      seen = { url: String(url), body: String(init?.body), method: init?.method ?? "GET" };
      return new Response(JSON.stringify({ access_token: "at", token_type: "Bearer", id_token: "the.id.token" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    expect(await exchangeCode(d, client, { code: "c1", redirectUri: "https://app.example/cb", verifier: "v1" }, fetchFn)).toBe("the.id.token");
    expect(seen!.method).toBe("POST");
    expect(seen!.url).toBe("https://idp.example/token");
    expect(Object.fromEntries(new URLSearchParams(seen!.body))).toEqual({ grant_type: "authorization_code", code: "c1", redirect_uri: "https://app.example/cb", client_id: CLIENT, client_secret: "test-only-secret", code_verifier: "v1" });
  });

  it("refuses an error answer, or an answer without an ID token", async () => {
    const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect(await refused(exchangeCode(d, client, { code: "c", redirectUri: "r", verifier: "v" }, answer(400, { error: "invalid_grant" })))).toBe("token");
    expect(await refused(exchangeCode(d, client, { code: "c", redirectUri: "r", verifier: "v" }, answer(200, { access_token: "at" })))).toBe("token");
  });
});

describe("the sealed request cookie", () => {
  const key = randomBytes(32);
  const request = { provider: "google" as const, purpose: "sign_in" as const, state: "s", nonce: "n", verifier: "v", locale: "en", next: "/invoices", expiresAt: NOW.getTime() + 600_000 };
  it("opens only unchanged, under the same key, and before it expires", () => {
    const sealed = sealRequest(request, key);
    expect(openRequest(sealed, key, NOW)).toEqual(request);
    expect(openRequest(sealed, randomBytes(32), NOW)).toBeNull();
    expect(openRequest(`${sealed.slice(0, -4)}AAAA`, key, NOW)).toBeNull();
    expect(openRequest(sealed, key, new Date(request.expiresAt + 1))).toBeNull();
    expect(openRequest("garbage", key, NOW)).toBeNull();
    expect(openRequest(undefined, key, NOW)).toBeNull();
  });
});
