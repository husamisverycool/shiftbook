/** The sign-in service's database and mail (decision 0012: the demo mailbox in demo mode, Resend when live). */
import { db, withAgency } from "../db";
import { env } from "../env";
import { DemoMailboxTransport, ResendTransport } from "../mail/transport";
import type { AuthDeps } from "./service";

export const authDeps = (): AuthDeps => ({
  db,
  mailTransport: (agencyId) => (env.mode === "demo" ? new DemoMailboxTransport(withAgency, agencyId) : new ResendTransport({ apiKey: process.env.RESEND_API_KEY, fromAddress: process.env.MAIL_FROM })),
});
