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
import { agencies, agencySettings, assignments, auditEvents, jobOrders, mappingProfiles, placementImports, rateCards } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, clientId, seedDemoAgency, workerId, worksiteId } from "../../src/server/demo/seed";
import ExcelJS from "exceljs";
import { ImportFileError, importView, MAX_IMPORT_ROWS, runImport, saveDateOrder, saveDecision, startImport } from "../../src/server/placements/service";
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
    const { id, removed } = await inAgency((tx) => startImport(tx, actor, store, { source: "bullhorn", filename: FILE, bytes: bytes() }, TODAY));
    expect(removed).toEqual([
      { column: "D", heading: "SSN", reason: "heading" },
      { column: "E", heading: "Date of Birth", reason: "heading" },
    ]);
    const [record] = await inAgency((tx) => tx.select().from(placementImports).where(eq(placementImports.id, id)));
    const stored = new TextDecoder().decode(await store.get(record!.storageKey));
    expect(stored).not.toMatch(/SSN|Birth|\d{3}-\d{2}-\d{4}|01\/02\/1990/);
    const view = await inAgency((tx) => importView(tx, store, id));
    expect(view!.header).not.toContain("SSN");
    expect(view!.mapping).toMatchObject({ externalId: "ID", workerFirstName: "Candidate First Name", client: "Company", position: "Job Title", shift: "Shift", startDate: "Start Date" });
  });

  it("imports what it can, says why for the rest, and runs only once", async () => {
    const { id } = await inAgency((tx) => startImport(tx, actor, store, { source: "bullhorn", filename: FILE, bytes: bytes() }, TODAY));
    const results = await inAgency((tx) => runImport(tx, actor, store, id, TODAY));
    // Row numbers are the spreadsheet's own (the header is row 1).
    expect(results.map((r) => [r.row, r.outcome, r.reason?.code ?? null])).toEqual([
      [2, "imported", null],
      [3, "imported", null],
      [4, "skipped", "new_job_order_needs_worksite"],
      [5, "skipped", "not_on_roster"],
      [6, "skipped", "cancelled_in_source"],
      [7, "imported", null],
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
    const again = await inAgency((tx) => startImport(tx, actor, store, { source: "bullhorn", filename: FILE, bytes: bytes() }, TODAY));
    const second = await inAgency((tx) => runImport(tx, actor, store, again.id, TODAY));
    expect(second.filter((r) => r.reason?.code === "already_imported").map((r) => r.row)).toEqual([2, 3, 7]);
    const [profile] = await inAgency((tx) => tx.select().from(mappingProfiles).where(eq(mappingProfiles.source, "placements:bullhorn")));
    expect((profile!.definition as { mapping: Record<string, string> }).mapping.client).toBe("Company");
  });

  it("follows the review step: a new job order at a chosen worksite, and a name matched by hand", async () => {
    const { id } = await inAgency((tx) => startImport(tx, actor, store, { source: "bullhorn", filename: FILE, bytes: bytes() }, TODAY));
    const view = await inAgency((tx) => importView(tx, store, id));
    const forklift = view!.values!.jobOrder.find((v) => v.label === "Forklift Operator · Night")!;
    expect(forklift.match).toBeNull();
    await inAgency((tx) => saveDecision(tx, actor, id, "jobOrder", forklift.raw, `new:${worksiteId("il")}`));
    await inAgency((tx) => saveDecision(tx, actor, id, "worker", "Maria Gomez", workerId("katarzyna-nowak")));
    const results = await inAgency((tx) => runImport(tx, actor, store, id, TODAY));
    expect(results.filter((r) => r.outcome === "imported").map((r) => r.row)).toEqual([2, 3, 4, 5, 7]);
    const [created] = await inAgency((tx) => tx.select().from(jobOrders).where(and(eq(jobOrders.clientId, clientId("il")), eq(jobOrders.position, "Forklift Operator"))));
    expect(created!.worksiteId).toBe(worksiteId("il"));
    await expect(inAgency((tx) => saveDecision(tx, actor, id, "worker", "Maria Gomez", "leave_out"))).rejects.toThrow(); // done imports do not change
  });

  it("a row refused after making a new job order does not leave the next rows pointing at it", async () => {
    // No default multipliers: a new job order's first rates cannot be set, so that row is refused.
    await inAgency((tx) => tx.delete(agencySettings).where(eq(agencySettings.key, "rate_card.default_bill_multipliers")));
    const csv = [
      "ID,Candidate,Company,Job Title,Shift,Start Date,Pay Rate,Bill Rate",
      "81001,Jerome Washington,Prairie Line Manufacturing (demo),Forklift Operator,Night,10/26/2026,19.25,28.00",
      "81002,Marcus Bell,Prairie Line Manufacturing (demo),Forklift Operator,Night,10/26/2026,,",
    ].join("\n");
    const { id } = await inAgency((tx) => startImport(tx, actor, store, { source: "other", filename: "two.csv", bytes: new TextEncoder().encode(csv) }, TODAY));
    const view = await inAgency((tx) => importView(tx, store, id));
    await inAgency((tx) => saveDecision(tx, actor, id, "jobOrder", view!.values!.jobOrder[0]!.raw, `new:${worksiteId("il")}`));
    const results = await inAgency((tx) => runImport(tx, actor, store, id, TODAY));
    expect(results.map((r) => [r.row, r.outcome, r.reason?.code ?? null])).toEqual([
      [2, "skipped", "rates_refused"],
      [3, "imported", null],
    ]);
    expect(await inAgency((tx) => tx.select().from(jobOrders).where(eq(jobOrders.position, "Forklift Operator")))).toHaveLength(1);
  });

  it("refuses a damaged Excel file, a file over the row limit, and hides an SSN-shaped part of a filename", async () => {
    await expect(inAgency((tx) => startImport(tx, actor, store, { source: "spott", filename: "broken.xlsx", bytes: new TextEncoder().encode("not a workbook") }, TODAY))).rejects.toBeInstanceOf(
      ImportFileError,
    );
    const many = ["Candidate,Company,Job Title,Start Date", ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => "Anita Patel,Prairie Line Manufacturing (demo),Assembler,10/19/2026")].join("\n");
    await expect(inAgency((tx) => startImport(tx, actor, store, { source: "other", filename: "many.csv", bytes: new TextEncoder().encode(many) }, TODAY))).rejects.toMatchObject({ reason: "too_many_rows" });
    const { id } = await inAgency((tx) => startImport(tx, actor, store, { source: "bullhorn", filename: "placements 900-12-3461.csv", bytes: bytes() }, TODAY));
    const [record] = await inAgency((tx) => tx.select().from(placementImports).where(eq(placementImports.id, id)));
    expect(record!.filename).toBe("placements •••.csv");
  });

  it("gives repeated column names a number so each can be matched", async () => {
    const csv = ["Name,Company,Job Title,Start Date,Name", "Anita Patel,Prairie Line Manufacturing (demo),Assembler,10/19/2026,AP"].join("\n");
    const { id } = await inAgency((tx) => startImport(tx, actor, store, { source: "other", filename: "dupes.csv", bytes: new TextEncoder().encode(csv) }, TODAY));
    expect((await inAgency((tx) => importView(tx, store, id)))!.header).toEqual(["Name", "Company", "Job Title", "Start Date", "Name (2)"]);
  });
});

