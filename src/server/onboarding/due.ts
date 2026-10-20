/**
 * When the onboarding emails go (docs/patterns/_emails/onboarding.md) — pure, given the clock.
 * The setup reminder: two days after sign-up, then once more three days later, only while a step of
 * "Finish setting up" is undone (Loops' and Userpilot's rules). The free days ending: 7 days before and
 * 3 days before (Stripe Billing's trial reminders), never once subscribed or ended.
 */
const DAY = 24 * 60 * 60 * 1000;
const NUDGE_FIRST_DAYS = 2;
const NUDGE_GAP_DAYS = 3;
const NUDGE_MAX = 2;
/** Reminders are for new agencies: none after their first 30 days. */
const NUDGE_WINDOW_DAYS = 30;
const TRIAL_NOTICES_DAYS = [7, 3] as const;

export function nudgeDue(input: { createdAt: Date; now: Date; sent: Date[]; stepsLeft: number }): boolean {
  if (input.stepsLeft === 0 || input.sent.length >= NUDGE_MAX) return false;
  if (input.now.getTime() - input.createdAt.getTime() > NUDGE_WINDOW_DAYS * DAY) return false;
  const last = input.sent.reduce<Date | null>((a, b) => (!a || b > a ? b : a), null);
  const from = last ? last.getTime() + NUDGE_GAP_DAYS * DAY : input.createdAt.getTime() + NUDGE_FIRST_DAYS * DAY;
  return input.now.getTime() >= from;
}

/** Due when the latest notice day passed since the last one sent (a short trial gets only the last). */
export function trialEmailDue(input: { trialEndsAt: Date | null; now: Date; lastSentAt: Date | null; subscribed: boolean }): { daysLeft: number } | null {
  if (!input.trialEndsAt || input.subscribed) return null;
  const left = input.trialEndsAt.getTime() - input.now.getTime();
  if (left <= 0) return null;
  const crossed = TRIAL_NOTICES_DAYS.filter((d) => left <= d * DAY);
  if (crossed.length === 0) return null;
  const crossedAt = input.trialEndsAt.getTime() - Math.min(...crossed) * DAY;
  if (input.lastSentAt && input.lastSentAt.getTime() >= crossedAt) return null;
  return { daysLeft: Math.ceil(left / DAY) };
}
