/**
 * What the payroll file settings page shows (docs/patterns/settings/payroll.md): the system in use
 * with when and by whom it was last changed, its codes, and every worker's id in it.
 */
import { desc, eq } from "drizzle-orm";
import { SYSTEM_OF, type CodeMap, type ExportFormat, type PayrollSystem, type PayrollTarget, type SettingProblem } from "../../exports/targets";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import type { Actor } from "../session";
import { currentSetting, payrollCodes, payrollTarget, TARGET_KEY } from "./settings";
import { can } from "../permissions";

export interface PayrollSettingsView {
  canEdit: boolean;
  target: PayrollTarget | null;
  /** The settings row the page was drawn from (a save from a stale page is refused). */
  targetId: string | null;
  changed: { at: string; by: string } | null;
  /** The stored codes, with what today's rules say is wrong with any of them. */
  codes: { format: ExportFormat; id: string | null; codes: CodeMap; problems: SettingProblem[] } | null;
  system: PayrollSystem | null;
  workers: { id: string; firstName: string; lastName: string; value: string; title: string }[];
}

export async function payrollSettingsView(tx: Tx, actor: Actor): Promise<PayrollSettingsView> {
  const target = await payrollTarget(tx);
  const row = await currentSetting(tx, TARGET_KEY);
  // The latest change to the system in use (its audit event names who made it).
  const events = await tx.select().from(s.auditEvents).where(eq(s.auditEvents.entityType, "agency_setting")).orderBy(desc(s.auditEvents.id));
  const last = events.find((e) => (e.after as { key?: string } | null)?.key === TARGET_KEY);
  const system = target ? SYSTEM_OF[target.format] : null;
  const people = await tx.select().from(s.workers);
  return {
    canEdit: can(actor, "settings"),
    target,
    targetId: row?.id ?? null,
    changed: last ? { at: last.occurredAt.toISOString(), by: last.actorLabel } : null,
    codes: target ? await (async () => {
      const c = await payrollCodes(tx, target.format);
      return { format: target.format, id: c.id, codes: c.stored, problems: c.problems };
    })() : null,
    system,
    workers: people
      .map((w) => ({ id: w.id, firstName: w.firstName, lastName: w.lastName, value: system ? (w.payrollIds[system]?.id ?? "") : "", title: system ? (w.payrollIds[system]?.title ?? "") : "" }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName, "en") || a.firstName.localeCompare(b.firstName, "en") || (a.id < b.id ? -1 : 1)),
  };
}
