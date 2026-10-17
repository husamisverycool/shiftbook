/**
 * The provider's answer at /api/auth/oidc/[provider]/callback (decision 0033 and its security review),
 * through the database and the demo's stand-in (in-process): what signs someone in, and every answer
 * that must not — a state that is not this browser's, no cookie, an expired or altered cookie, another
 * provider's cookie, an `error` from the provider, a replayed answer, a connect finished in another
 * session — and the hand-off to the emailed code before a first link.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appKey } from "../../src/server/auth/crypto";
import { answerAuthorize, readAuthorize } from "../../src/server/auth/demo-idp";
import { DEMO_SSO_ISSUER } from "../../src/server/auth/demo-idp-config";
import { finishLinkProof, ssoConfigOf, type IdentityMail } from "../../src/server/auth/identities";
import { sealRequest, type FlowPurpose, type ProviderId } from "../../src/server/auth/oidc";
import { handleOidcCallback, openLink } from "../../src/server/auth/oidc-callback";
import { flowClient, startRequest } from "../../src/server/auth/oidc-flow";
import { demoSignIn, inviteMember, readSession, redeemLink, type AuthDeps, type LinkMail, type SessionInfo } from "../../src/server/auth/service";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER, RECRUITERS } from "../../src/server/demo/dataset";
import { clearDemoAgency, seedDemoAgency } from "../../src/server/demo/seed";
import type { OutgoingMail } from "../../src/server/mail/transport";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const sent: OutgoingMail[] = [];
const deps: AuthDeps = { db: app.db, mailTransport: () => ({ send: async (m) => (sent.push(m), { providerId: null }) }) };
const BASE = "http://localhost:3700";
const mail: IdentityMail = {
  code: (code, _u, c) => ({ subject: `Your code (${c.purpose})`, text: `Your code: ${code}`, html: "" }),
  linked: (i) => ({ subject: `${i.provider} connected`, text: `${i.provider} connected`, html: "" }),
  baseUrl: BASE,
};
const theOwner = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: "Demo Owner (demo)", role: "owner" as const };
const LENA = RECRUITERS[0].email;

beforeEach(async () => {
  sent.length = 0;
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await owner.db.delete(s.sessions);
  await owner.db.delete(s.signInFailures);
  await app.withAgency(DEMO_AGENCY.id, async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

/** A request started as the app starts it; the browser at the stand-in chooses `email`; the provider's answer. */
async function flow(provider: ProviderId, email: string, opts: { purpose?: FlowPurpose; session?: SessionInfo; agencyId?: string; userId?: string; next?: string } = {}) {
  const sso = provider === "sso" ? await ssoConfigOf(deps, DEMO_AGENCY.id, { demoMode: true }) : null;
  const client = flowClient(provider, BASE, sso)!;
  const { url, cookie } = await startRequest({
    client,
    purpose: opts.purpose ?? "sign_in",
    base: BASE,
    locale: "en",
    next: opts.next ?? null,
    ...(opts.session ? { userId: opts.session.userId, sessionId: opts.session.sessionId } : {}),
    ...(opts.agencyId ? { agencyId: opts.agencyId, userId: opts.userId } : {}),
  });
  const now = new Date();
  const asked = readAuthorize(new URL(url).searchParams, BASE, provider, now)!;
  return { cookie, params: new URL(answerAuthorize(asked, email, now)).searchParams };
}
const call = (provider: string, params: URLSearchParams, cookie: string | undefined, session: SessionInfo | null = null) =>
  handleOidcCallback({ provider, params, cookie, base: BASE, session, userAgent: "test", address: null, demoMode: true, deps, mail });
const FAILED = { location: "/en/sign-in?notice=provider_failed" };

