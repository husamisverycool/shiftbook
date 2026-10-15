import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agencies, auditEvents, sourceDocuments, workers } from "../../src/server/db/schema";
import { DEMO_AGENCY, WORKERS } from "../../src/server/demo/dataset";
import { resetDemo } from "../../src/server/demo/reset";
import { clearDemoAgency, periodId, seedDemoAgency } from "../../src/server/demo/seed";
import { receiveDocument } from "../../src/server/intake/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const root = mkdtempSync(join(tmpdir(), "sb-reset-"));
const store = new LocalDocumentStore(root);
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test owner", role: "owner" };

beforeAll(async () => {
  const existing = await owner.db.select().from(agencies).where(eq(agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await app.withAgency(actor.agencyId, async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("one-click demo reset", () => {
  it("removes uploads and their files, restores the seeded agency, and audits the reset", async () => {
    const file = "IL-prairie-line-timeclock-2026-10-05.csv";
    await app.withAgency(actor.agencyId, (tx) =>
      receiveDocument(tx, actor, store, { payPeriodId: periodId("w2"), filename: file, bytes: readFileSync(`demo/samples/2026-10-05/${file}`) }),
    );
    await app.withAgency(actor.agencyId, (tx) => tx.update(workers).set({ lastName: "Changed" }).where(eq(workers.lastName, WORKERS[0]!.lastName)));
    expect(existsSync(join(root, actor.agencyId))).toBe(true);

    await resetDemo({ withAgency: app.withAgency, store }, actor);

    const docs = await app.withAgency(actor.agencyId, (tx) => tx.select().from(sourceDocuments));
    expect(docs).toEqual([]);
    const people = await app.withAgency(actor.agencyId, (tx) => tx.select().from(workers));
    expect(people).toHaveLength(WORKERS.length);
    expect(people.some((p) => p.lastName === "Changed")).toBe(false);
    expect(existsSync(join(root, actor.agencyId))).toBe(false);
    const events = await app.withAgency(actor.agencyId, (tx) => tx.select().from(auditEvents).where(eq(auditEvents.action, "reset")));
    expect(events.length).toBeGreaterThan(0);
  });

  it("refuses to reset an agency that is not the demo agency", async () => {
    const other: Actor = { ...actor, agencyId: "00000000-0000-4000-a000-0000000000ff" };
    await expect(resetDemo({ withAgency: app.withAgency, store }, other)).rejects.toThrow(/demo agency/);
  });
});
