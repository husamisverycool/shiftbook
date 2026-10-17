/**
 * Partner-ready money flows (slice w, SPEC §27 item 9: compute everything, move nothing).
 *
 * The week (as the margin test): Prairie Line (Illinois) — Marcus Bell 30 h and Anita Patel 16 h as
 * machine operators ($18.25 pay, $26.50 bill, class 3632), Trevor Lindqvist 8 h as an assembler
 * ($17.50 pay, $25.75 bill). By hand:
 *   pay   Marcus 30 × $18.25 = $547.50; Anita 16 × $18.25 = $292.00; Trevor 8 × $17.50 = $140.00 → $979.50
 *   bill  Marcus 30 × $26.50 = $795.00; Anita 16 × $26.50 = $424.00; Trevor 8 × $25.75 = $206.00 → $1,425.00
 *   funding on $1,425.00: advance 90% = $1,282.50; fee 3% = $42.75; reserve $142.50; released $99.75
 *   wage access before the run, Marcus 30 h × $18.25 = $547.50 earned; half = $273.75 available
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, clientId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { createRunFiles } from "../../src/server/files/service";
import { fundingView, handoffs, payrollHandoffView, payrollRuns, wageAccessView } from "../../src/server/money/queries";
import { recordInsuranceHandoff, recordPayrollHandoff, requestWageAccess, submitFunding } from "../../src/server/money/service";
import { setFundingRules, setWageAccessRules } from "../../src/server/money/settings";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { approveAsOwner, databaseError, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-money-")));
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test owner", role: "owner" };
const coordinator: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000003", label: "Test coordinator", role: "coordinator" };
const accountant: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000005", label: "Test accountant", role: "accountant" };
const w2 = periodId("w2");
const PLM = clientId("il");
const TODAY = "2026-10-17";
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);

async function addShift(worker: string, date: string, inMinute: number, outMinute: number) {
  await owner.db.insert(s.timeEntries).values({ agencyId: theOwner.agencyId, payPeriodId: w2, workerNameRaw: worker, workerId: workerId(worker), assignmentId: assignmentId(worker), workDate: date, inMinute, outMinute, breakMinutes: 0, minutes: outMinute - inMinute, confidence: "high", status: "reviewed" });
}

async function freshAgency() {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  await owner.db.update(s.clientBillingProfiles).set({ backupDetail: false, backupImages: false }).where(eq(s.clientBillingProfiles.clientId, PLM));
}

async function addWeek() {
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) await addShift("marcus-bell", d, 420, 1020);
  for (const d of ["2026-10-05", "2026-10-06"]) await addShift("anita-patel", d, 420, 900);
  await addShift("trevor-lindqvist", "2026-10-05", 420, 900);
}

async function runWeek() {
  await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
  await inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: "2026-10-13" }));
}

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("embedded payroll handoff", () => {
  beforeEach(freshAgency);

  it("builds the run's payload, reconciled to the payroll file to the cent, with no SSN", async () => {
    await addWeek();
    await runWeek();
    const [run] = await inAgency((tx) => payrollRuns(tx));
    expect(run).toMatchObject({ periodStart: "2026-10-05", periodEnd: "2026-10-11", payday: "2026-10-16", grossCents: 97950, handoff: null });
    const view = await inAgency((tx) => payrollHandoffView(tx, run!.id));
    expect(view!.payload.neutral.reconciliation).toEqual({ run_gross_cents: 97950, payload_gross_cents: 97950, equal: true });
    expect(view!.payload.neutral.employees.map((e) => [e.last_name, e.gross])).toEqual([
      ["Bell", "547.50"],
      ["Lindqvist", "140.00"],
      ["Patel", "292.00"],
    ]);
    // Every line carries its workers' comp class and worksite; the SSN never appears.
    expect(view!.payload.neutral.employees.flatMap((e) => e.earnings.map((x) => x.wc_class_code))).toEqual(["3632", "3632", "3632"]);
    expect(JSON.stringify(view!.payload)).not.toMatch(/\b9\d{2}-?\d{2}-?\d{4}\b/);
    expect(view!.payload.ready).toBe(true);
  });

  it("is recorded once, by the Owner only, and audited", async () => {
    await addWeek();
    await runWeek();
    const [run] = await inAgency((tx) => payrollRuns(tx));
    expect(await inAgency((tx) => recordPayrollHandoff(tx, coordinator, run!.id, "check"))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => recordPayrollHandoff(tx, theOwner, run!.id, "paypal"))).toEqual({ ok: false, error: "not_found" });
    const r = await inAgency((tx) => recordPayrollHandoff(tx, theOwner, run!.id, "check"));
    expect(r.ok).toBe(true);
    expect(await inAgency((tx) => recordPayrollHandoff(tx, theOwner, run!.id, "zeal"))).toEqual({ ok: false, error: "already" });
    const [h] = await inAgency((tx) => handoffs(tx, { kind: "payroll" }));
    expect(h).toMatchObject({ partner: "check", amountCents: 97950, subjectId: run!.id, createdByLabel: "Test owner" });
    expect(h!.payloadSha256).toMatch(/^[0-9a-f]{64}$/);
    const events = await owner.db.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "pay_run"), eq(s.auditEvents.entityId, run!.id), eq(s.auditEvents.action, "export")));
    expect(events.some((e) => (e.after as { handoff?: string }).handoff === (r as { handoffId: string }).handoffId)).toBe(true);
  });

  it("is never changed or deleted by an agency's own app connection once recorded", async () => {
    await addWeek();
    await runWeek();
    const [run] = await inAgency((tx) => payrollRuns(tx));
    await inAgency((tx) => recordPayrollHandoff(tx, theOwner, run!.id, "file"));
    expect(await databaseError(inAgency((tx) => tx.update(s.partnerHandoffs).set({ amountCents: 1 })))).toMatch(/permission denied/);
    // Only the demo's reset deletes: an agency that is not a demo keeps every handoff.
    await owner.db.update(s.agencies).set({ isDemo: false }).where(eq(s.agencies.id, DEMO_AGENCY.id));
    try {
      expect(await databaseError(inAgency((tx) => tx.delete(s.partnerHandoffs)))).toMatch(/partner_handoffs rows are kept/);
    } finally {
      await owner.db.update(s.agencies).set({ isDemo: true }).where(eq(s.agencies.id, DEMO_AGENCY.id));
    }
  });
});

describe("earned wage access", () => {
  beforeEach(freshAgency);

  it("offers half of what was earned, rounded down, and keeps a request outstanding until payday", async () => {
    await addWeek();
    const marcus = workerId("marcus-bell");
    const [row] = (await inAgency((tx) => wageAccessView(tx, { workerId: marcus }))).rows;
    expect(row!.availability).toMatchObject({ earnedCents: 54750, minutes: 1800, capCents: 27375, availableCents: 27375 });
    expect(await inAgency((tx) => requestWageAccess(tx, accountant, marcus, 10000, "standard"))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => requestWageAccess(tx, theOwner, marcus, 27376, "standard"))).toEqual({ ok: false, error: "too_much" });
    expect((await inAgency((tx) => requestWageAccess(tx, theOwner, marcus, 20000, "expedited"))).ok).toBe(true);
    const [after] = (await inAgency((tx) => wageAccessView(tx, { workerId: marcus }))).rows;
    expect(after!.availability).toMatchObject({ outstandingCents: 20000, availableCents: 7375 });
    expect(after!.requests[0]!.summary).toMatchObject({ delivery: "expedited", feeCents: 299 });
    // The run pays those hours (recovering the access by payroll deduction): nothing is outstanding or unpaid.
    await runWeek();
    const [paid] = (await inAgency((tx) => wageAccessView(tx, { workerId: marcus }))).rows;
    expect(paid!.availability).toMatchObject({ earnedCents: 0, outstandingCents: 0, availableCents: 0, reason: "no_hours" });
    // That run's payroll payload repays it from Marcus's paycheck, once.
    const [run] = await inAgency((tx) => payrollRuns(tx));
    const view = await inAgency((tx) => payrollHandoffView(tx, run!.id));
    const deductions = view!.payload.neutral.employees.flatMap((e) => e.deductions.map((d) => [e.last_name, d.amount_cents]));
    expect(deductions).toEqual([["Bell", 20000]]);
  });

  it("is off when the agency turns it off, and its rules are the Owner's", async () => {
    await addWeek();
    expect(await inAgency((tx) => setWageAccessRules(tx, coordinator, { enabled: false, capBps: 5000, maxPerRequestCents: 0, expeditedFeeCents: 0 }, TODAY))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => setWageAccessRules(tx, theOwner, { enabled: true, capBps: 10_001, maxPerRequestCents: 0, expeditedFeeCents: 0 }, TODAY))).toMatchObject({ ok: false, error: "invalid" });
    expect(await inAgency((tx) => setWageAccessRules(tx, theOwner, { enabled: false, capBps: 5000, maxPerRequestCents: 0, expeditedFeeCents: 0 }, TODAY))).toEqual({ ok: true });
    const [row] = (await inAgency((tx) => wageAccessView(tx, { workerId: workerId("marcus-bell") }))).rows;
    expect(row!.availability).toMatchObject({ availableCents: 0, reason: "disabled" });
  });
});

describe("invoice funding", () => {
  beforeEach(freshAgency);

  it("prequalifies an approved invoice with the offer's arithmetic, and records its packet once", async () => {
    await addWeek();
    await runWeek();
    const { packets } = await inAgency((tx) => fundingView(tx, TODAY));
    expect(packets).toHaveLength(1);
    // The client never approved these hours by link: not eligible while the agency requires it.
    expect(packets[0]).toMatchObject({ eligible: false, reasons: ["no_approval"], concentrationBps: 10000 });
    expect(await inAgency((tx) => submitFunding(tx, theOwner, packets[0]!.invoice.id, TODAY))).toEqual({ ok: false, error: "not_ready" });
    await inAgency((tx) => setFundingRules(tx, theOwner, { enabled: true, advanceBps: 9000, feeBps: 300, maxConcentrationBps: 10000, maxAgeDays: 90, requireClientApproval: false }, TODAY));
    const [p] = (await inAgency((tx) => fundingView(tx, TODAY))).packets;
    expect(p).toMatchObject({ eligible: true, ageDays: 4, offer: { balanceCents: 142500, advanceCents: 128250, feeCents: 4275, reserveCents: 14250, releasedOnPaymentCents: 9975 } });
    expect((await inAgency((tx) => submitFunding(tx, theOwner, p!.invoice.id, TODAY))).ok).toBe(true);
    expect(await inAgency((tx) => submitFunding(tx, theOwner, p!.invoice.id, TODAY))).toEqual({ ok: false, error: "already" });
    const [h] = await inAgency((tx) => handoffs(tx, { kind: "funding" }));
    expect(h).toMatchObject({ amountCents: 142500, summary: { advanceCents: 128250, feeCents: 4275 } });
  });
});

describe("the broker's payroll by class", () => {
  beforeEach(freshAgency);

  it("records the class totals for pay dates in a range", async () => {
    expect(await inAgency((tx) => recordInsuranceHandoff(tx, theOwner, "2026-10-01", "2026-10-31"))).toEqual({ ok: false, error: "none" });
    await addWeek();
    await runWeek();
    expect(await inAgency((tx) => recordInsuranceHandoff(tx, theOwner, "2026-10-31", "2026-10-01"))).toEqual({ ok: false, error: "range" });
    expect((await inAgency((tx) => recordInsuranceHandoff(tx, theOwner, "2026-10-01", "2026-10-31"))).ok).toBe(true);
    const [h] = await inAgency((tx) => handoffs(tx, { kind: "insurance" }));
    expect(h).toMatchObject({ partner: "broker", amountCents: 97950, subjectId: "2026-10-01_2026-10-31" });
  });
});

describe("handoffs stay in their agency", () => {
  beforeEach(freshAgency);

  it("another agency reads none of them and cannot write one for this agency", async () => {
    await addWeek();
    await runWeek();
    await inAgency((tx) => recordInsuranceHandoff(tx, theOwner, "2026-10-01", "2026-10-31"));
    const [other] = await owner.db.insert(s.agencies).values({ name: "Other agency (test)" }).returning();
    const seen = await app.withAgency(other!.id, (tx) => tx.select().from(s.partnerHandoffs));
    expect(seen).toEqual([]);
    expect(
      await databaseError(
        app.withAgency(other!.id, (tx) => tx.insert(s.partnerHandoffs).values({ agencyId: DEMO_AGENCY.id, kind: "insurance", subjectType: "pay_dates", subjectId: "x", partner: "broker", payload: {}, payloadSha256: "0".repeat(64), createdByLabel: "intruder" })),
      ),
    ).toMatch(/row-level security/);
  });
});