describe("the callback", () => {
  it("signs in the account the provider vouches for, and only with this browser's own request", async () => {
    const { cookie, params } = await flow("google", LENA, { next: "/invoices" });
    const answer = (await call("google", params, cookie))!;
    expect(answer.location).toBe("/en/invoices");
    expect(await readSession(deps, answer.session)).toMatchObject({ email: LENA, demo: true });
  });

  it("refuses a state that is not the one this browser's cookie holds", async () => {
    const { cookie, params } = await flow("google", LENA);
    params.set("state", "someone-elses-state");
    expect(await call("google", params, cookie)).toEqual(FAILED);
  });

  it("refuses an answer without the request's cookie, with an expired one, or an altered one", async () => {
    const { cookie, params } = await flow("google", LENA);
    expect(await call("google", params, undefined)).toEqual(FAILED);
    const expired = sealRequest({ provider: "google", purpose: "sign_in", state: params.get("state")!, nonce: "n", verifier: "v", locale: "en", next: null, expiresAt: Date.now() - 1 }, appKey());
    expect(await call("google", params, expired)).toEqual(FAILED);
    expect(await call("google", params, `${cookie.slice(0, -6)}AAAAAA`)).toEqual(FAILED);
  });

  it("refuses another provider's cookie", async () => {
    const { cookie, params } = await flow("google", LENA);
    expect(await call("microsoft", params, cookie)).toEqual(FAILED);
  });

  it("refuses an answer that carries the provider's error, and an unknown provider", async () => {
    const { cookie, params } = await flow("google", LENA);
    const denied = new URLSearchParams({ state: params.get("state")!, error: "access_denied" });
    expect(await call("google", denied, cookie)).toEqual(FAILED);
    expect(await call("github", params, cookie)).toBeNull();
  });

  it("an answer replayed (the same code, the same cookie) signs no one in again", async () => {
    const { cookie, params } = await flow("google", LENA);
    expect((await call("google", params, cookie))!.session).toBeDefined();
    expect(await call("google", params, cookie)).toEqual(FAILED);
  });

  it("connects only to the very session that asked: finished in another session, nothing is linked", async () => {
    const started = await demoSignIn(deps, DEMO_AGENCY.id, DEMO_OWNER.id, "t");
    if (!started.ok) throw new Error("demo sign-in");
    const ownerSession = (await readSession(deps, started.token))!;
    const r = await inviteMember(deps, theOwner, { name: "Pat Lee", email: "pat@agency.example", role: "billing", locale: "en" }, (link): LinkMail => ({ subject: "Join", text: link, html: "" }), BASE);
    if (!r.ok) throw new Error(r.error);
    const pat = await redeemLink(deps, /sbau_[A-Za-z0-9_-]{43}/.exec(sent.at(-1)!.text)![0], "invite", "a long enough passphrase", "t");
    if (!pat.ok) throw new Error(pat.error);
    const patSession = (await readSession(deps, pat.token))!;
    const elsewhere = await flow("google", "owner@cedarrow.example.com", { purpose: "connect", session: ownerSession });
    expect(await call("google", elsewhere.params, elsewhere.cookie, patSession)).toEqual({ location: "/en/settings/account?identity=failed&provider=google" });
    expect(await call("google", elsewhere.params, elsewhere.cookie, null)).toEqual({ location: "/en/settings/account?identity=failed&provider=google" });
    expect(await owner.db.select().from(s.userIdentities)).toEqual([]);
    const here = await flow("google", "owner@cedarrow.example.com", { purpose: "connect", session: ownerSession });
    expect(await call("google", here.params, here.cookie, ownerSession)).toEqual({ location: "/en/settings/account?identity=connected&provider=google" });
    expect((await owner.db.select().from(s.userIdentities)).map((i) => i.userId)).toEqual([DEMO_OWNER.id]);
    expect(sent.filter((m) => m.subject === "google connected").map((m) => m.to.email)).toEqual([DEMO_OWNER.email]);
  });

  it("an agency's SSO hands a first link to the emailed code: nothing linked, no session, until the code is typed", async () => {
    const { cookie, params } = await flow("sso", DEMO_OWNER.email, { purpose: "sso", agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id });
    sent.length = 0;
    const answer = (await call("sso", params, cookie))!;
    expect([answer.location, answer.session]).toEqual(["/en/sign-in/link", undefined]);
    const waiting = openLink(answer.link, new Date())!;
    expect(waiting.link).toMatchObject({ provider: "sso", issuer: DEMO_SSO_ISSUER, userId: DEMO_OWNER.id, hint: "o***@cedarrow.example.com" });
    expect(openLink(answer.link, new Date(Date.now() + 11 * 60_000))).toBeNull();
    expect(await owner.db.select().from(s.userIdentities).where(sql`${s.userIdentities.removedAt} is null`)).toEqual([]);
    const code = /\d{6}/.exec(sent[0]!.text)![0];
    const done = await finishLinkProof(deps, waiting.link, code, { userAgent: "t", address: null, demoMode: true }, mail);
    expect(done).toMatchObject({ ok: true, next: "done" });
    // Linked now: the next SSO sign-in needs no code.
    const again = await flow("sso", DEMO_OWNER.email, { purpose: "sso", agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id });
    expect((await call("sso", again.params, again.cookie))!.session).toBeDefined();
  });
});
