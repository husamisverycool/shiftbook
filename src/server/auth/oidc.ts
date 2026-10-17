/**
 * A small OpenID Connect client (decision 0033; OpenID Connect Core 1.0 §3.1, RFC 7636): the
 * discovery document, the authorization code flow with PKCE (S256), state and nonce, the code
 * exchange, and the ID token's verification with `jose` — the issuer's published keys, RS256 or
 * ES256 only, iss, aud (exactly this client), azp, exp / nbf / iat with a little skew, the nonce.
 * Google, Microsoft and every agency's own provider go through it, and so does the demo's stand-in.
 *
 * No database here; nothing logged. A refusal is an OidcError whose `reason` names the check.
 */
import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { createRemoteJWKSet, customFetch, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { sameText, seal, unseal, type Sealed } from "./crypto";
import { safeFetch } from "./safe-fetch";

export type ProviderId = "google" | "microsoft" | "sso";
export const PROVIDERS: readonly ProviderId[] = ["google", "microsoft", "sso"];

/** Google's ID tokens carry either spelling (developers.google.com/identity/openid-connect). */
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
/** Microsoft's multi-tenant v2.0 issuer: the token's own tenant (tid) fills it. */
export const TENANT_PLACEHOLDER = "{tenantid}";

/** Exactly one of these issuers, or (Microsoft) the template filled with the token's tid. */
export type IssuerRule = { kind: "exact"; values: string[] } | { kind: "tenant"; template: string };

export interface OidcClient {
  provider: ProviderId;
  discoveryUrl: string;
  /** What the discovery document must name as its issuer (Microsoft's keeps the {tenantid} placeholder). */
  discoveryIssuer: string;
  issuer: IssuerRule;
  clientId: string;
  clientSecret: string;
  /** Endpoints over plain http allowed (tests only; the demo's stand-in is reached in-process). */
  allowHttp: boolean;
  /** The hosts the provider's endpoints may be on: its own, or a documented list (review M2). */
  endpointHosts: string[];
  /** How the server reaches the provider: safeFetch by default; the demo's stand-in in-process. */
  fetch?: typeof fetch;
  /** Where the browser goes to sign in, when not the discovery document's address (the demo's stand-in page). */
  authorizeAt?: string;
}

export interface Discovery {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

export type OidcReason = "discovery" | "token" | "signature" | "issuer" | "audience" | "expired" | "claims" | "nonce" | "state";
export class OidcError extends Error {
  constructor(public readonly reason: OidcReason, detail?: string) {
    super(`OpenID Connect: ${reason}${detail ? ` (${detail})` : ""}`);
    this.name = "OidcError";
  }
}

/** Accepted signature algorithms: never "none", never a shared secret (HS*). */
export const ALGORITHMS = ["RS256", "ES256"];
/** Clock skew allowed on exp, nbf and iat. */
export const SKEW_SECONDS = 60;
/** An ID token older than this (by iat) is refused: it was made for a sign-in a moment ago. */
export const MAX_TOKEN_AGE_SECONDS = 10 * 60;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const random = () => randomBytes(32).toString("base64url");

// ---------- discovery ----------

function endpoint(value: unknown, opts: { allowHttp: boolean; hosts?: string[] }): string {
  if (typeof value !== "string" || value.length > 2000) throw new OidcError("discovery", "an endpoint is missing");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OidcError("discovery", "an endpoint is not an address");
  }
  if (url.protocol !== "https:" && !(opts.allowHttp && url.protocol === "http:")) throw new OidcError("discovery", "an endpoint is not https");
  if (!opts.allowHttp) {
    // Never an address the server could be pointed at inside a network (review M2).
    if (isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0) throw new OidcError("discovery", "an endpoint is an IP address");
    if (url.port !== "" && url.port !== "443") throw new OidcError("discovery", "an endpoint is on another port");
    if (url.username || url.password) throw new OidcError("discovery", "an endpoint carries credentials");
  }
  if (opts.hosts && !opts.hosts.includes(url.hostname.toLowerCase())) throw new OidcError("discovery", "an endpoint is on another host");
  return url.toString();
}

/** The parts of an OpenID Provider's configuration the code flow needs (OpenID Connect Discovery §3, §4.3). */
export function parseDiscovery(json: unknown, opts: { allowHttp: boolean; expectedIssuer?: string; hosts?: string[] }): Discovery {
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new OidcError("discovery", "not a JSON object");
  const d = json as Record<string, unknown>;
  if (typeof d.issuer !== "string" || d.issuer.length === 0) throw new OidcError("discovery", "no issuer");
  if (opts.expectedIssuer !== undefined && d.issuer !== opts.expectedIssuer) throw new OidcError("discovery", "the issuer is another one");
  return { issuer: d.issuer, authorizationEndpoint: endpoint(d.authorization_endpoint, opts), tokenEndpoint: endpoint(d.token_endpoint, opts), jwksUri: endpoint(d.jwks_uri, opts) };
}

const DISCOVERY_TTL_MS = 60 * 60 * 1000;
/** Both caches are bounded (review L6): the oldest entry goes first once full. */
const CACHE_MAX = 64;
const discoveryCache = new Map<string, { at: number; value: Discovery }>();
const keep = <V>(cache: Map<string, V>, key: string, value: V) => {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
};
export const discoveryCacheSize = () => discoveryCache.size;

/** The provider's discovery document, kept for an hour. */
export async function discover(client: OidcClient, now = new Date()): Promise<Discovery> {
  const key = `${client.discoveryUrl}|${client.discoveryIssuer}|${client.endpointHosts.join(",")}`;
  const hit = discoveryCache.get(key);
  if (hit && now.getTime() - hit.at < DISCOVERY_TTL_MS) return hit.value;
  const fetchFn = client.fetch ?? safeFetch;
  let json: unknown;
  try {
    const response = await fetchFn(client.discoveryUrl, { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new OidcError("discovery", `answered ${response.status}`);
    json = await response.json();
  } catch (error) {
    if (error instanceof OidcError) throw error;
    throw new OidcError("discovery", "could not be read");
  }
  const value = parseDiscovery(json, { allowHttp: client.allowHttp, expectedIssuer: client.discoveryIssuer, hosts: client.endpointHosts });
  keep(discoveryCache, key, { at: now.getTime(), value });
  return value;
}

/** Forgets a provider's discovery document and keys (an SSO configuration changed), or every one. */
export function forgetDiscovery(discoveryUrl?: string): void {
  for (const key of [...discoveryCache.keys()]) if (!discoveryUrl || key.startsWith(`${discoveryUrl}|`)) discoveryCache.delete(key);
  if (!discoveryUrl) remoteSets.clear();
}

// ---------- the request ----------

/** BASE64URL(SHA-256(verifier)) — RFC 7636 §4.2, S256. */
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier, "ascii").digest("base64url");

/** A fresh state (CSRF), nonce (replay) and PKCE verifier, 32 random bytes each. */
export const newAuthRequest = () => ({ state: random(), nonce: random(), verifier: random() });

export function authorizationUrl(d: Discovery, client: OidcClient, r: { redirectUri: string; state: string; nonce: string; verifier: string; locale?: string; loginHint?: string }): string {
  const url = new URL(client.authorizeAt ?? d.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client.clientId);
  url.searchParams.set("redirect_uri", r.redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", r.state);
  url.searchParams.set("nonce", r.nonce);
  url.searchParams.set("code_challenge", pkceChallenge(r.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  if (r.locale) url.searchParams.set("ui_locales", r.locale);
  if (r.loginHint) url.searchParams.set("login_hint", r.loginHint);
  return url.toString();
}

/** The code exchanged at the token endpoint (client secret in the form, as Google and Microsoft accept); the ID token. */
export async function exchangeCode(d: Discovery, client: OidcClient, r: { code: string; redirectUri: string; verifier: string }): Promise<string> {
  const fetchFn = client.fetch ?? safeFetch;
  const body = new URLSearchParams({ grant_type: "authorization_code", code: r.code, redirect_uri: r.redirectUri, client_id: client.clientId, client_secret: client.clientSecret, code_verifier: r.verifier });
  let answer: Record<string, unknown>;
  try {
    const response = await fetchFn(d.tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: body.toString(), redirect: "error", signal: AbortSignal.timeout(10_000) });
    answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new OidcError("token", `answered ${response.status}`);
  } catch (error) {
    if (error instanceof OidcError) throw error;
    throw new OidcError("token", "could not be reached");
  }
  if (typeof answer.id_token !== "string" || answer.id_token.length === 0) throw new OidcError("token", "no ID token");
  return answer.id_token;
}

// ---------- the ID token ----------

const remoteSets = new Map<string, JWTVerifyGetKey>();
/** The issuer's published keys, through the client's own transport (jose caches them and fetches again for an unknown key id). */
export function remoteKeys(jwksUri: string, fetchFn: typeof fetch = safeFetch): JWTVerifyGetKey {
  let set = remoteSets.get(jwksUri);
  if (!set) {
    set = createRemoteJWKSet(new URL(jwksUri), { timeoutDuration: 10_000, [customFetch]: fetchFn });
    keep(remoteSets, jwksUri, set);
  }
  return set;
}

export type IdClaims = JWTPayload & Record<string, unknown>;

function issuerOk(rule: IssuerRule, claims: IdClaims): boolean {
  if (typeof claims.iss !== "string") return false;
  if (rule.kind === "exact") return rule.values.includes(claims.iss);
  // Microsoft: the issuer names the tenant the token itself says (tid), a GUID.
  return typeof claims.tid === "string" && GUID.test(claims.tid) && claims.iss === rule.template.replace(TENANT_PLACEHOLDER, claims.tid);
}

/** Every check OpenID Connect Core §3.1.3.7 asks, or an OidcError naming the one that failed. */
export async function verifyIdToken(idToken: string, opts: { keys: JWTVerifyGetKey; issuer: IssuerRule; clientId: string; nonce: string; now: Date }): Promise<IdClaims> {
  let claims: IdClaims;
  try {
    ({ payload: claims } = await jwtVerify(idToken, opts.keys, {
      algorithms: ALGORITHMS,
      audience: opts.clientId,
      clockTolerance: SKEW_SECONDS,
      maxTokenAge: MAX_TOKEN_AGE_SECONDS,
      requiredClaims: ["iss", "sub", "aud", "exp", "iat"],
      currentDate: opts.now,
    }));
  } catch (error) {
    if (error instanceof errors.JWTExpired) throw new OidcError("expired");
    if (error instanceof errors.JWTClaimValidationFailed) {
      if (error.claim === "aud") throw new OidcError("audience");
      if (error.claim === "iss") throw new OidcError("issuer");
      throw new OidcError("claims", error.claim);
    }
    throw new OidcError("signature");
  }
  if (!issuerOk(opts.issuer, claims)) throw new OidcError("issuer");
  // One audience, this client: any other audience is one this client does not trust (§3.1.3.7 item 3).
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (aud.length !== 1 || aud[0] !== opts.clientId) throw new OidcError("audience");
  if (claims.azp !== undefined && claims.azp !== opts.clientId) throw new OidcError("audience");
  if (typeof claims.sub !== "string" || claims.sub.length === 0 || claims.sub.length > 255) throw new OidcError("claims", "sub");
  if (typeof claims.nonce !== "string" || !sameText(claims.nonce, opts.nonce)) throw new OidcError("nonce");
  return claims;
}

export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  /** Lower-cased, as the provider gave it (only a hint unless verified). */
  email: string | null;
  /** Whether the provider vouches for the email (decision 0033): Google email_verified, Microsoft xms_edov. */
  emailVerified: boolean;
  /**
   * Whether the provider also hosts that mailbox, so its word is proof of it now (review H2): Google
   * for gmail.com or its Workspace domain (hd); Microsoft with xms_edov. Never an agency's provider.
   */
  mailboxProven: boolean;
  name: string | null;
}

/**
 * The identity a verified token names. Google says the email is verified with `email_verified`;
 * Microsoft's email is never proof by itself, only with the optional claim `xms_edov` (the domain's
 * owner verified it); an agency's own provider with `email_verified`.
 */
export function identityOf(provider: ProviderId, claims: IdClaims): VerifiedIdentity {
  const email = typeof claims.email === "string" && /^[^\s@]+@[^\s@]+$/.test(claims.email.trim()) && claims.email.length <= 254 ? claims.email.trim().toLowerCase() : null;
  // An agency's provider on Entra ID vouches with xms_edov, as Microsoft does (it sends no email_verified).
  const vouched = provider === "microsoft" ? claims.xms_edov === true : provider === "sso" ? claims.email_verified === true || claims.xms_edov === true : claims.email_verified === true;
  const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 120) : null;
  const emailVerified = Boolean(email) && vouched;
  const domain = email ? email.slice(email.lastIndexOf("@") + 1) : "";
  const hostedBy = typeof claims.hd === "string" ? claims.hd.trim().toLowerCase() : null;
  const mailboxProven = emailVerified && (provider === "google" ? domain === "gmail.com" || (hostedBy !== null && hostedBy === domain) : provider === "microsoft");
  return { issuer: String(claims.iss), subject: String(claims.sub), email, emailVerified, mailboxProven, name };
}

// ---------- the request, kept in the browser (sealed) ----------

export type FlowPurpose = "sign_in" | "connect" | "invite" | "sso";
export interface OidcRequest {
  provider: ProviderId;
  purpose: FlowPurpose;
  state: string;
  nonce: string;
  verifier: string;
  locale: string;
  next: string | null;
  expiresAt: number;
  /** connect: the person (and session) who asked. */
  userId?: string;
  sessionId?: string;
  /** invite: the invite link's token. */
  invite?: string;
  /** sso: the agency whose provider runs, and the member who typed their email. */
  agencyId?: string;
}

const REQUEST_AAD = "oidc-request";

/** The request sealed under the app key (AES-256-GCM), for the short-lived httpOnly cookie. */
export const sealRequest = (request: OidcRequest, key: Buffer): string => Buffer.from(JSON.stringify(seal(Buffer.from(JSON.stringify(request), "utf8"), key, REQUEST_AAD)), "utf8").toString("base64url");

/** The request back, or null when changed, sealed under another key, expired or not one at all. */
export function openRequest(value: string | undefined, key: Buffer, now: Date): OidcRequest | null {
  if (!value || value.length > 8000) return null;
  try {
    const sealed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Sealed;
    const request = JSON.parse(unseal(sealed, key, REQUEST_AAD).toString("utf8")) as OidcRequest;
    if (typeof request.expiresAt !== "number" || request.expiresAt <= now.getTime()) return null;
    if (!PROVIDERS.includes(request.provider)) return null;
    return request;
  } catch {
    return null;
  }
}
