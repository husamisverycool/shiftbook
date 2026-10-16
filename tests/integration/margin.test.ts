/**
 * Margin analytics (slice i; plan `.claude/plans/slice-i-margin.md`, decisions I1–I13).
 *
 * The week: Prairie Line (PLM, Illinois) — Marcus Bell 30 h and Anita Patel 16 h as machine
 * operators ($18.25 pay, $26.50 bill, class 3632), Trevor Lindqvist 8 h as an assembler ($17.50 pay,
 * $25.75 bill, class 3632). Demo rates: Illinois employer taxes 11.70%, workers' comp 3632 $3.00 per
 * $100 (an example), pay day 5 days after the period ends.
 *   Marcus: pay $547.50, bill $795.00, burden 547.50 × 14.70% = $80.4825 → $80.48
 *   Anita:  pay $292.00, bill $424.00, burden 292.00 × 14.70% = $42.924  → $42.92
 *   Trevor: pay $140.00, bill $206.00, burden 140.00 × 14.70% = $20.58
 *   Total: billed $1,425.00 − pay $979.50 − burden $143.98 = margin $301.52; 21.159…% → 21.2%.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, clientId, jobOrderId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { createRunFiles } from "../../src/server/files/service";
import { cashView, marginSettings, marginView, overtimeView } from "../../src/server/margin/queries";
import { addTaxRate, addWcRate, setBranch, setOtPremium, setPayDay, setRecruiter } from "../../src/server/margin/service";
import { recordPayment } from "../../src/server/receivables/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { approveAsOwner, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-margin-")));
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test owner", role: "owner" };
const accountant: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000005", label: "Test accountant", role: "accountant" };
const coordinator: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000003", label: "Test coordinator", role: "coordinator" };
const w2 = periodId("w2");
const PLM = clientId("il");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);
const PERIOD = { from: "2026-09-28", to: "2026-10-12" };

async function addShift(worker: string, date: string, inMinute: number, outMinute: number) {
  await owner.db.insert(s.timeEntries).values({ agencyId: theOwner.agencyId, payPeriodId: w2, workerNameRaw: worker, workerId: workerId(worker), assignmentId: assignmentId(worker), workDate: date, inMinute, outMinute, breakMinutes: 0, minutes: outMinute - inMinute, confidence: "high", status: "reviewed" });
}

async function freshAgency() {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  await owner.db.update(s.clientBillingProfiles).set({ backupDetail: false, backupImages: false }).where(eq(s.clientBillingProfiles.clientId, PLM));
}

async function runWeek(marcusDays = 3, marcusOut = 1020) {
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].slice(0, marcusDays)) await addShift("marcus-bell", d, 420, marcusOut);
  for (const d of ["2026-10-05", "2026-10-06"]) await addShift("anita-patel", d, 420, 900);
  await addShift("trevor-lindqvist", "2026-10-05", 420, 900);
  await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
  await inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: "2026-10-13" }));
}

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("margin by client, worker, recruiter, branch and week (I1–I6)", () => {
  beforeEach(freshAgency);

  it("billed − pay − estimated burden, every pay line's burden explained", async () => {
    await runWeek();
    const v = await inAgency((tx) => marginView(tx, { ...PERIOD, groupBy: "client", sort: "margin" }));
    expect(v.totals).toEqual({ minutesPaid: 3240, billedCents: 142_500, payCents: 97_950, burdenCents: 14_398, marginCents: 30_152, marginPermille: 212, incomplete: 0 });
    expect(v.groups.map((g) => [g.name, g.totals.marginCents])).toEqual([["Prairie Line Manufacturing (demo)", 30_152]]);
    const marcus = v.groups[0]!.lines.find((l) => l.workerName === "Marcus Bell")!;
    expect(marcus).toMatchObject({ week: "2026-10-05", minutesPaid: 1800, billedCents: 79_500, payCents: 54_750, burdenCents: 8048, branchName: "Main office", recruiterName: "Lena Ortiz (demo)" });
    expect(marcus.details.find((d) => d.kind === "pay")!.burdenExplain).toBe(
      "Employer taxes (IL) 11.70% of $547.50 = $64.0575; workers' comp (IL 3632) $3.00 per $100 of $547.50 = $16.425; burden $80.4825 → $80.48, rounded half up once.",
    );
    // The weeks of the period, oldest first, the empty ones at zero.
    expect(v.weeks.map((w) => [w.week, w.totals.marginCents])).toEqual([
      ["2026-09-28", 0],
      ["2026-10-05", 30_152],
      ["2026-10-12", 0],
    ]);
    expect((await inAgency((tx) => marginView(tx, { ...PERIOD, groupBy: "recruiter", sort: "margin" }))).groups.map((g) => g.name)).toEqual(["Lena Ortiz (demo)", "Sam Whitfield (demo)"]);
    expect((await inAgency((tx) => marginView(tx, { ...PERIOD, groupBy: "week", sort: "margin" }))).groups.map((g) => g.key)).toEqual(["2026-10-05"]);
    // Nothing outside the period.
    expect((await inAgency((tx) => marginView(tx, { from: "2026-10-12", to: "2026-10-12", groupBy: "client", sort: "margin" }))).groups).toEqual([]);
  });

  it("a rate added from a date changes the weeks from then on; a missing rate is counted as zero and flagged", async () => {
    await runWeek();
    expect(await inAgency((tx) => addWcRate(tx, theOwner, { state: "IL", classCode: "3632", description: "Machine shop", ratePpm: 50_000, effectiveFrom: "2026-10-05" }))).toEqual({ ok: true });
    // Marcus: 547.50 × (11.70% + 5.00%) = 91.4325 → 91.43.
    const v = await inAgency((tx) => marginView(tx, { ...PERIOD, groupBy: "worker", sort: "margin" }));
    expect(v.groups.find((g) => g.name === "Marcus Bell")!.totals.burdenCents).toBe(9143);
    const settings = await inAgency((tx) => marginSettings(tx, "2026-10-16"));
    expect(settings.wcRates.filter((r) => r.classCode === "3632").map((r) => [r.effectiveFrom, r.effectiveTo, r.ratePpm])).toEqual([
      ["2026-10-05", null, 50_000],
      ["2026-01-01", "2026-10-04", 30_000],
    ]);
    // No employer tax rate at all: counted as zero, and every row says so. Workers' comp alone:
    // 547.50 × 5% = 27.375 → 27.38; 292.00 → 14.60; 140.00 → 7.00.
    await owner.db.delete(s.burdenTaxRates).where(eq(s.burdenTaxRates.agencyId, theOwner.agencyId));
    const bare = await inAgency((tx) => marginView(tx, { ...PERIOD, groupBy: "client", sort: "margin" }));
    expect(bare.totals.incomplete).toBe(3);
    expect(bare.totals.burdenCents).toBe(2738 + 1460 + 700);
  });

  it("only the Owner changes rates; refused values say why; the same start day replaces", async () => {
    expect(await inAgency((tx) => addTaxRate(tx, accountant, { state: "IL", ratePpm: 1, includes: null, effectiveFrom: "2026-11-01" }))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => addTaxRate(tx, theOwner, { state: "Illinois", ratePpm: 2_000_000, includes: null, effectiveFrom: "nope" }))).toMatchObject({ ok: false, error: "invalid", problems: [{ field: "state" }, { field: "ratePpm" }, { field: "effectiveFrom" }] });
    expect(await inAgency((tx) => addTaxRate(tx, theOwner, { state: "IL", ratePpm: 120_000, includes: "FICA + FUTA + SUTA", effectiveFrom: "2026-11-01" }))).toEqual({ ok: true });
    expect(await inAgency((tx) => addTaxRate(tx, theOwner, { state: "IL", ratePpm: 121_000, includes: "FICA + FUTA + SUTA", effectiveFrom: "2026-11-01" }))).toEqual({ ok: true });
    const il = (await inAgency((tx) => marginSettings(tx, "2026-10-16"))).taxRates.filter((r) => r.state === "IL");
    expect(il.map((r) => [r.effectiveFrom, r.effectiveTo, r.ratePpm])).toEqual([
      ["2026-11-01", null, 121_000],
      ["2026-01-01", "2026-10-31", 117_000],
    ]);
    expect(await inAgency((tx) => setPayDay(tx, coordinator, 4, "2026-11-01"))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => setPayDay(tx, theOwner, 4, "2026-11-01"))).toEqual({ ok: true });
    expect(await inAgency((tx) => setOtPremium(tx, theOwner, false, "2026-11-01"))).toEqual({ ok: true });
    const after = await inAgency((tx) => marginSettings(tx, "2026-10-16"));
    expect([after.payDay.days, after.otPremium.exclude]).toEqual([5, true]);
    expect(after.payDay.next).toEqual({ days: 4, from: "2026-11-01" });
    expect(after.otPremium.next).toEqual({ exclude: false, from: "2026-11-01" });
  });

  it("recruiter and branch: set by whoever manages placements, never the accountant", async () => {
    const lena = (await inAgency((tx) => tx.select().from(s.users))).find((u) => u.name === "Lena Ortiz (demo)")!;
    expect(await inAgency((tx) => setRecruiter(tx, accountant, assignmentId("anita-patel"), lena.id))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => setRecruiter(tx, coordinator, assignmentId("anita-patel"), "00000000-0000-4000-a000-00000000dead"))).toEqual({ ok: false, error: "not_found" });
    expect(await inAgency((tx) => setRecruiter(tx, coordinator, assignmentId("anita-patel"), null))).toEqual({ ok: true });
    const [branch] = await inAgency((tx) => tx.select().from(s.branches).where(eq(s.branches.name, "Ontario office")));
    expect(await inAgency((tx) => setBranch(tx, theOwner, jobOrderId("il-operator"), branch!.id))).toEqual({ ok: true });
    await runWeek();
    const byBranch = await inAgency((tx) => marginView(tx, { ...PERIOD, groupBy: "branch", sort: "margin" }));
    expect(byBranch.groups.map((g) => [g.name, g.lines.length])).toEqual([
      ["Ontario office", 2],
      ["Main office", 1],
    ]);
    const byRecruiter = await inAgency((tx) => marginView(tx, { ...PERIOD, groupBy: "recruiter", sort: "margin" }));
    expect(byRecruiter.groups.find((g) => g.key === "none")!.lines.map((l) => l.workerName)).toEqual(["Anita Patel"]);
  });
});

describe("overtime not billed (I7)", () => {
  beforeEach(freshAgency);

  it("a client that bills overtime at straight time: the premium paid on those hours", async () => {
    await owner.db.update(s.clientBillingProfiles).set({ overtimeBillingRule: "straight_time" }).where(eq(s.clientBillingProfiles.clientId, PLM));
    // Marcus 5 × 9 h = 45 h: 5 h overtime at $27.375 = $136.88; premium one third = $45.6266… → $45.63.
    await runWeek(5, 960);
    const v = await inAgency((tx) => overtimeView(tx, PERIOD));
    expect(v.rows.map((r) => [r.clientName, r.workerName, r.paidMinutes, r.multiplierMinutes, r.straightMinutes, r.premiumNotBilledCents, r.reasons])).toEqual([
      ["Prairie Line Manufacturing (demo)", "Marcus Bell", 300, 0, 300, 4563, ["bill_overtime_straight"]],
    ]);
    expect(v.totals).toEqual({ paidMinutes: 300, leakedMinutes: 300, premiumNotBilledCents: 4563 });
    expect((await inAgency((tx) => marginView(tx, { ...PERIOD, groupBy: "client", sort: "margin" }))).overtimePremiumNotBilledCents).toBe(4563);
  });
});

describe("cash floating and the next payroll (I8, I9)", () => {
  beforeEach(freshAgency);

  it("payroll paid on its pay date less what the client paid for that work; the next payroll estimated", async () => {
    await runWeek();
    // The week ended 2026-10-11 and is paid 2026-10-16.
    expect((await inAgency((tx) => cashView(tx, "2026-10-15"))).floatingCents).toBe(0);
    const v = await inAgency((tx) => cashView(tx, "2026-10-16"));
    expect(v.floatingCents).toBe(97_950);
    expect(v.clients.map((c) => [c.clientName, c.paidCents, c.collectedCents, c.floatingCents])).toEqual([["Prairie Line Manufacturing (demo)", 97_950, 0, 97_950]]);
    // Next: the week ending 2026-10-18, paid 2026-10-23, not run yet: the average of the paid weeks.
    expect(v.next).toMatchObject({ payDate: "2026-10-23", payroll: { cents: 97_950, estimate: true }, expectedCents: 0, afterCents: 195_900 });
    const [invoice] = await inAgency((tx) => tx.select().from(s.invoices).where(eq(s.invoices.clientId, PLM)));
    await inAgency((tx) => recordPayment(tx, theOwner, { clientId: PLM, receivedOn: "2026-10-16", amountCents: 100_000, method: "ach", reference: null, memo: null, applications: [{ invoiceId: invoice!.id, amountCents: 100_000 }] }));
    // Collected $1,000.00 for $979.50 paid: nothing floating (never below zero).
    expect((await inAgency((tx) => cashView(tx, "2026-10-16"))).clients[0]).toMatchObject({ collectedCents: 100_000, floatingCents: 0 });
  });
});
