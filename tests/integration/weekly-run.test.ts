/**
 * The weekly run (slice e, part 1; plan `.claude/plans/slice-e-weekly-run.md`): the Owner approves a
 * run, which freezes what was approved; files only from an approved run that still matches; a change
 * voids the approval; a client that requires approval holds the run; overtime well above last week
 * is a warning.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadPortal, sendApprovalRequest, submitDecision, type ApprovalDeps } from "../../src/server/approvals/service";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, clientId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { createRunFiles, RunNotApprovedError } from "../../src/server/files/service";
import { DemoMailboxTransport } from "../../src/server/mail/transport";
import { editEntry } from "../../src/server/review/service";
import { approveRun, setClientApprovalRequired, unapproveRun } from "../../src/server/run/approval";
import { PeriodLockedError } from "../../src/server/run/period-lock";
import { computeRun } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-weekly-")));
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test owner", role: "owner" };
const coordinator: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000003", label: "Test coordinator", role: "coordinator" };
const w2 = periodId("w2");
const IL = clientId("il");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);
const today = "2026-10-13";

async function addShift(worker: string, period: string, date: string, inMinute: number, outMinute: number, status: "reviewed" | "extracted" = "reviewed") {
  const [row] = await owner.db
    .insert(s.timeEntries)
    .values({ agencyId: theOwner.agencyId, payPeriodId: period, workerNameRaw: worker, workerId: workerId(worker), assignmentId: assignmentId(worker), workDate: date, inMinute, outMinute, breakMinutes: 0, minutes: outMinute - inMinute, confidence: "high", status })
    .returning();
  return row!;
}

/** Marcus 10 h Monday to Wednesday and 8 h Thursday and Friday (46 h); Anita 8 h Monday to Wednesday. */
async function fresh() {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  const shifts = [];
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) shifts.push(await addShift("marcus-bell", w2, d, 420, 1020));
  for (const d of ["2026-10-08", "2026-10-09"]) shifts.push(await addShift("marcus-bell", w2, d, 420, 900));
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) shifts.push(await addShift("anita-patel", w2, d, 420, 900));
  return shifts;
}

const compute = (who: Actor = theOwner, period = w2) => inAgency((tx) => computeRun(tx, who, period));
const runRow = async (period = w2) => (await inAgency((tx) => tx.select().from(s.payRuns).where(eq(s.payRuns.payPeriodId, period)).orderBy(desc(s.payRuns.version)).limit(1)))[0]!;

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("approving a run", () => {
  beforeEach(fresh);

  it("is the Owner's: a coordinator cannot approve", async () => {
    const run = await compute();
    expect(run.status).toBe("ready");
    expect(await inAgency((tx) => approveRun(tx, coordinator, w2, run.fingerprint))).toEqual({ ok: false, error: "not_allowed" });
  });

  it("freezes what was approved: who, when, the fingerprint and the warnings acknowledged", async () => {
    const run = await compute();
    expect(await inAgency((tx) => approveRun(tx, theOwner, w2, run.fingerprint))).toEqual({ ok: true });
    const row = await runRow();
    expect(row).toMatchObject({ status: "approved", approvedBy: theOwner.userId, approvedByLabel: "Test owner" });
    expect(row.approval).toMatchObject({ fingerprint: run.fingerprint, rulesVersion: expect.any(String), warnings: expect.any(Array), totals: { grossCents: expect.any(Number), billedCents: expect.any(Number) } });
    const [event] = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityId, row.id), eq(s.auditEvents.action, "approve"))));
    expect(event!.actorLabel).toBe("Test owner");
    // Computing again with nothing changed keeps the approval.
    expect((await compute()).status).toBe("approved");
  });

  it("is refused when the totals changed since they were shown, or while anything blocks", async () => {
    await compute();
    expect(await inAgency((tx) => approveRun(tx, theOwner, w2, "0".repeat(64)))).toEqual({ ok: false, error: "changed" });
    await inAgency((tx) => setClientApprovalRequired(tx, theOwner, IL, true));
    const blocked = await compute();
    expect(blocked.status).toBe("blocked");
    expect(await inAgency((tx) => approveRun(tx, theOwner, w2, blocked.fingerprint))).toEqual({ ok: false, error: "blocked" });
  });

  it("is voided by any change after it, audited; computing then shows the run ready again", async () => {
    const shifts = await fresh();
    const run = await compute();
    await inAgency((tx) => approveRun(tx, theOwner, w2, run.fingerprint));
    expect(await inAgency((tx) => editEntry(tx, theOwner, shifts[7]!.id, { outMinute: 930 }, ["confirmed_client"], "phone call"))).toEqual({ ok: true });
    const again = await compute();
    expect(again.status).toBe("ready");
    const row = await runRow();
    expect(row).toMatchObject({ status: "ready", approvedBy: null, approval: null });
    const events = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityId, row.id), eq(s.auditEvents.reason, "approval voided: the run changed after it was approved"))));
    expect(events).toHaveLength(1);
  });

  it("can be withdrawn with a reason until the files exist", async () => {
    const run = await compute();
    await inAgency((tx) => approveRun(tx, theOwner, w2, run.fingerprint));
    expect(await inAgency((tx) => unapproveRun(tx, theOwner, w2, " "))).toEqual({ ok: false, error: "reason_required" });
    expect(await inAgency((tx) => unapproveRun(tx, coordinator, w2, "wrong week"))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => unapproveRun(tx, theOwner, w2, "Anita's Wednesday is wrong"))).toEqual({ ok: true });
    expect((await runRow()).status).toBe("ready");
  });
});

