// What a rate card's dated terms put on one shift before the engine runs (drizzle/0062): its shift
// differential, when the shift starts inside the card's window on one of its days, and its
// contractual minimum day. Pure: the engine pays what each shift carries.
import { weekdayOf, type Differential } from "@shiftbook/rules";

export interface RateCardTerms {
  diffName: string | null;
  diffPayCents: number | null;
  diffBillCents: number | null;
  diffStartMinute: number | null;
  diffEndMinute: number | null;
  diffDays: number[];
  contractMinimumMinutes: number | null;
  billsContractMinimum: boolean;
}

/**
 * The differential on a shift that starts at `startMinute` on `date`, or undefined. A window that
 * starts after it ends wraps past midnight (22:00–06:00). A shift whose start time is unknown never
 * gets a windowed differential: the timesheet must say when it started.
 */
export function differentialFor(card: RateCardTerms, date: string, startMinute: number | null): Differential | undefined {
  if (card.diffName === null || card.diffPayCents === null) return undefined;
  if (card.diffDays.length > 0 && !card.diffDays.includes(weekdayOf(date))) return undefined;
  if (card.diffStartMinute !== null && card.diffEndMinute !== null) {
    if (startMinute === null) return undefined;
    const { diffStartMinute: from, diffEndMinute: to } = card;
    const inside = from < to ? startMinute >= from && startMinute < to : startMinute >= from || startMinute < to;
    if (!inside) return undefined;
  }
  return { name: card.diffName, payCentsPerHour: card.diffPayCents, billCentsPerHour: card.diffBillCents ?? 0 };
}

/** The contractual minimum day a card puts on its shifts, if any. */
export function contractTermsOf(card: RateCardTerms): { contractMinimumMinutes?: number; billsContractMinimum?: boolean } {
  return card.contractMinimumMinutes ? { contractMinimumMinutes: card.contractMinimumMinutes, billsContractMinimum: card.billsContractMinimum } : {};
}
