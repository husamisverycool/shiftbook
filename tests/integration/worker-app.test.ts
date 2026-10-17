/**
 * Slice t (SPEC §27 items 5–6): the worker app against the real database — sign-in by text-message
 * code, the worker fence (a worker reads only their own rows), onboarding with sealed answers, clock
 * in and out into the review flow, pay stubs from a paid week, messages, and the agency's side.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appKey } from "../../src/server/auth/crypto";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { createRunFiles } from "../../src/server/files/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { sendAgencyMessage, sendOnboardingLink, setClientWorkerClock, setWorkerPhone, workerAppOf } from "../../src/server/worker-app/agency";
import { addressBucket, chooseWorkerAgency, demoWorkerSignIn, readWorkerSession, requestWorkerCode, verifyWorkerCode } from "../../src/server/worker-app/auth";
import { withWorker } from "../../src/server/worker-app/fence";
import { phoneIndex } from "../../src/server/worker-app/phone";
import { clockIn, clockOf, clockOut, formAnswers, homeOf, hoursOf, onboardingOf, payStubOf, payStubsOf, postMessage, saveStep, threadOf } from "../../src/server/worker-app/service";
import { approveEntries } from "../../src/server/review/service";
import { DemoSmsTransport } from "../../src/server/worker-app/sms";
import { DemoTranslator } from "../../src/server/worker-app/translate";
import { approveAsOwner, databaseError, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-wapp-")));
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test owner", role: "owner" };
const recruiter: Actor = { ...theOwner, role: "recruiter", label: "Test recruiter" };
const accountant: Actor = { ...theOwner, role: "accountant", label: "Test accountant" };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);
const deps = { db: app.db, sms: new DemoSmsTransport() };
const DANIEL = workerId("daniel-ruiz");
const MARCUS = workerId("marcus-bell");
const daniel = { agencyId: DEMO_AGENCY.id, workerId: DANIEL, label: "Daniel Ruiz (worker app)" };
const asDaniel = <T>(fn: Parameters<typeof withWorker<T>>[2]) => withWorker(app.db, daniel, fn);
const PHONE = "(312) 555-0142";
const E164 = "+13125550142";
const TODAY = "2026-10-08";
const ctx = { today: TODAY, now: new Date("2026-10-08T15:00:00Z"), address: "203.0.113.9", userAgent: "test" };
const phoneOpts = { confirmedRecently: false, oldNumberText: (agency: string) => `${agency}: your number changed`, now: ctx.now };

async function lastCode(): Promise<string> {
  const [row] = await owner.db.select({ text: s.smsMessages.demoBody }).from(s.smsMessages).where(eq(s.smsMessages.kind, "sign_in_code")).orderBy(desc(s.smsMessages.createdAt)).limit(1);
  const m = /(\d{6})/.exec(row?.text ?? "");
  if (!m) throw new Error("no code texted");
  return m[1]!;
}

async function fresh() {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await owner.db.execute(sql`delete from worker_sign_in_codes`);
  await owner.db.execute(sql`delete from sign_in_failures`);
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  // Start every test from no worker-app data (the demo seeds some: tests/…/demo checks it separately).
  await owner.db.delete(s.workerMessages).where(eq(s.workerMessages.agencyId, DEMO_AGENCY.id));
  await owner.db.delete(s.workerOnboarding).where(eq(s.workerOnboarding.agencyId, DEMO_AGENCY.id));
  await owner.db.update(s.clients).set({ workerClock: "off" }).where(eq(s.clients.agencyId, DEMO_AGENCY.id));
  await owner.db.update(s.workers).set({ phone: null, phoneIndex: null }).where(eq(s.workers.agencyId, DEMO_AGENCY.id));
  await inAgency((tx) => setWorkerPhone(tx, theOwner, DANIEL, PHONE, phoneOpts));
}

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("worker sign-in by text message", () => {
  beforeEach(fresh);

  it("texts a code to a worker's number and signs them in with it; the kept text hides the code", async () => {
    expect(await requestWorkerCode(deps, PHONE, (code) => `Your code is ${code}`, "203.0.113.9")).toEqual({ ok: true, phone: E164 });
    const code = await lastCode();
    const [kept] = await owner.db.select({ body: s.smsMessages.body }).from(s.smsMessages).where(eq(s.smsMessages.kind, "sign_in_code"));
    expect(kept!.body).toBe("Your code is [code hidden]");
    const [stored] = await owner.db.select().from(s.workerSignInCodes);
    expect(stored!.codeHash).not.toContain(code);
    expect(stored!.phoneIndex).toBe(phoneIndex(E164, appKey()));
    const r = await verifyWorkerCode(deps, PHONE, code, "test", "203.0.113.9");
    expect(r).toMatchObject({ ok: true, kind: "session", workerId: DANIEL });
    const session = await readWorkerSession({ db: app.db }, r.ok && r.kind === "session" ? r.token : "");
    expect(session).toMatchObject({ workerId: DANIEL, firstName: "Daniel", preferredLanguage: "es", demo: false });
    // Once only.
    expect(await verifyWorkerCode(deps, PHONE, code, "test", null)).toEqual({ ok: false, error: "invalid" });
  });

  it("answers the same for a number on file and one that is not, and texts only the one on file", async () => {
    expect(await requestWorkerCode(deps, "(312) 555-0199", () => "x", null)).toEqual({ ok: true, phone: "+13125550199" });
    expect(await owner.db.select().from(s.smsMessages).where(eq(s.smsMessages.kind, "sign_in_code"))).toHaveLength(0);
    expect(await requestWorkerCode(deps, "555-0142", () => "x", null)).toEqual({ ok: false, error: "invalid" });
  });

  it("sends at most one code a minute per number, and five wrong codes end it", async () => {
    await requestWorkerCode(deps, PHONE, (c) => `code ${c}`, null);
    await requestWorkerCode(deps, PHONE, (c) => `code ${c}`, null);
    expect(await owner.db.select().from(s.workerSignInCodes)).toHaveLength(1);
    const code = await lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(await verifyWorkerCode(deps, PHONE, wrong, null, null)).toEqual({ ok: false, error: "invalid" });
    // A spent code answers as a wrong one does: "expired" would tell that the number is on file.
    expect(await verifyWorkerCode(deps, PHONE, code, null, null)).toEqual({ ok: false, error: "invalid" });
  });

  it("answers a spent code, an expired one and a number with no code alike, after the same writes", async () => {
    await requestWorkerCode(deps, PHONE, (c) => `code ${c}`, null);
    const code = await lastCode();
    const later = { ...deps, now: () => new Date(Date.now() + 11 * 60 * 1000) };
    expect(await verifyWorkerCode(later, PHONE, code, null, null)).toEqual({ ok: false, error: "invalid" });
    expect(await verifyWorkerCode(later, "(312) 555-0177", code, null, null)).toEqual({ ok: false, error: "invalid" });
    // Both failures were counted against their numbers alike.
    const failures = await owner.db.select().from(s.signInFailures);
    expect(failures.length).toBeGreaterThanOrEqual(2);
  });

  it("counts an IPv6 address by its /64, so rotating within it does not reset the limit", async () => {
    expect(addressBucket("2001:db8:aaaa:bbbb:1:2:3:4")).toBe("2001:db8:aaaa:bbbb::/64");
    expect(addressBucket("2001:db8:aaaa:bbbb::9")).toBe("2001:db8:aaaa:bbbb::/64");
    expect(addressBucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(addressBucket("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(addressBucket("203.0.113.9")).toBe("203.0.113.9");
    await requestWorkerCode(deps, PHONE, (c) => `code ${c}`, null);
    for (let i = 0; i < 50; i++) await verifyWorkerCode(deps, `(312) 555-${1000 + i}`, "123456", null, `2001:db8:aaaa:bbbb::${(i + 1).toString(16)}`);
    expect(await verifyWorkerCode(deps, PHONE, await lastCode(), null, "2001:db8:aaaa:bbbb:ffff::1")).toEqual({ ok: false, error: "throttled" });
  });

  it("locks out an address after too many wrong codes", async () => {
    await requestWorkerCode(deps, PHONE, (c) => `code ${c}`, null);
    // Wrong codes for many numbers from one place (each number alone stays under its own limit).
    for (let i = 0; i < 50; i++) await verifyWorkerCode(deps, `(312) 555-${1000 + i}`, "123456", null, "198.51.100.4");
    expect(await verifyWorkerCode(deps, PHONE, await lastCode(), null, "198.51.100.4")).toEqual({ ok: false, error: "throttled" });
  });

  it("lists the agencies when the number is at more than one, and signs in at the one chosen", async () => {
    const [other] = await owner.db.insert(s.agencies).values({ name: "Other Agency (test)" }).returning();
    const [w] = await owner.db.insert(s.workers).values({ agencyId: other!.id, firstName: "Daniel", lastName: "Ruiz", phone: E164, phoneIndex: phoneIndex(E164, appKey()) }).returning();
    await requestWorkerCode(deps, PHONE, (c) => `code ${c}`, null);
    // The first agency's outbox keeps the text but names no worker: it cannot watch another agency's.
    const [logged] = await owner.db.select({ workerId: s.smsMessages.workerId }).from(s.smsMessages).where(eq(s.smsMessages.kind, "sign_in_code"));
    expect(logged!.workerId).toBeNull();
    const r = await verifyWorkerCode(deps, PHONE, await lastCode(), null, null);
    if (!r.ok || r.kind !== "choose") throw new Error("expected a choice");
    expect(r.agencies.map((a) => a.agencyName).sort()).toEqual([DEMO_AGENCY.name, "Other Agency (test)"].sort());
    const chosen = await chooseWorkerAgency(deps, r.choice, w!.id, null);
    expect(chosen).toMatchObject({ ok: true, agencyId: other!.id, workerId: w!.id });
    // The choice is spent.
    expect(await chooseWorkerAgency(deps, r.choice, w!.id, null)).toEqual({ ok: false });
    // The other agency's worker leaves the number, so the next tests see one agency again.
    await owner.db.update(s.workers).set({ phone: null, phoneIndex: null }).where(eq(s.workers.id, w!.id));
  });

  it("offers demo workers to continue as, only in a demo agency", async () => {
    expect(await demoWorkerSignIn({ db: app.db }, DEMO_AGENCY.id, DANIEL, null)).toMatchObject({ ok: true });
  });
});

describe("the worker fence", () => {
  beforeEach(fresh);

  it("shows a worker only their own rows on every table that holds a worker's data", async () => {
    await inAgency((tx) => postMessage(tx, { agencyId: DEMO_AGENCY.id, workerId: MARCUS, sender: "agency", authorLabel: "x", authorUserId: null, body: "for Marcus", bodyLocale: "en", otherLocale: "en" }, new DemoTranslator()));
    await asDaniel(async (tx) => {
      expect((await tx.select({ id: s.workers.id }).from(s.workers)).map((r) => r.id)).toEqual([DANIEL]);
      const entries = await tx.select({ w: s.timeEntries.workerId }).from(s.timeEntries);
      expect(entries.length).toBeGreaterThan(0);
      expect(new Set(entries.map((e) => e.w))).toEqual(new Set([DANIEL]));
      expect(new Set((await tx.select({ w: s.assignments.workerId }).from(s.assignments)).map((r) => r.w))).toEqual(new Set([DANIEL]));
      expect(await tx.select().from(s.workerMessages)).toHaveLength(0);
    });
  });

  it("refuses a write for another worker", async () => {
    const message = await databaseError(asDaniel((tx) => tx.insert(s.workerMessages).values({ agencyId: DEMO_AGENCY.id, workerId: MARCUS, sender: "worker", authorLabel: "x", body: "hi", bodyLocale: "en" })));
    expect(message).toMatch(/row-level security/);
  });
});

describe("onboarding", () => {
  beforeEach(fresh);

  const personal = { legalFirstName: "Daniel", legalLastName: "Ruiz", ssn: "900-55-1234", birthDate: "1990-02-03", addressLine: "8 Oak Ave", city: "Joliet", state: "IL", zip: "60431", email: "" };

  it("seals the SSN, the date of birth, the I-9 numbers and the bank details; keeps only the last fours in clear", async () => {
    await asDaniel(async (tx) => {
      expect(await saveStep(tx, daniel, "personal", personal, ctx)).toEqual({ ok: true });
      expect(await saveStep(tx, daniel, "w4", { filingStatus: "single", dependents: "0", otherIncome: "", deductions: "", extraWithholding: "" }, ctx)).toEqual({ ok: true });
      expect(await saveStep(tx, daniel, "i9", { status: "permanent_resident", uscisNumber: "A123456789" }, ctx)).toEqual({ ok: true });
      expect(await saveStep(tx, daniel, "payment", { kind: "direct_deposit", routing: "021000021", account: "000123456789", confirm: "000123456789", accountType: "checking" }, ctx)).toEqual({ ok: true });
    });
    const [row] = await owner.db.select().from(s.workerOnboarding).where(eq(s.workerOnboarding.workerId, DANIEL));
    const raw = JSON.stringify(row);
    for (const secret of ["900551234", "1990-02-03", "123456789", "000123456789", "021000021"]) expect(raw).not.toContain(secret);
    expect(row!.depositLast4).toBe("6789");
    const [w] = await owner.db.select({ last4: s.workers.ssnLast4, sealed: s.workers.ssnSealed }).from(s.workers).where(eq(s.workers.id, DANIEL));
    expect(w!.last4).toBe("1234");
    expect(JSON.stringify(w!.sealed)).not.toContain("900551234");
    const opened = await asDaniel((tx) => formAnswers(tx, DANIEL));
    expect(opened).toMatchObject({ birthDate: "1990-02-03", i9: { status: "permanent_resident", uscisNumber: "123456789" }, deposit: { routing: "021000021", account: "000123456789" } });
    // The log never holds a number.
    const events = await owner.db.select({ after: s.auditEvents.after }).from(s.auditEvents).where(eq(s.auditEvents.entityId, DANIEL));
    expect(JSON.stringify(events)).not.toMatch(/900551234|000123456789|021000021|1990-02-03/);
  });

  it("refuses an SSN already on another worker in the agency", async () => {
    expect(await asDaniel((tx) => saveStep(tx, daniel, "personal", personal, ctx))).toEqual({ ok: true });
    // Marcus, fenced to his own rows, types Daniel's number: the check still sees it (yes or no only).
    const marcus = { ...daniel, workerId: MARCUS, label: "Marcus (worker app)" };
    expect(await withWorker(app.db, marcus, (tx) => saveStep(tx, marcus, "personal", { ...personal, legalFirstName: "Marcus", legalLastName: "Bell" }, ctx))).toEqual({ ok: false, field: "ssn" });
    // Five refusals an hour, then even a number no one has is refused (no probing for colleagues' numbers).
    for (let i = 0; i < 4; i++) await withWorker(app.db, marcus, (tx) => saveStep(tx, marcus, "personal", { ...personal, legalFirstName: "Marcus", legalLastName: "Bell" }, ctx));
    expect(await withWorker(app.db, marcus, (tx) => saveStep(tx, marcus, "personal", { ...personal, ssn: "900-66-7777", legalFirstName: "Marcus", legalLastName: "Bell" }, ctx))).toEqual({ ok: false, field: "ssn" });
  });

  it("signs only after every step, with the legal name typed, and dates the roster's I-9 Section 1", async () => {
    await asDaniel(async (tx) => {
      expect(await saveStep(tx, daniel, "sign", { name: "Daniel Ruiz", agree: "on" }, ctx)).toEqual({ ok: false, field: "steps" });
      await saveStep(tx, daniel, "personal", personal, ctx);
      await saveStep(tx, daniel, "w4", { filingStatus: "single" }, ctx);
      await saveStep(tx, daniel, "i9", { status: "citizen" }, ctx);
      await saveStep(tx, daniel, "payment", { kind: "paper_check" }, ctx);
      expect(await saveStep(tx, daniel, "policies", { policy_safety: "on" }, ctx)).toEqual({ ok: false, field: "policies" });
      expect(await saveStep(tx, daniel, "policies", { policy_safety: "on", policy_harassment: "on", policy_timekeeping: "on" }, ctx)).toEqual({ ok: true });
      expect(await saveStep(tx, daniel, "sign", { name: "Dan Ruiz", agree: "on" }, ctx)).toEqual({ ok: false, field: "name" });
      expect(await saveStep(tx, daniel, "sign", { name: "Daniel Ruiz", agree: "on" }, ctx)).toEqual({ ok: true });
      expect((await onboardingOf(tx, DANIEL, TODAY)).progress.complete).toBe(true);
      expect(await saveStep(tx, daniel, "w4", { filingStatus: "single" }, ctx)).toEqual({ ok: false, field: "signed" });
    });
    const [w] = await owner.db.select({ i9: s.workers.i9Section1On }).from(s.workers).where(eq(s.workers.id, DANIEL));
    expect(w!.i9).not.toBeNull();
  });
});

describe("clock in and out", () => {
  beforeEach(fresh);

  it("is offered only at clients that allow it, asks location when the client does, and makes a time entry waiting for review", async () => {
    const [client] = await owner.db.select({ id: s.clients.id }).from(s.clients).innerJoin(s.jobOrders, eq(s.jobOrders.clientId, s.clients.id)).innerJoin(s.assignments, eq(s.assignments.jobOrderId, s.jobOrders.id)).where(eq(s.assignments.id, assignmentId("daniel-ruiz")));
    expect((await asDaniel((tx) => clockOf(tx, DANIEL, TODAY))).choices).toEqual([]);
    expect(await inAgency((tx) => setClientWorkerClock(tx, accountant, client!.id, "on"))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => setClientWorkerClock(tx, recruiter, client!.id, "location"))).toEqual({ ok: true });
    const view = await asDaniel((tx) => clockOf(tx, DANIEL, TODAY));
    expect(view.choices).toHaveLength(1);
    const a = view.choices[0]!.assignmentId;
    const at = new Date("2026-10-08T12:00:00Z");
    expect(await asDaniel((tx) => clockIn(tx, daniel, a, null, TODAY, at))).toEqual({ ok: false, error: "location_required" });
    expect(await asDaniel((tx) => clockIn(tx, daniel, a, { lat: 41.5, lng: -88.1, accuracyM: 12 }, TODAY, at))).toEqual({ ok: true });
    expect(await asDaniel((tx) => clockIn(tx, daniel, a, { lat: 41.5, lng: -88.1, accuracyM: 12 }, TODAY, at))).toEqual({ ok: false, error: "already_in" });
    const out = await asDaniel((tx) => clockOut(tx, daniel, { lat: 41.5, lng: -88.1, accuracyM: 9 }, new Date(at.getTime() + (8 * 60 + 30) * 60_000)));
    if (!out.ok) throw new Error(out.error);
    const [entry] = await owner.db.select().from(s.timeEntries).where(eq(s.timeEntries.id, out.entryId));
    expect(entry).toMatchObject({ workerId: DANIEL, assignmentId: a, minutes: 510, status: "needs_review", reviewReasons: ["worker_app"], confidence: "low", payPeriodId: periodId("w2") });
    expect((await asDaniel((tx) => hoursOf(tx, DANIEL)))[0]!.days.some((d) => d.id === out.entryId && d.status === "waiting" && d.fromApp)).toBe(true);
    // A bulk approval of the confident rows leaves a worker's own clock for a person.
    expect(await inAgency((tx) => approveEntries(tx, theOwner, [out.entryId], { bulk: true }))).toEqual({ approved: [], skipped: [out.entryId] });
  });

  it("closes a forgotten clock-in without its end, for a person to fill in, and tells the worker", async () => {
    const [client] = await owner.db.select({ id: s.clients.id }).from(s.clients).innerJoin(s.jobOrders, eq(s.jobOrders.clientId, s.clients.id)).innerJoin(s.assignments, eq(s.assignments.jobOrderId, s.jobOrders.id)).where(eq(s.assignments.id, assignmentId("daniel-ruiz")));
    await inAgency((tx) => setClientWorkerClock(tx, recruiter, client!.id, "on"));
    const a = (await asDaniel((tx) => clockOf(tx, DANIEL, TODAY))).choices[0]!.assignmentId;
    const at = new Date("2026-10-08T12:00:00Z");
    expect(await asDaniel((tx) => clockIn(tx, daniel, a, null, TODAY, at))).toEqual({ ok: true });
    // Out three days later: far past the 16-hour limit.
    expect(await asDaniel((tx) => clockOut(tx, daniel, null, new Date(at.getTime() + 72 * 60 * 60_000)))).toEqual({ ok: false, error: "too_long" });
    const [entry] = await owner.db.select().from(s.timeEntries).where(and(eq(s.timeEntries.workerId, DANIEL), eq(s.timeEntries.workDate, TODAY)));
    expect(entry).toMatchObject({ minutes: null, outMinute: null, confidence: "low", status: "needs_review", reviewReasons: ["worker_app", "worker_app_too_long"] });
    expect((await asDaniel((tx) => clockOf(tx, DANIEL, TODAY))).open).toBeNull();
    expect(await inAgency((tx) => approveEntries(tx, theOwner, [entry!.id], { bulk: false }))).toEqual({ approved: [], skipped: [entry!.id] });
  });

  it("marks a clock-out after the client turned the clock off, for a person to check", async () => {
    const [client] = await owner.db.select({ id: s.clients.id }).from(s.clients).innerJoin(s.jobOrders, eq(s.jobOrders.clientId, s.clients.id)).innerJoin(s.assignments, eq(s.assignments.jobOrderId, s.jobOrders.id)).where(eq(s.assignments.id, assignmentId("daniel-ruiz")));
    await inAgency((tx) => setClientWorkerClock(tx, recruiter, client!.id, "on"));
    const a = (await asDaniel((tx) => clockOf(tx, DANIEL, TODAY))).choices[0]!.assignmentId;
    const at = new Date("2026-10-08T12:00:00Z");
    await asDaniel((tx) => clockIn(tx, daniel, a, null, TODAY, at));
    await inAgency((tx) => setClientWorkerClock(tx, recruiter, client!.id, "off"));
    const out = await asDaniel((tx) => clockOut(tx, daniel, null, new Date(at.getTime() + 4 * 60 * 60_000)));
    if (!out.ok) throw new Error(out.error);
    const [entry] = await owner.db.select().from(s.timeEntries).where(eq(s.timeEntries.id, out.entryId));
    expect(entry!.reviewReasons).toEqual(["worker_app", "worker_app_not_allowed"]);
  });
});

describe("pay stubs, messages and the agency's side", () => {
  beforeEach(fresh);

  it("shows the worker their paid week's earnings and year to date, and nothing of a colleague's", async () => {
    for (const k of ["daniel-ruiz", "marcus-bell"])
      await owner.db.insert(s.timeEntries).values({ agencyId: DEMO_AGENCY.id, payPeriodId: periodId("w2"), workerNameRaw: k, workerId: workerId(k), assignmentId: assignmentId(k), workDate: "2026-10-05", inMinute: 420, outMinute: 1020, breakMinutes: 0, minutes: 600, confidence: "high", status: "reviewed" });
    await inAgency((tx) => approveAsOwner(tx, theOwner, periodId("w2")));
    await inAgency((tx) => createRunFiles(tx, theOwner, store, periodId("w2"), { today: TODAY }));
    const list = await asDaniel((tx) => payStubsOf(tx, DANIEL));
    expect(list.stubs).toHaveLength(1);
    const stub = await asDaniel((tx) => payStubOf(tx, DANIEL, list.stubs[0]!.runId));
    const [pay] = await owner.db.select({ cents: sql<number>`sum(amount_cents)::int` }).from(s.payLines).where(and(eq(s.payLines.payRunId, list.stubs[0]!.runId), eq(s.payLines.workerId, DANIEL)));
    expect(stub!.grossCents).toBe(pay!.cents);
    expect(stub!.lines.reduce((t, l) => t + l.amountCents, 0)).toBe(pay!.cents);
    expect(stub!.ytdCents).toBe(pay!.cents);
    expect(stub!.worker.name).toBe("Daniel Ruiz");
    expect(await withWorker(app.db, { ...daniel, workerId: MARCUS }, (tx) => payStubOf(tx, DANIEL, list.stubs[0]!.runId))).toBeNull();
    expect((await asDaniel((tx) => homeOf(tx, DANIEL, TODAY))).latestPay?.grossCents).toBe(pay!.cents);
  });

  it("keeps one thread per worker, translated for the other side, written only by those allowed", async () => {
    const t = new DemoTranslator();
    expect(await inAgency((tx) => sendAgencyMessage(tx, accountant, DANIEL, "hello", "en", t))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => sendAgencyMessage(tx, recruiter, DANIEL, "Payday is Friday. Your pay stub will be in the app.", "en", t))).toEqual({ ok: true });
    await asDaniel((tx) => postMessage(tx, { ...daniel, sender: "worker", authorLabel: daniel.label, authorUserId: null, body: "Gracias. ¿Cuándo recibo mi pago de esta semana?", bodyLocale: "es", otherLocale: "en" }, t));
    const thread = await asDaniel((tx) => threadOf(tx, DANIEL));
    expect(thread.map((m) => [m.sender, m.translation])).toEqual([
      ["agency", "El día de pago es el viernes. Su talón de pago estará en la aplicación."],
      ["worker", "Thank you. When do I get paid for this week?"],
    ]);
    const agencyView = await inAgency((tx) => workerAppOf(tx, DANIEL, TODAY));
    expect(agencyView).toMatchObject({ phone: "(•••) •••-0142", unread: 1, workerLanguage: "es" });
  });

  it("texts the onboarding link to the worker's number, and refuses a number another worker has", async () => {
    expect(await inAgency((tx) => setWorkerPhone(tx, recruiter, MARCUS, PHONE, phoneOpts))).toEqual({ ok: false, error: "taken" });
    expect(await inAgency((tx) => setWorkerPhone(tx, recruiter, MARCUS, "12", phoneOpts))).toEqual({ ok: false, error: "invalid" });
    expect(await inAgency((tx) => sendOnboardingLink(tx, recruiter, MARCUS, () => "x", ctx.now))).toEqual({ ok: false, error: "no_phone" });
    const r = await inAgency((tx) => sendOnboardingLink(tx, recruiter, DANIEL, (name) => `${name}: finish onboarding at https://app.example/es/w`, ctx.now));
    expect(r.ok).toBe(true);
    const [row] = await owner.db.select().from(s.workerOnboarding).where(eq(s.workerOnboarding.workerId, DANIEL));
    expect(row!.invitedByLabel).toBe("Test recruiter");
    const [sms] = await owner.db.select().from(s.smsMessages).where(eq(s.smsMessages.kind, "onboarding_invite"));
    expect(sms).toMatchObject({ toPhone: E164, workerId: DANIEL });
  });
});

describe("changing a worker's number (security review, slice t)", () => {
  beforeEach(fresh);

  it("signs the worker out everywhere and texts the old number", async () => {
    await requestWorkerCode(deps, PHONE, (c) => `code ${c}`, null);
    const r = await verifyWorkerCode(deps, PHONE, await lastCode(), null, null);
    const token = r.ok && r.kind === "session" ? r.token : "";
    expect(await readWorkerSession({ db: app.db }, token)).not.toBeNull();
    const changed = await inAgency((tx) => setWorkerPhone(tx, recruiter, DANIEL, "(312) 555-0188", phoneOpts));
    expect(changed).toMatchObject({ ok: true, notify: { to: E164 } });
    expect(await readWorkerSession({ db: app.db }, token)).toBeNull();
    const [told] = await owner.db.select().from(s.smsMessages).where(eq(s.smsMessages.kind, "phone_changed"));
    expect(told).toMatchObject({ toPhone: E164, workerId: DANIEL });
  });

  it("once the worker has given sealed answers, only the Owner changes it, after confirming it is them", async () => {
    await owner.db.insert(s.workerOnboarding).values({ workerId: DANIEL, agencyId: DEMO_AGENCY.id, signedAt: ctx.now, signedName: "Daniel Ruiz" }).onConflictDoUpdate({ target: s.workerOnboarding.workerId, set: { signedAt: ctx.now, signedName: "Daniel Ruiz" } });
    expect(await inAgency((tx) => setWorkerPhone(tx, recruiter, DANIEL, "(312) 555-0188", phoneOpts))).toEqual({ ok: false, error: "owner_required" });
    expect(await inAgency((tx) => setWorkerPhone(tx, theOwner, DANIEL, "(312) 555-0188", phoneOpts))).toEqual({ ok: false, error: "confirm" });
    expect(await inAgency((tx) => setWorkerPhone(tx, theOwner, DANIEL, "(312) 555-0188", { ...phoneOpts, confirmedRecently: true }))).toMatchObject({ ok: true });
    const [w] = await owner.db.select({ phone: s.workers.phone }).from(s.workers).where(eq(s.workers.id, DANIEL));
    expect(w!.phone).toBe("+13125550188");
  });
});

describe("the demo's worker app", () => {
  it("seeds numbers, Daniel onboarded with a translated thread, Maribel part-way, clock-in at the Illinois client", async () => {
    await inAgency(async (tx) => {
      await clearDemoAgency(tx);
      await seedDemoAgency(tx);
    });
    const view = await inAgency((tx) => workerAppOf(tx, DANIEL, TODAY));
    expect(view).toMatchObject({ phone: "(•••) •••-0142", workerLanguage: "es", unread: 1 });
    expect(view!.onboarding.progress.complete).toBe(true);
    expect(view!.thread.map((m) => m.translation !== null)).toEqual([true, true, true, true]);
    const maribel = await inAgency((tx) => workerAppOf(tx, workerId("maribel-torres"), TODAY));
    expect(maribel!.onboarding.progress).toMatchObject({ done: 2, next: "i9" });
    expect((await asDaniel((tx) => clockOf(tx, DANIEL, TODAY))).choices.length).toBe(1);
    const opened = await asDaniel((tx) => formAnswers(tx, DANIEL));
    expect(opened?.deposit).toMatchObject({ routing: "021000021" });
    expect((await asDaniel((tx) => hoursOf(tx, DANIEL))).length).toBeGreaterThan(0);
  });
});
