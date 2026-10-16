/**
 * A client's invoice settings (SPEC §4 ClientBillingProfile; slice g, decisions G2–G9), kept as dated
 * versions (Bullhorn One Invoice Terms: "create a new version instead of editing"). A version that
 * would apply to a period already invoiced for the client is refused: those invoices were made with
 * the settings then in force, and a correction of that period must split the same way (Bullhorn Back
 * Office applies setting changes to invoices still in progress only).
 *
 * Pattern for the page: docs/patterns/clients/[id].md.
 */
import { addDays, isIsoDate } from "@shiftbook/rules";
import { and, eq, inArray } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { lockCatalog } from "../run/period-lock";
import type { Actor } from "../session";
import { planInsert } from "./versions";

export interface BillingSettings {
  invoiceTemplate: s.InvoiceTemplate;
  separateBy: s.SeparateBy[];
  poRequired: boolean;
  poNumber: string | null;
  backupDetail: boolean;
  backupImages: boolean;
  vmsFormat: s.VmsFormat | null;
  paymentTermsDays: number;
  overtimeBillingRule: (typeof s.otBillingRule.enumValues)[number];
  billPremiums: boolean;
  billGuarantees: boolean;
}

export interface BillingProblem {
  field: keyof BillingSettings | "effectiveFrom";
  rule: string;
}

const OT_RULES = s.otBillingRule.enumValues as readonly string[];
/** Who may change invoice settings (the page says so to everyone else). */
export const mayChangeBilling = (actor: Actor) => actor.role === "owner" || actor.role === "billing";

/** Everything wrong with a set of invoice settings (empty when they can be saved). */
export function billingProblems(value: unknown): BillingProblem[] {
  const v = (value ?? {}) as Partial<Record<keyof BillingSettings, unknown>>;
  const problems: BillingProblem[] = [];
  if (!s.INVOICE_TEMPLATES.includes(v.invoiceTemplate as s.InvoiceTemplate)) problems.push({ field: "invoiceTemplate", rule: "choose_template" });
  const sep = v.separateBy;
  if (!Array.isArray(sep) || sep.some((x) => !s.SEPARATE_BY.includes(x as s.SeparateBy)) || new Set(sep).size !== sep.length) problems.push({ field: "separateBy", rule: "choose_separate" });
  for (const key of ["poRequired", "backupDetail", "backupImages", "billPremiums", "billGuarantees"] as const) {
    if (typeof v[key] !== "boolean") problems.push({ field: key, rule: "yes_or_no" });
  }
  const po = v.poNumber;
  if (po !== null && (typeof po !== "string" || po.length < 1 || po.length > 64 || po.trim() !== po || /[\u0000-\u001f]/.test(po))) problems.push({ field: "poNumber", rule: "po_number" });
  if (v.vmsFormat !== null && !s.VMS_FORMATS.includes(v.vmsFormat as s.VmsFormat)) problems.push({ field: "vmsFormat", rule: "choose_vms" });
  const terms = v.paymentTermsDays;
  if (typeof terms !== "number" || !Number.isSafeInteger(terms) || terms < 0 || terms > 365) problems.push({ field: "paymentTermsDays", rule: "terms_days" });
  if (!OT_RULES.includes(v.overtimeBillingRule as string)) problems.push({ field: "overtimeBillingRule", rule: "choose_ot_rule" });
  return problems;
}

const pick = (v: BillingSettings): BillingSettings => ({
  invoiceTemplate: v.invoiceTemplate,
  separateBy: [...v.separateBy].sort(),
  poRequired: v.poRequired,
  poNumber: v.poNumber,
  backupDetail: v.backupDetail,
  backupImages: v.backupImages,
  vmsFormat: v.vmsFormat,
  paymentTermsDays: v.paymentTermsDays,
  overtimeBillingRule: v.overtimeBillingRule,
  billPremiums: v.billPremiums,
  billGuarantees: v.billGuarantees,
});

/** The last day of the latest period this client was invoiced for, or null. */
export async function invoicedThrough(tx: Tx, clientId: string): Promise<string | null> {
  const rows = await tx
    .select({ endsOn: s.payPeriods.endsOn })
    .from(s.invoices)
    .innerJoin(s.payRuns, eq(s.payRuns.id, s.invoices.payRunId))
    .innerJoin(s.payPeriods, eq(s.payPeriods.id, s.payRuns.payPeriodId))
    .where(eq(s.invoices.clientId, clientId));
  return rows.reduce<string | null>((max, r) => (max === null || r.endsOn > max ? r.endsOn : max), null);
}

export type BillingResult =
  | { ok: true; id: string }
  | { ok: false; error: "not_allowed" | "not_found" }
  | { ok: false; error: "invoiced_through"; through: string }
  | { ok: false; error: "invalid"; problems: BillingProblem[] };

/**
 * Starts a version of a client's invoice settings on `effectiveFrom`: the version before it ends the
 * day before; a version that already starts that day is replaced. Fields this page does not edit
 * (the VMS's name, consolidate) carry over from the version in force on that day.
 */
