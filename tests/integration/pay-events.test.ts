/**
 * Slice G2: pay events a person enters (missed meal, bonus), a rate card's shift differential and
 * minimum day, and holiday policies — each through the weekly run, audited, with hand arithmetic.
 * Luis Hernandez (California, $19.50/h) works 8 hours on Thursday October 8, 2026.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { agencies, auditEvents, billLines, clientBillingProfiles, payLines, rateCards, timeEntries } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, clientId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { addEntry } from "../../src/server/review/service";
import { HolidayRefusedError, saveHolidayPolicy } from "../../src/server/catalog/holidays";
import { PayEventRefusedError, payEventsView, recordBonus, recordConfirmation, removePayEvent } from "../../src/server/run/pay-events";
import { computeRun } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const period = periodId("w2");
const luis = workerId("luis-hernandez");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);
let assignmentId = "";

beforeEach(async () => {
  const existing = await owner.db.select().from(agencies).where(eq(agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
    await tx.update(clientBillingProfiles).set({ vmsFormat: null }).where(eq(clientBillingProfiles.clientId, clientId("ca")));
  });
  const added = await inAgency((tx) => addEntry(tx, actor, period, { workerId: luis, workDate: "2026-10-08", inMinute: 420, outMinute: 930, breakMinutes: 30 }, ["other"], "test week"));
  if (!added.ok) throw new Error(added.error);
  const [entry] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, added.entryId)));
  assignmentId = entry!.assignmentId!;
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

const luisLines = async (runId: string) =>
  (await inAgency((tx) => tx.select().from(payLines).where(and(eq(payLines.payRunId, runId), eq(payLines.workerId, luis))))).map((l) => [l.type, l.minutes, l.amountCents]);
const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    if (e instanceof PayEventRefusedError || e instanceof HolidayRefusedError) return e instanceof PayEventRefusedError ? e.code : e.problems;
    throw e;
  }
};

describe("pay events entered by a person", () => {
  it("a confirmed missed meal period pays one hour at the regular rate; entered once, with a reason, audited, and removable", async () => {
    const meal = { workerId: luis, assignmentId, workDate: "2026-10-08", kind: "meal_period_missed" as const, scheduledMinutes: null, reassigned: false, reason: "Supervisor confirmed no lunch" };
    expect(await refusal(inAgency((tx) => recordConfirmation(tx, actor, period, { ...meal, reason: " " })))).toBe("reason_required");
    expect(await refusal(inAgency((tx) => recordConfirmation(tx, actor, period, { ...meal, workDate: "2026-09-01" })))).toBe("outside_period");
    const id = await inAgency((tx) => recordConfirmation(tx, actor, period, meal));
    expect(await refusal(inAgency((tx) => recordConfirmation(tx, actor, period, meal)))).toBe("already_recorded");
    let run = await inAgency((tx) => computeRun(tx, actor, period));
    // 8 h × $19.50 = $156.00; the premium is one hour at the $19.50 regular rate.
    expect(await luisLines(run.runId)).toEqual(expect.arrayContaining([["REG", 480, 15_600], ["MEAL_PREMIUM", 60, 1_950]]));
    const audited = await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityType, "premium_confirmation"), eq(auditEvents.entityId, id))));
    expect(audited.map((a) => [a.action, a.reason])).toEqual([["create", "Supervisor confirmed no lunch"]]);
    const view = await inAgency((tx) => payEventsView(tx, period));
    expect(view.events.map((e) => [e.workerName, e.eventKind, e.date])).toEqual([["Luis Hernández", "meal_period_missed", "2026-10-08"]]);
    expect(view.options.some((o) => o.workerId === luis && o.assignments.some((a) => a.assignmentId === assignmentId))).toBe(true);
    await inAgency((tx) => removePayEvent(tx, actor, period, { kind: "confirmation", id }, "Entered by mistake"));
    run = await inAgency((tx) => computeRun(tx, actor, period));
    expect((await luisLines(run.runId)).some(([t]) => t === "MEAL_PREMIUM")).toBe(false);
  });

  it("a nondiscretionary bonus is paid with its workweek; a bad amount or a week outside the period is refused", async () => {
    const bonus = { workerId: luis, assignmentId, workweekStart: "2026-10-05", amountCents: 5_000, kind: "nondiscretionary" as const, reason: "Perfect attendance" };
    expect(await refusal(inAgency((tx) => recordBonus(tx, actor, period, { ...bonus, amountCents: 0 })))).toBe("bad_amount");
    expect(await refusal(inAgency((tx) => recordBonus(tx, actor, period, { ...bonus, workweekStart: "2026-10-06" })))).toBe("outside_period");
    await inAgency((tx) => recordBonus(tx, actor, period, bonus));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(await luisLines(run.runId)).toEqual(expect.arrayContaining([["BONUS", 0, 5_000]]));
  });
});

describe("a rate card's further terms", () => {
  it("a differential pays and bills its own line, and a minimum day tops a short day up", async () => {
    const [entry] = await inAgency((tx) => tx.select().from(timeEntries).where(and(eq(timeEntries.workerId, luis), eq(timeEntries.workDate, "2026-10-08"))));
    const cards = await inAgency((tx) => tx.select().from(rateCards));
    const card = cards.find((c) => c.assignmentId === null && c.payRateCents === 1950 && c.jobOrderId !== null);
    expect(card).toBeDefined();
    // $1.00/h paid, $1.50/h billed on every shift; a 10-hour minimum day, billed.
    await inAgency((tx) => tx.update(rateCards).set({ diffName: "Night", diffPayCents: 100, diffBillCents: 150, contractMinimumMinutes: 600, billsContractMinimum: true }).where(eq(rateCards.jobOrderId, card!.jobOrderId)));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    // 8 h × $1.00 = $8.00 differential; the 2 hours short of 10 at $19.50 = $39.00.
    expect(await luisLines(run.runId)).toEqual(expect.arrayContaining([["DIFF", 480, 800], ["MIN_GUARANTEE", 120, 3_900]]));
    const billed = (await inAgency((tx) => tx.select().from(billLines).where(and(eq(billLines.payRunId, run.runId), eq(billLines.workerId, luis))))).map((l) => [l.type, l.minutes, l.amountCents, l.ruleId]);
    expect(billed).toEqual(expect.arrayContaining([["DIFF", 480, 1_200, "bill_shift_differential"], ["MIN_GUARANTEE", 120, expect.any(Number), "bill_contract_minimum"]]));
    expect(entry).toBeDefined();
  });
});

describe("holiday policies", () => {
  it("refuses a second policy for the same client holding the same date", async () => {
    const policy = { clientId: clientId("ca"), name: "Plant shutdown", dates: ["2026-12-24"], workedMultiplier: { num: 3, den: 2 }, notWorkedMinutes: 480, billWorkedMultiplier: null, billNotWorked: false };
    await inAgency((tx) => saveHolidayPolicy(tx, { ...actor, role: "owner" }, null, policy));
    expect(await refusal(inAgency((tx) => saveHolidayPolicy(tx, { ...actor, role: "owner" }, null, { ...policy, name: "Another" })))).toEqual(["overlap"]);
    expect(await refusal(inAgency((tx) => saveHolidayPolicy(tx, { ...actor, role: "owner" }, null, { ...policy, dates: ["2026-12-31"], workedMultiplier: { num: 4, den: 1 } })))).toEqual(["worked_multiplier"]);
  });
});
