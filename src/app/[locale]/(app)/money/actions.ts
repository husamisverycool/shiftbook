"use server";

import { revalidatePath } from "next/cache";
import { withAgency } from "@/server/db";
import { recordInsuranceHandoff, recordPayrollHandoff, requestWageAccess, submitFunding, type MoneyResult } from "@/server/money/service";
import { actorAllowedTo } from "@/server/session";
import { agencyToday } from "@/server/settings";

/** Partner handoffs (slice w; docs/patterns/money.md): shapes here, the rules and recomputation in the service. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function done(result: MoneyResult): MoneyResult {
  for (const path of ["/[locale]/(app)/money", "/[locale]/(app)/money/payroll", "/[locale]/(app)/money/payroll/[id]", "/[locale]/(app)/money/wage-access", "/[locale]/(app)/money/funding", "/[locale]/(app)/money/funding/[id]", "/[locale]/(app)/money/insurance", "/[locale]/(app)/workers/[id]"])
    revalidatePath(path, "page");
  return result;
}

export async function recordPayrollHandoffAction(runId: string, partner: string): Promise<MoneyResult> {
  if (typeof runId !== "string" || !UUID.test(runId) || typeof partner !== "string") return { ok: false, error: "not_found" };
  const actor = await actorAllowedTo("money");
  return done(await withAgency(actor.agencyId, (tx) => recordPayrollHandoff(tx, actor, runId, partner)));
}

export async function requestWageAccessAction(workerId: string, amountCents: number, delivery: string): Promise<MoneyResult> {
  if (typeof workerId !== "string" || !UUID.test(workerId)) return { ok: false, error: "not_found" };
  const actor = await actorAllowedTo("money");
  return done(await withAgency(actor.agencyId, (tx) => requestWageAccess(tx, actor, workerId, amountCents, delivery)));
}

export async function submitFundingAction(invoiceId: string): Promise<MoneyResult> {
  if (typeof invoiceId !== "string" || !UUID.test(invoiceId)) return { ok: false, error: "not_found" };
  const actor = await actorAllowedTo("money");
  return done(await withAgency(actor.agencyId, async (tx) => submitFunding(tx, actor, invoiceId, await agencyToday(tx))));
}

export async function recordInsuranceHandoffAction(from: string, to: string): Promise<MoneyResult> {
  const actor = await actorAllowedTo("money");
  return done(await withAgency(actor.agencyId, (tx) => recordInsuranceHandoff(tx, actor, from, to)));
}
