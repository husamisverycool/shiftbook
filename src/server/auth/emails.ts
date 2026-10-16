/**
 * The invite and password reset emails (docs/patterns/_emails/sign-in-links.md): plain text with a
 * simple HTML copy, in the person's language; the link is the only thing in them that matters, and
 * the copy Shiftbook keeps hides it (service.ts, hideAuthLinks).
 */
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { assemble, type RenderedEmail } from "../approvals/emails";
import type { Role } from "../permissions";

const MESSAGES = { en, es } as const;
type Locale = keyof typeof MESSAGES;
const localeOf = (locale: string): Locale => (locale === "es" ? "es" : "en");
const translator = (locale: Locale) => createTranslator({ locale, messages: MESSAGES[locale], namespace: "authEmail" });

export function renderInviteEmail(link: string, invite: { name: string; agencyName: string; byName: string; role: Role; locale: string; expiresAt: Date }, timeZone: string): RenderedEmail {
  const locale = localeOf(invite.locale);
  const t = translator(locale);
  const roles = createTranslator({ locale, messages: MESSAGES[locale], namespace: "roles" });
  let until: string;
  try {
    until = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone }).format(invite.expiresAt);
  } catch {
    until = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(invite.expiresAt);
  }
  return assemble(t("invite.subject", { by: invite.byName, agency: invite.agencyName }), [
    { text: t("greeting", { name: invite.name }) },
    { text: t("invite.intro", { by: invite.byName, agency: invite.agencyName, role: roles(`${invite.role}.name`) }) },
    { text: roles(`${invite.role}.line`) },
    { link, label: t("invite.open") },
    { text: t("invite.expires", { date: until }) },
    { text: t("invite.unexpected") },
    { text: t("footer", { agency: invite.agencyName }) },
  ]);
}

export function renderResetEmail(link: string, user: { name: string; locale: string; agencyName: string }): RenderedEmail {
  const t = translator(localeOf(user.locale));
  return assemble(t("reset.subject"), [
    { text: t("greeting", { name: user.name }) },
    { text: t("reset.intro", { agency: user.agencyName }) },
    { link, label: t("reset.open") },
    { text: t("reset.expires") },
    { text: t("reset.unexpected") },
    { text: t("footer", { agency: user.agencyName }) },
  ]);
}
