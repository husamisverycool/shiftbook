/**
 * What each role may change (slice k, decision K4; SPEC §2). One table: every server action checks
 * it before it does anything, and every screen reads it to hide what the person cannot do. Reading
 * is open to every role except the margin and the whole activity log (the Owner and the accountant)
 * and whole SSNs (the Owner, with a reason). The services keep their own finer checks too (a
 * compliance duty names the roles that act on it; only the Owner changes compliance settings).
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
  /** The worker roster: a worker's details, payroll numbers, documents, an SSN entered, employment (slice k). */
  workers: ["owner", "coordinator"],
  /** A whole SSN on screen, with a reason, every time recorded (SPEC §2, §17). */
  revealSsn: ["owner"],
  /** The margin pages (reading). */
  viewMargin: ["owner", "accountant"],
  /** The agency's whole activity log (reading; decision 0028). */
  viewActivity: ["owner", "accountant"],
  /** The agency's subscription to Granite: Stripe's checkout and billing pages (decision 0036). */
  billing: ["owner"],
  /** Partner handoffs — payroll payloads, wage access, invoice funding, the broker's export — and their rules (slice w). */
  money: ["owner"],
} as const satisfies Record<string, readonly Role[]>;
export type Ability = keyof typeof ABILITIES;

export const can = (who: { role: Role }, ability: Ability): boolean => (ABILITIES[ability] as readonly Role[]).includes(who.role);

/** What is only read: the abilities that change nothing. */
const READING: Ability[] = ["viewMargin", "viewActivity"];

/** True for a role that changes nothing at all (the outside accountant). */
export const readsOnly = (who: { role: Role }): boolean => !(Object.keys(ABILITIES) as Ability[]).some((a) => !READING.includes(a) && can(who, a));

/**
 * What stays possible while the agency's subscription is not active (decision 0036): reading, the
 * Owner's audited SSN look-up (a reading), and billing itself (to start paying again). Everything else
 * changes the agency's records and is paused.
 */
const WHILE_PAUSED: Ability[] = [...READING, "revealSsn", "billing"];

/** Whether an ability is paused while the agency's subscription is not active. */
export const pausedWhenUnpaid = (ability: Ability): boolean => !WHILE_PAUSED.includes(ability);

/**
 * Every ability as yes or no, for the screens (they hide what the role cannot change). While changes
 * are paused (decision 0036), the screens hide every change as they do for the accountant.
 */
export const abilitiesOf = (who: { role: Role }, opts: { changesPaused?: boolean } = {}): Record<Ability, boolean> =>
  Object.fromEntries((Object.keys(ABILITIES) as Ability[]).map((a) => [a, can(who, a) && !(opts.changesPaused && pausedWhenUnpaid(a))])) as Record<Ability, boolean>;

/** Whether `to` has fewer rights than `from`: everything `to` may do, `from` may already, and less (decision 0036). */
export const fewerRights = (from: Role, to: Role): boolean => {
  const ofFrom = (Object.keys(ABILITIES) as Ability[]).filter((a) => can({ role: from }, a));
  const ofTo = (Object.keys(ABILITIES) as Ability[]).filter((a) => can({ role: to }, a));
  return ofTo.every((a) => ofFrom.includes(a)) && ofTo.length < ofFrom.length;
};

/** A change to the agency's people or its single sign-on (the "members" ability). */
export type MemberChange =
  | { kind: "invite" }
  | { kind: "resend_invite" }
  | { kind: "cancel_invite" }
  | { kind: "suspend" }
  | { kind: "restore" }
  | { kind: "role"; from: Role; to: Role }
  /** A role change the service makes only when the new role has fewer rights (changeRole's onlyFewerRights). */
  | { kind: "role_lowered_only" }
  | { kind: "sso"; enabled: boolean }
  | { kind: "sso_settings" };

/**
 * While the agency's changes are paused (decision 0036; security review), what only takes access away
 * still works — suspending someone, cancelling an invite, a role with fewer rights, single sign-on off —
 * so an Owner can always remove a person's access. Everything that grants access stays paused.
 */
export function allowedWhilePaused(change: MemberChange): boolean {
  switch (change.kind) {
    case "suspend":
    case "cancel_invite":
    case "role_lowered_only":
      return true;
    case "role":
      return fewerRights(change.from, change.to);
    case "sso":
      return !change.enabled;
    default:
      return false;
  }
}