describe("third review: headerless files, removed columns, dates and row numbers", () => {
  const start = (filename: string, data: Uint8Array | string, source: "bullhorn" | "other" = "other") =>
    inAgency((tx) => startImport(tx, actor, store, { source, filename, bytes: typeof data === "string" ? new TextEncoder().encode(data) : data }, TODAY));
  const ssnShaped = /\d{3}[\s.\-]?\d{2}[\s.\-]?\d{4}/;

  it("refuses a file without a header row before anything is kept, so no record reaches the log", async () => {
    const headerless = readFileSync(`demo/samples/placements/${FILE}`, "utf8").split("\n").slice(1).join("\n");
    const auditBefore = await inAgency((tx) => tx.select().from(auditEvents));
    await expect(start("no-header.csv", headerless, "bullhorn")).rejects.toMatchObject({ reason: "no_header" });
    const auditAfter = await inAgency((tx) => tx.select().from(auditEvents));
    expect(auditAfter).toHaveLength(auditBefore.length);
    expect(await inAgency((tx) => tx.select().from(placementImports))).toHaveLength(0);
  });

  it("keeps which columns were removed, by position and without their values, for the screens and the log", async () => {
    const csv = ["Candidate,Company,Job Title,Start Date,Employee Ref,When", "Anita Patel,Prairie Line Manufacturing (demo),Assembler,10/19/2026,900123461,01/02/1990"].join("\n");
    const { id } = await start("refs.csv", csv);
    const view = await inAgency((tx) => importView(tx, store, id));
    expect(view!.removed).toEqual([
      { column: "E", heading: "Employee Ref", reason: "ssn_values" },
      { column: "F", heading: "When", reason: "birth_dates" },
    ]);
    const logged = await inAgency((tx) => tx.select({ after: auditEvents.after }).from(auditEvents).where(eq(auditEvents.entityId, id)));
    expect(JSON.stringify(logged)).not.toMatch(ssnShaped);
    expect(JSON.stringify(logged)).not.toContain("1990");
  });

  it("keeps a start date column that holds an old placement, so the import can still run", async () => {
    const csv = ["Candidate,Company,Job Title,Start Date,End Date", "Anita Patel,Prairie Line Manufacturing (demo),Assembler,03/05/2012,06/30/2012", "Marcus Bell,Prairie Line Manufacturing (demo),Assembler,10/19/2026,"].join("\n");
    const { id, removed } = await start("history.csv", csv);
    expect(removed).toEqual([]);
    const view = await inAgency((tx) => importView(tx, store, id));
    expect(view!.missing).toEqual([]);
  });

  it("drops an Excel column of SSNs stored as numbers with the SSN format (leading zero hidden by Excel)", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Placements");
    ws.addRow(["Candidate", "Company", "Job Title", "Start Date", "Employee Ref"]);
    ws.addRow(["Anita Patel", "Prairie Line Manufacturing (demo)", "Assembler", new Date(Date.UTC(2026, 9, 19)), 9_000_001]);
    ws.getCell("E2").numFmt = ["000", "00", "0000"].join("-");
    const { removed } = await start("refs.xlsx", new Uint8Array(await wb.xlsx.writeBuffer()));
    expect(removed).toEqual([{ column: "E", heading: "Employee Ref", reason: "ssn_values" }]);
  });

  it("reads Excel date cells as the dates they are, whatever a typed date elsewhere looks like", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Placements");
    ws.addRow(["Candidate", "Company", "Job Title", "Shift", "Start Date", "End Date"]);
    ws.addRow(["Anita Patel", "Prairie Line Manufacturing (demo)", "Assembler", "Day", new Date(Date.UTC(2026, 9, 5)), "25/12/2026"]);
    ws.addRow(["Marcus Bell", "Prairie Line Manufacturing (demo)", "Assembler", "Second", new Date(Date.UTC(2026, 10, 2)), "26/12/2026"]);
    const { id } = await start("dates.xlsx", new Uint8Array(await wb.xlsx.writeBuffer()));
    const view = await inAgency((tx) => importView(tx, store, id));
    expect(view!.dates.order).toBe("day_first");
    expect(view!.plan.map((p) => (p.outcome === "create" ? [p.startDate, p.endDate] : p.reason.code))).toEqual([
      ["2026-10-05", "2026-12-25"],
      ["2026-11-02", "2026-12-26"],
    ]);
  });

  it("lets the person choose the date order, shows each date as read, and runs with that order", async () => {
    const csv = ["Candidate,Company,Job Title,Shift,Start Date", "Anita Patel,Prairie Line Manufacturing (demo),Assembler,Day,05/11/2026", "Marcus Bell,Prairie Line Manufacturing (demo),Assembler,Second,13/11/2026"].join("\n");
    const { id } = await start("uk.csv", csv);
    let view = await inAgency((tx) => importView(tx, store, id));
    expect(view!.dates).toMatchObject({ order: "month_first", chosen: null });
    expect(view!.dates.values).toEqual([
      { raw: "13/11/2026", count: 1, date: null },
      { raw: "05/11/2026", count: 1, date: "2026-05-11" },
    ]);
    await inAgency((tx) => saveDateOrder(tx, actor, id, "day_first"));
    view = await inAgency((tx) => importView(tx, store, id));
    expect(view!.dates).toMatchObject({ order: "day_first", chosen: "day_first" });
    // The preview lists each assignment it will create with its dates.
    expect(view!.preview.rows.map((r) => [r.row, r.workerName, r.startDate, r.endDate])).toEqual([
      [2, "Anita Patel", "2026-11-05", null],
      [3, "Marcus Bell", "2026-11-13", null],
    ]);
    await inAgency((tx) => runImport(tx, actor, store, id, TODAY));
    const made = await inAgency((tx) => tx.select().from(assignments).where(eq(assignments.startDate, "2026-11-13")));
    expect(made).toHaveLength(1);
  });

  it("numbers rows as the file does when it has blank lines", async () => {
    const csv = ["Candidate,Company,Job Title,Start Date", "", "Anita Patel,Prairie Line Manufacturing (demo),Assembler,10/19/2026", "", "", "Nobody Known,Prairie Line Manufacturing (demo),Assembler,10/19/2026"].join("\n");
    const { id } = await start("gaps.csv", csv);
    const view = await inAgency((tx) => importView(tx, store, id));
    expect(view!.plan.map((p) => [p.row, p.outcome])).toEqual([
      [3, "skip"],
      [6, "skip"],
    ]);
  });
});

