/**
 * An agency that signs itself up sets up its own business (completeness audit; SPEC §4): its details,
 * time zone and pay week, a branch, a client and its worksite (Census codes), a job order and a
 * placement, and its pay periods appear — end to end, as a brand-new non-demo agency, through the same
 * services the screens call.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, workweekStart } from "@shiftbook/rules";
import * as s from "../../src/server/db/schema";
import { createJobOrder } from "../../src/server/catalog/job-orders";
import { createAssignment } from "../../src/server/catalog/assignments";
import { createWorker } from "../../src/server/workers/service";
import { agencyView, createBranch, ensurePayPeriods, listBranches, renameBranch, saveAgencyDetails, setBranchArchived, setWorkweekStart, startPayPeriod } from "../../src/server/setup/agency";
import { clientProblems, createClient, createWorksite, setClientArchived, updateClient, updateWorksite, worksiteProblems } from "../../src/server/setup/clients";
import { agencyToday } from "../../src/server/settings";
import type { Actor } from "../../src/server/session";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
let actor: Actor;
let coordinator: Actor;
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);

beforeAll(async () => {
  const [agency] = await owner.db.insert(s.agencies).values({ name: "Fresh Start Staffing (test)" }).returning();
  const [person] = await owner.db.insert(s.users).values({ agencyId: agency!.id, name: "Fresh Owner", email: "owner@fresh.example.com", role: "owner" }).returning();
  actor = { agencyId: agency!.id, userId: person!.id, label: "Fresh Owner", role: "owner" };
  coordinator = { ...actor, label: "Fresh Coordinator", role: "coordinator" };
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

const site = {
  name: "Joliet Plant",
  addressLine: "75 Example Industrial Drive",
  city: "Joliet",
  state: "IL",
  postalCode: "60431",
  countyFips: "17197", // Will County (Census 2020)
  placeFips: "1738570", // Joliet city
  outsideAnyPlace: false,
};

describe("a brand-new agency sets up its business", () => {
  it("checks a client's and a worksite's details, the worksite's county and place from the Census list", () => {
    expect(clientProblems({ name: "", code: "a b", addressLines: [], billingEmail: "nope", paymentTermsDays: -1 }).map((p) => p.field)).toEqual(["name", "code", "billingEmail", "paymentTermsDays"]);
    expect(worksiteProblems(site)).toEqual([]);
    // A place outside the county chosen, a made-up county, both a place and "outside any town".
    expect(worksiteProblems({ ...site, countyFips: "17031" }).map((p) => p.field)).toEqual(["placeFips"]);
    expect(worksiteProblems({ ...site, countyFips: "17999" }).map((p) => p.field)).toEqual(["countyFips"]);
    expect(worksiteProblems({ ...site, outsideAnyPlace: true }).map((p) => p.field)).toEqual(["placeFips"]);
    expect(worksiteProblems({ ...site, placeFips: null, outsideAnyPlace: true })).toEqual([]);
  });

  it("details, time zone and pay week; a branch; a client with its worksite; a job order, a placement and its pay periods", async () => {
    // Nothing is made before the pay week's day is set.
    expect(await inAgency((tx) => ensurePayPeriods(tx, actor.agencyId, "2026-10-17"))).toEqual([]);
    expect(await inAgency((tx) => saveAgencyDetails(tx, actor, { name: "Fresh Start Staffing (test)", addressLines: ["10 Example Street", "Joliet, IL 60431"], phone: "(815) 555-0100", email: "billing@fresh.example.com", timeZone: "America/Chicago" }))).toEqual({ ok: true });
    expect(await inAgency((tx) => setWorkweekStart(tx, coordinator, 1))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => setWorkweekStart(tx, actor, 1))).toEqual({ ok: true });
    const view = await inAgency((tx) => agencyView(tx, actor.agencyId));
    expect(view).toMatchObject({ addressLines: ["10 Example Street", "Joliet, IL 60431"], timeZone: "America/Chicago", workweekStartsOn: 1, workweekChangeable: true });

    const today = await inAgency((tx) => agencyToday(tx));
    const thisWeek = workweekStart(today, 1);
    const periods = await inAgency((tx) => tx.select({ startsOn: s.payPeriods.startsOn }).from(s.payPeriods));
    expect(periods.map((p) => p.startsOn).sort()).toEqual([addDays(thisWeek, -7), thisWeek]);
    // Asking again makes nothing more (opening Convert timesheets twice).
    expect(await inAgency((tx) => ensurePayPeriods(tx, actor.agencyId, today))).toEqual([]);
    // An earlier week, once; never a future one.
    const older = await inAgency((tx) => startPayPeriod(tx, coordinator, addDays(thisWeek, -20)));
    expect(older.ok).toBe(true);
    expect(await inAgency((tx) => startPayPeriod(tx, coordinator, addDays(thisWeek, -20)))).toEqual({ ok: false, error: "exists" });
    expect(await inAgency((tx) => startPayPeriod(tx, coordinator, addDays(thisWeek, 9)))).toEqual({ ok: false, error: "future" });

    const branch = await inAgency((tx) => createBranch(tx, actor, "Joliet"));
    expect(branch.ok).toBe(true);
    expect(await inAgency((tx) => createBranch(tx, actor, "joliet"))).toEqual({ ok: false, error: "name_taken" });
    expect(await inAgency((tx) => renameBranch(tx, actor, branch.id!, "Joliet office"))).toEqual({ ok: true });

    const client = await inAgency((tx) => createClient(tx, coordinator, { name: "Prairie Example Co.", code: "PRAIRIE", addressLines: ["1 Example Way"], billingEmail: "ap@prairie.example.com", paymentTermsDays: 30 }));
    if (!client.ok) throw new Error(JSON.stringify(client));
    expect(await inAgency((tx) => createClient(tx, coordinator, { name: "Another", code: "prairie", addressLines: [], billingEmail: null, paymentTermsDays: 15 }))).toEqual({ ok: false, error: "code_taken" });
    const [profile] = await inAgency((tx) => tx.select().from(s.clientBillingProfiles).where(eq(s.clientBillingProfiles.clientId, client.id)));
    expect(profile).toMatchObject({ paymentTermsDays: 30, invoiceTemplate: "standard", effectiveTo: null });
    const worksite = await inAgency((tx) => createWorksite(tx, coordinator, client.id, site));
    if (!worksite.ok) throw new Error(JSON.stringify(worksite));
    const [stored] = await inAgency((tx) => tx.select().from(s.worksites).where(eq(s.worksites.id, worksite.id)));
    expect(stored).toMatchObject({ county: "Will", countyFips: "17197", placeFips: "1738570", outsideAnyPlace: false });

    const job = await inAgency((tx) =>
      createJobOrder(tx, coordinator, { clientId: client.id, worksiteId: worksite.id, position: "Machine operator", socCode: "51-9199", shift: "Days", headcount: 2, payMinCents: 1825, payMaxCents: 1825, prevailingWage: false, branchId: branch.id! }),
    );
    if (!job.ok) throw new Error(JSON.stringify(job));
    const worker = await inAgency((tx) => createWorker(tx, coordinator, { firstName: "Test", lastName: "Worker", preferredLanguage: "en", hireDate: null } as never));
    if (!worker.ok) throw new Error(JSON.stringify(worker));
    const placed = await inAgency((tx) => createAssignment(tx, coordinator, { workerId: worker.id, jobOrderId: job.id, startDate: addDays(thisWeek, -7), endDate: null }));
    expect(placed.ok).toBe(true);

    // With workers placed, the client stays; the worksite's place is fixed once hours exist (none yet: it may change).
    expect(await inAgency((tx) => setClientArchived(tx, coordinator, client.id, true))).toEqual({ ok: false, error: "active_placements" });
    expect((await inAgency((tx) => updateWorksite(tx, coordinator, worksite.id, { ...site, name: "Joliet Plant 2" }))).ok).toBe(true);
    expect((await inAgency((tx) => updateClient(tx, coordinator, client.id, { name: "Prairie Example Company", code: "PRAIRIE", addressLines: ["1 Example Way"], billingEmail: "ap@prairie.example.com" }))).ok).toBe(true);
    expect(await inAgency((tx) => setBranchArchived(tx, actor, branch.id!, true))).toEqual({ ok: true });
    expect((await inAgency((tx) => listBranches(tx)))[0]).toMatchObject({ name: "Joliet office", archived: true, jobOrders: 1 });
    // Hours filed: the pay week's day is now fixed.
    const [week] = await inAgency((tx) => tx.select({ id: s.payPeriods.id }).from(s.payPeriods).where(eq(s.payPeriods.startsOn, thisWeek)));
    await inAgency((tx) => tx.insert(s.timeEntries).values({ agencyId: actor.agencyId, payPeriodId: week!.id, assignmentId: placed.ok ? placed.id : null, workerNameRaw: "Test Worker", minutes: 480, workDate: thisWeek }));
    expect(await inAgency((tx) => setWorkweekStart(tx, actor, 0))).toEqual({ ok: false, error: "in_use" });
    expect(await inAgency((tx) => updateWorksite(tx, coordinator, worksite.id, { ...site, placeFips: null, outsideAnyPlace: true }))).toEqual({ ok: false, error: "place_in_use" });
  });

  it("only the roles the permissions table names", async () => {
    const accountant: Actor = { ...actor, role: "accountant" };
    expect(await inAgency((tx) => createClient(tx, accountant, { name: "X", code: "X", addressLines: [], billingEmail: null, paymentTermsDays: 30 }))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => createBranch(tx, coordinator, "Elsewhere"))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => saveAgencyDetails(tx, coordinator, {}))).toEqual({ ok: false, error: "not_allowed" });
  });
});
