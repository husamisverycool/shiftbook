/**
 * Slice ab, onboarding (docs/patterns/_emails/onboarding.md) through the database: a signed-up agency's
 * first Owner is welcomed once; the daily sweep sends one setup reminder naming the next step (at most
 * two, stopping once set up) and the free days ending; never for the demo, never to anyone but the Owner.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { completeSignup, requestSignup, type SignupDeps, type SignupRender } from "../../src/server/auth/signup";
import { readSession, type AuthDeps } from "../../src/server/auth/service";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER } from "../../src/server/demo/dataset";
import type { OutgoingMail } from "../../src/server/mail/transport";
import { onboardingSweep, sendWelcome } from "../../src/server/onboarding/service";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const sent: OutgoingMail[] = [];
let clock = new Date();
const transport = { send: async (m: OutgoingMail) => (sent.push(m), { providerId: null }) };
const signup: SignupDeps = { db: app.db, mail: transport, now: () => clock };
const auth: AuthDeps = { db: app.db, mailTransport: () => transport, now: () => clock };
const deps = { mailTransport: () => transport, baseUrl: "https://app.example", now: () => clock };
const render: SignupRender = { link: (link, code) => ({ subject: "Confirm", text: `${link} ${code}`, html: "" }), existing: () => ({ subject: "x", text: "x", html: "" }) };
const DAY = 24 * 60 * 60 * 1000;
let n = 0;

async function newAgency(trialDays = 30) {
  const email = `onboard.${Date.now()}.${(n += 1)}@new-agency.example`;
  await requestSignup(signup, { email, name: "Robin Vega", agencyName: "Harbor Light Staffing", locale: "en" }, null, render, "https://app.example");
  const token = /sbau_[A-Za-z0-9_-]{43}/.exec(sent.at(-1)!.text)![0];
  const done = await completeSignup(signup, token, "a long enough passphrase", "test", { trialDays });
  if (!done.ok) throw new Error(done.error);
  const session = (await readSession(auth, done.token))!;
  sent.length = 0;
  return { agencyId: session.agencyId, userId: session.userId, email };
}

beforeEach(() => {
  sent.length = 0;
  clock = new Date();
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("onboarding emails (slice ab)", () => {
  it("the welcome goes once, from Tabulado, to the first Owner, with one next step and the free days' end", async () => {
    const a = await newAgency();
    expect(await sendWelcome(deps, app.withAgency, a.agencyId, a.userId)).toBe(true);
    expect(await sendWelcome(deps, app.withAgency, a.agencyId, a.userId)).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ fromName: "Tabulado", to: { email: a.email, name: "Robin Vega" }, subject: "Harbor Light Staffing is ready on Tabulado" });
    expect(sent[0]!.text).toMatch(/^Welcome to Tabulado, Robin/);
    expect(sent[0]!.text).toContain("free days run until");
    expect(sent[0]!.text).toContain("Open Tabulado:\nhttps://app.example/en");
    const kept = await app.withAgency(a.agencyId, (tx) => tx.select().from(s.emailMessages).where(eq(s.emailMessages.kind, "welcome")));
    expect(kept).toEqual([expect.objectContaining({ status: "sent", toEmail: a.email })]);
  });

  it("the setup reminder: none at first; at two days it names the next step and links to it; a second three days later; never a third", async () => {
    const a = await newAgency();
    expect(await onboardingSweep(deps, app.withAgency, a.agencyId)).toBe(0);
    clock = new Date(Date.now() + 2 * DAY + 60_000);
    expect(await onboardingSweep(deps, app.withAgency, a.agencyId)).toBe(1);
    expect(sent[0]!.subject).toBe("Add your agency's details");
    expect(sent[0]!.text).toContain("Open agency settings:\nhttps://app.example/en/settings/agency");
    expect(await onboardingSweep(deps, app.withAgency, a.agencyId)).toBe(0);
    clock = new Date(clock.getTime() + 3 * DAY);
    expect(await onboardingSweep(deps, app.withAgency, a.agencyId)).toBe(1);
    clock = new Date(clock.getTime() + 10 * DAY);
    const third = await onboardingSweep(deps, app.withAgency, a.agencyId);
    // Ten days later the free days' notice may be due, but never a third reminder.
    expect(sent.filter((m) => m.subject === "Add your agency's details")).toHaveLength(2);
    expect(third).toBeLessThanOrEqual(1);
  });

  it("the free days ending: at 7 days and at 3 days, once each; none once subscribed", async () => {
    const a = await newAgency(10);
    const trialEnding = () => sent.filter((m) => m.subject.startsWith("Your free days end on"));
    // Keep the reminders out of the way: they have already gone.
    await owner.db.insert(s.emailMessages).values([0, 1].map(() => ({ agencyId: a.agencyId, kind: "setup_nudge" as const, toEmail: a.email, subject: "x", textBody: "x", status: "sent" as const, createdAt: new Date() })));
    clock = new Date(Date.now() + 3 * DAY + 60_000);
    await onboardingSweep(deps, app.withAgency, a.agencyId);
    expect(trialEnding()).toHaveLength(1);
    expect(trialEnding()[0]!.text).toContain("Start subscription:\nhttps://app.example/en/settings/billing");
    await onboardingSweep(deps, app.withAgency, a.agencyId);
    expect(trialEnding()).toHaveLength(1);
    clock = new Date(Date.now() + 7 * DAY + 60_000);
    await onboardingSweep(deps, app.withAgency, a.agencyId);
    expect(trialEnding()).toHaveLength(2);

    const b = await newAgency(10);
    await owner.db.update(s.agencySubscriptions).set({ status: "active", stripeSubscriptionId: "sub_test2" }).where(eq(s.agencySubscriptions.agencyId, b.agencyId));
    clock = new Date(Date.now() + 3 * DAY + 60_000);
    sent.length = 0;
    await onboardingSweep(deps, app.withAgency, b.agencyId);
    expect(trialEnding()).toHaveLength(0);
  });

  it("never for the demo agency, nor to anyone but its Owner", async () => {
    clock = new Date(Date.now() + 40 * DAY);
    expect(await onboardingSweep(deps, app.withAgency, DEMO_AGENCY.id)).toBe(0);
    expect(await sendWelcome(deps, app.withAgency, DEMO_AGENCY.id, DEMO_OWNER.id)).toBe(false);
    const a = await newAgency();
    expect(await sendWelcome(deps, app.withAgency, a.agencyId, DEMO_OWNER.id)).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe("onboarding emails under load (security review L3)", () => {
  it("two setups finishing at once welcome the Owner once", async () => {
    const a = await newAgency();
    const both = await Promise.all([sendWelcome(deps, app.withAgency, a.agencyId, a.userId), sendWelcome(deps, app.withAgency, a.agencyId, a.userId)]);
    expect(both.filter(Boolean)).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });
});