describe("fourth review: time-of-day dates, empty Excel headings, birth dates in filenames", () => {
  const start = (filename: string, data: Uint8Array | string) =>
    inAgency((tx) => startImport(tx, actor, store, { source: "other", filename, bytes: typeof data === "string" ? new TextEncoder().encode(data) : data }, TODAY));

  it("refuses a headerless file whose dates carry a time of day, keeping nothing", async () => {
    const csv = ["70001,Anita Patel,Prairie Line Manufacturing (demo),Assembler,10/19/2026 12:00:00 AM,1/2/1990 12:00:00 AM", "70002,Marcus Bell,Prairie Line Manufacturing (demo),Assembler,10/19/2026 12:00:00 AM,3/4/1985 12:00:00 AM"].join("\n");
    await expect(start("export.csv", csv)).rejects.toMatchObject({ reason: "no_header" });
    expect(await inAgency((tx) => tx.select().from(placementImports))).toHaveLength(0);
  });

  it("reads start dates that carry a time of day", async () => {
    const csv = ["Candidate,Company,Job Title,Shift,Start Date", "Anita Patel,Prairie Line Manufacturing (demo),Assembler,Day,10/19/2026 12:00:00 AM"].join("\n");
    const { id } = await start("with-times.csv", csv);
    const view = await inAgency((tx) => importView(tx, store, id));
    expect(view!.plan[0]).toMatchObject({ outcome: "create", startDate: "2026-10-19" });
  });

  it("takes an Excel file with an empty heading cell (it becomes \"Column\")", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Placements");
    ws.getCell("A1").value = "Candidate";
    ws.getCell("C1").value = "Company";
    ws.getCell("D1").value = "Job Title";
    ws.getCell("E1").value = "Start Date";
    ws.addRow(["Anita Patel", "x", "Prairie Line Manufacturing (demo)", "Assembler", new Date(Date.UTC(2026, 9, 19))]);
    const { id } = await start("gap.xlsx", new Uint8Array(await wb.xlsx.writeBuffer()));
    expect((await inAgency((tx) => importView(tx, store, id)))!.header).toEqual(["Candidate", "Column", "Company", "Job Title", "Start Date"]);
  });

  it("hides a birth date in the filename everywhere it is kept", async () => {
    const csv = ["Candidate,Company,Job Title,Start Date", "Anita Patel,Prairie Line Manufacturing (demo),Assembler,10/19/2026"].join("\n");
    const { id } = await start("Anita Patel DOB 01-02-1990.csv", csv);
    const [record] = await inAgency((tx) => tx.select().from(placementImports).where(eq(placementImports.id, id)));
    expect(record!.filename).toBe("Anita Patel DOB •••.csv");
    const logged = await inAgency((tx) => tx.select({ after: auditEvents.after }).from(auditEvents).where(eq(auditEvents.entityId, id)));
    expect(JSON.stringify(logged)).not.toContain("1990");
  });
});


describe("sixth review: id columns are not birth dates", () => {
  it("keeps a Bullhorn file's placement ids and employee numbers when some look like old dates", async () => {
    const csv = [
      "Placement ID,Employee Number,Candidate First Name,Candidate Last Name,Company,Job Title,Shift,Start Date",
      "10011999,10011990,Anita,Patel,Prairie Line Manufacturing (demo),Assembler,Day,10/19/2026",
      "45000123,10011991,Marcus,Bell,Prairie Line Manufacturing (demo),Assembler,Second,10/19/2026",
      "45000124,10011992,Robert,Jones,Prairie Line Manufacturing (demo),Assembler,Second,10/19/2026",
    ].join("\n");
    const { id, removed } = await inAgency((tx) => startImport(tx, actor, store, { source: "bullhorn", filename: "ids.csv", bytes: new TextEncoder().encode(csv) }, TODAY));
    expect(removed).toEqual([]);
    const view = await inAgency((tx) => importView(tx, store, id));
    expect(view!.header).toEqual(["Placement ID", "Employee Number", "Candidate First Name", "Candidate Last Name", "Company", "Job Title", "Shift", "Start Date"]);
    expect(view!.mapping.externalId).toBe("Placement ID");
  });
});
