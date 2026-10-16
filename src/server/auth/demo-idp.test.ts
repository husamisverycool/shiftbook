/**
 * The demo's stand-in providers (decision 0033) answer the real client code: discovery, the
 * authorization request, the code (once, with PKCE), a signed ID token the client verifies with the
 * published keys — for Google, Microsoft (tenant issuer, xms_edov) and the demo agency's SSO.
 */
import { createLocalJWKSet } from "jose";
import { describe, expect, it } from "vitest";
import { DEMO_TENANT_ID, demoClientId, demoClientSecret } from "./demo-idp-config";
import { answerAuthorize, demoDiscovery, demoJwks, demoToken, NOT_A_MEMBER, openAuthorize, readAuthorize, sealAuthorize } from "./demo-idp";
import { authorizationUrl, identityOf, newAuthRequest, parseDiscovery, TENANT_PLACEHOLDER, verifyIdToken, type IssuerRule, type OidcClient, type ProviderId } from "./oidc";

const BASE = "http://localhost:3700";

function clientFor(provider: ProviderId): OidcClient {
  const issuer: IssuerRule = provider === "microsoft" ? { kind: "tenant", template: `${BASE}/api/demo/idp/microsoft/${TENANT_PLACEHOLDER}/v2.0` } : { kind: "exact", values: [`${BASE}/api/demo/idp/${provider}`] };
  const discoveryIssuer = issuer.kind === "tenant" ? issuer.template : issuer.values[0]!;
  return { provider, discoveryUrl: "", discoveryIssuer, issuer, clientId: demoClientId(provider), clientSecret: demoClientSecret(provider), allowHttp: true };
}

async function signIn(provider: ProviderId, email: string) {
  const client = clientFor(provider);
  const d = parseDiscovery(demoDiscovery(BASE, provider), { allowHttp: true, expectedIssuer: client.discoveryIssuer });
  const r = newAuthRequest();
  const redirectUri = `${BASE}/api/auth/oidc/${provider}/callback`;
  const url = new URL(authorizationUrl(d, client, { redirectUri, state: r.state, nonce: r.nonce, verifier: r.verifier, locale: "es" }));
  const now = new Date();
  const request = openAuthorize(sealAuthorize(readAuthorize(url.searchParams, BASE, provider, now)!), now)!;
  expect(request.locale).toBe("es");
  const back = new URL(answerAuthorize(request, email, now));
  expect(back.searchParams.get("state")).toBe(r.state);
  const form = new URLSearchParams({ grant_type: "authorization_code", code: back.searchParams.get("code")!, redirect_uri: redirectUri, client_id: client.clientId, client_secret: client.clientSecret, code_verifier: r.verifier });
  const answer = await demoToken(form, BASE, provider, now);
  expect(answer.status).toBe(200);
  const claims = await verifyIdToken(answer.body.id_token as string, { keys: createLocalJWKSet(await demoJwks()), issuer: client.issuer, clientId: client.clientId, nonce: r.nonce, now });
  return { claims, form, redirectUri, request, now };
}

describe("the demo's stand-in providers", () => {
  it("Google: a verified email, and the same subject every time for the same account", async () => {
    const a = await signIn("google", "lena@cedarrow.example.com");
    const b = await signIn("google", "lena@cedarrow.example.com");
    expect(identityOf("google", a.claims)).toMatchObject({ issuer: `${BASE}/api/demo/idp/google`, email: "lena@cedarrow.example.com", emailVerified: true });
    expect(a.claims.sub).toBe(b.claims.sub);
  });

  it("Microsoft: the issuer names the tenant (tid), the email is vouched for by xms_edov", async () => {
    const { claims } = await signIn("microsoft", NOT_A_MEMBER);
    expect(claims.iss).toBe(`${BASE}/api/demo/idp/microsoft/${DEMO_TENANT_ID}/v2.0`);
    expect(identityOf("microsoft", claims)).toMatchObject({ email: NOT_A_MEMBER, emailVerified: true });
  });

  it("SSO: a verified email from the demo agency's own provider", async () => {
    const { claims } = await signIn("sso", "owner@cedarrow.example.com");
    expect(identityOf("sso", claims)).toMatchObject({ issuer: `${BASE}/api/demo/idp/sso`, email: "owner@cedarrow.example.com", emailVerified: true });
  });

  it("refuses a request it did not make: another client, another return address, no PKCE", () => {
    const ok = new URLSearchParams({ response_type: "code", client_id: demoClientId("google"), redirect_uri: `${BASE}/api/auth/oidc/google/callback`, scope: "openid email", state: "s", nonce: "n", code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256" });
    const now = new Date();
    expect(readAuthorize(ok, BASE, "google", now)).not.toBeNull();
    for (const [k, v] of [["client_id", "someone-else"], ["redirect_uri", "https://evil.example/cb"], ["code_challenge_method", "plain"], ["response_type", "token"]] as const) {
      const bad = new URLSearchParams(ok);
      bad.set(k, v);
      expect(readAuthorize(bad, BASE, "google", now)).toBeNull();
    }
    expect(openAuthorize("tampered", now)).toBeNull();
  });

  it("a cancelled choice goes back as access denied", () => {
    const now = new Date();
    const request = readAuthorize(new URLSearchParams({ response_type: "code", client_id: demoClientId("sso"), redirect_uri: `${BASE}/api/auth/oidc/sso/callback`, scope: "openid", state: "s1", nonce: "n", code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256" }), BASE, "sso", now)!;
    const back = new URL(answerAuthorize(request, "cancel", now));
    expect(Object.fromEntries(back.searchParams)).toEqual({ state: "s1", error: "access_denied" });
  });

  it("a code works once, only with its verifier and the client's secret", async () => {
    const { form, now } = await signIn("google", "billing@cedarrow.example.com");
    expect((await demoToken(form, BASE, "google", now)).body).toEqual({ error: "invalid_grant" });
    const other = await (async () => {
      const r = newAuthRequest();
      const client = clientFor("google");
      const d = parseDiscovery(demoDiscovery(BASE, "google"), { allowHttp: true });
      const url = new URL(authorizationUrl(d, client, { redirectUri: `${BASE}/api/auth/oidc/google/callback`, state: r.state, nonce: r.nonce, verifier: r.verifier }));
      const back = new URL(answerAuthorize(readAuthorize(url.searchParams, BASE, "google", now)!, "owner@cedarrow.example.com", now));
      return new URLSearchParams({ grant_type: "authorization_code", code: back.searchParams.get("code")!, redirect_uri: `${BASE}/api/auth/oidc/google/callback`, client_id: client.clientId, client_secret: client.clientSecret, code_verifier: r.verifier });
    })();
    const wrongVerifier = new URLSearchParams(other);
    wrongVerifier.set("code_verifier", newAuthRequest().verifier);
    expect((await demoToken(wrongVerifier, BASE, "google", now)).body).toEqual({ error: "invalid_grant" });
    const wrongSecret = new URLSearchParams(other);
    wrongSecret.set("client_secret", "nope");
    expect((await demoToken(wrongSecret, BASE, "google", now)).status).toBe(401);
    expect((await demoToken(other, BASE, "microsoft", now)).status).toBe(401);
    expect((await demoToken(other, BASE, "google", now)).status).toBe(200);
  });
});
