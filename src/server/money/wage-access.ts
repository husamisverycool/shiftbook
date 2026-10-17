/**
 * Earned wage access availability (SPEC §27 item 9; docs/patterns/money/wage-access.md), built to the
 * CFPB's December 23, 2025 advisory opinion's "covered EWA" conditions (docs/research/
 * money-flows-slice-w.md §5): never more than wages already earned, determined from payroll data — here,
 * hours that were reviewed or approved by the client and are not yet paid, at the rate card in force
 * on each day, straight time only (overtime would only add, so the figure never overstates what was
 * earned); recovered by a payroll deduction at the next payroll; no recourse, no collection, no credit
 * check. An access already requested stays outstanding until the hours it drew on are paid.
 *
 * Earned is the exact sum of minutes × rate ÷ 60, rounded down once (never up). Available is the
 * agency's cap of that, rounded down, less what is outstanding, never below zero, and never above the
 * per-request limit. Pure.
 */
export interface UnpaidShift {
  entryId: string;
  workDate: string;
  minutes: number;
  /** Cents per hour from the rate card in force that day; null when none is in force. */
  payRateCents: number | null;
}

export interface WageAccessRules {
  enabled: boolean;
  /** Share of earned pay that may be accessed, in basis points (5000 = 50%). */
  capBps: number;
  /** Most one request may be, in cents (0 = no limit beyond the cap). */
  maxPerRequestCents: number;
  /** A fee for faster delivery, in cents; the standard delivery is always free (shown with equal weight). */
  expeditedFeeCents: number;
}

export const DEFAULT_WAGE_ACCESS: WageAccessRules = { enabled: false, capBps: 5000, maxPerRequestCents: 0, expeditedFeeCents: 0 };

export interface Outstanding {
  amountCents: number;
  /** The entries the access drew on; it is recovered once they are paid. */
  entryIds: string[];
}

export interface Availability {
  earnedCents: number;
  /** Minutes counted, and minutes left out because no rate card was in force. */
  minutes: number;
  minutesWithoutRate: number;
  capCents: number;
  outstandingCents: number;
  availableCents: number;
  /** The entries this availability rests on (recorded with a request). */
  entryIds: string[];
  /** Why nothing is available, when nothing is. */
  reason: "disabled" | "no_hours" | "used" | null;
}

export function wageAccessAvailability(shifts: UnpaidShift[], outstanding: Outstanding[], rules: WageAccessRules, paidEntryIds: ReadonlySet<string>): Availability {
  let num = 0n;
  let minutes = 0;
  let minutesWithoutRate = 0;
  const entryIds: string[] = [];
  for (const s of shifts) {
    if (s.minutes <= 0) continue;
    if (s.payRateCents === null) {
      minutesWithoutRate += s.minutes;
      continue;
    }
    num += BigInt(s.minutes) * BigInt(s.payRateCents);
    minutes += s.minutes;
    entryIds.push(s.entryId);
  }
  const earnedCents = Number(num / 60n); // rounded down: never more than earned
  const capCents = Number((BigInt(earnedCents) * BigInt(rules.capBps)) / 10_000n);
  // Outstanding while any of the hours it drew on is still unpaid (recovered by the next payroll).
  const outstandingCents = outstanding.filter((o) => o.entryIds.some((id) => !paidEntryIds.has(id))).reduce((t, o) => t + o.amountCents, 0);
  let availableCents = Math.max(0, capCents - outstandingCents);
  if (rules.maxPerRequestCents > 0) availableCents = Math.min(availableCents, rules.maxPerRequestCents);
  if (!rules.enabled) availableCents = 0;
  const reason = !rules.enabled ? "disabled" : earnedCents === 0 ? "no_hours" : availableCents === 0 ? "used" : null;
  return { earnedCents, minutes, minutesWithoutRate, capCents, outstandingCents, availableCents, entryIds: entryIds.sort(), reason };
}

/** A request is allowed only for a whole number of cents from one dollar up to what is available. */
export function requestProblem(amountCents: unknown, availability: Availability): "amount" | "too_much" | "none" | null {
  if (availability.availableCents <= 0) return "none";
  if (typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) || amountCents < 100) return "amount";
  if (amountCents > availability.availableCents) return "too_much";
  return null;
}

/**
 * The run that repays an access: the one that pays the last of the hours it drew on, in pay order —
 * exactly when it stops being outstanding (money review B2). Null while some of its hours are unpaid.
 */
export function recoveringRun(drawn: ReadonlySet<string>, lines: readonly { payRunId: string; timeEntryIds: readonly string[] }[], order: (a: string, b: string) => number): string | null {
  const runs = [...new Set(lines.filter((l) => l.timeEntryIds.some((id) => drawn.has(id))).map((l) => l.payRunId))].sort(order);
  const paid = new Set<string>();
  for (const r of runs) {
    for (const l of lines) if (l.payRunId === r) for (const id of l.timeEntryIds) if (drawn.has(id)) paid.add(id);
    if (paid.size === drawn.size) return r;
  }
  return null;
}
