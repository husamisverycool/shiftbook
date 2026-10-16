/**
 * Slice (c) through the weekly run: a rate card below the minimum wage is topped up (not held, and
 * not mistaken for unbilled hours), and a confirmed missed meal period in California is paid one
 * hour at the week's regular rate; holiday pay follows the agency's policy and bonuses are paid with
 * the week (docs/research/pay-rules-slice-c.md).
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { agencies, assignments, billLines, bonuses, clientBillingProfiles, holidayPolicies, jobOrders, payLines, payPeriods, premiumConfirmations, rateCards, timeEntries } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { createAssignment } from "../../src/server/catalog/assignments";
import { clearDemoAgency, clientId, jobOrderId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { readStoredDocument, receiveDocument, type ImageReader } from "../../src/server/intake/service";
import { addEntry } from "../../src/server/review/service";
import { totalsStep } from "../../src/server/convert/queries";
import { createRunFiles } from "../../src/server/files/service";
import { computeRun, setSkipped } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-pay-rules-")));
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const noImages: ImageReader = { read: () => Promise.reject(new Error("no images in this test")) };
const period = periodId("w2");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);

beforeEach(async () => {
  const existing = await owner.db.select().from(agencies).where(eq(agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("pay rules through the weekly run", () => {
  it("tops up a rate card below the minimum wage on its own line, with a warning, and no pay/bill mismatch", async () => {
    const file = "IL-prairie-line-timeclock-2026-10-05.csv";
    const { documentId } = await inAgency((tx) => receiveDocument(tx, actor, store, { payPeriodId: period, filename: file, bytes: readFileSync(`demo/samples/2026-10-05/${file}`) }));
    await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, documentId);
    const il = await inAgency((tx) => tx.select({ id: jobOrders.id }).from(jobOrders).where(eq(jobOrders.clientId, clientId("il"))));
    await inAgency((tx) => tx.update(rateCards).set({ payRateCents: 1450 }).where(inArray(rateCards.jobOrderId, il.map((j) => j.id))));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers.map((b) => b.code)).not.toContain("pay_bill_mismatch");
    expect(run.warnings.map((w) => w.code)).toContain("below_minimum_wage");
    const topUps = await inAgency((tx) => tx.select().from(payLines).where(and(eq(payLines.payRunId, run.runId), eq(payLines.type, "MW_TRUEUP"))));
    expect(topUps.length).toBeGreaterThan(0);
    expect(topUps.every((l) => l.rateNum === 50 && l.rateDen === 1)).toBe(true);
  });

  it("pays a confirmed missed meal period in California one hour at the week's regular rate", async () => {
    const added = await inAgency((tx) => addEntry(tx, actor, period, { workerId: workerId("luis-hernandez"), workDate: "2026-10-08", inMinute: 420, outMinute: 930, breakMinutes: 30 }, ["other"], "test week"));
    if (!added.ok) throw new Error(added.error);
    const [entry] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, added.entryId)));
    await inAgency((tx) => tx.insert(premiumConfirmations).values({ agencyId: actor.agencyId, workerId: workerId("luis-hernandez"), assignmentId: entry!.assignmentId!, workDate: "2026-10-08", kind: "meal_period_missed", confirmedBy: actor.userId }));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers.map((b) => b.code)).not.toContain("pay_bill_mismatch");
    const lines = await inAgency((tx) => tx.select().from(payLines).where(and(eq(payLines.payRunId, run.runId), eq(payLines.workerId, workerId("luis-hernandez")))));
    // 8 hours at $19.50 (no overtime): the regular rate is $19.50, so the premium is $19.50.
    expect(lines.map((l) => [l.type, l.minutes, l.amountCents])).toEqual([
      ["REG", 480, 15_600],
      ["MEAL_PREMIUM", 60, 1950],
    ]);
  });

  it("bills a confirmed meal premium at the bill rate when the client's billing profile says so", async () => {
    await inAgency((tx) => tx.update(clientBillingProfiles).set({ billPremiums: true }).where(eq(clientBillingProfiles.clientId, clientId("ca"))));
    const added = await inAgency((tx) => addEntry(tx, actor, period, { workerId: workerId("luis-hernandez"), workDate: "2026-10-08", inMinute: 420, outMinute: 930, breakMinutes: 30 }, ["other"], "test week"));
    if (!added.ok) throw new Error(added.error);
    const [entry] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, added.entryId)));
    await inAgency((tx) => tx.insert(premiumConfirmations).values({ agencyId: actor.agencyId, workerId: workerId("luis-hernandez"), assignmentId: entry!.assignmentId!, workDate: "2026-10-08", kind: "meal_period_missed", confirmedBy: actor.userId }));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers.map((b) => b.code)).not.toContain("pay_bill_mismatch");
    const bill = await inAgency((tx) => tx.select().from(billLines).where(and(eq(billLines.payRunId, run.runId), eq(billLines.workerId, workerId("luis-hernandez")))));
    expect(bill.map((l) => [l.type, l.minutes, l.ruleId])).toEqual([
      ["REG", 480, "bill_regular"],
      ["MEAL_PREMIUM", 60, "bill_premium"],
    ]);
  });

  it("pays California reporting time for a short day and for a day sent home without any work", async () => {
    const added = await inAgency((tx) => addEntry(tx, actor, period, { workerId: workerId("luis-hernandez"), workDate: "2026-10-08", inMinute: 420, outMinute: 540, breakMinutes: 0 }, ["other"], "sent home early"));
    if (!added.ok) throw new Error(added.error);
    const [entry] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, added.entryId)));
    const base = { agencyId: actor.agencyId, workerId: workerId("luis-hernandez"), assignmentId: entry!.assignmentId!, kind: "reported_short" as const, scheduledMinutes: 480, confirmedBy: actor.userId };
    await inAgency((tx) => tx.insert(premiumConfirmations).values([{ ...base, workDate: "2026-10-08" }, { ...base, workDate: "2026-10-09" }]));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers.map((b) => b.code)).not.toContain("pay_bill_mismatch");
    // The pay is right; the Gusto hours file cannot carry reporting-time pay (SPEC §13), so that refusal
    // names the worker, who can be skipped and paid by hand.
    expect(run.blockers.filter((b) => b.workerId === workerId("luis-hernandez") && b.code !== "export_refused")).toEqual([]);
    expect(run.blockers.find((b) => b.code === "export_refused")?.message).toContain("reporting-time pay");
    const lines = await inAgency((tx) => tx.select().from(payLines).where(and(eq(payLines.payRunId, run.runId), eq(payLines.workerId, workerId("luis-hernandez")))));
    // Thursday: 2 h worked of 8 scheduled → half the day (4 h) is due: 2 h more. Friday: no work → 4 h.
    expect(lines.map((l) => [l.type, l.minutes, l.amountCents])).toEqual([
      ["REG", 120, 3900],
      ["REPORTING_PAY", 120, 3900],
      ["REPORTING_PAY", 240, 7800],
    ]);
  });

  it("pays a holiday premium, a confirmed holiday not worked and a bonus, from stored policy and bonus rows", async () => {
    const luis = workerId("luis-hernandez");
    const [p] = await inAgency((tx) => tx.select().from(payPeriods).where(eq(payPeriods.id, period)));
    const added = await inAgency((tx) => addEntry(tx, actor, period, { workerId: luis, workDate: "2026-10-08", inMinute: 420, outMinute: 930, breakMinutes: 30 }, ["other"], "holiday shift"));
    if (!added.ok) throw new Error(added.error);
    const [entry] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, added.entryId)));
    const assignmentId = entry!.assignmentId!;
    await inAgency(async (tx) => {
      await tx.insert(holidayPolicies).values({ agencyId: actor.agencyId, name: "Agency holidays", holidayDates: ["2026-10-08", "2026-10-09"], workedMultiplierNum: 3, workedMultiplierDen: 2, notWorkedMinutes: 480, billWorkedMultiplierNum: 3, billWorkedMultiplierDen: 2 });
      await tx.insert(premiumConfirmations).values({ agencyId: actor.agencyId, workerId: luis, assignmentId, workDate: "2026-10-09", kind: "holiday_not_worked", confirmedBy: actor.userId });
      await tx.insert(bonuses).values({ agencyId: actor.agencyId, workerId: luis, assignmentId, workweekStart: p!.startsOn, amountCents: 2500, kind: "nondiscretionary", enteredBy: actor.userId });
    });
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers.filter((b) => (b.workerId === luis && b.code !== "export_refused") || b.code === "pay_bill_mismatch")).toEqual([]);
    expect(run.blockers.find((b) => b.code === "export_refused")).toMatchObject({ workerId: luis });
    const pay = await inAgency((tx) => tx.select().from(payLines).where(and(eq(payLines.payRunId, run.runId), eq(payLines.workerId, luis))));
    // $19.50: the worked holiday adds 0.5 × $19.50 for 8 h; the holiday not worked pays 8 h; the bonus as entered.
    expect(pay.map((l) => [l.type, l.minutes, l.amountCents])).toEqual([
      ["REG", 480, 15_600],
      ["HOL", 480, 7800],
      ["HOL_NOT_WORKED", 480, 15_600],
      ["BONUS", 0, 2500],
    ]);
    const bill = await inAgency((tx) => tx.select().from(billLines).where(and(eq(billLines.payRunId, run.runId), eq(billLines.workerId, luis))));
    expect(bill.map((l) => [l.type, l.minutes])).toEqual([
      ["REG", 480],
      ["HOL", 480],
    ]);
    // The totals screen counts the client's hours worked once: the holiday premium line repeats them.
    const all = await inAgency((tx) => tx.select().from(billLines).where(and(eq(billLines.payRunId, run.runId), eq(billLines.clientId, clientId("ca")))));
    const worked = all.filter((l) => l.type === "REG" || l.type === "OT" || l.type === "DT").reduce((sum, l) => sum + l.minutes, 0);
    const totals = await inAgency((tx) => totalsStep(tx, actor, period));
    expect(totals.clients.find((c) => c.clientId === clientId("ca"))!.minutes).toBe(worked);
    expect(all.reduce((sum, l) => sum + l.minutes, 0)).toBe(worked + 480);
  });

  it("creates the Gusto file for a run with a bonus, in Gusto's bonus column", async () => {
    const luis = workerId("luis-hernandez");
    const [p] = await inAgency((tx) => tx.select().from(payPeriods).where(eq(payPeriods.id, period)));
    const added = await inAgency((tx) => addEntry(tx, actor, period, { workerId: luis, workDate: "2026-10-08", inMinute: 420, outMinute: 930, breakMinutes: 30 }, ["other"], "bonus week"));
    if (!added.ok) throw new Error(added.error);
    const [entry] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, added.entryId)));
    await inAgency((tx) => tx.insert(bonuses).values({ agencyId: actor.agencyId, workerId: luis, assignmentId: entry!.assignmentId!, workweekStart: p!.startsOn, amountCents: 2500, kind: "nondiscretionary", enteredBy: actor.userId }));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers).toEqual([]);
    const files = await inAgency((tx) => createRunFiles(tx, actor, store, period, { today: "2026-10-12" }));
    const csv = new TextDecoder().decode(await store.get(files.payroll.storageKey));
    const [header, row] = csv.split("\n");
    expect(header!.split(",").at(-1)).toBe("bonus");
    expect(row!.split(",").at(-1)).toBe("25.00");
    expect(files.payroll.controlTotals.amountsByType).toEqual({ BONUS: 2500 });
  });

  it("a payroll file refusal names its worker, every such worker at once, and skipping them clears the run", async () => {
    const marcus = workerId("marcus-bell");
    const [il] = await inAgency((tx) => tx.select().from(assignments).where(eq(assignments.workerId, marcus)));
    await inAgency((tx) => tx.update(assignments).set({ endDate: "2026-10-07" }).where(eq(assignments.id, il!.id)));
    const moved = await inAgency((tx) => createAssignment(tx, actor, { workerId: marcus, jobOrderId: jobOrderId("ma-server"), startDate: "2026-10-08", endDate: null }));
    expect(moved.ok).toBe(true);
    // 30 h at $18.25 in Illinois, then 16 h at $17.00 in Massachusetts: overtime on a weighted rate, which the Gusto hours file cannot carry.
    for (const [day, out] of [["2026-10-05", 1020], ["2026-10-06", 1020], ["2026-10-07", 1020], ["2026-10-08", 900], ["2026-10-09", 900]] as const) {
      const added = await inAgency((tx) => addEntry(tx, actor, period, { workerId: marcus, workDate: day, inMinute: 420, outMinute: out, breakMinutes: 0 }, ["other"], "two-rate week"));
      if (!added.ok) throw new Error(added.error);
    }
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    const refused = run.blockers.filter((b) => b.code === "export_refused");
    expect(refused.map((b) => b.workerId)).toEqual([marcus]);
    expect(refused[0]!.message).toContain("Bell, Marcus");
    await inAgency((tx) => setSkipped(tx, actor, period, marcus, { skipped: true, reason: "paid by hand in Gusto" }));
    const again = await inAgency((tx) => computeRun(tx, actor, period));
    expect(again.blockers.filter((b) => b.code === "export_refused")).toEqual([]);
  });

  it("holds a bonus entered for a week with no hours instead of dropping it", async () => {
    const luis = workerId("luis-hernandez");
    const [p] = await inAgency((tx) => tx.select().from(payPeriods).where(eq(payPeriods.id, period)));
    const [assignment] = await inAgency((tx) => tx.select({ id: assignments.id }).from(assignments).where(eq(assignments.workerId, luis)));
    await inAgency((tx) => tx.insert(bonuses).values({ agencyId: actor.agencyId, workerId: luis, assignmentId: assignment!.id, workweekStart: p!.startsOn, amountCents: 2500, kind: "nondiscretionary" }));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    const held = run.blockers.filter((b) => b.workerId === luis);
    expect(held.map((b) => b.message).join(" ")).toContain("a bonus of $25.00 is entered for a week with no hours or reported days on file");
  });
});
