/**
 * Slice (k) step 3 through the database (decision 0028): the agency's activity log — filtered by
 * date, person, record type, action and one record; record names looked up when shown; pages of 50;
 * the export following the filters, itself an event; only the Owner and the accountant read it; one
 * agency never sees another's events.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { activityEvent, activityOptions, activityPage, activityRecord, exportActivity, mayViewActivity } from "../../src/server/activity/queries";
import { parseActivityFilters } from "../../src/server/activity/filters";
import { appKey } from "../../src/server/auth/crypto";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER } from "../../src/server/demo/dataset";
import { clearDemoAgency, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import type { Actor } from "../../src/server/session";
import { audit } from "../../src/server/audit";
import { revealSsn, setSsn, updatePersonal } from "../../src/server/workers/service";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: "Demo Owner (demo)", role: "owner" };
const coordinator: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000003", label: "Test coordinator", role: "coordinator" };
const billing: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000004", label: "Test billing", role: "billing" };
const accountant: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000005", label: "Test accountant", role: "accountant" };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(DEMO_AGENCY.id, fn);
const marcus = workerId("marcus-bell");
// The log is never cleared, so every test reads from a moment of its own.
let since: Date;

beforeEach(async () => {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  since = new Date();
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

const today = () => new Date().toISOString().slice(0, 10);
const filters = (over: Record<string, string> = {}) => parseActivityFilters(over, today());

describe("the activity log", () => {
  it("the Owner's reveal is in the log with its reason and the worker's name (SPEC §24 step 10)", async () => {
    expect(await inAgency((tx) => revealSsn(tx, theOwner, marcus, "W-2 correction for the state", appKey()))).toMatchObject({ ok: true });
    const page = await inAgency((tx) => activityPage(tx, filters({ action: "ssn_viewed" })));
    const mine = page.events.filter((e) => new Date(e.at) >= since);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ actor: "Demo Owner (demo)", action: "reveal", event: "ssn_viewed", entityType: "worker", entityId: marcus, reason: "W-2 correction for the state", record: { name: "Marcus Bell", href: `/workers/${marcus}` } });
    // Never the number: the last four at most.
    expect(JSON.stringify(mine[0])).not.toMatch(/\d{3}-?\d{2}-?\d{4}/);
  });

  it("filters by person, record type, action and one record; newest first; pages of 50", async () => {
    await inAgency((tx) => updatePersonal(tx, coordinator, marcus, { firstName: "Marcus", lastName: "Bell", preferredLanguage: "es" }));
    await inAgency((tx) => revealSsn(tx, theOwner, marcus, "Payroll set-up", appKey()));
    const byLena = await inAgency((tx) => activityPage(tx, filters({ person: "Test coordinator", type: "worker" })));
    expect(byLena.events.filter((e) => new Date(e.at) >= since).map((e) => [e.event, e.entityId])).toEqual([["update", marcus]]);
    const forMarcus = await inAgency((tx) => activityPage(tx, filters({ record: `worker:${marcus}` })));
    const recent = forMarcus.events.filter((e) => new Date(e.at) >= since);
    expect(recent.map((e) => e.event)).toEqual(["ssn_viewed", "update"]);
    expect(forMarcus.events.every((e) => e.entityType === "worker" && e.entityId === marcus)).toBe(true);
    // The record filter's chip names the record even when nothing matches.
    expect(await inAgency((tx) => activityRecord(tx, { type: "worker", id: marcus }))).toMatchObject({ name: "Marcus Bell", href: `/workers/${marcus}` });
    // The whole log in pages: newest first, 50 at a time, no event twice.
    const first = await inAgency((tx) => activityPage(tx, filters()));
    expect(first.events).toHaveLength(50);
    expect(first.total).toBeGreaterThan(50);
    // Load more reads on without counting again (the first page counted).
    const second = await inAgency((tx) => activityPage(tx, filters(), { after: first.nextAfter!, withTotal: false }));
    expect(second.total).toBeNull();
    expect(second.events[0]!.id).toBeLessThan(first.events.at(-1)!.id);
    expect(new Set([...first.events, ...second.events].map((e) => e.id)).size).toBe(first.events.length + second.events.length);
    // A date range in the agency's own days: nothing before today in a range that ends yesterday.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const old = await inAgency((tx) => activityPage(tx, parseActivityFilters({ from: "2020-01-01", to: "2020-01-31" }, yesterday)));
    expect(old.events).toEqual([]);
  });

  it("Changed lists changes, an SSN changed only under its own action", async () => {
    await inAgency((tx) => setSsn(tx, coordinator, marcus, "900-55-7777", appKey()));
    await inAgency((tx) => updatePersonal(tx, coordinator, marcus, { firstName: "Marcus", lastName: "Bell", preferredLanguage: "es" }));
    const changed = (await inAgency((tx) => activityPage(tx, filters({ action: "update", record: `worker:${marcus}` })))).events.filter((e) => new Date(e.at) >= since);
    expect(changed.map((e) => e.event)).toEqual(["update"]);
    const ssn = (await inAgency((tx) => activityPage(tx, filters({ action: "ssn_changed", record: `worker:${marcus}` })))).events.filter((e) => new Date(e.at) >= since);
    expect(ssn.map((e) => e.event)).toEqual(["ssn_changed"]);
  });

  it("one agency never sees another's events, by the list or by an event's id", async () => {
    const OTHER = "00000000-0000-4000-b000-00000000000a";
    await owner.db.insert(s.agencies).values({ id: OTHER, name: "Other agency (test)" }).onConflictDoNothing();
    const label = `Someone else ${Date.now()}`;
    const them: Actor = { agencyId: OTHER, userId: "00000000-0000-4000-a000-000000000009", label, role: "owner" };
    await app.withAgency(OTHER, (tx) => audit(tx, them, [{ action: "update", entityType: "client", entityId: "6f1c2a8e-0b4d-4c55-9a3e-2d7b8c9e0f11", after: { name: "Theirs" } }]));
    const [theirs] = (await app.withAgency(OTHER, (tx) => activityPage(tx, filters({ person: label })))).events;
    expect(theirs).toMatchObject({ actor: label });
    const mine = await inAgency((tx) => activityPage(tx, filters({ person: label })));
    expect(mine.events).toEqual([]);
    expect(await inAgency((tx) => activityEvent(tx, theirs!.id))).toBeNull();
    expect((await inAgency((tx) => activityOptions(tx))).people).not.toContain(label);
  });

  it("a record no longer on file is said to be so", async () => {
    const goneId = "6f1c2a8e-0b4d-4c55-9a3e-2d7b8c9e0f99";
    await inAgency((tx) => audit(tx, theOwner, [{ action: "update", entityType: "worker", entityId: goneId, after: { lastName: "Gone" } }]));
    const [e] = (await inAgency((tx) => activityPage(tx, filters({ record: `worker:${goneId}` })))).events;
    expect(e!.record).toEqual({ name: null, href: null, gone: true });
  });

  it("the filters' choices are the people and record types in the log; one event by its id", async () => {
    await inAgency((tx) => revealSsn(tx, theOwner, marcus, "Payroll set-up", appKey()));
    const options = await inAgency((tx) => activityOptions(tx));
    expect(options.people).toContain("Demo Owner (demo)");
    expect(options.types).toContain("worker");
    const page = await inAgency((tx) => activityPage(tx, filters({ action: "ssn_viewed" })));
    const one = await inAgency((tx) => activityEvent(tx, page.events[0]!.id));
    expect(one).toEqual(page.events[0]);
    expect(await inAgency((tx) => activityEvent(tx, -1))).toBeNull();
  });

  it("the export follows the filters and is itself in the log", async () => {
    await inAgency((tx) => revealSsn(tx, theOwner, marcus, "Payroll set-up", appKey()));
    const out = await inAgency((tx) => exportActivity(tx, accountant, filters({ action: "ssn_viewed", record: `worker:${marcus}` })));
    expect(out.rows).toBeGreaterThan(0);
    expect(out.csv.split("\r\n")[0]).toBe("When (UTC),Who,Event,Action,Record type,Record,Record id,Reason,Before,After");
    expect(out.csv).toContain("Payroll set-up");
    expect(out.csv).not.toContain("Test coordinator");
    const exported = await inAgency((tx) => activityPage(tx, filters({ type: "activity_log", action: "export" })));
    expect(exported.events[0]).toMatchObject({ actor: "Test accountant", event: "export", after: { rows: out.rows, filters: { action: "ssn_viewed", record: `worker:${marcus}` } } });
  });

  it("only the Owner and the accountant read the whole log", () => {
    expect([theOwner, coordinator, billing, accountant].map(mayViewActivity)).toEqual([true, false, false, true]);
  });
});
