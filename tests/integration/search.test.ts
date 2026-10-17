/**
 * The command menu's record search (decision 0038): one agency's records only, at most five of each
 * kind, an invoice number found exactly, scopes narrowing to a client or a worker, and the person's
 * typed wildcards taken literally.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, seedDemoAgency } from "../../src/server/demo/seed";
import { containsPattern, searchRecords } from "../../src/server/search/records";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
let other = "";

beforeAll(async () => {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await app.withAgency(DEMO_AGENCY.id, async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  const [b] = await owner.db.insert(s.agencies).values({ name: "Other agency (search test)" }).returning();
  other = b!.id;
  await owner.db.insert(s.clients).values({ agencyId: other, name: "Prairie Line Lookalike (other agency)", code: "ZZ" });
  await owner.db.insert(s.workers).values({ agencyId: other, firstName: "Marcus", lastName: "Elsewhere" });
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("command menu search", () => {
  it("finds one agency's workers and clients by name, never another agency's", async () => {
    const found = await app.withAgency(DEMO_AGENCY.id, (tx) => searchRecords(tx, { term: "prairie" }));
    expect(found.some((r) => r.kind === "client" && r.title.startsWith("Prairie Line"))).toBe(true);
    expect(found.some((r) => r.title.includes("other agency"))).toBe(false);
    const marcus = await app.withAgency(DEMO_AGENCY.id, (tx) => searchRecords(tx, { term: "marcus", set: "people" }));
    expect(marcus.map((r) => r.title)).not.toContain("Marcus Elsewhere");
    const theirs = await app.withAgency(other, (tx) => searchRecords(tx, { term: "marcus", set: "people" }));
    expect(theirs.map((r) => r.title)).toEqual(["Marcus Elsewhere"]);
  });

  it("returns at most five of each kind, with an address for each", async () => {
    const found = await app.withAgency(DEMO_AGENCY.id, (tx) => searchRecords(tx, { term: "a" }));
    const byKind = new Map<string, number>();
    for (const r of found) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    for (const n of byKind.values()) expect(n).toBeLessThanOrEqual(5);
    for (const r of found) expect(r.href).toMatch(/^\/(workers|clients|invoices|job-orders)\//);
  });

  it("people (@) are workers and clients only; work (#) never includes them", async () => {
    const people = await app.withAgency(DEMO_AGENCY.id, (tx) => searchRecords(tx, { term: "e", set: "people" }));
    expect(new Set(people.map((r) => r.kind))).toEqual(new Set(["worker", "client"]));
    const work = await app.withAgency(DEMO_AGENCY.id, (tx) => searchRecords(tx, { term: "e", set: "work" }));
    expect(work.every((r) => ["invoice", "jobOrder", "assignment"].includes(r.kind))).toBe(true);
  });

  it("narrows to a client's records within a client scope", async () => {
    const [prairie] = await app.withAgency(DEMO_AGENCY.id, (tx) => tx.select().from(s.clients).where(eq(s.clients.code, "PRL")));
    const client = prairie ?? (await app.withAgency(DEMO_AGENCY.id, (tx) => tx.select().from(s.clients)))[0]!;
    const found = await app.withAgency(DEMO_AGENCY.id, (tx) => searchRecords(tx, { term: "", scope: { kind: "client", id: client.id } }));
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((r) => r.kind === "client")).toBe(false);
    for (const r of found.filter((x) => x.kind === "jobOrder" || x.kind === "assignment")) expect(r.context.client).toBe(client.name);
  });

  it("takes % and _ in the typed text literally, and finds nothing for empty text without a scope", async () => {
    expect(containsPattern("50%_off")).toBe("%50\\%\\_off%");
    const none = await app.withAgency(DEMO_AGENCY.id, (tx) => searchRecords(tx, { term: "%" }));
    expect(none).toEqual([]);
    expect(await app.withAgency(DEMO_AGENCY.id, (tx) => searchRecords(tx, { term: "   " }))).toEqual([]);
  });
});
