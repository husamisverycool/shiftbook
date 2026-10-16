import { english, RULES_VERSION } from "@shiftbook/rules";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agencies, auditEvents, billLines, payLines, payRuns, sourceDocuments, timeEntries, workers } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { readStoredDocument, receiveDocument, type ImageReader } from "../../src/server/intake/service";
import { computeRun, setSkipped } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { inLineOrder, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-run-")));
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const noImages: ImageReader = { read: () => Promise.reject(new Error("no images in this test")) };
const period = periodId("w2");
const deps = { withAgency: app.withAgency, store, imageReader: noImages };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);

async function freshPeriodWithTimeClock() {
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  const file = "IL-prairie-line-timeclock-2026-10-05.csv";
  const { documentId } = await inAgency((tx) =>
    receiveDocument(tx, actor, store, { payPeriodId: period, filename: file, bytes: readFileSync(`demo/samples/2026-10-05/${file}`) }),
  );
  await readStoredDocument(deps, actor, documentId);
  return documentId;
}

const lines = (runId: string, who: string) =>
  inAgency(async (tx) => ({
    pay: inLineOrder(await tx.select().from(payLines).where(and(eq(payLines.payRunId, runId), eq(payLines.workerId, workerId(who))))),
    bill: inLineOrder(await tx.select().from(billLines).where(and(eq(billLines.payRunId, runId), eq(billLines.workerId, workerId(who))))),
  }));
const brief = (rows: { type: string; minutes: number; amountCents: number }[]) => rows.map((r) => [r.type, r.minutes, r.amountCents]);

