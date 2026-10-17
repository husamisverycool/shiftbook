/**
 * The demo's stand-in providers (decision 0033, review H1) answer the real client code IN-PROCESS:
 * discovery, the code (once, with PKCE), a signed ID token verified with the published keys — for
 * Google, Microsoft (tenant issuer, xms_edov) and the demo agency's SSO. The client's server-side
 * calls never leave the process: not to the app's own address, and not to whatever Host or
 * X-Forwarded-Proto a request claims. Only the browser's step uses the app's address.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerAuthorize, demoFetch, demoToken, NOT_A_MEMBER, openAuthorize, readAuthorize, sealAuthorize } from "./demo-idp";
import { DEMO_IDP_ORIGIN, DEMO_SSO_ISSUER, DEMO_TENANT_ID, demoClientId, demoClientSecret } from "./demo-idp-config";
import { newAuthRequest, pkceChallenge, type ProviderId } from "./oidc";
import { completeRequest, flowClient, startRequest } from "./oidc-flow";

const APP = "http://localhost:3700";
const SPOOFED = "https://evil.example:8443";
const SSO = { issuer: DEMO_SSO_ISSUER, clientId: demoClientId("sso"), clientSecret: demoClientSecret("sso") };
let outside: ReturnType<typeof vi.fn>;

beforeEach(() => {
  outside = vi.fn(async () => {
    throw new Error("the network was called");
  });
  vi.stubGlobal("fetch", outside);
});
afterEach(() => vi.unstubAllGlobals());

/** The whole flow as the browser and the callback run it, with `base` the address the request claimed. */
async function signIn(provider: ProviderId, email: string, base = APP) {
  const client = flowClient(provider, base, provider === "sso" ? SSO : null)!;
  const { url, cookie } = await startRequest({ client, purpose: "sign_in", base, locale: "es", next: null });
  const browser = new URL(url);
  // Only the browser's step goes to the app's address (its stand-in page).
  expect(browser.origin + browser.pathname).toBe(`${new URL(base).origin}/api/demo/idp/${provider}/authorize`);
  const now = new Date();
  const asked = openAuthorize(sealAuthorize(readAuthorize(browser.searchParams, base, provider, now)!), now)!;
  expect(asked.locale).toBe("es");
  const back = new URL(answerAuthorize(asked, email, now));
  return completeRequest(provider, back.searchParams, cookie, base, async () => SSO);
}

