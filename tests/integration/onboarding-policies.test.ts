/**
 * Decision 0043: Settings › Onboarding. The agency edits the policies workers acknowledge; each change
 * is a new version, and a worker who acknowledged an older version of a required policy is asked again
 * (Home's card, the onboarding step). Optional and future policies ask nobody today; a removed policy
 * stops being asked. Owner and Coordinator only; versions are never changed, and deleted only by the
 * demo's reset; a worker's session never writes one.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import type { Actor } from "../../src/server/session";
import { agencyToday } from "../../src/server/settings";
import { withWorker } from "../../src/server/worker-app/fence";
import { currentPolicies, policiesView, removePolicy, savePolicy } from "../../src/server/worker-app/policies";
import { homeOf, onboardingOf, saveStep } from "../../src/server/worker-app/service";
import { databaseError, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const coordinator: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const recruiter: Actor = { ...coordinator, role: "recruiter", label: "Test recruiter" };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(DEMO_AGENCY.id, fn);
const DANIEL = workerId("daniel-ruiz");
const daniel = { agencyId: DEMO_AGENCY.id, workerId: DANIEL, label: "Daniel Ruiz (worker app)" };
const asDaniel = <T>(fn: Parameters<typeof withWorker<T>>[2]) => withWorker(app.db, daniel, fn);
const all = { policy_safety: "on", policy_harassment: "on", policy_timekeeping: "on" };
let today = "";
const ctx = () => ({ today, now: new Date(), address: null, userAgent: null });
const later = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  await owner.db.delete(s.workerOnboarding).where(eq(s.workerOnboarding.agencyId, DEMO_AGENCY.id));
  today = await inAgency((tx) => agencyToday(tx));
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("onboarding policies with versions", () => {
  it("asks again for a required policy changed after the worker acknowledged it, and only that one", async () => {
    // Daniel acknowledges the three built-in policies (version 1 of each).
    expect(await asDaniel((tx) => saveStep(tx, daniel, "policies", all, ctx()))).toEqual({ ok: true });
    expect((await asDaniel((tx) => homeOf(tx, DANIEL, today))).policiesDue).toBe(0);

    // The coordinator rewrites the safety policy from today: version 2. The others stay at version 1.
    const saved = await inAgency((tx) => savePolicy(tx, coordinator, { key: "safety", titleEn: "Safety on site", bodyEn: "Wear the gear the job needs. Report injuries the same day, to your coordinator.", effectiveFrom: today }));
    expect(saved).toEqual({ ok: true, key: "safety", version: 2 });
    const versions = await inAgency((tx) => tx.select({ key: s.onboardingPolicies.policyKey, version: s.onboardingPolicies.version }).from(s.onboardingPolicies));
    expect(versions).toHaveLength(4);

    expect((await asDaniel((tx) => homeOf(tx, DANIEL, today))).policiesDue).toBe(1);
    const step = await asDaniel((tx) => onboardingOf(tx, DANIEL, today));
    expect(step.policiesDue).toBe(1);
    expect(step.policies.find((p) => p.key === "safety")).toMatchObject({ version: 2, title: { en: "Safety on site", es: null }, at: null });
    const view = await inAgency((tx) => policiesView(tx));
    expect(Object.fromEntries(view.current.map((p) => [p.key, p.owing]))).toEqual({ safety: 1, harassment: 0, timekeeping: 0 });

    // A required policy must be ticked again; once it is, nothing is due and the acknowledgment names version 2.
    expect(await asDaniel((tx) => saveStep(tx, daniel, "policies", { policy_harassment: "on", policy_timekeeping: "on" }, ctx()))).toEqual({ ok: false, field: "policies" });
    expect(await asDaniel((tx) => saveStep(tx, daniel, "policies", all, ctx()))).toEqual({ ok: true });
    expect((await asDaniel((tx) => homeOf(tx, DANIEL, today))).policiesDue).toBe(0);
    const [row] = await owner.db.select({ policies: s.workerOnboarding.policies }).from(s.workerOnboarding).where(eq(s.workerOnboarding.workerId, DANIEL));
    expect(row!.policies.find((p) => p.key === "safety")!.version).toBe(2);
  });

  it("counts an acknowledgment saved before versions as version 1", async () => {
    await asDaniel((tx) => saveStep(tx, daniel, "policies", all, ctx()));
    await owner.db
      .update(s.workerOnboarding)
      .set({ policies: ["safety", "harassment", "timekeeping"].map((key) => ({ key, at: "2026-09-01T12:00:00.000Z" })) })
      .where(eq(s.workerOnboarding.workerId, DANIEL));
    await inAgency((tx) => savePolicy(tx, coordinator, { key: "timekeeping", titleEn: "Your hours", bodyEn: "Clock in and out yourself.", effectiveFrom: today }));
    expect((await asDaniel((tx) => homeOf(tx, DANIEL, today))).policiesDue).toBe(1);
  });

  it("asks nobody for an optional policy or one that starts later; removing a policy stops it", async () => {
    await asDaniel((tx) => saveStep(tx, daniel, "policies", all, ctx()));
    expect(await inAgency((tx) => savePolicy(tx, coordinator, { titleEn: "Parking", bodyEn: "Park in the visitor lot.", titleEs: "Estacionamiento", bodyEs: "Estacione en el lote de visitantes.", required: false, effectiveFrom: today }))).toEqual({ ok: true, key: "parking", version: 1 });
    expect(await inAgency((tx) => savePolicy(tx, coordinator, { titleEn: "Phones", bodyEn: "No phones on the line.", effectiveFrom: later(7) }))).toEqual({ ok: true, key: "phones", version: 1 });
    expect((await asDaniel((tx) => homeOf(tx, DANIEL, today))).policiesDue).toBe(0);
    expect((await inAgency((tx) => policiesView(tx))).upcoming.map((p) => p.key)).toEqual(["phones"]);
    expect((await inAgency((tx) => currentPolicies(tx, later(7)))).map((p) => p.key).sort()).toEqual(["harassment", "parking", "phones", "safety", "timekeeping"]);

    expect(await inAgency((tx) => removePolicy(tx, coordinator, "harassment", today))).toEqual({ ok: true, key: "harassment", version: 2 });
    expect((await inAgency((tx) => currentPolicies(tx, today))).map((p) => p.key).sort()).toEqual(["parking", "safety", "timekeeping"]);
    expect(await inAgency((tx) => removePolicy(tx, coordinator, "harassment", today))).toEqual({ ok: false, error: "not_found" });
    // Daniel's onboarding step no longer requires it.
    expect(await asDaniel((tx) => saveStep(tx, daniel, "policies", { policy_safety: "on", policy_timekeeping: "on" }, ctx()))).toEqual({ ok: true });
  });

  it("refuses other roles, bad input and a past date; versions are never changed and a worker never writes one", async () => {
    const input = { titleEn: "Breaks", bodyEn: "Take your breaks.", effectiveFrom: today };
    expect(await inAgency((tx) => savePolicy(tx, recruiter, input))).toEqual({ ok: false, error: "forbidden" });
    expect(await inAgency((tx) => removePolicy(tx, recruiter, "safety", today))).toEqual({ ok: false, error: "forbidden" });
    expect(await inAgency((tx) => savePolicy(tx, coordinator, { ...input, titleEn: " ", titleEs: "Descansos", effectiveFrom: "2020-01-01" }))).toEqual({ ok: false, error: "invalid", problems: ["title_en", "body_es", "effective_from"] });
    expect(await inAgency((tx) => savePolicy(tx, coordinator, { ...input, key: "nope" }))).toEqual({ ok: false, error: "not_found" });

    await inAgency((tx) => savePolicy(tx, coordinator, input));
    expect(await databaseError(inAgency((tx) => tx.update(s.onboardingPolicies).set({ bodyEn: "rewritten" })))).toMatch(/permission denied/);
    expect(await databaseError(asDaniel((tx) => tx.insert(s.onboardingPolicies).values({ agencyId: DEMO_AGENCY.id, policyKey: "mine", version: 1, titleEn: "x", bodyEn: "x", effectiveFrom: today, createdByLabel: "x" })))).toMatch(/row-level security/);
    // Outside the demo, versions stay on record: the delete is refused (rolled back here).
    const refused = await databaseError(
      owner.db.transaction(async (tx) => {
        await tx.update(s.agencies).set({ isDemo: false }).where(eq(s.agencies.id, DEMO_AGENCY.id));
        await tx.execute(sql`delete from onboarding_policies where agency_id = ${DEMO_AGENCY.id}`);
      }),
    );
    expect(refused).toMatch(/kept/);
    const [demo] = await owner.db.select({ isDemo: s.agencies.isDemo }).from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
    expect(demo!.isDemo).toBe(true);
  });
});
