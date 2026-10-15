/** Append-only audit events (SPEC §19): every create, update, approve, export and reveal. */
import type { Tx } from "./db/client";
import { auditEvents } from "./db/schema";
import type { Actor } from "./session";

export interface AuditInput {
  action: "create" | "update" | "approve" | "export" | "reveal" | "reset" | "delete" | "import";
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export async function audit(tx: Tx, actor: Actor, events: AuditInput[]): Promise<void> {
  if (events.length === 0) return;
  await tx.insert(auditEvents).values(
    events.map((e) => ({
      agencyId: actor.agencyId,
      actorUserId: actor.userId,
      actorLabel: actor.label,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      before: e.before ?? null,
      after: e.after ?? null,
      reason: e.reason ?? null,
    })),
  );
}
