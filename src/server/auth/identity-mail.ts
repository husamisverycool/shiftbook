/** The emails the identity flows send, wired for the app (decision 0033): live mode sends after the response. */
import { after } from "next/server";
import { isDemo } from "../session";
import { renderIdentityLinkedEmail, renderSignInCodeEmail } from "./code-email";
import type { IdentityMail } from "./identities";

export const identityMail = (baseUrl: string): IdentityMail => ({
  code: renderSignInCodeEmail,
  linked: renderIdentityLinkedEmail,
  baseUrl,
  ...(isDemo() ? {} : { later: (job: () => Promise<unknown>) => after(job) }),
});
