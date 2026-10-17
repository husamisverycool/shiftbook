/**
 * The client portal's email (docs/patterns/_emails/portal-link.md): plain text with a simple HTML
 * copy, in the contact's language; the one link, nothing loaded from other sites, no tracking.
 */
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { assemble, type EmailAgency, type RenderedEmail } from "../approvals/emails";
import type { ApprovalLocale } from "../db/schema";

const MESSAGES = { en, es } as const;

export interface PortalEmailInput {
  locale: ApprovalLocale;
  agency: EmailAgency;
  clientName: string;
  contactName: string;
  link: string;
  expiresAt: Date;
}

export function renderPortalEmail(input: PortalEmailInput): RenderedEmail {
  const t = createTranslator({ locale: input.locale, messages: MESSAGES[input.locale], namespace: "portalEmail" });
  const expires = new Intl.DateTimeFormat(input.locale, { dateStyle: "long", timeStyle: "short", timeZone: input.agency.timeZone }).format(input.expiresAt);
  const contact = [input.agency.phone, input.agency.email].filter((v): v is string => Boolean(v)).join(", ");
  return assemble(t("subject", { agency: input.agency.name }), [
    { text: t("greeting", { name: input.contactName }) },
    { text: t("body", { agency: input.agency.name, client: input.clientName }) },
    { link: input.link, label: t("button") },
    { text: t("expires", { when: expires }) },
    { text: t("private") },
    ...(contact ? [{ text: t("questions", { agency: input.agency.name, contact }) }] : []),
  ]);
}
