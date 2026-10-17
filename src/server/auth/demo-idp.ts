/**
 * The demo's stand-in identity providers (decision 0033): Google, Microsoft and the demo agency's
 * single sign-on, played by the app itself so the demo makes no outside call while the sign-in code
 * runs exactly as it would against the real ones (discovery, authorize, token, published keys, a
 * signed ID token). The server reaches discovery, token and keys IN-PROCESS through demoFetch — never
 * over the network, never at an address taken from a request (review H1); only the browser's step,
 * choosing an account, is a route on the app (demo mode only; 404 otherwise).
 *
 * Its signing key is made when the server starts (ES256) and kept in memory; the codes it hands out
 * are sealed under the app key, last two minutes and work once.
 */
import { createHash, randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { DEMO_OWNER, RECRUITERS, STAFF } from "../demo/dataset";
import { appKey, sameText, seal, unseal, type Sealed } from "./crypto";
import { DEMO_IDP_ORIGIN, DEMO_TENANT_ID, demoClientId, demoClientSecret, demoIssuer } from "./demo-idp-config";
import { pkceChallenge, TENANT_PLACEHOLDER, type ProviderId } from "./oidc";

/** The accounts the stand-in offers: the demo people, and one address that belongs to no member. */
export const NOT_A_MEMBER = "not.a.member@example.com";
export const DEMO_IDP_ACCOUNTS: { email: string; name: string | null }[] = [
  { email: DEMO_OWNER.email, name: DEMO_OWNER.name },
  { email: RECRUITERS[0].email, name: RECRUITERS[0].name },
  ...STAFF.map((p) => ({ email: p.email, name: p.name })),
  { email: NOT_A_MEMBER, name: null },
];

export const isDemoProvider = (p: string): p is ProviderId => p === "google" || p === "microsoft" || p === "sso";

// ---------- the signing key, made at run time ----------

interface Key {
  privateKey: CryptoKey;
  jwk: JWK;
  kid: string;
}
const holder = globalThis as typeof globalThis & { __shiftbookDemoIdpKey?: Promise<Key>; __shiftbookDemoIdpUsed?: Map<string, number> };
function signingKey(): Promise<Key> {
  holder.__shiftbookDemoIdpKey ??= (async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const kid = randomBytes(8).toString("hex");
    return { privateKey, kid, jwk: { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" } };
  })();
  return holder.__shiftbookDemoIdpKey;
}

export async function demoJwks(): Promise<{ keys: JWK[] }> {
  return { keys: [(await signingKey()).jwk] };
}

// ---------- discovery ----------

export function demoDiscovery(provider: ProviderId): Record<string, unknown> {
  const root = `${DEMO_IDP_ORIGIN}/${provider}`;
  return {
    issuer: provider === "microsoft" ? `${DEMO_IDP_ORIGIN}/microsoft/${TENANT_PLACEHOLDER}/v2.0` : demoIssuer(provider),
    authorization_endpoint: `${root}/authorize`,
    token_endpoint: `${root}/token`,
    jwks_uri: `${root}/jwks`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["ES256"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post"],
    scopes_supported: ["openid", "email", "profile"],
    claims_supported: ["iss", "sub", "aud", "exp", "iat", "nonce", "email", "email_verified", "name", ...(provider === "microsoft" ? ["tid", "oid", "xms_edov"] : provider === "google" ? ["hd"] : [])],
  };
}

/** The demo agency's addresses are "hosted" by the stand-in Google (a Workspace domain, hd). */
const DEMO_HOSTED_DOMAIN = DEMO_OWNER.email.slice(DEMO_OWNER.email.indexOf("@") + 1);

// ---------- authorize ----------

export interface AuthorizeRequest {
  provider: ProviderId;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  challenge: string;
  locale: "en" | "es";
  expiresAt: number;
}

const short = (v: string | null, max = 512) => (v && v.length > 0 && v.length <= max ? v : null);

/** The authorization request, if it is one Granite itself made (its client, its callback, PKCE S256). */
export function readAuthorize(params: URLSearchParams, base: string, provider: ProviderId, now: Date): AuthorizeRequest | null {
  const state = short(params.get("state"));
  const nonce = short(params.get("nonce"));
  const challenge = params.get("code_challenge");
  if (params.get("response_type") !== "code" || params.get("client_id") !== demoClientId(provider)) return null;
  if (params.get("redirect_uri") !== `${base}/api/auth/oidc/${provider}/callback`) return null;
  if (!(params.get("scope") ?? "").split(" ").includes("openid")) return null;
  if (params.get("code_challenge_method") !== "S256" || !challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || !state || !nonce) return null;
  return { provider, clientId: demoClientId(provider), redirectUri: params.get("redirect_uri")!, state, nonce, challenge, locale: params.get("ui_locales") === "es" ? "es" : "en", expiresAt: now.getTime() + 10 * 60 * 1000 };
}

const pack = (value: unknown, aad: string) => Buffer.from(JSON.stringify(seal(Buffer.from(JSON.stringify(value), "utf8"), appKey(), aad)), "utf8").toString("base64url");
function unpack<T extends { expiresAt: number }>(value: string | null | undefined, aad: string, now: Date): T | null {
  if (!value || value.length > 6000) return null;
  try {
    const out = JSON.parse(unseal(JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Sealed, appKey(), aad).toString("utf8")) as T;
    return typeof out.expiresAt === "number" && out.expiresAt > now.getTime() ? out : null;
  } catch {
    return null;
  }
}

export const sealAuthorize = (r: AuthorizeRequest) => pack(r, "demo-idp-request");
export const openAuthorize = (value: string | null | undefined, now: Date) => unpack<AuthorizeRequest>(value, "demo-idp-request", now);

interface CodeGrant {
  provider: ProviderId;
  clientId: string;
  redirectUri: string;
  challenge: string;
  nonce: string;
  email: string;
  jti: string;
  expiresAt: number;
}

/** Where the browser goes back to: a code for the chosen account, or "access denied" when cancelled. */
export function answerAuthorize(request: AuthorizeRequest, choice: string, now: Date): string {
  const back = new URL(request.redirectUri);
  back.searchParams.set("state", request.state);
  const account = DEMO_IDP_ACCOUNTS.find((a) => a.email === choice);
  if (!account) {
    back.searchParams.set("error", "access_denied");
    return back.toString();
  }
  const grant: CodeGrant = { provider: request.provider, clientId: request.clientId, redirectUri: request.redirectUri, challenge: request.challenge, nonce: request.nonce, email: account.email, jti: randomBytes(16).toString("hex"), expiresAt: now.getTime() + 2 * 60 * 1000 };
  back.searchParams.set("code", pack(grant, "demo-idp-code"));
  return back.toString();
}

// ---------- token ----------

/** A stable subject per provider and account, as a real provider keeps one per account. */
export const demoSubject = (label: string, email: string) => createHash("sha256").update(`${label}|${email}`).digest("hex").slice(0, 24);

function firstUse(jti: string, now: Date): boolean {
  const used = (holder.__shiftbookDemoIdpUsed ??= new Map());
  for (const [k, until] of used) if (until < now.getTime()) used.delete(k);
  if (used.has(jti)) return false;
  used.set(jti, now.getTime() + 5 * 60 * 1000);
  return true;
}

/** The token endpoint: the client's credentials, the code (once), PKCE, then a signed ID token. */
export async function demoToken(form: URLSearchParams, provider: ProviderId, now: Date): Promise<{ status: number; body: Record<string, unknown> }> {
  const refuse = (error: string) => ({ status: 400, body: { error } });
  if (form.get("grant_type") !== "authorization_code") return refuse("unsupported_grant_type");
  if (form.get("client_id") !== demoClientId(provider) || !sameText(form.get("client_secret") ?? "", demoClientSecret(provider))) return { status: 401, body: { error: "invalid_client" } };
  const grant = unpack<CodeGrant>(form.get("code"), "demo-idp-code", now);
  if (!grant || grant.provider !== provider || grant.clientId !== form.get("client_id") || grant.redirectUri !== form.get("redirect_uri")) return refuse("invalid_grant");
  const verifier = form.get("code_verifier") ?? "";
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || pkceChallenge(verifier) !== grant.challenge) return refuse("invalid_grant");
  if (!firstUse(grant.jti, now)) return refuse("invalid_grant");
  const key = await signingKey();
  const account = DEMO_IDP_ACCOUNTS.find((a) => a.email === grant.email)!;
  const claims: Record<string, unknown> = { nonce: grant.nonce, email: account.email, ...(account.name ? { name: account.name } : {}) };
  if (provider === "microsoft") Object.assign(claims, { tid: DEMO_TENANT_ID, oid: demoSubject("microsoft-oid", account.email), preferred_username: account.email, xms_edov: true });
  else {
    claims.email_verified = true;
    if (provider === "google" && account.email.endsWith(`@${DEMO_HOSTED_DOMAIN}`)) claims.hd = DEMO_HOSTED_DOMAIN;
  }
  const idToken = await new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: key.kid, typ: "JWT" })
    .setIssuer(demoIssuer(provider))
    .setAudience(grant.clientId)
    .setSubject(demoSubject(provider, account.email))
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + 300)
    .sign(key.privateKey);
  return { status: 200, body: { access_token: randomBytes(24).toString("base64url"), token_type: "Bearer", expires_in: 300, id_token: idToken } };
}