beforeAll(async () => {
  const existing = await owner.db.select().from(agencies).where(eq(agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(agencies).values({ ...DEMO_AGENCY, isDemo: true });
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("computing a pay run from the period's time entries", () => {
  it("computes clean Illinois time-clock hours, with overtime, and stores every line with its explanation", async () => {
    await freshPeriodWithTimeClock();
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers).toEqual([]);
    expect(run.status).toBe("ready");

    // Hand-computed: 5 × 8h + 4h Saturday = 44h at $18.25/h, billed $26.50/h, overtime billed at 1.5×.
    const jerome = await lines(run.runId, "jerome-washington");
    expect(brief(jerome.pay)).toEqual([["REG", 2400, 73_000], ["OT", 240, 10_950]]);
    expect(brief(jerome.bill)).toEqual([["REG", 2400, 106_000], ["OT", 240, 15_900]]);
    // 4 × 8h + 8h37m = 40h37m: 37 minutes at $27.375/h = 1688.125¢ → $16.88.
    const daniel = await lines(run.runId, "daniel-ruiz");
    expect(brief(daniel.pay)).toEqual([["REG", 2400, 73_000], ["OT", 37, 1688]]);
    expect(daniel.pay[1]!.explain).toContain("1688.125¢ → rounded half-up once → $16.88");
    // Assembler at $17.50/h: 4 × 8h + 10h = 42h.
    const pedro = await lines(run.runId, "pedro-alcantara");
    expect(brief(pedro.pay)).toEqual([["REG", 2400, 70_000], ["OT", 120, 5250]]);
    expect(pedro.pay.every((l) => l.explain.length > 0 && l.timeEntryIds.length > 0)).toBe(true);
    // Each line keeps its explanation as message keys beside the English (decision 0030), saying exactly it.
    const stored = await inAgency(async (tx) => [...(await tx.select().from(payLines).where(eq(payLines.payRunId, run.runId))), ...(await tx.select().from(billLines).where(eq(billLines.payRunId, run.runId)))]);
    expect(stored.length).toBeGreaterThan(0);
    for (const l of stored) expect(english(l.say!)).toBe(l.explain);
    expect(daniel.pay[1]!.say![0]).toMatchObject({ key: "arithmeticRounded", values: { exact: "1688.125", amount: "$16.88" } });
  });

  it("keeps one working run per period: computing again replaces its lines", async () => {
    const first = await inAgency((tx) => computeRun(tx, actor, period));
    const again = await inAgency((tx) => computeRun(tx, actor, period));
    expect(again.runId).toBe(first.runId);
    const runs = await inAgency((tx) => tx.select().from(payRuns).where(eq(payRuns.payPeriodId, period)));
    expect(runs).toHaveLength(1);
    const pay = await inAgency((tx) => tx.select().from(payLines).where(eq(payLines.payRunId, again.runId)));
    expect(new Set(pay.map((l) => `${l.workerId}|${l.workweekStart}|${l.type}`)).size).toBe(pay.length);
  });

  it("stores what it computed from: rules version, inputs and results", async () => {
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    const [row] = await inAgency((tx) => tx.select().from(payRuns).where(eq(payRuns.id, run.runId)));
    expect(row!.rulesVersion).toBe(RULES_VERSION);
    expect(row!.snapshot).toMatchObject({ rulesVersion: RULES_VERSION, input: { workweekStartsOn: 1 } });
    const events = await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityType, "pay_run"), eq(auditEvents.entityId, run.runId))));
    expect(events.length).toBeGreaterThan(0);
  });

  it("blocks while an entry still needs review, and names it", async () => {
    const [entry] = await inAgency((tx) =>
      tx.select().from(timeEntries).where(and(eq(timeEntries.payPeriodId, period), eq(timeEntries.workerId, workerId("anita-patel")))),
    );
    await inAgency((tx) => tx.update(timeEntries).set({ status: "needs_review" }).where(eq(timeEntries.id, entry!.id)));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.status).toBe("blocked");
    expect(run.blockers.map((b) => [b.code, b.entryIds])).toEqual([["entry_needs_review", [entry!.id]]]);
    await inAgency((tx) => tx.update(timeEntries).set({ status: "reviewed" }).where(eq(timeEntries.id, entry!.id)));
  });

  it("never pays or bills a rejected entry", async () => {
    const entries = await inAgency((tx) =>
      tx.select().from(timeEntries).where(and(eq(timeEntries.payPeriodId, period), eq(timeEntries.workerId, workerId("jerome-washington")))),
    );
    const saturday = entries.find((e) => e.workDate === "2026-10-10")!;
    await inAgency((tx) => tx.update(timeEntries).set({ status: "rejected" }).where(eq(timeEntries.id, saturday.id)));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(brief((await lines(run.runId, "jerome-washington")).pay)).toEqual([["REG", 2400, 73_000]]);
    await inAgency((tx) => tx.update(timeEntries).set({ status: "extracted" }).where(eq(timeEntries.id, saturday.id)));
  });

  it("blocks a worker without a Gusto employee id (the payroll file could not match them)", async () => {
    await inAgency((tx) => tx.update(workers).set({ payrollIds: {} }).where(eq(workers.id, workerId("olivia-hart"))));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers.map((b) => [b.code, b.workerId])).toEqual([["missing_payroll_id", workerId("olivia-hart")]]);
  });

  it("lets a person skip a blocked worker from this run, with a reason, and audits it", async () => {
    await inAgency((tx) => setSkipped(tx, actor, period, workerId("olivia-hart"), { skipped: true, reason: "Gusto id being set up; paid next week" }));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.status).toBe("ready");
    expect(run.skipped.map((s) => s.workerId)).toEqual([workerId("olivia-hart")]);
    expect((await lines(run.runId, "olivia-hart")).pay).toEqual([]);
    await expect(inAgency((tx) => setSkipped(tx, actor, period, workerId("olivia-hart"), { skipped: true, reason: " " }))).rejects.toThrow(/reason/);
    await inAgency((tx) => setSkipped(tx, actor, period, workerId("olivia-hart"), { skipped: false, reason: "id added" }));
    const back = await inAgency((tx) => computeRun(tx, actor, period));
    expect(back.skipped).toEqual([]);
    expect(back.blockers.map((b) => b.code)).toEqual(["missing_payroll_id"]);
  });

  it("blocks an entry nobody could match to a worker", async () => {
    const [doc] = await inAgency((tx) => tx.select().from(sourceDocuments).limit(1));
    await inAgency((tx) =>
      tx.insert(timeEntries).values({ agencyId: actor.agencyId, payPeriodId: period, sourceDocumentId: doc!.id, rowIndex: 999, workerNameRaw: "Unknown Person", workDate: "2026-10-08", minutes: 480, status: "reviewed", confidence: "medium" }),
    );
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers.map((b) => b.code)).toContain("unmatched_entry");
  });
});