describe("creating the files", () => {
  beforeEach(fresh);

  it("needs an approved run that still matches", async () => {
    await compute();
    await expect(inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today }))).rejects.toBeInstanceOf(RunNotApprovedError);
    const run = await compute();
    await inAgency((tx) => approveRun(tx, theOwner, w2, run.fingerprint));
    const files = await inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today }));
    expect(files.invoices).toHaveLength(1);
    expect((await runRow()).status).toBe("exported");
    // Once the files exist, the approval cannot be withdrawn.
    await expect(inAgency((tx) => unapproveRun(tx, theOwner, w2, "too late"))).rejects.toBeInstanceOf(PeriodLockedError);
  });
});

describe("a client that requires approval", () => {
  beforeEach(fresh);

  it("holds the run until the client approves its shifts", async () => {
    await inAgency((tx) => setClientApprovalRequired(tx, theOwner, IL, true));
    const held = await compute();
    const blocker = held.blockers.find((b) => b.code === "client_approval_missing");
    expect(blocker?.message).toBe("Prairie Line Manufacturing (demo): 8 shifts are not approved by the client yet.");
    expect(blocker?.entryIds).toHaveLength(8);

    const deps: ApprovalDeps = { db: app.db, withAgency: app.withAgency, mailTransport: (id) => new DemoMailboxTransport(app.withAgency, id), baseUrl: "https://shiftbook.test", now: () => new Date("2026-10-12T15:00:00Z") };
    expect((await sendApprovalRequest(deps, theOwner, { clientId: IL, payPeriodId: w2, approverName: "Dana Approver", approverEmail: "dana@prairie.example", locale: "en", agencyLocale: "en" })).ok).toBe(true);
    const [mail] = await inAgency((tx) => tx.select().from(s.demoMailbox));
    const token = /sbap_[A-Za-z0-9_-]{43}/.exec(mail!.textBody)![0];
    const view = await loadPortal(deps, token);
    if (view.state !== "active") throw new Error("inactive");
    expect((await submitDecision(deps, token, { typedName: "Dana Approver", confirmed: true, snapshot: view.snapshot, locale: "en", ipAddress: null, userAgent: null })).ok).toBe(true);
    expect((await compute()).blockers.filter((b) => b.code === "client_approval_missing")).toEqual([]);
  });

  it("is a setting the Owner turns on and off, audited", async () => {
    await inAgency((tx) => setClientApprovalRequired(tx, theOwner, IL, true));
    await inAgency((tx) => setClientApprovalRequired(tx, theOwner, IL, false));
    const [client] = await inAgency((tx) => tx.select().from(s.clients).where(eq(s.clients.id, IL)));
    expect(client!.approvalRequired).toBe(false);
    const events = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "client"), eq(s.auditEvents.entityId, IL))).orderBy(s.auditEvents.id));
    // The audit log is never cleared (earlier tests' changes are in it too): the last two are these.
    expect(events.map((e) => (e.after as { approvalRequired: boolean }).approvalRequired).slice(-2)).toEqual([true, false]);
  });
});

describe("overtime well above last week", () => {
  beforeEach(fresh);

  async function exportW2() {
    const run = await compute();
    await inAgency((tx) => approveRun(tx, theOwner, w2, run.fingerprint));
    await inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today }));
    const [w3] = await owner.db.insert(s.payPeriods).values({ agencyId: theOwner.agencyId, startsOn: "2026-10-12", endsOn: "2026-10-18" }).returning();
    return w3!.id;
  }

  it("is a warning naming the worker (Marcus 6 h of overtime last week, 20 h this week), never a blocker", async () => {
    const w3 = await exportW2();
    for (const d of ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]) await addShift("marcus-bell", w3, d, 360, 1080);
    const run = await compute(theOwner, w3);
    const spike = run.warnings.filter((w) => w.code === "overtime_spike");
    expect(spike.map((w) => [w.workerName, w.message])).toEqual([["Marcus Bell", "Marcus Bell: 20:00 of overtime this period against 6:00 in the period before."]]);
    expect(run.blockers.map((b) => b.code)).not.toContain("overtime_spike");
  });

  it("stays quiet for a small rise, and when there is no earlier exported week", async () => {
    const quiet = await compute();
    expect(quiet.warnings.filter((w) => w.code === "overtime_spike")).toEqual([]);
    const w3 = await exportW2();
    for (const d of ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]) await addShift("marcus-bell", w3, d, 420, 1020);
    await addShift("marcus-bell", w3, "2026-10-16", 420, 960);
    const run = await compute(theOwner, w3);
    // 49 h: 9 h of overtime against 6 h — 3 h more, under the 4-hour floor.
    expect(run.warnings.filter((w) => w.code === "overtime_spike")).toEqual([]);
  });
});
