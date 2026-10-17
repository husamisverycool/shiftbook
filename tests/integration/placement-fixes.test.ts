/**
 * Slice s (decision 0040): an Avionté placement report imported with Avionté's own bulk-import step —
 * only the rows with errors are listed; a wrong value is fixed in place (the stored file never
 * changes), a row is left out, and the run imports exactly what the preview showed.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { agencies, assignments, placementImports } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, seedDemoAgency } from "../../src/server/demo/seed";
import { ImportFileError, importView, runImport, saveRowFix, setRowRemoved, startImport } from "../../src/server/placements/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-fixes-")));
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);
const TODAY = "2026-10-15";
const csv = [
  "Placement ID,Talent First Name,Talent Last Name,Company Name,Job Title,Shift,Start Date,End Date,Reg Pay Rate,Reg Bill Rate",
  "A-1,Anita,Patel,Prairie Line Manufacturing (demo),Assembler,Day,10/19/2026,,17.50,25.75",
  "A-2,Marcus,Bell,Prairie Line Manufacturing (demo),Assembler,Second,,,18.00,26.25",
  "A-3,Marcus,Bell,Prairie Line Manufacturing (demo),Assembler,Day,10/26/2026,,abc,26.25",
].join("\n");

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

describe("fixing only the rows with errors", () => {
  it("lists the rows with errors, fixes one in place, leaves one out, and imports what the preview showed", async () => {
    const { id } = await inAgency((tx) => startImport(tx, actor, store, { source: "avionte", filename: "avionte-placements.csv", bytes: new TextEncoder().encode(csv) }, TODAY));
    let view = (await inAgency((tx) => importView(tx, store, id)))!;
    expect(view.missing).toEqual([]);
    expect(view.problems.map((p) => [p.row, p.reason.code, p.fix?.column ?? null])).toEqual([
      [3, "missing_value", "Start Date"],
      [4, "invalid_rate", "Reg Pay Rate"],
    ]);

    await inAgency((tx) => saveRowFix(tx, actor, store, id, 3, "Start Date", "10/20/2026"));
    await inAgency((tx) => setRowRemoved(tx, actor, store, id, 4, true));
    view = (await inAgency((tx) => importView(tx, store, id)))!;
    expect(view.problems.map((p) => [p.row, p.reason.code, p.removed])).toEqual([[4, "removed_by_person", true]]);
    expect(view.preview.create).toBe(2);

    // The stored copy never changes; the fix lives on the import.
    const [record] = await inAgency((tx) => tx.select().from(placementImports).where(eq(placementImports.id, id)));
    expect(new TextDecoder().decode(await store.get(record!.storageKey))).toContain("A-2,Marcus,Bell,Prairie Line Manufacturing (demo),Assembler,Second,,,18.00,26.25");
    expect(record!.rowEdits).toEqual({ "3": { "Start Date": "10/20/2026" } });

    const results = await inAgency((tx) => runImport(tx, actor, store, id, TODAY));
    expect(results.map((r) => [r.row, r.outcome, r.reason?.code ?? null])).toEqual([
      [2, "imported", null],
      [3, "imported", null],
      [4, "skipped", "removed_by_person"],
    ]);
    const made = await inAgency((tx) => tx.select().from(assignments).where(isNotNull(assignments.externalId)));
    expect(made.find((a) => a.externalId === "A-2")?.startDate).toBe("2026-10-20");
  });

  it("refuses a fix holding an SSN, a column that is not mapped, and a row that is not in the file", async () => {
    const { id } = await inAgency((tx) => startImport(tx, actor, store, { source: "avionte", filename: "avionte-placements.csv", bytes: new TextEncoder().encode(csv) }, TODAY));
    await expect(inAgency((tx) => saveRowFix(tx, actor, store, id, 3, "Start Date", "912-34-5678"))).rejects.toBeInstanceOf(ImportFileError);
    await expect(inAgency((tx) => saveRowFix(tx, actor, store, id, 3, "Nope", "x"))).rejects.toThrow();
    await expect(inAgency((tx) => setRowRemoved(tx, actor, store, id, 99, true))).rejects.toThrow();
  });
});
