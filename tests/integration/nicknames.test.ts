/**
 * The agency's nickname map (SPEC §6): edited on Settings › Names, taught by a match in review,
 * audited, fenced to the agency, and used the next time a timesheet is read.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agencies, auditEvents, nicknames, timeEntries, workers } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, periodId, seedDemoAgency } from "../../src/server/demo/seed";
import { addNickname, learnNickname, listNicknames, NicknameProblemError, nicknameFromEntry, removeNickname } from "../../src/server/intake/nicknames";
import type { Actor } from "../../src/server/session";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);

beforeAll(async () => {
  const existing = await owner.db.select().from(agencies).where(eq(agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await app.withAgency(DEMO_AGENCY.id, async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("Settings › Names", () => {
  it("adds a nickname once, case and accents ignored, and removes it, each audited", async () => {
    const added = await inAgency((tx) => addNickname(tx, actor, "Toni", "Antonia"));
    await expect(inAgency((tx) => addNickname(tx, actor, "toni", "ANTONIA"))).rejects.toThrow(NicknameProblemError);
    await expect(inAgency((tx) => addNickname(tx, actor, "Ana", "ana"))).rejects.toThrow(NicknameProblemError);
    await expect(inAgency((tx) => addNickname(tx, actor, " ", "Ana"))).rejects.toThrow(NicknameProblemError);
    expect((await inAgency(listNicknames)).some((n) => n.id === added.id)).toBe(true);
    await inAgency((tx) => removeNickname(tx, actor, added.id));
    expect((await inAgency(listNicknames)).some((n) => n.id === added.id)).toBe(false);
    const events = await inAgency((tx) => tx.select().from(auditEvents).where(eq(auditEvents.entityId, added.id)));
    expect(events.map((e) => e.action).sort()).toEqual(["create", "delete"]);
  });

  it("is fenced to the agency: another agency sees none of them", async () => {
    const other = "00000000-0000-4000-a000-0000000000ff";
    const existing = await owner.db.select().from(agencies).where(eq(agencies.id, other));
    if (existing.length === 0) await owner.db.insert(agencies).values({ id: other, name: "Other agency (test)" });
    expect(await app.withAgency(other, (tx) => tx.select().from(nicknames))).toEqual([]);
  });
});

describe("a match in review teaches a nickname", () => {
  it("offers 'Mike' for a worker named Michael once the entry is matched, and remembers it on yes", async () => {
    const [worker] = await inAgency((tx) => tx.select().from(workers).limit(1));
    const [entry] = await inAgency((tx) =>
      tx
        .insert(timeEntries)
        .values({ agencyId: actor.agencyId, payPeriodId: periodId("w2"), workerNameRaw: `Mikey ${worker!.lastName}`, workerId: worker!.id, workDate: "2026-10-05", minutes: 480 })
        .returning(),
    );
    expect(await inAgency((tx) => nicknameFromEntry(tx, entry!.id))).toMatchObject({ nickname: "Mikey", givenName: worker!.firstName.split(" ")[0] });
    await inAgency((tx) => learnNickname(tx, actor, entry!.id));
    expect((await inAgency(listNicknames)).some((n) => n.nickname === "Mikey")).toBe(true);
    // Once known, nothing more to learn.
    expect(await inAgency((tx) => nicknameFromEntry(tx, entry!.id))).toBeNull();
  });
});
