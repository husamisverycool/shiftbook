/**
 * Home (docs/patterns/home.md; decision 0029): Stripe Home's "Today" compares the figure with the
 * period before it ("Yesterday"), and "Your overview" shows the weeks chosen in its date range
 * (Last 4, 13 or 52 weeks, Margin's presets) with the same number of weeks before them to compare.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, ne, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { createRunFiles } from "../../src/server/files/service";
import { homeView } from "../../src/server/home/queries";
import { marginPeriod, marginView } from "../../src/server/margin/queries";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { approveAsOwner, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-home-")));
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test owner", role: "owner" };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);
const w2 = periodId("w2");
const TODAY = "2026-10-13";

async function freshAgency() {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
}

async function addShift(worker: string, date: string, inMinute: number, outMinute: number) {
  await owner.db.insert(s.timeEntries).values({ agencyId: theOwner.agencyId, payPeriodId: w2, workerNameRaw: worker, workerId: workerId(worker), assignmentId: assignmentId(worker), workDate: date, inMinute, outMinute, breakMinutes: 0, minutes: outMinute - inMinute, confidence: "high", status: "reviewed" });
}

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("Home's Today and Your overview", () => {
  beforeEach(freshAgency);

  it("compares the pay period's hours with the period just before it, as Stripe's Today compares with yesterday", async () => {
    await addShift("marcus-bell", "2026-10-05", 420, 900);
    await addShift("marcus-bell", "2026-10-06", 420, 960);
    const view = await inAgency((tx) => homeView(tx, theOwner.agencyId, TODAY, { viewMargin: true }));
    // The week before (paid before Granite) still counts its hours: every entry not rejected.
    const [before] = await owner.db
      .select({ n: sql<number>`coalesce(sum(${s.timeEntries.minutes}), 0)::int` })
      .from(s.timeEntries)
      .where(and(eq(s.timeEntries.payPeriodId, periodId("w1")), ne(s.timeEntries.status, "rejected")));
    expect(before!.n).toBeGreaterThan(0);
    expect(view.today.minutes).toBe(480 + 540);
    expect(view.today.previous).toEqual({ startsOn: "2026-09-28", endsOn: "2026-10-04", minutes: before!.n });
  });

  it("has no comparison when there is no period before", async () => {
    await owner.db.delete(s.timeEntries).where(eq(s.timeEntries.payPeriodId, periodId("w1")));
    await owner.db.delete(s.payPeriods).where(eq(s.payPeriods.id, periodId("w1")));
    const view = await inAgency((tx) => homeView(tx, theOwner.agencyId, TODAY, { viewMargin: true }));
    expect(view.today.previous).toBeNull();
  });

  it("shows the weeks of the date range chosen, with as many weeks before them to compare", async () => {
    for (const d of ["2026-10-05", "2026-10-06"]) await addShift("marcus-bell", d, 420, 1020);
    await addShift("anita-patel", "2026-10-05", 420, 900);
    await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
    await inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: TODAY }));

    for (const [ask, weeks] of [[undefined, 13], ["4", 4], ["52", 52], ["7", 13]] as const) {
      const view = await inAgency((tx) => homeView(tx, theOwner.agencyId, TODAY, { viewMargin: true, weeks: ask }));
      const o = view.overview!;
      expect(o.preset).toBe(weeks);
      expect(o.weeks).toHaveLength(weeks);
      expect(o.previousWeeks).toHaveLength(weeks);
      // The same figures Margin shows for the same weeks.
      const range = await inAgency((tx) => marginPeriod(tx, TODAY, { weeks: String(weeks) }));
      const margin = await inAgency((tx) => marginView(tx, { from: range.from, to: range.to, groupBy: "client", sort: "margin" }));
      expect(o.weeks.reduce((n, w) => n + w.billedCents, 0)).toBe(margin.totals.billedCents);
      expect(o.weeks.reduce((n, w) => n + w.marginCents, 0)).toBe(margin.totals.marginCents);
      expect(margin.totals.billedCents).toBeGreaterThan(0);
      // The weeks before are the ones just before, week by week, and their totals are the comparison.
      expect(o.previousWeeks.at(-1)!.week < o.weeks[0]!.week).toBe(true);
      expect(o.previous.billedCents).toBe(o.previousWeeks.reduce((n, w) => n + w.billedCents, 0));
      expect(o.previous.minutesPaid).toBe(o.previousWeeks.reduce((n, w) => n + w.minutesPaid, 0));
    }
  });

  it("has no overview for a role that may not see margin", async () => {
    const view = await inAgency((tx) => homeView(tx, theOwner.agencyId, TODAY, { viewMargin: false, weeks: "4" }));
    expect(view.overview).toBeNull();
  });
});
