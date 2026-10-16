/**
 * What each role may change (slice k, decision K4; SPEC §2). One table: every server action checks
 * it before it does anything, and every screen reads it to hide what the person cannot do. Reading
 * is open to every role except the margin (the Owner and the accountant) and whole SSNs (the Owner,
 * with a reason). The services keep their own finer checks too (a compliance duty names the roles
 * that act on it; only the Owner changes compliance settings).
 *
 * Pure: no database, so screens and tests can use it.
 */
export const ROLES = ["owner", "coordinator", "billing", "accountant"] as const;
export type Role = (typeof ROLES)[number];

export const ABILITIES = {
  /** Timesheets in, the review grid, client approval of hours, the run's totals. */
  hours: ["owner", "coordinator"],
  /** Approving or reopening a weekly run, the payroll files, corrections, which clients must approve first. */
  run: ["owner"],
  /** Job orders, rate cards, placements, placement import, recruiters. */
  placements: ["owner", "coordinator"],
  /** A client's billing details. */
  clientBilling: ["owner", "billing"],
  /** Payments, credits, write-offs, short-pays, reminders, the bank file. */
  cash: ["owner", "billing"],
  /** Compliance duties (each duty also names the roles that act on it). */
  compliance: ["owner", "coordinator", "billing"],
  /** Payroll, margin and compliance settings. */
  settings: ["owner"],
  /** Invites, roles and suspensions. */
  members: ["owner"],
  /** The margin pages (reading). */
  viewMargin: ["owner", "accountant"],
} as const satisfies Record<string, readonly Role[]>;
export type Ability = keyof typeof ABILITIES;

export const can = (who: { role: Role }, ability: Ability): boolean => (ABILITIES[ability] as readonly Role[]).includes(who.role);

/** True for a role that changes nothing at all (the outside accountant). */
export const readsOnly = (who: { role: Role }): boolean => !(Object.keys(ABILITIES) as Ability[]).some((a) => a !== "viewMargin" && can(who, a));

/** Every ability as yes or no, for the screens (they hide what the role cannot change). */
export const abilitiesOf = (who: { role: Role }): Record<Ability, boolean> => Object.fromEntries((Object.keys(ABILITIES) as Ability[]).map((a) => [a, can(who, a)])) as Record<Ability, boolean>;
