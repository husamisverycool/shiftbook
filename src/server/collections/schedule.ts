/**
 * Automatic collection reminders (slice r; docs/patterns/settings/collections.md): Stripe's "send the
 * reminder before, when, or after the invoice is due", from a fixed set of choices, using slice h's
 * three reminder kinds. Pure.
 */
import { addDays } from "@shiftbook/rules";
import type { ReminderStage } from "../db/schema";

export interface ReminderSchedule {
  enabled: boolean;
  /** Days before the due date for the "before due" reminder; null = not sent. */
  beforeDueDays: number | null;
  /** Days after the due date for the overdue reminder. */
  overdueDays: number | null;
  /** Days after the due date for the final notice. */
  finalDays: number | null;
}

/** The fixed choices offered on the settings page (null = that reminder is not sent). */
export const SCHEDULE_CHOICES = {
  beforeDueDays: [1, 3, 7],
  overdueDays: [1, 3, 7, 14],
  finalDays: [14, 30, 45, 60],
} as const;

/** The agency setting's key (an effective-dated agency setting). */
export const SCHEDULE_KEY = "collection_reminders";

export const DEFAULT_SCHEDULE: ReminderSchedule = { enabled: false, beforeDueDays: null, overdueDays: null, finalDays: null };

const choice = (v: unknown, allowed: readonly number[]): v is number | null => v === null || (typeof v === "number" && allowed.includes(v));

/** The stored setting as a schedule; anything else is "send nothing". */
export function parseSchedule(value: unknown): ReminderSchedule {
  if (typeof value !== "object" || value === null) return DEFAULT_SCHEDULE;
  const v = value as Record<string, unknown>;
  if (typeof v.enabled !== "boolean" || !choice(v.beforeDueDays, SCHEDULE_CHOICES.beforeDueDays) || !choice(v.overdueDays, SCHEDULE_CHOICES.overdueDays) || !choice(v.finalDays, SCHEDULE_CHOICES.finalDays)) return DEFAULT_SCHEDULE;
  if (v.overdueDays !== null && v.finalDays !== null && v.finalDays <= v.overdueDays) return DEFAULT_SCHEDULE;
  return { enabled: v.enabled, beforeDueDays: v.beforeDueDays, overdueDays: v.overdueDays, finalDays: v.finalDays };
}

/** The day each configured stage comes, in order. */
function stageDays(dueOn: string, s: ReminderSchedule): { stage: ReminderStage; on: string }[] {
  return [
    ...(s.beforeDueDays !== null ? [{ stage: "before_due" as const, on: addDays(dueOn, -s.beforeDueDays) }] : []),
    ...(s.overdueDays !== null ? [{ stage: "overdue" as const, on: addDays(dueOn, s.overdueDays) }] : []),
    ...(s.finalDays !== null ? [{ stage: "final" as const, on: addDays(dueOn, s.finalDays) }] : []),
  ];
}

/**
 * The reminder to send today, if any: the latest stage whose day has come, unless it was already sent.
 * An earlier stage that was missed is not sent late (a "before due" note after the due date would be wrong).
 */
export function reminderDue(invoice: { dueOn: string; balanceCents: number }, schedule: ReminderSchedule, today: string, sent: readonly ReminderStage[]): ReminderStage | null {
  if (!schedule.enabled || invoice.balanceCents <= 0) return null;
  const come = stageDays(invoice.dueOn, schedule).filter((x) => x.on <= today);
  const latest = come.at(-1);
  if (!latest || sent.includes(latest.stage)) return null;
  if (latest.stage === "before_due" && today > invoice.dueOn) return null;
  return latest.stage;
}

/**
 * How much a new credit note may credit (Stripe: "The sum of all credit notes issued for an invoice
 * can't exceed the total amount of the invoice"). Earlier credit notes are negative totals.
 */
export function creditNoteRoom(invoiceTotalCents: number, earlierCreditNoteTotals: readonly number[]): number {
  return Math.max(0, invoiceTotalCents + earlierCreditNoteTotals.reduce((sum, c) => sum + c, 0));
}
