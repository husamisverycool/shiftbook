/**
 * The OpenID Connect flow on the app (decision 0033): which client a provider uses (the real one when
 * its keys are set; the demo's stand-in in demo mode, always — the demo makes no outside call), the
 * request sealed into the short-lived `sb_oidc` cookie, and the callback's checks (the cookie's
 * state, the code exchange, the ID token). The callers set the cookies on their own responses.
 *
 * Server-side calls never use an address taken from the request (review H1): the demo's stand-in is
 * reached in-process; real providers and agencies' issuers through safeFetch, their endpoints only on
 * their own hosts (or Google's and Microsoft's documented ones) — review M2. `base` (the app's
 * address) is used only for the browser: the redirect address and the stand-in's page.
 */
import { isIP } from "node:net";
import { env } from "../env";
import { isDemo } from "../session";
import { appKey, sameText } from "./crypto";
import { demoFetch } from "./demo-idp";
import { DEMO_IDP_HOST, DEMO_IDP_ORIGIN, DEMO_IDP_PATH, demoClientId, demoClientSecret, demoIssuer } from "./demo-idp-config";
import { localePath, safeNext } from "./next-path";
import {
  authorizationUrl,
  discover,
  exchangeCode,
  forgetDiscovery,
  GOOGLE_ISSUERS,
  identityOf,
  newAuthRequest,
  OidcError,
  openRequest,
  remoteKeys,
  sealRequest,
  TENANT_PLACEHOLDER,
  verifyIdToken,
  type FlowPurpose,
  type OidcClient,
  type OidcRequest,
  type ProviderId,
  type VerifiedIdentity,
} from "./oidc";
import { createSafeFetch, publicLookup, safeFetch, SafeFetchError, type Resolver } from "./safe-fetch";

export const OIDC_COOKIE = "sb_oidc";
export const OIDC_COOKIE_PATH = "/api/auth/oidc";
const FLOW_MS = 10 * 60 * 1000;

const MICROSOFT_ISSUER = `https://login.microsoftonline.com/${TENANT_PLACEHOLDER}/v2.0`;

/**
 * Where a provider's endpoints may be: its issuer's own host, except these documented ones whose
 * discovery documents name endpoints on sibling hosts (review M2). Google: accounts.google.com's
 * discovery names oauth2.googleapis.com, www.googleapis.com and openidconnect.googleapis.com; Microsoft
 * keeps all of Entra ID's on login.microsoftonline.com.
 */
const ENDPOINT_HOSTS: Record<string, string[]> = {
  "accounts.google.com": ["accounts.google.com", "oauth2.googleapis.com", "www.googleapis.com", "openidconnect.googleapis.com"],
  "login.microsoftonline.com": ["login.microsoftonline.com"],
};
export const endpointHostsFor = (issuer: string): string[] => {
  const host = new URL(issuer).hostname.toLowerCase();
  return ENDPOINT_HOSTS[host] ?? [host];
};

