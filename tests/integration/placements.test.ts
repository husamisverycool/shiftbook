/**
 * Slice (b): importing placements from a Bullhorn export (SPEC §8; docs/patterns/assignments/import.md).
 * SSN and birth-date columns never reach storage; workers are matched, never created; every row is
 * imported or skipped with a reason; running again changes nothing; re-importing skips.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { agencies, assignments, jobOrders, mappingProfiles, placementImports, rateCards } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, clientId, seedDemoAgency, workerId, worksiteId } from "../../src/server/demo/seed";
import { importView, runImport, saveDecision, startImport } from "../../src/server/placements/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-placements-")));
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);
const FILE = "bullhorn-placements-2026-10.csv";
const bytes = () => readFileSync(`demo/samples/placements/${FILE}`);
const TODAY = "2026-10-15";

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

describe("importing placements", () => {
  it("drops SSN and birth-date columns before the file is stored", async () => {
    const { id, dropped } = await inAgency((tx) => startImport(tx, actor, store, { source: "bullhorn", filename: FILE, bytes: bytes() }));
    expect(dropped).toBe(2);
    const [record] = await inAgency((tx) => tx.select().from(placementImports).where(eq(placementImports.id, id)));
    const stored = new TextDecoder().decode(await store.get(record!.storageKey));
    expect(stored).not.toMatch(/SSN|Birth|\d{3}-\d{2}-\d{4}|01\/02\/1990/);
    const view = await inAgency((tx) => importView(tx, store, id));
    expect(view!.header).not.toContain("SSN");
    expect(view!.mapping).toMatchObject({ externalId: "ID", workerFirstName: "Candidate First Name", client: "Company", position: "Job Title", shift: "Shift", startDate: "Start Date" });
  });

  it("imports what it can, says why for the rest, and runs only once", async () => {
    const { id } = await inAgency((tx) => startImport(tx, actor, store, { source: "bullhorn", filename: FILE, bytes: bytes() }));
    const results = await inAgency((tx) => runImport(tx, actor, store, id, TODAY));
    expect(results.map((r) => [r.row, r.outcome, r.reason?.code ?? null])).toEqual([
      [1, "imported", null],
      [2, "imported", null],
      [3, "skipped", "new_job_order_needs_worksite"],
      [4, "skipped", "not_on_roster"],
      [5, "skipped", "cancelled_in_source"],
      [6, "imported", null],
    ]);
    const imported = await inAgency((tx) => tx.select().from(assignments).where(isNotNull(assignments.externalId)));
    expect(imported.map((a) => a.externalId).sort()).toEqual(["70001", "70002", "70006"]);
    // Only Marcus's rates differ from the job order's: he gets his own rate version from his start.
    const own = await inAgency((tx) => tx.select().from(rateCards).where(isNotNull(rateCards.assignmentId)));
    expect(own.map((v) => [v.assignmentId === imported.find((a) => a.externalId === "70002")!.id, v.effectiveFrom, v.payRateCents, v.billRateCents])).toEqual([[true, "2026-10-19", 1800, 2625]]);
    expect(imported.find((a) => a.externalId === "70002")!.endDate).toBe("2026-12-18");

    expect(await inAgency((tx) => runImport(tx, actor, store, id, TODAY))).toEqual(results);
    expect(await inAgency((tx) => tx.select().from(assignments).where(isNotNull(assignments.externalId)))).toHaveLength(3);

    // The same file again: those placements are skipped as already imported; the mapping is remembered.
    const again = await inAgency((tx) => startImport(tx, actor, store, { source: "bullhorn", filename: FILE, bytes: bytes() }));
    const second = await inAgency((tx) => runImport(tx, actor, store, again.id, TODAY));
    expect(second.filter((r) => r.reason?.code === "already_imported").map((r) => r.row)).toEqual([1, 2, 6]);
    const [profile] = await inAgency((tx) => tx.select().from(mappingProfiles).where(eq(mappingProfiles.source, "placements:bullhorn")));
    expect((profile!.definition as { mapping: Record<string, string> }).mapping.client).toBe("Company");
  });

  it("follows the review step: a new job order at a chosen worksite, and a name matched by hand", async () => {
    const { id } = await inAgency((tx) => startImport(tx, actor, store, { source: "bullhorn", filename: FILE, bytes: bytes() }));
    const view = await inAgency((tx) => importView(tx, store, id));
    const forklift = view!.values!.jobOrder.find((v) => v.label === "Forklift Operator · Night")!;
    expect(forklift.match).toBeNull();
    await inAgency((tx) => saveDecision(tx, actor, id, "jobOrder", forklift.raw, `new:${worksiteId("il")}`));
    await inAgency((tx) => saveDecision(tx, actor, id, "worker", "Maria Gomez", workerId("katarzyna-nowak")));
    const results = await inAgency((tx) => runImport(tx, actor, store, id, TODAY));
    expect(results.filter((r) => r.outcome === "imported").map((r) => r.row)).toEqual([1, 2, 3, 4, 6]);
    const [created] = await inAgency((tx) => tx.select().from(jobOrders).where(and(eq(jobOrders.clientId, clientId("il")), eq(jobOrders.position, "Forklift Operator"))));
    expect(created!.worksiteId).toBe(worksiteId("il"));
    await expect(inAgency((tx) => saveDecision(tx, actor, id, "worker", "Maria Gomez", "leave_out"))).rejects.toThrow(); // done imports do not change
  });
});