// ---------- the server's way to the stand-in: in-process, nowhere else ----------

const bodyText = (body: RequestInit["body"]) => (typeof body === "string" ? body : body instanceof URLSearchParams ? body.toString() : "");

/**
 * A fetch that reaches only the stand-in, in this process: discovery, the published keys and the
 * token endpoint at DEMO_IDP_ORIGIN. Any other address is refused — the demo makes no outside call.
 */
export const demoFetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== DEMO_IDP_ORIGIN) throw new TypeError("The demo makes no outside call: only the stand-in identity provider is reachable.");
  const [provider = "", ...rest] = url.pathname.slice(1).split("/");
  const path = rest.join("/");
  if (!isDemoProvider(provider)) return new Response("Not found", { status: 404 });
  const method = (init?.method ?? "GET").toUpperCase();
  const discovery = provider === "microsoft" ? "common/v2.0/.well-known/openid-configuration" : ".well-known/openid-configuration";
  if (method === "GET" && path === discovery) return Response.json(demoDiscovery(provider));
  if (method === "GET" && path === "jwks") return Response.json(await demoJwks());
  if (method === "POST" && path === "token") {
    const answer = await demoToken(new URLSearchParams(bodyText(init?.body)), provider, new Date());
    return Response.json(answer.body, { status: answer.status });
  }
  return new Response("Not found", { status: 404 });
}) as typeof fetch;
