/**
 * The sign-up service's database and mail (decision 0036). Live: Resend (decision 0012), built when a
 * message is sent, so a missing setting is recorded as a failed send rather than a crash. The demo makes
 * no agencies and sends nothing: its pages and actions refuse before this is used.
 */
import { db } from "../db";
import { env } from "../env";
import { ResendTransport } from "../mail/transport";
import type { SignupDeps } from "./signup";

export const signupDeps = (): SignupDeps => ({
  db,
  mail: {
    send: async (mail) => {
      if (env.mode === "demo") throw new Error("The demo sends no sign-up email.");
      return new ResendTransport({ apiKey: process.env.RESEND_API_KEY, fromAddress: process.env.MAIL_FROM }).send(mail);
    },
  },
});
