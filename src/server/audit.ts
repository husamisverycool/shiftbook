/** Append-only audit events (SPEC §19): every create, update, approve, export and reveal. */
import type { Tx } from "./db/client";
import { auditEvents } from "./db/schema";
import type { Actor } from "./session";

export interface AuditInput {
  action: "create" | "update" | "approve" | "export" | "reveal" | "reset" | "delete" | "import" | "sign_in" | "sign_out" | "sign_in_failed" | "refuse";
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export async function audit(tx: Tx, actor: Actor, events: AuditInput[]): Promise<void> {
  await auditBy(tx, { agencyId: actor.agencyId, userId: actor.userId, label: actor.label }, events);
}

/** Someone who is not an agency user (a client's approver, by link): no user id, a label that names them. */
export async function auditBy(tx: Tx, who: { agencyId: string; userId: string | null; label: string }, events: AuditInput[]): Promise<void> {
  if (events.length === 0) return;
  await tx.insert(auditEvents).values(
    events.map((e) => ({
      agencyId: who.agencyId,
      actorUserId: who.userId,
      actorLabel: who.label,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      before: e.before ?? null,
      after: e.after ?? null,
      reason: e.reason ?? null,
    })),
  );
}