/** The keys of a provider, from the environment (decision 0033; docs/hosting-settings.md). */
export function providerKeys(provider: "google" | "microsoft"): { clientId: string; clientSecret: string } | null {
  const clientId = provider === "google" ? process.env.SHIFTBOOK_GOOGLE_CLIENT_ID : process.env.SHIFTBOOK_MICROSOFT_CLIENT_ID;
  const clientSecret = provider === "google" ? process.env.SHIFTBOOK_GOOGLE_CLIENT_SECRET : process.env.SHIFTBOOK_MICROSOFT_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Offered on the sign-in page: in demo mode always (the stand-in), otherwise once its keys are set. */
export const providerOffered = (provider: "google" | "microsoft") => isDemo() || providerKeys(provider) !== null;

export const redirectUri = (base: string, provider: ProviderId) => `${base}/api/auth/oidc/${provider}/callback`;
const wellKnown = (issuer: string) => `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;

/** The client for a provider at this address; an agency's single sign-on needs its own details. */
export function flowClient(provider: ProviderId, base: string, sso?: { issuer: string; clientId: string; clientSecret: string } | null): OidcClient | null {
  // The browser's step at the demo's stand-in is a page on the app; everything else stays in-process.
  const demoParts = (p: ProviderId) => ({ fetch: demoFetch, endpointHosts: [DEMO_IDP_HOST], authorizeAt: `${base}${DEMO_IDP_PATH}/${p}/authorize`, allowHttp: false });
  if (provider === "sso") {
    if (!sso) return null;
    const exact = { provider, discoveryUrl: wellKnown(sso.issuer), discoveryIssuer: sso.issuer, issuer: { kind: "exact" as const, values: [sso.issuer] }, clientId: sso.clientId, clientSecret: sso.clientSecret };
    if (isDemo()) return sso.issuer.startsWith(`${DEMO_IDP_ORIGIN}/`) ? { ...exact, ...demoParts("sso") } : null;
    return { ...exact, allowHttp: false, endpointHosts: endpointHostsFor(sso.issuer), fetch: safeFetch };
  }
  if (isDemo()) {
    const clientId = demoClientId(provider);
    const clientSecret = demoClientSecret(provider);
    if (provider === "microsoft") {
      const template = `${DEMO_IDP_ORIGIN}/microsoft/${TENANT_PLACEHOLDER}/v2.0`;
      return { provider, discoveryUrl: `${DEMO_IDP_ORIGIN}/microsoft/common/v2.0/.well-known/openid-configuration`, discoveryIssuer: template, issuer: { kind: "tenant", template }, clientId, clientSecret, ...demoParts(provider) };
    }
    const issuer = demoIssuer(provider);
    return { provider, discoveryUrl: wellKnown(issuer), discoveryIssuer: issuer, issuer: { kind: "exact", values: [issuer] }, clientId, clientSecret, ...demoParts(provider) };
  }
  const keys = providerKeys(provider);
  if (!keys) return null;
  if (provider === "google") return { provider, discoveryUrl: wellKnown("https://accounts.google.com"), discoveryIssuer: "https://accounts.google.com", issuer: { kind: "exact", values: GOOGLE_ISSUERS }, ...keys, allowHttp: false, endpointHosts: endpointHostsFor("https://accounts.google.com"), fetch: safeFetch };
  return { provider, discoveryUrl: "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration", discoveryIssuer: MICROSOFT_ISSUER, issuer: { kind: "tenant", template: MICROSOFT_ISSUER }, ...keys, allowHttp: false, endpointHosts: endpointHostsFor("https://login.microsoftonline.com/common/v2.0"), fetch: safeFetch };
}

export type IssuerCheck = "ok" | "private" | "unreachable";

/**
 * Whether an agency's issuer can be used (the SSO settings' check, review M2): an https name (not an
 * IP address) whose every address is public, answering as an OpenID Connect provider with its
 * endpoints on its own host. In demo mode only the stand-in, in-process. `resolver` is for tests.
 */
export async function checkIssuer(issuer: string, opts: { demoMode: boolean; resolver?: Resolver }): Promise<IssuerCheck> {
  const { resolver } = opts;
  if (opts.demoMode) {
    if (!issuer.startsWith(`${DEMO_IDP_ORIGIN}/`)) return "unreachable";
  } else {
    let url: URL;
    try {
      url = new URL(issuer);
    } catch {
      return "unreachable";
    }
    if (url.protocol !== "https:" || isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0) return "private";
    const lookup = publicLookup(resolver);
    const resolved = await new Promise<boolean>((resolve) => lookup(url.hostname, { all: true }, (error) => resolve(!error)));
    if (!resolved) return "private";
  }
  try {
    const exact = { provider: "sso" as const, discoveryUrl: wellKnown(issuer), discoveryIssuer: issuer, issuer: { kind: "exact" as const, values: [issuer] }, clientId: "", clientSecret: "" };
    const client: OidcClient = opts.demoMode
      ? { ...exact, fetch: demoFetch, endpointHosts: [DEMO_IDP_HOST], allowHttp: false }
      : { ...exact, fetch: resolver ? createSafeFetch({ resolver }) : safeFetch, endpointHosts: endpointHostsFor(issuer), allowHttp: false };
    forgetDiscovery(client.discoveryUrl);
    await discover(client);
    return "ok";
  } catch (error) {
    return error instanceof SafeFetchError && error.reason === "private_address" ? "private" : "unreachable";
  }
}

/** The cookies' Secure flag: whenever the app is served over HTTPS. */
export const secureFor = (base: string) => base.startsWith("https://") || Boolean(env.appUrl?.startsWith("https://"));

export const oidcCookieOptions = (base: string) => ({ httpOnly: true, secure: secureFor(base), sameSite: "lax" as const, path: OIDC_COOKIE_PATH, maxAge: FLOW_MS / 1000 });

/** A new request: the provider's authorization address, and the sealed cookie that remembers it. */
export async function startRequest(input: {
  client: OidcClient;
  purpose: FlowPurpose;
  base: string;
  locale: string;
  next: string | null;
  loginHint?: string;
  userId?: string;
  sessionId?: string;
  invite?: string;
  agencyId?: string;
}): Promise<{ url: string; cookie: string }> {
  const d = await discover(input.client);
  const r = newAuthRequest();
  const request: OidcRequest = {
    provider: input.client.provider,
    purpose: input.purpose,
    state: r.state,
    nonce: r.nonce,
    verifier: r.verifier,
    locale: input.locale === "es" ? "es" : "en",
    next: input.next,
    expiresAt: Date.now() + FLOW_MS,
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.invite ? { invite: input.invite } : {}),
    ...(input.agencyId ? { agencyId: input.agencyId } : {}),
  };
  const url = authorizationUrl(d, input.client, { redirectUri: redirectUri(input.base, input.client.provider), state: r.state, nonce: r.nonce, verifier: r.verifier, locale: request.locale, loginHint: input.loginHint });
  return { url, cookie: sealRequest(request, appKey()) };
}

export type Completed = { ok: true; request: OidcRequest; identity: VerifiedIdentity } | { ok: false; request: OidcRequest | null };

/**
 * The provider's answer: the cookie's request (its state must be the one returned, so a code sent to
 * someone else's browser is never used here), the code exchanged, the ID token verified.
 */
export async function completeRequest(provider: ProviderId, params: URLSearchParams, cookie: string | undefined, base: string, ssoFor: (request: OidcRequest) => Promise<{ issuer: string; clientId: string; clientSecret: string } | null>): Promise<Completed> {
  const request = openRequest(cookie, appKey(), new Date());
  if (!request || request.provider !== provider) return { ok: false, request: null };
  const state = params.get("state");
  const code = params.get("code");
  if (!state || !sameText(state, request.state) || !code || params.get("error")) return { ok: false, request };
  const client = flowClient(provider, base, provider === "sso" ? await ssoFor(request) : null);
  if (!client) return { ok: false, request };
  try {
    const d = await discover(client);
    const idToken = await exchangeCode(d, client, { code, redirectUri: redirectUri(base, provider), verifier: request.verifier });
    const claims = await verifyIdToken(idToken, { keys: remoteKeys(d.jwksUri, client.fetch), issuer: client.issuer, clientId: client.clientId, nonce: request.nonce, now: new Date() });
    return { ok: true, request, identity: identityOf(provider, claims) };
  } catch (error) {
    if (error instanceof OidcError) return { ok: false, request };
    throw error;
  }
}

/** Where a fresh session goes next: the code, the authenticator setup, or the page they wanted. */
export function onwardPath(next: "done" | "code" | "setup", locale: string, wanted: unknown): string {
  const back = safeNext(wanted);
  const keep = back === "/" ? "" : `?next=${encodeURIComponent(back)}`;
  if (next === "code") return `/${locale}/sign-in/code${keep}`;
  if (next === "setup") return `/${locale}/sign-in/setup${keep}`;
  return localePath(locale, back);
}
