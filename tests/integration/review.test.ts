import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agencies, auditEvents, timeEntries } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { readStoredDocument, receiveDocument, type ImageReader } from "../../src/server/intake/service";
import { approveEntries, editEntry, rejectEntry, restoreEntry } from "../../src/server/review/service";
import { computeRun } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-review-")));
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const noImages: ImageReader = { read: () => Promise.reject(new Error("no images in this test")) };
const period = periodId("w2");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);
const entryOf = async (who: string, date: string) =>
  (await inAgency((tx) => tx.select().from(timeEntries).where(and(eq(timeEntries.payPeriodId, period), eq(timeEntries.workerId, workerId(who)), eq(timeEntries.workDate, date)))))[0]!;

beforeAll(async () => {
  const existing = await owner.db.select().from(agencies).where(eq(agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  const file = "IL-prairie-line-timeclock-2026-10-05.csv";
  const { documentId } = await inAgency((tx) =>
    receiveDocument(tx, actor, store, { payPeriodId: period, filename: file, bytes: readFileSync(`demo/samples/2026-10-05/${file}`) }),
  );
  await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, documentId);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("editing an entry", () => {
  it("requires a reason, and 'other' needs a note", async () => {
    const e = await entryOf("anita-patel", "2026-10-05");
    expect(await inAgency((tx) => editEntry(tx, actor, e.id, { outMinute: 960 }, [], ""))).toEqual({ ok: false, error: "reason_required" });
    expect(await inAgency((tx) => editEntry(tx, actor, e.id, { outMinute: 960 }, ["other"], " "))).toEqual({ ok: false, error: "note_required" });
  });

  it("recomputes minutes from the times, marks the entry reviewed and the value edited, and audits before/after with the reason", async () => {
    const e = await entryOf("anita-patel", "2026-10-05");
    const result = await inAgency((tx) => editEntry(tx, actor, e.id, { outMinute: 960 }, ["confirmed_client"], "supervisor email"));
    expect(result).toEqual({ ok: true });
    const after = await entryOf("anita-patel", "2026-10-05");
    expect(after.outMinute).toBe(960);
    expect(after.minutes).toBe(960 - 420 - 30);
    expect(after.status).toBe("reviewed");
    expect(after.fields.out?.edited).toBe(true);
    const [event] = await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityId, e.id), eq(auditEvents.action, "update"))));
    expect(event!.reason).toBe("confirmed_client: supervisor email");
    expect(event!.before).toMatchObject({ outMinute: 930, minutes: 480 });
    expect(event!.after).toMatchObject({ outMinute: 960, minutes: 510 });
  });

  it("refuses impossible values with a plain error code", async () => {
    const e = await entryOf("anita-patel", "2026-10-06");
    expect(await inAgency((tx) => editEntry(tx, actor, e.id, { inMinute: 600, outMinute: 500 }, ["misread_corrected"], ""))).toEqual({ ok: false, error: "out_not_after_in" });
    expect(await inAgency((tx) => editEntry(tx, actor, e.id, { breakMinutes: 600 }, ["misread_corrected"], ""))).toEqual({ ok: false, error: "break_too_long" });
    expect(await inAgency((tx) => editEntry(tx, actor, e.id, { workDate: "2026-10-20" }, ["misread_corrected"], ""))).toEqual({ ok: false, error: "date_outside_period" });
    expect(await inAgency((tx) => editEntry(tx, actor, e.id, { outMinute: 1500 }, ["misread_corrected"], ""))).toEqual({ ok: false, error: "crosses_midnight" });
  });

  it("matches an entry to another worker only when that worker has one active assignment", async () => {
    const e = await entryOf("anita-patel", "2026-10-07");
    expect(await inAgency((tx) => editEntry(tx, actor, e.id, { workerId: workerId("olivia-hart") }, ["matched_worker"], ""))).toEqual({ ok: true });
    const moved = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, e.id)));
    expect(moved[0]!.workerId).toBe(workerId("olivia-hart"));
    expect(moved[0]!.assignmentId).not.toBe(e.assignmentId);
  });
});

describe("approving and rejecting", () => {
  it("bulk approval changes only high-confidence rows", async () => {
    const a = await entryOf("fatima-haddad", "2026-10-05");
    const b = await entryOf("fatima-haddad", "2026-10-06");
    await inAgency((tx) => tx.update(timeEntries).set({ confidence: "medium", status: "needs_review" }).where(eq(timeEntries.id, b.id)));
    const r = await inAgency((tx) => approveEntries(tx, actor, [a.id, b.id], { bulk: true }));
    expect(r).toEqual({ approved: [a.id], skipped: [b.id] });
    const single = await inAgency((tx) => approveEntries(tx, actor, [b.id], { bulk: false }));
    expect(single.approved).toEqual([b.id]);
  });

  it("refuses to approve an entry that is not matched to a worker", async () => {
    const e = await entryOf("grace-mensah", "2026-10-05");
    await inAgency((tx) => tx.update(timeEntries).set({ workerId: null, assignmentId: null, status: "needs_review" }).where(eq(timeEntries.id, e.id)));
    const r = await inAgency((tx) => approveEntries(tx, actor, [e.id], { bulk: false }));
    expect(r).toEqual({ approved: [], skipped: [e.id] });
  });

  it("a rejected entry is never paid, and can be restored for review", async () => {
    const e = await entryOf("trevor-lindqvist", "2026-10-05");
    await inAgency((tx) => rejectEntry(tx, actor, e.id));
    expect((await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, e.id))))[0]!.status).toBe("rejected");
    await inAgency((tx) => restoreEntry(tx, actor, e.id));
    expect((await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, e.id))))[0]!.status).toBe("needs_review");
  });
});

describe("the run refuses entries dated outside the pay period", () => {
  it("blocks them by name", async () => {
    const e = await entryOf("olivia-hart", "2026-10-05");
    await inAgency((tx) => tx.update(timeEntries).set({ workDate: "2026-10-12", status: "reviewed" }).where(eq(timeEntries.id, e.id)));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers.map((b) => b.code)).toContain("outside_period");
  });
});
