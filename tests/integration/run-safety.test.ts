/**
 * Fifth second-opinion review: a period is paid once, concurrent clicks cannot double anything,
 * a day that may be counted twice is held, and the files always match what was reviewed.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { agencies, agencySettings, clientBillingProfiles, exports, invoices, payLines, payPeriods, payRuns, rateCards, sourceDocuments, timeEntries, workers } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, clientId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { createRunFiles, RunNotReadyError, TotalsChangedError } from "../../src/server/files/service";
import { archiveDocument, readStoredDocument, receiveDocument, type ImageReader } from "../../src/server/intake/service";
import { addEntry, approveEntries, confirmDistinctDay, editEntry, rejectEntry } from "../../src/server/review/service";
import { computeRun, PeriodLockedError, setSkipped } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-safety-")));
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const noImages: ImageReader = { read: () => Promise.reject(new Error("no images in this test")) };
const period = periodId("w2");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);
const TODAY = "2026-10-15";
const SAMPLE = "IL-prairie-line-timeclock-2026-10-05.csv";

async function freshWeek() {
  const existing = await owner.db.select().from(agencies).where(eq(agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  const { documentId } = await inAgency((tx) => receiveDocument(tx, actor, store, { payPeriodId: period, filename: SAMPLE, bytes: readFileSync(`demo/samples/2026-10-05/${SAMPLE}`) }));
  await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, documentId);
}
const entryOf = async (who: string, date: string) =>
  (await inAgency((tx) => tx.select().from(timeEntries).where(and(eq(timeEntries.payPeriodId, period), eq(timeEntries.workerId, workerId(who)), eq(timeEntries.workDate, date)))))[0]!;

beforeEach(freshWeek);
afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("a period is paid once (B1)", () => {
  it("locks the period and its paid entries once the files exist", async () => {
    const files = await inAgency((tx) => createRunFiles(tx, actor, store, period, { today: TODAY }));
    const paid = await inAgency((tx) => tx.select().from(payLines).where(eq(payLines.payRunId, files.runId)));
    const ids = [...new Set(paid.flatMap((l) => l.timeEntryIds))];
    const rows = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.payPeriodId, period)));
    expect(rows.filter((r) => ids.includes(r.id)).every((r) => r.status === "locked")).toBe(true);

    await expect(inAgency((tx) => createRunFiles(tx, actor, store, period, { today: TODAY }))).rejects.toBeInstanceOf(PeriodLockedError);
    await expect(inAgency((tx) => computeRun(tx, actor, period))).rejects.toBeInstanceOf(PeriodLockedError);
    await expect(inAgency((tx) => setSkipped(tx, actor, period, workerId("anita-patel"), { skipped: true, reason: "x" }))).rejects.toBeInstanceOf(PeriodLockedError);
    const e = await entryOf("anita-patel", "2026-10-05");
    expect(await inAgency((tx) => editEntry(tx, actor, e.id, { outMinute: 960 }, ["confirmed_client"], ""))).toEqual({ ok: false, error: "period_locked" });
    expect(await inAgency((tx) => addEntry(tx, actor, period, { workerId: workerId("anita-patel"), workDate: "2026-10-10", minutes: 60 }, ["confirmed_client"], ""))).toEqual({ ok: false, error: "period_locked" });
    await expect(inAgency((tx) => approveEntries(tx, actor, [e.id], { bulk: false }))).rejects.toBeInstanceOf(PeriodLockedError);
    await expect(inAgency((tx) => rejectEntry(tx, actor, e.id))).rejects.toBeInstanceOf(PeriodLockedError);
    await expect(
      inAgency((tx) => receiveDocument(tx, actor, store, { payPeriodId: period, filename: "late.csv", bytes: new TextEncoder().encode("a,b\n1,2\n") })),
    ).rejects.toBeInstanceOf(PeriodLockedError);
  });
});

describe("concurrent clicks cannot double anything (B2)", () => {
  it("lets one of two simultaneous 'create files' through and refuses the other", async () => {
    const results = await Promise.allSettled([
      inAgency((tx) => createRunFiles(tx, actor, store, period, { today: TODAY })),
      inAgency((tx) => createRunFiles(tx, actor, store, period, { today: TODAY })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(PeriodLockedError);
    const files = await inAgency((tx) => tx.select().from(exports));
    expect(files).toHaveLength(1);
    const invs = await inAgency((tx) => tx.select().from(invoices));
    expect(new Set(invs.map((i) => i.number)).size).toBe(invs.length);
    const lines = await inAgency((tx) => tx.select().from(payLines).where(eq(payLines.payRunId, files[0]!.payRunId)));
    expect(files[0]!.controlTotals.grossCents).toBe(lines.reduce((s, l) => s + l.amountCents, 0));
    expect(files[0]!.controlTotals.grossCents).toBe(739_062);
  });

  it("a totals refresh racing 'create files' cannot change what is exported", async () => {
    const [refresh, files] = await Promise.allSettled([
      inAgency((tx) => computeRun(tx, actor, period)),
      inAgency((tx) => createRunFiles(tx, actor, store, period, { today: TODAY })),
    ]);
    // Whichever goes first, the other waits; a refresh after the files exist is refused.
    if (refresh.status === "rejected") expect(refresh.reason).toBeInstanceOf(PeriodLockedError);
    expect(files.status).toBe("fulfilled");
    const rows = await inAgency((tx) => tx.select().from(exports));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.controlTotals.grossCents).toBe(739_062);
    const lines = await inAgency((tx) => tx.select().from(payLines).where(eq(payLines.payRunId, rows[0]!.payRunId)));
    expect(lines.reduce((s, l) => s + l.amountCents, 0)).toBe(739_062);
  });
});

describe("a day that may be counted twice is held (B3)", () => {
  it("blocks a worker-day with a timed entry and an untimed one from another source", async () => {
    const added = await inAgency((tx) => addEntry(tx, actor, period, { workerId: workerId("anita-patel"), workDate: "2026-10-05", minutes: 480 }, ["confirmed_client"], ""));
    expect(added.ok).toBe(true);
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.status).toBe("blocked");
    expect(run.blockers.map((b) => b.code)).toContain("possible_duplicate_day");
  });
});

describe("the files match what was reviewed (S4, S5)", () => {
  it("refuses to create files when the totals changed after they were shown", async () => {
    const shown = await inAgency((tx) => computeRun(tx, actor, period));
    await inAgency((tx) => tx.update(rateCards).set({ payRateCents: 1900 }));
    await expect(inAgency((tx) => createRunFiles(tx, actor, store, period, { today: TODAY, expectedFingerprint: shown.fingerprint }))).rejects.toBeInstanceOf(TotalsChangedError);
  });

  it("computing again with nothing changed keeps the same run, lines and fingerprint", async () => {
    const a = await inAgency((tx) => computeRun(tx, actor, period));
    const before = await inAgency((tx) => tx.select({ id: payLines.id }).from(payLines).where(eq(payLines.payRunId, a.runId)));
    const b = await inAgency((tx) => computeRun(tx, actor, period));
    const after = await inAgency((tx) => tx.select({ id: payLines.id }).from(payLines).where(eq(payLines.payRunId, b.runId)));
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(after.map((x) => x.id).sort()).toEqual(before.map((x) => x.id).sort());
  });

  it("shows a payroll-file problem as a blocker before 'create files', not as an error after", async () => {
    await inAgency((tx) => tx.update(workers).set({ payrollIds: { gusto: { id: "xyz ", title: "Machine Operator (Primary)" } } }).where(eq(workers.id, workerId("olivia-hart"))));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.status).toBe("blocked");
    expect(run.blockers.map((b) => b.code)).toContain("export_refused");
  });
});

describe("periods and workweeks line up (S6)", () => {
  it("blocks a period that does not start and end on workweek boundaries", async () => {
    await inAgency((tx) => tx.update(agencySettings).set({ value: 0 }).where(eq(agencySettings.key, "workweek_starts_on")));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers.map((b) => b.code)).toContain("period_not_aligned");
  });

  it("refuses to create files for a period with nothing to pay", async () => {
    await inAgency((tx) => tx.update(timeEntries).set({ status: "rejected" }).where(eq(timeEntries.payPeriodId, period)));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers.map((b) => b.code)).toEqual(["no_entries"]);
  });
});

describe("uploads only into the agency's own periods (N9)", () => {
  it("refuses a period id that is not one of the agency's", async () => {
    const other = "00000000-0000-4000-a000-0000000000ee";
    await expect(
      inAgency((tx) => receiveDocument(tx, actor, store, { payPeriodId: other, filename: SAMPLE, bytes: readFileSync(`demo/samples/2026-10-05/${SAMPLE}`) })),
    ).rejects.toThrow(/pay period/);
    const periods = await inAgency((tx) => tx.select().from(payPeriods));
    expect(periods.some((p) => p.id === other)).toBe(false);
  });
});

describe("sixth review", () => {
  const late = () =>
    inAgency((tx) => receiveDocument(tx, actor, store, { payPeriodId: period, filename: "late.csv", bytes: new TextEncoder().encode("Employee ID,Employee Name\n1,x\n") }));

  it("holds the run while a timesheet is still waiting to be read", async () => {
    await late();
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers.map((b) => b.code)).toContain("documents_pending");
    await expect(inAgency((tx) => createRunFiles(tx, actor, store, period, { today: TODAY }))).rejects.toBeInstanceOf(RunNotReadyError);
  });

  it("holds the run for a timesheet that could not be read, until it is archived with a reason", async () => {
    const { documentId } = await late();
    await inAgency((tx) => tx.update(sourceDocuments).set({ status: "failed", error: "unreadable" }).where(eq(sourceDocuments.id, documentId)));
    expect((await inAgency((tx) => computeRun(tx, actor, period))).blockers.map((b) => b.code)).toContain("document_failed");
    await expect(inAgency((tx) => archiveDocument(tx, actor, documentId, " "))).rejects.toThrow(/reason/);
    await inAgency((tx) => archiveDocument(tx, actor, documentId, "Duplicate of the clock export"));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.status).toBe("ready");
  });

  it("lets a person confirm two entries on one day are both real, until either changes", async () => {
    await inAgency((tx) => addEntry(tx, actor, period, { workerId: workerId("anita-patel"), workDate: "2026-10-05", minutes: 120 }, ["confirmed_client"], ""));
    const held = await inAgency((tx) => computeRun(tx, actor, period));
    const group = held.blockers.find((b) => b.code === "possible_duplicate_day")!;
    await expect(inAgency((tx) => confirmDistinctDay(tx, actor, group.entryIds!, ""))).rejects.toThrow(/reason/);
    await inAgency((tx) => confirmDistinctDay(tx, actor, group.entryIds!, "Evening cleanup shift, confirmed with the supervisor"));
    expect((await inAgency((tx) => computeRun(tx, actor, period))).blockers.map((b) => b.code)).not.toContain("possible_duplicate_day");
    const handEntry = (await inAgency((tx) => tx.select().from(timeEntries).where(and(eq(timeEntries.workerId, workerId("anita-patel")), eq(timeEntries.workDate, "2026-10-05"))))).find(
      (e) => e.sourceDocumentId === null,
    )!;
    await inAgency((tx) => editEntry(tx, actor, handEntry.id, { minutes: 180 }, ["confirmed_client"], ""));
    expect((await inAgency((tx) => computeRun(tx, actor, period))).blockers.map((b) => b.code)).toContain("possible_duplicate_day");
  });

  it("checks the invoices before 'create files': billing profile on the last day, free number, total that fits", async () => {
    await inAgency((tx) => tx.update(clientBillingProfiles).set({ effectiveTo: "2026-10-10" }).where(eq(clientBillingProfiles.clientId, clientId("il"))));
    expect((await inAgency((tx) => computeRun(tx, actor, period))).blockers.map((b) => b.code)).toContain("invoice_problem");
    await freshWeek();
    await inAgency(async (tx) => {
      const [old] = await tx.insert(payRuns).values({ agencyId: actor.agencyId, payPeriodId: periodId("w1"), version: 1, status: "exported", rulesVersion: "x" }).returning();
      await tx.insert(invoices).values({ agencyId: actor.agencyId, clientId: clientId("il"), payRunId: old!.id, number: "PLM-20261005", issuedOn: TODAY, dueOn: TODAY, subtotalCents: 1, totalCents: 1 });
    });
    expect((await inAgency((tx) => computeRun(tx, actor, period))).blockers.map((b) => b.code)).toContain("invoice_problem");
    await freshWeek();
    await inAgency((tx) => tx.update(rateCards).set({ billRateCents: 9_000_000 }));
    expect((await inAgency((tx) => computeRun(tx, actor, period))).blockers.map((b) => b.code)).toContain("invoice_problem");
  });

  it("refuses files when a PO number, a name or a Gusto id changed after the totals were shown", async () => {
    const shown = await inAgency((tx) => computeRun(tx, actor, period));
    await inAgency((tx) => tx.update(clientBillingProfiles).set({ poNumber: "PO-99999" }).where(eq(clientBillingProfiles.clientId, clientId("il"))));
    await expect(inAgency((tx) => createRunFiles(tx, actor, store, period, { today: TODAY, expectedFingerprint: shown.fingerprint }))).rejects.toBeInstanceOf(TotalsChangedError);
    const again = await inAgency((tx) => computeRun(tx, actor, period));
    await inAgency((tx) => tx.update(workers).set({ lastName: "Renamed" }).where(eq(workers.id, workerId("anita-patel"))));
    await expect(inAgency((tx) => createRunFiles(tx, actor, store, period, { today: TODAY, expectedFingerprint: again.fingerprint }))).rejects.toBeInstanceOf(TotalsChangedError);
  });

  it("treats a period paid before Shiftbook (all hours locked, no run) as closed", async () => {
    await expect(inAgency((tx) => computeRun(tx, actor, periodId("w1")))).rejects.toBeInstanceOf(PeriodLockedError);
    await expect(
      inAgency((tx) => receiveDocument(tx, actor, store, { payPeriodId: periodId("w1"), filename: SAMPLE, bytes: readFileSync(`demo/samples/2026-10-05/${SAMPLE}`) })),
    ).rejects.toBeInstanceOf(PeriodLockedError);
    expect(new PeriodLockedError().permanent).toBe(true);
  });
});
