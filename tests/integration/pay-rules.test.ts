/**
 * Slice (c) through the weekly run: a rate card below the minimum wage is topped up (not held, and
 * not mistaken for unbilled hours), and a confirmed missed meal period in California is paid one
 * hour at the week's regular rate (docs/research/pay-rules-slice-c.md).
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { agencies, jobOrders, payLines, premiumConfirmations, rateCards, timeEntries } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, clientId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { readStoredDocument, receiveDocument, type ImageReader } from "../../src/server/intake/service";
import { addEntry } from "../../src/server/review/service";
import { computeRun } from "../../src/server/run/service";
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
});
