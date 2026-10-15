/**
 * Job orders (SPEC §4, §8; docs/patterns/job-orders.md): client, worksite, position, SOC code, shift,
 * headcount, pay range, prevailing-wage flag. The worksite must be the client's. Every change is
 * audited. A job order's client cannot change once workers are assigned to it.
 */
import { eq } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { lockCatalog } from "../run/period-lock";
import type { Actor } from "../session";

export interface JobOrderInput {
  clientId: string;
  worksiteId: string;
  position: string;
  socCode: string | null;
  shift: string | null;
  headcount: number;
  payMinCents: number | null;
  payMaxCents: number | null;
  prevailingWage: boolean;
}

export type JobOrderField = "client" | "worksite" | "position" | "soc_code" | "shift" | "headcount" | "pay_range";
export type JobOrderResult = { ok: true; id: string } | { ok: false; error: "invalid"; fields: JobOrderField[] } | { ok: false; error: "not_found" | "client_has_assignments" };

const MAX_RATE_CENTS = 10_000_000;
const cents = (n: number | null) => n === null || (Number.isSafeInteger(n) && n > 0 && n <= MAX_RATE_CENTS);

async function problems(tx: Tx, input: JobOrderInput): Promise<JobOrderField[]> {
  const fields: JobOrderField[] = [];
  const [client] = await tx.select({ id: s.clients.id }).from(s.clients).where(eq(s.clients.id, input.clientId));
  if (!client) fields.push("client");
  const [site] = await tx.select({ clientId: s.worksites.clientId }).from(s.worksites).where(eq(s.worksites.id, input.worksiteId));
  if (!site || site.clientId !== input.clientId) fields.push("worksite");
  if (input.position.trim() === "" || input.position.length > 120) fields.push("position");
  if (input.socCode !== null && !/^\d{2}-\d{4}$/.test(input.socCode)) fields.push("soc_code");
  if (input.shift !== null && input.shift.length > 60) fields.push("shift");
  if (!Number.isSafeInteger(input.headcount) || input.headcount < 1 || input.headcount > 10_000) fields.push("headcount");
  if (!cents(input.payMinCents) || !cents(input.payMaxCents) || (input.payMinCents !== null && input.payMaxCents !== null && input.payMinCents > input.payMaxCents)) {
    fields.push("pay_range");
  }
  return fields;
}

const clean = (input: JobOrderInput) => ({
  ...input,
  position: input.position.trim(),
  socCode: input.socCode?.trim() || null,
  shift: input.shift?.trim() || null,
});

export async function createJobOrder(tx: Tx, actor: Actor, raw: JobOrderInput): Promise<JobOrderResult> {
  const input = clean(raw);
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const fields = await problems(tx, input);
  if (fields.length > 0) return { ok: false, error: "invalid", fields };
  const [row] = await tx.insert(s.jobOrders).values({ agencyId: actor.agencyId, ...input }).returning({ id: s.jobOrders.id });
  await audit(tx, actor, [{ action: "create", entityType: "job_order", entityId: row!.id, after: input }]);
  return { ok: true, id: row!.id };
}

export async function updateJobOrder(tx: Tx, actor: Actor, id: string, raw: JobOrderInput): Promise<JobOrderResult> {
  const input = clean(raw);
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [current] = await tx.select().from(s.jobOrders).where(eq(s.jobOrders.id, id));
  if (!current) return { ok: false, error: "not_found" };
  if (current.clientId !== input.clientId) {
    const [assigned] = await tx.select({ id: s.assignments.id }).from(s.assignments).where(eq(s.assignments.jobOrderId, id)).limit(1);
    if (assigned) return { ok: false, error: "client_has_assignments" };
  }
  const fields = await problems(tx, input);
  if (fields.length > 0) return { ok: false, error: "invalid", fields };
  await tx.update(s.jobOrders).set(input).where(eq(s.jobOrders.id, id));
  const before = {
    clientId: current.clientId,
    worksiteId: current.worksiteId,
    position: current.position,
    socCode: current.socCode,
    shift: current.shift,
    headcount: current.headcount,
    payMinCents: current.payMinCents,
    payMaxCents: current.payMaxCents,
    prevailingWage: current.prevailingWage,
  };
  await audit(tx, actor, [{ action: "update", entityType: "job_order", entityId: id, before, after: input }]);
  return { ok: true, id };
}
