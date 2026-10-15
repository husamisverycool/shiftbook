/**
 * Who is acting, and for which agency. Slice (a) has no login yet (slice k adds sign-in, roles and
 * MFA), so the app runs only in demo mode as the demo agency's Owner. In live mode it refuses to run.
 */
import { DEMO_AGENCY, DEMO_OWNER } from "./demo/dataset";
import { env } from "./env";

export interface Actor {
  agencyId: string;
  userId: string;
  label: string;
  role: "owner" | "coordinator" | "billing" | "accountant";
}

export class NotSignedInError extends Error {
  constructor() {
    super("Sign-in is not available yet; this version runs in demo mode only.");
    this.name = "NotSignedInError";
  }
}

export function currentActor(): Actor {
  if (env.mode !== "demo") throw new NotSignedInError();
  return { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: `${DEMO_OWNER.name} (demo)`, role: DEMO_OWNER.role };
}

export const isDemo = () => env.mode === "demo";
