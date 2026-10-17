// Holiday policies (drizzle/0018; docs/patterns/settings/holidays.md): agency data, not law. The
// agency's default (client null) and a client's own, which wins on that client's work. The engine
// reads them on every computation; two policies for the same client holding the same date would
// leave it unable to choose, so saving refuses that.
import { and, eq, gte, lte } from "drizzle-orm";
import { isIsoDate } from "@shiftbook/rules";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { can } from "../permissions";
import { periodState } from "../run/period-lock";
import type { Actor } from "../session";

export interface HolidayPolicyInput {
  clientId: string | null;
  name: string;
  dates: string[];
  /** Hours worked on the holiday pay this multiple of the pay rate (1 = no premium). */
  workedMultiplier: { num: number; den: number };
  /** Minutes paid for a holiday not worked, when a person confirms eligibility. */
  notWorkedMinutes: number;
  billWorkedMultiplier: { num: number; den: number } | null;
  billNotWorked: boolean;
}

export type HolidayProblem = "name" | "dates" | "worked_multiplier" | "not_worked" | "bill_multiplier" | "client" | "overlap" | "reason" | "locked" | "not_allowed";

export class HolidayRefusedError extends Error {
  constructor(readonly problems: HolidayProblem[]) {
    super(problems.join(", "));
    this.name = "HolidayRefusedError";
  }
}

/** A multiple between 1 and 3, as a whole-number fraction. */
const sensible = (m: { num: number; den: number }) => Number.isSafeInteger(m.num) && Number.isSafeInteger(m.den) && m.den > 0 && m.den <= 100 && m.num >= m.den && m.num <= 3 * m.den;

export function holidayProblems(input: HolidayPolicyInput): HolidayProblem[] {
  const out: HolidayProblem[] = [];
  if (typeof input.name !== "string" || input.name.trim() === "" || input.name.trim().length > 80) out.push("name");
  if (!Array.isArray(input.dates) || input.dates.length === 0 || input.dates.length > 60 || !input.dates.every(isIsoDate) || new Set(input.dates).size !== input.dates.length) out.push("dates");
  if (!sensible(input.workedMultiplier)) out.push("worked_multiplier");
  if (!Number.isSafeInteger(input.notWorkedMinutes) || input.notWorkedMinutes < 0 || input.notWorkedMinutes > 720) out.push("not_worked");
  if (input.billWorkedMultiplier !== null && !sensible(input.billWorkedMultiplier)) out.push("bill_multiplier");
  return out;
}

export interface HolidayPolicyView {
  id: string;
  clientId: string | null;
  clientName: string | null;
  name: string;
  dates: string[];
  workedMultiplier: { num: number; den: number };
  notWorkedMinutes: number;
  billWorkedMultiplier: { num: number; den: number } | null;
  billNotWorked: boolean;
}

export async function holidayPolicies(tx: Tx): Promise<{ policies: HolidayPolicyView[]; clients: { id: string; name: string }[] }> {
  const rows = await tx.select().from(s.holidayPolicies);
  const clients = (await tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients)).sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = new Map(clients.map((c) => [c.id, c.name]));
  const policies = rows
    .map((p) => ({
      id: p.id,
      clientId: p.clientId,
      clientName: p.clientId ? (nameOf.get(p.clientId) ?? null) : null,
      name: p.name,
      dates: [...p.holidayDates].sort(),
      workedMultiplier: { num: p.workedMultiplierNum, den: p.workedMultiplierDen },
      notWorkedMinutes: p.notWorkedMinutes,
      billWorkedMultiplier: p.billWorkedMultiplierNum !== null && p.billWorkedMultiplierDen !== null ? { num: p.billWorkedMultiplierNum, den: p.billWorkedMultiplierDen } : null,
      billNotWorked: p.billNotWorked,
    }))
    .sort((a, b) => (a.clientName ?? "").localeCompare(b.clientName ?? "") || a.name.localeCompare(b.name));
  return { policies, clients };
}

type Row = typeof s.holidayPolicies.$inferSelect;

/** Everything a policy says, for the audit log's before and after. */
const snapshot = (p: Pick<Row, "clientId" | "name" | "holidayDates" | "workedMultiplierNum" | "workedMultiplierDen" | "notWorkedMinutes" | "billWorkedMultiplierNum" | "billWorkedMultiplierDen" | "billNotWorked">) => ({
  clientId: p.clientId,
  name: p.name,
  dates: [...p.holidayDates].sort(),
  workedMultiplier: `${p.workedMultiplierNum}/${p.workedMultiplierDen}`,
  notWorkedMinutes: p.notWorkedMinutes,
  billWorkedMultiplier: p.billWorkedMultiplierNum !== null && p.billWorkedMultiplierDen !== null ? `${p.billWorkedMultiplierNum}/${p.billWorkedMultiplierDen}` : null,
  billNotWorked: p.billNotWorked,
});