describe("the demo's stand-in providers, in-process", () => {
  it("Google: a verified email, Workspace-hosted (hd) for the demo agency's addresses; the same subject each time", async () => {
    const a = await signIn("google", "lena@cedarrow.example.com");
    const b = await signIn("google", "lena@cedarrow.example.com");
    if (!a.ok || !b.ok) throw new Error("refused");
    expect(a.identity).toMatchObject({ issuer: `${DEMO_IDP_ORIGIN}/google`, email: "lena@cedarrow.example.com", emailVerified: true, mailboxProven: true });
    expect(a.identity.subject).toBe(b.identity.subject);
    const outsider = await signIn("google", NOT_A_MEMBER);
    if (!outsider.ok) throw new Error("refused");
    expect(outsider.identity).toMatchObject({ emailVerified: true, mailboxProven: false });
    expect(outside).not.toHaveBeenCalled();
  });

  it("Microsoft: the issuer names the tenant (tid); the email is vouched for by xms_edov", async () => {
    const done = await signIn("microsoft", NOT_A_MEMBER);
    if (!done.ok) throw new Error("refused");
    expect(done.identity).toMatchObject({ issuer: `${DEMO_IDP_ORIGIN}/microsoft/${DEMO_TENANT_ID}/v2.0`, email: NOT_A_MEMBER, emailVerified: true });
  });

  it("SSO: a verified email from the demo agency's own provider, never taken as proof of the mailbox", async () => {
    const done = await signIn("sso", "owner@cedarrow.example.com");
    if (!done.ok) throw new Error("refused");
    expect(done.identity).toMatchObject({ issuer: DEMO_SSO_ISSUER, email: "owner@cedarrow.example.com", emailVerified: true, mailboxProven: false });
  });

  it("a request claiming another Host or scheme still never calls out: the server-side calls stay in-process", async () => {
    const done = await signIn("google", "owner@cedarrow.example.com", SPOOFED);
    expect(done.ok).toBe(true);
    const client = flowClient("microsoft", SPOOFED)!;
    expect(new URL(client.discoveryUrl).origin).toBe(DEMO_IDP_ORIGIN);
    expect(client.fetch).toBe(demoFetch);
    expect(outside).not.toHaveBeenCalled();
  });

  it("the in-process transport answers only the stand-in's own address", async () => {
    for (const url of [`${SPOOFED}/api/demo/idp/google/jwks`, `${APP}/api/demo/idp/google/.well-known/openid-configuration`, "http://169.254.169.254/latest/meta-data", "https://accounts.google.com/.well-known/openid-configuration"]) {
      await expect(demoFetch(url)).rejects.toThrow(/no outside call/);
    }
    expect((await demoFetch(`${DEMO_IDP_ORIGIN}/google/jwks`)).status).toBe(200);
    expect((await demoFetch(`${DEMO_IDP_ORIGIN}/nobody/jwks`)).status).toBe(404);
    expect(outside).not.toHaveBeenCalled();
  });

  it("refuses an authorization request it did not make: another client, another return address, no PKCE", () => {
    const ok = new URLSearchParams({ response_type: "code", client_id: demoClientId("google"), redirect_uri: `${APP}/api/auth/oidc/google/callback`, scope: "openid email", state: "s", nonce: "n", code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256" });
    const now = new Date();
    expect(readAuthorize(ok, APP, "google", now)).not.toBeNull();
    for (const [k, v] of [["client_id", "someone-else"], ["redirect_uri", "https://evil.example/cb"], ["code_challenge_method", "plain"], ["response_type", "token"]] as const) {
      const bad = new URLSearchParams(ok);
      bad.set(k, v);
      expect(readAuthorize(bad, APP, "google", now)).toBeNull();
    }
    expect(openAuthorize("tampered", now)).toBeNull();
  });

  it("a cancelled choice goes back as access denied", () => {
    const now = new Date();
    const asked = readAuthorize(new URLSearchParams({ response_type: "code", client_id: demoClientId("sso"), redirect_uri: `${APP}/api/auth/oidc/sso/callback`, scope: "openid", state: "s1", nonce: "n", code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256" }), APP, "sso", now)!;
    expect(Object.fromEntries(new URL(answerAuthorize(asked, "cancel", now)).searchParams)).toEqual({ state: "s1", error: "access_denied" });
  });

  it("a code works once, only with its verifier and the client's secret", async () => {
    const now = new Date();
    const grant = () => {
      const r = newAuthRequest();
      const asked = readAuthorize(new URLSearchParams({ response_type: "code", client_id: demoClientId("google"), redirect_uri: `${APP}/api/auth/oidc/google/callback`, scope: "openid email", state: "s", nonce: "n", code_challenge: pkceChallenge(r.verifier), code_challenge_method: "S256" }), APP, "google", now)!;
      const code = new URL(answerAuthorize(asked, "owner@cedarrow.example.com", now)).searchParams.get("code")!;
      return new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: `${APP}/api/auth/oidc/google/callback`, client_id: demoClientId("google"), client_secret: demoClientSecret("google"), code_verifier: r.verifier });
    };
    const form = grant();
    expect((await demoToken(form, "google", now)).status).toBe(200);
    expect((await demoToken(form, "google", now)).body).toEqual({ error: "invalid_grant" });
    const other = grant();
    const wrongVerifier = new URLSearchParams(other);
    wrongVerifier.set("code_verifier", newAuthRequest().verifier);
    expect((await demoToken(wrongVerifier, "google", now)).body).toEqual({ error: "invalid_grant" });
    const wrongSecret = new URLSearchParams(other);
    wrongSecret.set("client_secret", "nope");
    expect((await demoToken(wrongSecret, "google", now)).status).toBe(401);
    expect((await demoToken(other, "microsoft", now)).status).toBe(401);
    expect((await demoToken(other, "google", now)).status).toBe(200);
  });
});
