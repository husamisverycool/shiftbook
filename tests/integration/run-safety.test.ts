/**
 * Fifth second-opinion review: a period is paid once, concurrent clicks cannot double anything,
 * a day that may be counted twice is held, and the files always match what was reviewed.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listPeriods, totalsStep, uploadStep, hoursStep } from "../../src/server/convert/queries";
import { agencies, agencySettings, auditEvents, clientBillingProfiles, exports, invoices, jobOrders, jobs, payLines, payPeriods, payRuns, rateCards, sourceDocuments, timeEntries, workers, worksites } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, clientId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { createRunFiles, RunNotReadyError, TotalsChangedError } from "../../src/server/files/service";
import { StaleRequestError } from "../../src/server/errors";
import { archiveDocument, NotArchivableError, queueWaitingDocuments, READ_FAILED, readStoredDocument, receiveDocument, retryDocument, type ImageReader } from "../../src/server/intake/service";
import { receiveUploads } from "../../src/server/intake/upload";
import { STALE_AFTER_MINUTES } from "../../src/server/jobs";
import { addEntry, approveEntries, confirmDistinctDay, editEntry, rejectEntry, restoreEntry } from "../../src/server/review/service";
import { lockPeriod, PeriodBusyError, periodLock, periodState } from "../../src/server/run/period-lock";
import { computeRun, PeriodLockedError, setSkipped } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { openAppDb, openOwnerDb } from "./helpers";
import { approveAsOwner } from "./helpers";

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
    await inAgency((tx) => approveAsOwner(tx, actor, period));
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
    await inAgency((tx) => approveAsOwner(tx, actor, period));
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
    await inAgency((tx) => approveAsOwner(tx, actor, period));
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

describe("seventh review", () => {
  const docOf = async (filename: string) =>
    (await inAgency((tx) => tx.select().from(sourceDocuments).where(and(eq(sourceDocuments.payPeriodId, period), eq(sourceDocuments.filename, filename)))))[0]!;
  const entriesOfDoc = (documentId: string) => inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.sourceDocumentId, documentId)));
  const codes = async () => (await inAgency((tx) => computeRun(tx, actor, period))).blockers.map((b) => b.code);
  const failingStore = { get: () => Promise.reject(new Error("storage timeout")), put: store.put.bind(store) } as unknown as LocalDocumentStore;
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
  const late = () =>
    inAgency((tx) => receiveDocument(tx, actor, store, { payPeriodId: period, filename: "late.csv", bytes: new TextEncoder().encode("Employee ID,Employee Name\n1,x\n") }));

  it("never pays an archived timesheet's hours, and a reading that finishes later cannot bring them back (B1)", async () => {
    const doc = await docOf(SAMPLE);
    await expect(inAgency((tx) => retryDocument(tx, actor, doc.id))).rejects.toBeInstanceOf(StaleRequestError); // it was read fine
    // A second reading fails after the first one succeeded: the first reading's entries are still there.
    await inAgency((tx) => tx.update(sourceDocuments).set({ status: "received" }).where(eq(sourceDocuments.id, doc.id)));
    await expect(readStoredDocument({ withAgency: app.withAgency, store: failingStore, imageReader: noImages }, actor, doc.id)).rejects.toThrow();
    expect((await docOf(SAMPLE)).status).toBe("failed");
    expect((await entriesOfDoc(doc.id)).length).toBeGreaterThan(0);

    await inAgency((tx) => archiveDocument(tx, actor, doc.id, "The same hours are in the client's export"));
    const archived = await entriesOfDoc(doc.id);
    expect(archived.every((e) => e.status === "rejected")).toBe(true);
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.status).toBe("blocked");
    expect(run.blockers.map((b) => b.code)).toContain("no_entries");
    expect((await inAgency((tx) => hoursStep(tx, period))).rows).toHaveLength(0);

    // A queued reading that runs after the archive changes nothing.
    await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, doc.id);
    expect((await docOf(SAMPLE)).status).toBe("archived");
    expect((await entriesOfDoc(doc.id)).every((e) => e.status === "rejected")).toBe(true);
    expect(await inAgency((tx) => restoreEntry(tx, actor, archived[0]!.id))).toBe(false);
    await expect(inAgency((tx) => retryDocument(tx, actor, doc.id))).rejects.toBeInstanceOf(StaleRequestError);
  });

  it("clears a 'both are real' confirmation when an entry is rejected or restored (S1, N4)", async () => {
    const a = await entryOf("anita-patel", "2026-10-05");
    const add = async () => {
      const r = await inAgency((tx) => addEntry(tx, actor, period, { workerId: workerId("anita-patel"), workDate: "2026-10-05", minutes: 120 }, ["confirmed_client"], ""));
      if (!r.ok) throw new Error(r.error);
      return r.entryId;
    };
    const b = await add();
    await inAgency((tx) => confirmDistinctDay(tx, actor, [a.id, b], "Evening shift, confirmed with the supervisor"));
    await inAgency((tx) => rejectEntry(tx, actor, b));
    const c = await add();
    await inAgency((tx) => confirmDistinctDay(tx, actor, [a.id, c], "Evening shift, confirmed with the supervisor"));
    expect(await codes()).not.toContain("possible_duplicate_day");
    await inAgency((tx) => restoreEntry(tx, actor, b));
    await inAgency((tx) => approveEntries(tx, actor, [b], { bulk: false }));
    expect(await codes()).toContain("possible_duplicate_day");

    await expect(inAgency((tx) => confirmDistinctDay(tx, actor, [a.id], "one entry"))).rejects.toBeInstanceOf(StaleRequestError);
    await inAgency((tx) => rejectEntry(tx, actor, c));
    await expect(inAgency((tx) => confirmDistinctDay(tx, actor, [a.id, c], "a rejected entry"))).rejects.toBeInstanceOf(StaleRequestError);
  });

  it("offers to read again, or archive, a timesheet whose reading stopped part-way (S2)", async () => {
    const { documentId } = await late();
    const setReading = (since: Date) => inAgency((tx) => tx.update(sourceDocuments).set({ status: "reading", updatedAt: since }).where(eq(sourceDocuments.id, documentId)));

    await setReading(new Date());
    expect((await inAgency((tx) => uploadStep(tx, period))).find((d) => d.id === documentId)!.stuck).toBe(false);
    await expect(inAgency((tx) => retryDocument(tx, actor, documentId))).rejects.toBeInstanceOf(StaleRequestError);
    await expect(inAgency((tx) => archiveDocument(tx, actor, documentId, "duplicate"))).rejects.toBeInstanceOf(NotArchivableError);

    await setReading(minutesAgo(STALE_AFTER_MINUTES + 1));
    expect((await inAgency((tx) => uploadStep(tx, period))).find((d) => d.id === documentId)!.stuck).toBe(true);
    await inAgency((tx) => retryDocument(tx, actor, documentId));
    expect((await docOf("late.csv")).status).toBe("received");
    const queued = async () => (await inAgency((tx) => tx.select().from(jobs).where(eq(jobs.status, "queued")))).filter((j) => (j.payload as { documentId?: string }).documentId === documentId).length;
    const before = await queued();
    await inAgency((tx) => retryDocument(tx, actor, documentId)); // a second click
    expect(await queued()).toBe(before);

    await setReading(minutesAgo(STALE_AFTER_MINUTES + 1));
    await inAgency((tx) => archiveDocument(tx, actor, documentId, "Uploaded twice"));
    expect((await docOf("late.csv")).status).toBe("archived");
  });

  it("says plainly when the period is busy, and keeps the timesheet readable (S3)", async () => {
    const usual = periodLock.timeoutMs;
    periodLock.timeoutMs = 200;
    let release!: () => void;
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    const holder = inAgency(async (tx) => {
      await lockPeriod(tx, period);
      locked();
      await released;
    });
    try {
      await isLocked;
      await expect(inAgency((tx) => computeRun(tx, actor, period))).rejects.toBeInstanceOf(PeriodBusyError);
      const doc = await docOf(SAMPLE);
      await inAgency((tx) => tx.update(sourceDocuments).set({ status: "received" }).where(eq(sourceDocuments.id, doc.id))); // read again
      await expect(readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, doc.id)).rejects.toBeInstanceOf(PeriodBusyError);
      const after = await docOf(SAMPLE);
      expect(after.error).toBe(new PeriodBusyError().message);
      expect(after.error).not.toMatch(/query|select|pg_/i);
    } finally {
      release();
      await holder;
      periodLock.timeoutMs = usual;
    }
    const failed = await docOf(SAMPLE);
    await inAgency((tx) => retryDocument(tx, actor, failed.id));
  });

  it("answers a stale tab plainly when a timesheet or entry is gone (S4)", async () => {
    const gone = "00000000-0000-4000-a000-0000000000ee";
    await expect(inAgency((tx) => archiveDocument(tx, actor, gone, "x"))).rejects.toBeInstanceOf(StaleRequestError);
    await expect(inAgency((tx) => retryDocument(tx, actor, gone))).rejects.toBeInstanceOf(StaleRequestError);
    const a = await entryOf("anita-patel", "2026-10-05");
    await expect(inAgency((tx) => confirmDistinctDay(tx, actor, [a.id, gone], "x"))).rejects.toBeInstanceOf(StaleRequestError);
  });

  it("keeps a period paid before Shiftbook closed even when one of its entries was rejected (N1, N2)", async () => {
    const w1 = periodId("w1");
    const [one] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.payPeriodId, w1)).limit(1));
    await inAgency((tx) => tx.update(timeEntries).set({ status: "rejected" }).where(eq(timeEntries.id, one!.id)));
    await expect(inAgency((tx) => computeRun(tx, actor, w1))).rejects.toBeInstanceOf(PeriodLockedError);
    expect((await inAgency((tx) => listPeriods(tx))).some((p) => p.id === w1)).toBe(false);
    expect(await inAgency((tx) => periodState(tx, w1))).toBe("history");
    expect(await inAgency((tx) => periodState(tx, period))).toBe("open");
  });

  it("refuses files when a position or worksite name printed on the invoice changed after the totals were shown (N3)", async () => {
    const shown = await inAgency((tx) => computeRun(tx, actor, period));
    await inAgency((tx) => tx.update(jobOrders).set({ position: "Renamed position" }));
    await expect(inAgency((tx) => createRunFiles(tx, actor, store, period, { today: TODAY, expectedFingerprint: shown.fingerprint }))).rejects.toBeInstanceOf(TotalsChangedError);
    const again = await inAgency((tx) => computeRun(tx, actor, period));
    await inAgency((tx) => tx.update(worksites).set({ name: "Renamed site" }));
    await expect(inAgency((tx) => createRunFiles(tx, actor, store, period, { today: TODAY, expectedFingerprint: again.fingerprint }))).rejects.toBeInstanceOf(TotalsChangedError);
  });
});

describe("eighth review", () => {
  const docOf = async (filename: string) =>
    (await inAgency((tx) => tx.select().from(sourceDocuments).where(and(eq(sourceDocuments.payPeriodId, period), eq(sourceDocuments.filename, filename)))))[0]!;
  const entriesOfDoc = (documentId: string) => inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.sourceDocumentId, documentId)));
  const deps = { withAgency: app.withAgency, store, imageReader: noImages };
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
  const signal = () => {
    let done!: () => void;
    const promise = new Promise<void>((resolve) => (done = resolve));
    return { promise, done };
  };
  /** Holds the period's lock (another person working) while `fn` runs, with a short wait. */
  async function whileBusy(fn: () => Promise<void>) {
    const usual = periodLock.timeoutMs;
    periodLock.timeoutMs = 200;
    const locked = signal();
    const release = signal();
    const holder = inAgency(async (tx) => {
      await lockPeriod(tx, period);
      locked.done();
      await release.promise;
    });
    try {
      await locked.promise;
      await fn();
    } finally {
      release.done();
      await holder;
      periodLock.timeoutMs = usual;
    }
  }

  it("a reading that starts while a person archives the timesheet does nothing (B1 race)", async () => {
    const doc = await docOf(SAMPLE);
    await inAgency((tx) => tx.update(sourceDocuments).set({ status: "failed", error: "unreadable" }).where(eq(sourceDocuments.id, doc.id)));
    const archived = signal();
    const commit = signal();
    const archiving = inAgency(async (tx) => {
      await archiveDocument(tx, actor, doc.id, "The same hours are in the client's export");
      archived.done();
      await commit.promise;
    });
    await archived.promise;
    const reading = readStoredDocument(deps, actor, doc.id); // waits on the archived row
    await new Promise((resolve) => setTimeout(resolve, 300));
    commit.done();
    await archiving;
    expect(await reading).toEqual({ entries: 0, needsReview: 0 });
    expect((await docOf(SAMPLE)).status).toBe("archived");
    expect((await entriesOfDoc(doc.id)).every((e) => e.status === "rejected")).toBe(true);
    expect((await inAgency((tx) => computeRun(tx, actor, period))).blockers.map((b) => b.code)).toContain("no_entries");
  });

  it("a stray second reading of a timesheet already read changes nothing a person reviewed (should-fix 1)", async () => {
    const doc = await docOf(SAMPLE);
    const e = await entryOf("anita-patel", "2026-10-05");
    await inAgency((tx) => rejectEntry(tx, actor, e.id));
    const before = await entriesOfDoc(doc.id);
    expect(await readStoredDocument(deps, actor, doc.id)).toEqual({ entries: 0, needsReview: 0 });
    const after = await entriesOfDoc(doc.id);
    expect(after.map((x) => [x.id, x.status]).sort()).toEqual(before.map((x) => [x.id, x.status]).sort());
    expect((await docOf(SAMPLE)).status).toBe("read");
  });

  it("a slow reading stays fresh page by page, and one archived while cut off stays archived", async () => {
    const { documentId } = await inAgency((tx) => receiveDocument(tx, actor, store, { payPeriodId: period, filename: "sheet.jpg", bytes: new Uint8Array([1, 2, 3]) }));
    const seen: Date[] = [];
    const slow: ImageReader = {
      async read(input) {
        seen.push((await docOf("sheet.jpg")).updatedAt);
        await new Promise((resolve) => setTimeout(resolve, 20));
        await input.onPage?.();
        seen.push((await docOf("sheet.jpg")).updatedAt);
        return { parsed: { kind: "image", profileKey: null, clientHint: null, entries: [], notes: [] }, pages: [] };
      },
    };
    await readStoredDocument({ ...deps, imageReader: slow }, actor, documentId);
    expect(seen[1]!.getTime()).toBeGreaterThan(seen[0]!.getTime());

    // Cut off: no sign of life for longer than the stale limit, so a person archives it; the reading then ends.
    await inAgency((tx) => tx.update(sourceDocuments).set({ status: "failed" }).where(eq(sourceDocuments.id, documentId)));
    const cutOff: ImageReader = {
      async read(input) {
        await inAgency((tx) => tx.update(sourceDocuments).set({ updatedAt: minutesAgo(STALE_AFTER_MINUTES + 1) }).where(eq(sourceDocuments.id, documentId)));
        await inAgency((tx) => archiveDocument(tx, actor, documentId, "Uploaded twice"));
        await input.onPage?.();
        return { parsed: { kind: "image", profileKey: null, clientHint: null, entries: [], notes: [] }, pages: [] };
      },
    };
    expect(await readStoredDocument({ ...deps, imageReader: cutOff }, actor, documentId)).toEqual({ entries: 0, needsReview: 0 });
    expect((await docOf("sheet.jpg")).status).toBe("archived");
  });

  it("a timesheet whose reading could not even start is shown as failed, so it can be read again", async () => {
    const { documentId } = await inAgency((tx) => receiveDocument(tx, actor, store, { payPeriodId: period, filename: "late.csv", bytes: new TextEncoder().encode("a,b\n1,2\n") }));
    let calls = 0;
    const flaky = { ...deps, withAgency: <T>(agencyId: string, fn: Parameters<typeof app.withAgency<T>>[1]) => (calls++ === 0 ? Promise.reject(new Error("The database connection was reset.")) : app.withAgency(agencyId, fn)) };
    await expect(readStoredDocument(flaky, actor, documentId)).rejects.toThrow(/reset/);
    expect((await docOf("late.csv")).status).toBe("failed");
  });

  it("an upload into a busy period says so, and keeps the files already taken (S3)", async () => {
    await whileBusy(async () => {
      const r = await receiveUploads(app.withAgency, actor, store, period, [{ name: "late.csv", size: 10, bytes: () => new TextEncoder().encode("a,b\n1,2\n") }]);
      expect(r).toEqual({ accepted: [], refused: [], busy: true });
      await expect(inAgency((tx) => totalsStep(tx, actor, period))).rejects.toBeInstanceOf(PeriodBusyError);
    });
  });

  it("archiving records what each entry was before it was set aside, including disputed ones (notes 1, 2)", async () => {
    const doc = await docOf(SAMPLE);
    const e = await entryOf("anita-patel", "2026-10-05");
    await inAgency((tx) => tx.update(timeEntries).set({ status: "disputed" }).where(eq(timeEntries.id, e.id)));
    await inAgency((tx) => tx.update(sourceDocuments).set({ status: "failed" }).where(eq(sourceDocuments.id, doc.id)));
    await inAgency((tx) => archiveDocument(tx, actor, doc.id, "Hours are in the client's export"));
    expect((await entriesOfDoc(doc.id)).every((x) => x.status === "rejected")).toBe(true);
    const [event] = await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityId, e.id), eq(auditEvents.action, "update"))));
    expect(event!.before).toEqual({ status: "disputed" });
  });

  it("a period paid before Shiftbook stays history even with a draft run on it (note 3)", async () => {
    const w1 = periodId("w1");
    await inAgency((tx) => tx.insert(payRuns).values({ agencyId: actor.agencyId, payPeriodId: w1, version: 1, status: "draft", rulesVersion: "x" }));
    expect(await inAgency((tx) => periodState(tx, w1))).toBe("history");
  });

  it("a reading that stopped part-way is described as stopped in the totals (note 5)", async () => {
    const doc = await docOf(SAMPLE);
    await inAgency((tx) => tx.update(sourceDocuments).set({ status: "reading", updatedAt: minutesAgo(STALE_AFTER_MINUTES + 1) }).where(eq(sourceDocuments.id, doc.id)));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    const blocker = run.blockers.find((b) => b.code === "document_failed")!;
    expect(blocker.message).toMatch(/stopped before it finished/);
  });
});