/**
 * Dates whose pay a change would alter that fall in a pay period whose files exist (or that was paid
 * before Granite): a policy never rewrites a locked period (SPEC §5), as a rate change never does.
 */
async function lockedAmong(tx: Tx, dates: string[]): Promise<boolean> {
  for (const date of [...new Set(dates)].sort()) {
    const periods = await tx.select({ id: s.payPeriods.id }).from(s.payPeriods).where(and(lte(s.payPeriods.startsOn, date), gte(s.payPeriods.endsOn, date)));
    for (const p of periods) if ((await periodState(tx, p.id)) !== "open") return true;
  }
  return false;
}

/** The dates a change touches: added or removed ones, and every date when what they pay changes. */
function touched(before: ReturnType<typeof snapshot> | null, after: ReturnType<typeof snapshot> | null): string[] {
  if (!before) return after?.dates ?? [];
  if (!after) return before.dates;
  const { dates: b, ...bTerms } = before;
  const { dates: a, ...aTerms } = after;
  const moved = [...b.filter((d) => !a.includes(d)), ...a.filter((d) => !b.includes(d))];
  return JSON.stringify(bTerms) === JSON.stringify(aTerms) ? moved : [...new Set([...b, ...a])];
}

/**
 * Adds a policy, or changes one (id given, with a reason). Refuses a date another policy for the same
 * client holds, and any change to a date in a locked period. Only the Owner (the settings ability).
 */
export async function saveHolidayPolicy(tx: Tx, actor: Actor, id: string | null, input: HolidayPolicyInput, reasonText = ""): Promise<string> {
  if (!can(actor, "settings")) throw new HolidayRefusedError(["not_allowed"]);
  const reason = reasonText.trim();
  const problems = holidayProblems(input);
  if (id && reason === "") problems.push("reason");
  if (input.clientId !== null) {
    const [client] = await tx.select({ id: s.clients.id }).from(s.clients).where(eq(s.clients.id, input.clientId));
    if (!client) problems.push("client");
  }
  if (problems.length > 0) throw new HolidayRefusedError(problems);
  const others = (await tx.select().from(s.holidayPolicies)).filter((p) => p.id !== id && p.clientId === input.clientId);
  if (others.some((p) => p.holidayDates.some((d) => input.dates.includes(d)))) throw new HolidayRefusedError(["overlap"]);
  const row = {
    clientId: input.clientId,
    name: input.name.trim(),
    holidayDates: [...input.dates].sort(),
    workedMultiplierNum: input.workedMultiplier.num,
    workedMultiplierDen: input.workedMultiplier.den,
    notWorkedMinutes: input.notWorkedMinutes,
    billWorkedMultiplierNum: input.billWorkedMultiplier?.num ?? null,
    billWorkedMultiplierDen: input.billWorkedMultiplier?.den ?? null,
    billNotWorked: input.billNotWorked,
  };
  if (id) {
    const [before] = await tx.select().from(s.holidayPolicies).where(eq(s.holidayPolicies.id, id));
    if (!before) throw new HolidayRefusedError(["name"]);
    if (await lockedAmong(tx, touched(snapshot(before), snapshot(row)))) throw new HolidayRefusedError(["locked"]);
    await tx.update(s.holidayPolicies).set(row).where(eq(s.holidayPolicies.id, id));
    await audit(tx, actor, [{ action: "update", entityType: "holiday_policy", entityId: id, before: snapshot(before), after: snapshot(row), reason }]);
    return id;
  }
  if (await lockedAmong(tx, row.holidayDates)) throw new HolidayRefusedError(["locked"]);
  const [created] = await tx.insert(s.holidayPolicies).values({ ...row, agencyId: actor.agencyId, createdBy: actor.userId }).returning({ id: s.holidayPolicies.id });
  await audit(tx, actor, [{ action: "create", entityType: "holiday_policy", entityId: created!.id, after: snapshot(row), ...(reason ? { reason } : {}) }]);
  return created!.id;
}

/** Deletes a policy, with a reason; refused when one of its dates is in a locked period. */
export async function deleteHolidayPolicy(tx: Tx, actor: Actor, id: string, reasonText = ""): Promise<boolean> {
  if (!can(actor, "settings")) throw new HolidayRefusedError(["not_allowed"]);
  const reason = reasonText.trim();
  if (reason === "") throw new HolidayRefusedError(["reason"]);
  const [before] = await tx.select().from(s.holidayPolicies).where(eq(s.holidayPolicies.id, id));
  if (!before) return false;
  if (await lockedAmong(tx, before.holidayDates)) throw new HolidayRefusedError(["locked"]);
  await tx.delete(s.holidayPolicies).where(eq(s.holidayPolicies.id, id));
  await audit(tx, actor, [{ action: "delete", entityType: "holiday_policy", entityId: id, before: snapshot(before), reason }]);
  return true;
}
