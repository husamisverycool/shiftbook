/**
 * One-click demo reset (SPEC §18): removes everything made in the demo and reloads the seeded demo
 * agency, through the same agency-fenced path as every other write. Only the demo agency can reset.
 */
import { audit } from "../audit";
import type { Tx } from "../db/client";
import type { Actor } from "../session";
import type { DocumentStore } from "../storage";
import { DEMO_AGENCY } from "./dataset";
import { clearDemoAgency, seedDemoAgency } from "./seed";

export async function resetDemo(
  deps: { withAgency: <T>(agencyId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>; store: DocumentStore },
  actor: Actor,
): Promise<void> {
  if (actor.agencyId !== DEMO_AGENCY.id) throw new Error("Only the demo agency can be reset.");
  await deps.withAgency(actor.agencyId, async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
    await audit(tx, actor, [{ action: "reset", entityType: "agency", entityId: actor.agencyId, reason: "demo reset" }]);
  });
  await deps.store.removePrefix(`${actor.agencyId}/`);
}