export async function setBillingSettings(tx: Tx, actor: Actor, clientId: string, values: unknown, effectiveFrom: string): Promise<BillingResult> {
  if (!mayChangeBilling(actor)) return { ok: false, error: "not_allowed" };
  const problems = billingProblems(values);
  if (!isIsoDate(effectiveFrom)) problems.push({ field: "effectiveFrom", rule: "date" });
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const settings = pick(values as BillingSettings);
  // Billing settings are read by every run and every file: one change at a time, never mid-run.
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [client] = await tx.select({ id: s.clients.id }).from(s.clients).where(eq(s.clients.id, clientId));
  if (!client) return { ok: false, error: "not_found" };
  const through = await invoicedThrough(tx, clientId);
  if (through !== null && effectiveFrom <= through) return { ok: false, error: "invoiced_through", through };

  const versions = await tx.select().from(s.clientBillingProfiles).where(eq(s.clientBillingProfiles.clientId, clientId));
  const sameDay = versions.find((v) => v.effectiveFrom === effectiveFrom);
  const before = [...versions].filter((v) => v.effectiveFrom <= effectiveFrom).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  const carried = { vmsName: before?.vmsName ?? null, consolidate: before?.consolidate ?? false };
  if (sameDay) {
    await tx.update(s.clientBillingProfiles).set(settings).where(eq(s.clientBillingProfiles.id, sameDay.id));
    await audit(tx, actor, [{ action: "update", entityType: "billing_profile", entityId: sameDay.id, before: pick(sameDay as unknown as BillingSettings), after: { ...settings, clientId, effectiveFrom } }]);
    return { ok: true, id: sameDay.id };
  }
  const plan = planInsert(versions, effectiveFrom);
  if (!plan.ok) throw new Error("A version already starts that day.");
  for (const u of plan.updates) await tx.update(s.clientBillingProfiles).set({ effectiveTo: u.effectiveTo }).where(eq(s.clientBillingProfiles.id, u.id));
  const [row] = await tx
    .insert(s.clientBillingProfiles)
    .values({ agencyId: actor.agencyId, clientId, ...settings, ...carried, effectiveFrom, effectiveTo: plan.effectiveTo })
    .returning({ id: s.clientBillingProfiles.id });
  await audit(tx, actor, [
    { action: "create", entityType: "billing_profile", entityId: row!.id, after: { ...settings, clientId, effectiveFrom, effectiveTo: plan.effectiveTo } },
    ...plan.updates.map((u) => ({ action: "update" as const, entityType: "billing_profile", entityId: u.id, before: { effectiveTo: versions.find((v) => v.id === u.id)!.effectiveTo }, after: { effectiveTo: u.effectiveTo, clientId }, reason: `ended by the version from ${effectiveFrom}` })),
  ]);
  return { ok: true, id: row!.id };
}

/** The first day a new version may start: the day after the client's last invoiced period (or any day). */
export async function earliestNewVersion(tx: Tx, clientId: string): Promise<string | null> {
  const through = await invoicedThrough(tx, clientId);
  return through ? addDays(through, 1) : null;
}

export type PoResult = { ok: true } | { ok: false; error: "not_found" | "po_number" | "invoiced" };

/**
 * Sets the client's PO for one assignment (decision G4); an empty value means the client's own PO.
 * Hours of this assignment already invoiced keep the PO they were invoiced under (the invoice says
 * it); a change applies to hours not invoiced yet.
 */
export async function setAssignmentPo(tx: Tx, actor: Actor, assignmentId: string, poNumber: string): Promise<PoResult> {
  const po = poNumber.trim() === "" ? null : poNumber;
  if (po !== null && (po.length > 64 || po.trim() !== po || /[\u0000-\u001f]/.test(po))) return { ok: false, error: "po_number" };
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [current] = await tx.select().from(s.assignments).where(eq(s.assignments.id, assignmentId));
  if (!current) return { ok: false, error: "not_found" };
  if (current.poNumber === po) return { ok: true };
  await tx.update(s.assignments).set({ poNumber: po }).where(eq(s.assignments.id, assignmentId));
  await audit(tx, actor, [{ action: "update", entityType: "assignment", entityId: assignmentId, before: { poNumber: current.poNumber }, after: { poNumber: po, jobOrderId: current.jobOrderId } }]);
  return { ok: true };
}

/** Each client's settings in force on a date (the run and the files read them through this). */
export async function billingInForce(tx: Tx, clientIds: string[], date: string): Promise<Map<string, (typeof s.clientBillingProfiles.$inferSelect)[]>> {
  const rows = clientIds.length > 0 ? await tx.select().from(s.clientBillingProfiles).where(and(inArray(s.clientBillingProfiles.clientId, clientIds))) : [];
  const out = new Map<string, (typeof s.clientBillingProfiles.$inferSelect)[]>();
  for (const id of clientIds) out.set(id, rows.filter((r) => r.clientId === id && r.effectiveFrom <= date && (r.effectiveTo === null || date <= r.effectiveTo)));
  return out;
}
