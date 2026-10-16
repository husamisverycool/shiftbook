/**
 * The OpenID Connect flow on the app (decision 0033): which client a provider uses (the real one when
 * its keys are set; the demo's stand-in in demo mode, always — the demo makes no outside call), the
 * request sealed into the short-lived `sb_oidc` cookie, and the callback's checks (the cookie's
 * state, the code exchange, the ID token). The callers set the cookies on their own responses.
 */
import { env } from "../env";
import { isDemo } from "../session";
import { appKey, sameText } from "./crypto";
import { DEMO_IDP_PATH, demoClientId, demoClientSecret, demoIssuer } from "./demo-idp-config";
import { localePath, safeNext } from "./next-path";
import {
  authorizationUrl,
  discover,
  exchangeCode,
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

export const OIDC_COOKIE = "sb_oidc";
export const OIDC_COOKIE_PATH = "/api/auth/oidc";
const FLOW_MS = 10 * 60 * 1000;

const MICROSOFT_ISSUER = `https://login.microsoftonline.com/${TENANT_PLACEHOLDER}/v2.0`;

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
  if (provider === "sso") {
    if (!sso) return null;
    return { provider, discoveryUrl: wellKnown(sso.issuer), discoveryIssuer: sso.issuer, issuer: { kind: "exact", values: [sso.issuer] }, clientId: sso.clientId, clientSecret: sso.clientSecret, allowHttp: isDemo() };
  }
  if (isDemo()) {
    const clientId = demoClientId(provider);
    const clientSecret = demoClientSecret(provider);
    if (provider === "microsoft") {
      const template = `${base}${DEMO_IDP_PATH}/microsoft/${TENANT_PLACEHOLDER}/v2.0`;
      return { provider, discoveryUrl: `${base}${DEMO_IDP_PATH}/microsoft/common/v2.0/.well-known/openid-configuration`, discoveryIssuer: template, issuer: { kind: "tenant", template }, clientId, clientSecret, allowHttp: true };
    }
    const issuer = demoIssuer(base, provider);
    return { provider, discoveryUrl: wellKnown(issuer), discoveryIssuer: issuer, issuer: { kind: "exact", values: [issuer] }, clientId, clientSecret, allowHttp: true };
  }
  const keys = providerKeys(provider);
  if (!keys) return null;
  if (provider === "google") return { provider, discoveryUrl: wellKnown("https://accounts.google.com"), discoveryIssuer: "https://accounts.google.com", issuer: { kind: "exact", values: GOOGLE_ISSUERS }, ...keys, allowHttp: false };
  return { provider, discoveryUrl: "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration", discoveryIssuer: MICROSOFT_ISSUER, issuer: { kind: "tenant", template: MICROSOFT_ISSUER }, ...keys, allowHttp: false };
}

/** Whether an agency's issuer answers as an OpenID Connect provider (the SSO settings' check). */
export async function issuerAnswers(issuer: string): Promise<boolean> {
  try {
    await discover({ provider: "sso", discoveryUrl: wellKnown(issuer), discoveryIssuer: issuer, issuer: { kind: "exact", values: [issuer] }, clientId: "", clientSecret: "", allowHttp: isDemo() });
    return true;
  } catch {
    return false;
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
    const claims = await verifyIdToken(idToken, { keys: remoteKeys(d.jwksUri), issuer: client.issuer, clientId: client.clientId, nonce: request.nonce, now: new Date() });
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