describe("ninth review", () => {
  const docOf = async (filename: string) =>
    (await inAgency((tx) => tx.select().from(sourceDocuments).where(and(eq(sourceDocuments.payPeriodId, period), eq(sourceDocuments.filename, filename)))))[0]!;
  const late = () =>
    inAgency((tx) => receiveDocument(tx, actor, store, { payPeriodId: period, filename: "late.csv", bytes: new TextEncoder().encode("Employee ID,Employee Name\n1,x\n") }));
  const liveJobs = async (documentId: string) =>
    (await inAgency((tx) => tx.select().from(jobs))).filter((j) => (j.payload as { documentId?: string }).documentId === documentId && (j.status === "queued" || j.status === "running"));

  it("a claim that never committed leaves the timesheet failed with a plain reason, not waiting forever (S1, N3)", async () => {
    const { documentId } = await late();
    let calls = 0;
    const dropsBeforeCommit = <T>(agencyId: string, fn: Parameters<typeof app.withAgency<T>>[1]) =>
      calls++ === 0
        ? app.withAgency(agencyId, async (tx) => {
            await fn(tx);
            throw new Error("Failed query: commit (connection lost)");
          })
        : app.withAgency(agencyId, fn);
    await expect(readStoredDocument({ withAgency: dropsBeforeCommit, store, imageReader: noImages }, actor, documentId)).rejects.toThrow();
    const doc = await docOf("late.csv");
    expect([doc.status, doc.error]).toEqual(["failed", READ_FAILED]);
  });

  it("a timesheet waiting to be read without a job gets one when the queue runs", async () => {
    const { documentId } = await late();
    await inAgency((tx) => tx.update(jobs).set({ status: "failed" }));
    expect(await liveJobs(documentId)).toHaveLength(0);
    await inAgency((tx) => queueWaitingDocuments(tx, actor));
    await inAgency((tx) => queueWaitingDocuments(tx, actor)); // once is enough
    expect(await liveJobs(documentId)).toHaveLength(1);
  });

  it("a live reading signals each page, so its job is not taken over (N1)", async () => {
    const { documentId } = await inAgency((tx) => receiveDocument(tx, actor, store, { payPeriodId: period, filename: "sheet.jpg", bytes: new Uint8Array([1, 2, 3]) }));
    let beats = 0;
    const twoPages: ImageReader = {
      async read(input) {
        await input.onPage?.();
        await input.onPage?.();
        return { parsed: { kind: "image", profileKey: null, clientHint: null, entries: [], notes: [] }, pages: [] };
      },
    };
    await readStoredDocument({ withAgency: app.withAgency, store, imageReader: twoPages }, actor, documentId, async () => {
      beats += 1;
    });
    expect(beats).toBe(2);
  });
});
