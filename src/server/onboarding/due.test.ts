/** When the onboarding emails go (docs/patterns/_emails/onboarding.md): pure rules, no clock of their own. */
import { describe, expect, it } from "vitest";
import { nudgeDue, trialEmailDue } from "./due";

const DAY = 24 * 60 * 60 * 1000;
const created = new Date("2026-10-01T15:00:00Z");
const at = (days: number) => new Date(created.getTime() + days * DAY);

describe("the setup reminder", () => {
  it("first two days after sign-up, then three days after the first; never more than two", () => {
    expect(nudgeDue({ createdAt: created, now: at(1.9), sent: [], stepsLeft: 3 })).toBe(false);
    expect(nudgeDue({ createdAt: created, now: at(2), sent: [], stepsLeft: 3 })).toBe(true);
    expect(nudgeDue({ createdAt: created, now: at(4), sent: [at(2)], stepsLeft: 3 })).toBe(false);
    expect(nudgeDue({ createdAt: created, now: at(5), sent: [at(2)], stepsLeft: 3 })).toBe(true);
    expect(nudgeDue({ createdAt: created, now: at(30), sent: [at(2), at(5)], stepsLeft: 3 })).toBe(false);
  });

  it("never once every step is done, nor for an agency older than 30 days (onboarding is for new agencies)", () => {
    expect(nudgeDue({ createdAt: created, now: at(3), sent: [], stepsLeft: 0 })).toBe(false);
    expect(nudgeDue({ createdAt: created, now: at(31), sent: [], stepsLeft: 3 })).toBe(false);
  });
});

describe("the free days ending", () => {
  const ends = at(30);
  it("7 days before, then 3 days before; once each", () => {
    expect(trialEmailDue({ trialEndsAt: ends, now: at(22.9), lastSentAt: null, subscribed: false })).toBeNull();
    expect(trialEmailDue({ trialEndsAt: ends, now: at(23), lastSentAt: null, subscribed: false })).toEqual({ daysLeft: 7 });
    expect(trialEmailDue({ trialEndsAt: ends, now: at(24), lastSentAt: at(23), subscribed: false })).toBeNull();
    expect(trialEmailDue({ trialEndsAt: ends, now: at(27), lastSentAt: at(23), subscribed: false })).toEqual({ daysLeft: 3 });
    expect(trialEmailDue({ trialEndsAt: ends, now: at(28), lastSentAt: at(27), subscribed: false })).toBeNull();
  });

  it("a short trial gets only the 3-day one; nothing once ended, subscribed, or without free days", () => {
    expect(trialEmailDue({ trialEndsAt: ends, now: at(28), lastSentAt: null, subscribed: false })).toEqual({ daysLeft: 2 });
    expect(trialEmailDue({ trialEndsAt: ends, now: at(28.5), lastSentAt: at(28), subscribed: false })).toBeNull();
    expect(trialEmailDue({ trialEndsAt: ends, now: at(30.1), lastSentAt: null, subscribed: false })).toBeNull();
    expect(trialEmailDue({ trialEndsAt: ends, now: at(23), lastSentAt: null, subscribed: true })).toBeNull();
    expect(trialEmailDue({ trialEndsAt: null, now: at(23), lastSentAt: null, subscribed: false })).toBeNull();
  });
});
