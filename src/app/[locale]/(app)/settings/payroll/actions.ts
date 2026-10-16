"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EXPORT_FORMATS, SYSTEM_OF, type ExportFormat, type PayrollSystem, type SettingProblem } from "@/exports/targets";
import { withAgency } from "@/server/db";
import { StaleRequestError } from "@/server/errors";
import { PeriodBusyError } from "@/server/run/period-lock";
import { setPayrollCodes, setPayrollTarget, setWorkerPayrollId } from "@/server/payroll/settings";
import { actorAllowedTo } from "@/server/session";
import { agencyToday } from "@/server/settings";

const refresh = () => revalidatePath("/[locale]/(app)/settings/payroll", "page");

export type SettingsActionResult =
  | { ok: true }
  | { ok: false; error: "not_allowed" | "stale" | "busy" | "generic" | "not_found" }
  | { ok: false; error: "invalid"; problems: SettingProblem[] }
  | { ok: false; error: "taken"; by: string };

// Shapes only: the settings service checks every rule and says which one a value breaks.
const rowId = z.uuid().nullable();
const json = z.unknown().refine((v) => JSON.stringify(v ?? null).length <= 20_000);
const format = z.enum(EXPORT_FORMATS);
const system = z.enum(Object.values(SYSTEM_OF) as [PayrollSystem, ...PayrollSystem[]]);

async function guarded(fn: () => Promise<SettingsActionResult>): Promise<SettingsActionResult> {
  try {
    const r = await fn();
    refresh();
    return r;
  } catch (error) {
    refresh();
    if (error instanceof StaleRequestError) return { ok: false, error: "stale" };
    // Files are being made with the settings right now: try again in a moment.
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    throw error;
  }
}

export async function saveTargetAction(target: unknown, expectedId: string | null): Promise<SettingsActionResult> {
  if (!json.safeParse(target).success || !rowId.safeParse(expectedId).success) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("settings");
  return guarded(() => withAgency(actor.agencyId, async (tx) => setPayrollTarget(tx, actor, target, await agencyToday(tx), expectedId)));
}

export async function saveCodesAction(which: ExportFormat, codes: unknown, expectedId: string | null): Promise<SettingsActionResult> {
  if (!format.safeParse(which).success || !json.safeParse(codes).success || !rowId.safeParse(expectedId).success) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("settings");
  return guarded(() => withAgency(actor.agencyId, async (tx) => setPayrollCodes(tx, actor, which, codes, await agencyToday(tx), expectedId)));
}

export async function saveWorkerIdAction(workerId: string, which: PayrollSystem, id: string, title?: string): Promise<SettingsActionResult> {
  if (!z.uuid().safeParse(workerId).success || !system.safeParse(which).success || !z.string().max(200).safeParse(id).success || !z.string().max(200).optional().safeParse(title).success) {
    return { ok: false, error: "generic" };
  }
  const actor = await actorAllowedTo("settings");
  return guarded(() => withAgency(actor.agencyId, (tx) => setWorkerPayrollId(tx, actor, workerId, which, id, title)));
}
