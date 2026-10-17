/**
 * Slice u (decision 0039): shifts, publishing, offers, the worker's answers, no-shows — in the
 * database. One agency never sees another's shifts or offers; a confirmed shift places the worker on
 * the job order; no answer by the deadline opens the shift again; a schedule never makes a time entry.
 */
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@shiftbook/rules";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER } from "../../src/server/demo/dataset";
import { clearDemoAgency, seedDemoAgency } from "../../src/server/demo/seed";
import { answerOffer, confirmShift, createShifts, declineShift, eligibleWorkers, expireOverdue, markNoShow, publishShifts } from "../../src/server/schedule/service";
import { weekView, workerShifts } from "../../src/server/schedule/queries";
import type { Actor } from "../../src/server/session";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: "Demo Owner (demo)", role: "owner" };
const today = new Date().toISOString().slice(0, 10);
const later = addDays(today, 10);
let other = "";
let job = { id: "", position: "" };
let placed: string[] = [];
let stranger = "";

beforeAll(async () => {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await app.withAgency(DEMO_AGENCY.id, async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
    await tx.delete(s.shifts);
    // A job order of its own, so only this test's placements are eligible.
    const [src] = await tx.select().from(s.jobOrders).limit(1);
    const [j] = await tx
      .insert(s.jobOrders)
      .values({ agencyId: DEMO_AGENCY.id, clientId: src!.clientId, worksiteId: src!.worksiteId, position: "Schedule test position" })
      .returning({ id: s.jobOrders.id, position: s.jobOrders.position });
    job = j!;
    // Two workers placed on the job order from today on; one worker placed nowhere.
    const ws = await tx.select({ id: s.workers.id }).from(s.workers).limit(3);
    placed = [ws[0]!.id, ws[1]!.id];
    stranger = ws[2]!.id;
    await tx.delete(s.shiftOffers);
    for (const w of placed) await tx.insert(s.assignments).values({ agencyId: DEMO_AGENCY.id, workerId: w, jobOrderId: job.id, startDate: today, status: "active" });
  });
  const [b] = await owner.db.insert(s.agencies).values({ name: "Other agency (schedule test)" }).returning();
  other = b!.id;
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

const shiftInput = (over: Partial<Parameters<typeof createShifts>[2]> = {}) => ({ jobOrderId: job.id, workDate: later, startMinute: 420, endMinute: 900, breakMinutes: 30, workerId: null, copies: 1, requireConfirmation: true, ...over });

describe("scheduling", () => {
  it("open shifts publish as offers to the eligible workers; the first to accept takes it and is placed", async () => {
    const made = await app.withAgency(DEMO_AGENCY.id, (tx) => createShifts(tx, theOwner, shiftInput({ copies: 2 })));
    expect(made.ok && made.ids.length).toBe(2);
    const eligible = await app.withAgency(DEMO_AGENCY.id, (tx) => eligibleWorkers(tx, { jobOrderId: job.id, workDate: later, startMinute: 420, endMinute: 900, breakMinutes: 30 }));
    expect(eligible.filter((e) => e.tier === 1).map((e) => e.workerId).sort()).toEqual([...placed].sort());
    expect(eligible.some((e) => e.workerId === stranger && e.tier === 1)).toBe(false);
    const published = await app.withAgency(DEMO_AGENCY.id, (tx) => publishShifts(tx, theOwner, { from: later, to: later, scope: "changes", clientIds: null, notify: "confirm", message: null }));
    expect(published).toMatchObject({ ok: true, published: 2 });
    const mine = await app.withAgency(DEMO_AGENCY.id, (tx) => workerShifts(tx, placed[0]!, today));
    expect(mine.offers.length).toBe(2);
    const take = await app.withAgency(DEMO_AGENCY.id, (tx) => answerOffer(tx, { agencyId: DEMO_AGENCY.id, workerId: placed[0]!, label: "Worker" }, mine.offers[0]!.offerId, true, null));
    expect(take.ok).toBe(true);
    const shift = await app.withAgency(DEMO_AGENCY.id, async (tx) => (await tx.select().from(s.shifts).where(eq(s.shifts.id, mine.offers[0]!.id)))[0]!);
    expect(shift).toMatchObject({ state: "confirmed", workerId: placed[0] });
    expect(shift.assignmentId).not.toBeNull();
    // The other worker's offer for that shift is withdrawn; answering it now is refused.
    const theirs = await app.withAgency(DEMO_AGENCY.id, (tx) => tx.select().from(s.shiftOffers).where(and(eq(s.shiftOffers.shiftId, shift.id), eq(s.shiftOffers.workerId, placed[1]!))));
    expect(theirs[0]!.status).toBe("withdrawn");
    // A schedule never makes a time entry.
    const entries = await app.withAgency(DEMO_AGENCY.id, (tx) => tx.select({ n: sql<number>`count(*)::int` }).from(s.timeEntries).where(eq(s.timeEntries.assignmentId, shift.assignmentId!)));
    expect(entries[0]!.n).toBe(0);
  });

  it("an assigned shift awaits the worker's answer; confirming places them, declining opens it with a warning", async () => {
    const made = await app.withAgency(DEMO_AGENCY.id, (tx) => createShifts(tx, theOwner, shiftInput({ workerId: stranger, workDate: addDays(later, 1) })));
    const id = made.ok ? made.ids[0]! : "";
    await app.withAgency(DEMO_AGENCY.id, (tx) => publishShifts(tx, theOwner, { from: addDays(later, 1), to: addDays(later, 1), scope: "changes", clientIds: null, notify: "confirm", message: "See you then" }));
    const awaiting = await app.withAgency(DEMO_AGENCY.id, async (tx) => (await tx.select().from(s.shifts).where(eq(s.shifts.id, id)))[0]!);
    expect(awaiting.state).toBe("awaiting");
    expect(awaiting.confirmBy).not.toBeNull();
    // Someone else cannot answer it.
    expect(await app.withAgency(DEMO_AGENCY.id, (tx) => confirmShift(tx, { agencyId: DEMO_AGENCY.id, workerId: placed[0]!, label: "W" }, id))).toEqual({ ok: false, error: "not_yours" });
    const ok = await app.withAgency(DEMO_AGENCY.id, (tx) => confirmShift(tx, { agencyId: DEMO_AGENCY.id, workerId: stranger, label: "W" }, id));
    expect(ok.ok).toBe(true);
    const placedNow = await app.withAgency(DEMO_AGENCY.id, (tx) => tx.select().from(s.assignments).where(and(eq(s.assignments.workerId, stranger), eq(s.assignments.jobOrderId, job.id))));
    expect(placedNow.length).toBe(1);
    expect(await app.withAgency(DEMO_AGENCY.id, (tx) => declineShift(tx, { agencyId: DEMO_AGENCY.id, workerId: stranger, label: "W" }, id, " "))).toEqual({ ok: false, error: "reason_required" });
    await app.withAgency(DEMO_AGENCY.id, (tx) => declineShift(tx, { agencyId: DEMO_AGENCY.id, workerId: stranger, label: "W" }, id, "Family matter"));
    const declined = await app.withAgency(DEMO_AGENCY.id, async (tx) => (await tx.select().from(s.shifts).where(eq(s.shifts.id, id)))[0]!);
    expect(declined).toMatchObject({ state: "open", workerId: null, warning: "declined", warningWorkerId: stranger, warningReason: "Family matter" });
    const view = await app.withAgency(DEMO_AGENCY.id, (tx) => weekView(tx, today, { week: addDays(later, 1) }));
    expect(view.status.warnings).toContain(id);
    expect(view.status.unpublished).toContain(id);
  });

  it("no answer by the deadline opens the shift again, with a warning (Deputy)", async () => {
    const made = await app.withAgency(DEMO_AGENCY.id, (tx) => createShifts(tx, theOwner, shiftInput({ workerId: placed[1]!, workDate: addDays(later, 2) })));
    const id = made.ok ? made.ids[0]! : "";
    await app.withAgency(DEMO_AGENCY.id, async (tx) => {
      await tx.update(s.shifts).set({ state: "awaiting", publishedAt: sql`now()`, confirmBy: sql`now() - interval '1 minute'` }).where(eq(s.shifts.id, id));
      expect(await expireOverdue(tx)).toBeGreaterThanOrEqual(1);
    });
    const row = await app.withAgency(DEMO_AGENCY.id, async (tx) => (await tx.select().from(s.shifts).where(eq(s.shifts.id, id)))[0]!);
    expect(row).toMatchObject({ state: "open", workerId: null, warning: "expired", warningWorkerId: placed[1] });
  });

  it("a no-show is refused before the shift starts; once started, a replacement is offered", async () => {
    const future = await app.withAgency(DEMO_AGENCY.id, (tx) => createShifts(tx, theOwner, shiftInput({ workerId: placed[1]!, workDate: addDays(later, 3) })));
    expect(await app.withAgency(DEMO_AGENCY.id, (tx) => markNoShow(tx, theOwner, future.ok ? future.ids[0]! : "", true))).toEqual({ ok: false, error: "not_started" });
    // A shift that runs all day today (00:00 to 23:59), in UTC, has started and not ended.
    await app.withAgency(DEMO_AGENCY.id, (tx) => tx.delete(s.agencySettings).where(eq(s.agencySettings.key, "time_zone")));
    const now = await app.withAgency(DEMO_AGENCY.id, (tx) => createShifts(tx, theOwner, shiftInput({ workerId: placed[1]!, workDate: today, startMinute: 0, endMinute: 1439, breakMinutes: 0 })));
    const result = await app.withAgency(DEMO_AGENCY.id, (tx) => markNoShow(tx, theOwner, now.ok ? now.ids[0]! : "", true));
    expect(result.ok && result.ids.length).toBe(2);
    const replacement = await app.withAgency(DEMO_AGENCY.id, async (tx) => (await tx.select().from(s.shifts).where(eq(s.shifts.id, result.ok ? result.ids[1]! : "")))[0]!);
    expect(replacement).toMatchObject({ state: "open", replacesShiftId: now.ok ? now.ids[0] : "" });
    const offers = await app.withAgency(DEMO_AGENCY.id, (tx) => tx.select().from(s.shiftOffers).where(eq(s.shiftOffers.shiftId, replacement.id)));
    expect(offers.some((o) => o.workerId === placed[1])).toBe(false);
  });

  it("another agency sees none of these shifts or offers", async () => {
    const theirs = await app.withAgency(other, async (tx) => [await tx.select().from(s.shifts), await tx.select().from(s.shiftOffers)]);
    expect(theirs).toEqual([[], []]);
    const view = await app.withAgency(other, (tx) => weekView(tx, today, { week: later }));
    expect(view.shifts).toEqual([]);
  });
});
