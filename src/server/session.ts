/**
 * Who is acting, and for which agency (slice k, decision K2): the person whose session the request's
 * cookie names. Anyone without one is sent to sign-in; a person whose role needs the second step (or
 * who has an authenticator) is sent to it until it is passed, or to set one up. Read once per
 * request.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { authDeps } from "./auth/deps";
import { agencyStanding } from "./billing/service";
import { db } from "./db";
import { confirmMethodOf, mustConfirm, nextStep, readSession, SESSION_COOKIE, type SessionInfo } from "./auth/service";
import { env } from "./env";
import { NotAllowedError } from "./errors";
import { can, pausedWhenUnpaid, type Ability, type Role } from "./permissions";

export interface Actor {
  agencyId: string;
  userId: string;
  label: string;
  role: Role;
  /** Set for a signed-in person (absent in tests and scripts that act directly). */
  sessionId?: string;
  demo?: boolean;
}

export class NotSignedInError extends Error {
  constructor() {
    super("Not signed in.");
    this.name = "NotSignedInError";
  }
}

const session = cache(async (): Promise<SessionInfo | null> => readSession(authDeps(), (await cookies()).get(SESSION_COOKIE)?.value));

/** The signed-in person's session, or null (the sign-in pages use it). */
export const currentSession = () => session();

async function localeOr(fallback: string): Promise<string> {
  try {
    return await getLocale();
  } catch {
    return fallback;
  }
}

/** A demo person is always marked as one in the log and on screens. */
export const labelOf = (info: Pick<SessionInfo, "name" | "demo">) => (info.demo && !info.name.endsWith("(demo)") ? `${info.name} (demo)` : info.name);

export const actorOf = (info: SessionInfo): Actor => ({ agencyId: info.agencyId, userId: info.userId, label: labelOf(info), role: info.role, sessionId: info.sessionId, demo: info.demo });

/**
 * The signed-in person, or a redirect: to sign-in, to the code, or (unless `stage` is "setup") to
 * set up an authenticator their role needs.
 */
export async function currentActor(stage: "app" | "setup" = "app"): Promise<Actor> {
  const info = await session();
  const locale = await localeOr(info?.locale ?? "en");
  // A cookie whose session ended (timed out, signed out elsewhere, suspended) says so on the sign-in page.
  if (!info) redirect(`/${locale}/sign-in${(await cookies()).has(SESSION_COOKIE) ? "?notice=expired" : ""}`);
  const step = nextStep(info);
  if (step === "code") redirect(`/${locale}/sign-in/code`);
  if (step === "setup" && stage !== "setup") redirect(`/${locale}/sign-in/setup`);
  return actorOf(info);
}

/** The agency's standing (decision 0036): the demo, its billing row, whether it may change things. Read once per request. */
export const agencyStandingNow = cache((agencyId: string) => agencyStanding({ db }, agencyId));

/** Whether the agency's changes are paused because its subscription is not active (decision 0036). */
export async function changesPaused(actor: Pick<Actor, "agencyId">): Promise<boolean> {
  return !(await agencyStandingNow(actor.agencyId)).standing.changes;
}

/**
 * The signed-in person, when their role may do this (decision K4); every server action that changes
 * something asks first. While the agency's subscription is not active (decision 0036), a change is
 * not made: the person is sent to Home, whose banner says why and points the Owner to Billing (the
 * screens hide such changes already; this meets a page left open, or a hand-made request).
 */
export async function actorAllowedTo(ability: Ability): Promise<Actor> {
  const actor = await currentActor();
  if (!can(actor, ability)) throw new NotAllowedError();
  if (pausedWhenUnpaid(ability) && (await changesPaused(actor))) redirect(`/${await localeOr("en")}?notice=changes_paused`);
  return actor;
}

/** Whether the signed-in person must confirm it's them before a sensitive change (decision 0025; GitHub's sudo mode). */
export async function mustConfirmNow(): Promise<boolean> {
  const info = await session();
  return info ? mustConfirm(authDeps(), info) : true;
}

/** What they confirm with: a code (when they have an authenticator), their password, or (with neither) an emailed code. */
export async function confirmWith(): Promise<"code" | "password" | "email"> {
  const info = await session();
  return info ? confirmMethodOf(authDeps(), info) : "password";
}

export const isDemo = () => env.mode === "demo";
