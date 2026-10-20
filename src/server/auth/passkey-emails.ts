/**
 * The "passkey added" notice (docs/patterns/_emails/passkey-added.md; decision 0032; GitHub's security
 * notice when a passkey is added to an account): which passkey, when (in the agency's time zone), what
 * to do if it was not them, the link to Your account. Plain text with a simple HTML copy; no sign-in
 * link in it.
 */
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { assemble, type RenderedEmail } from "../approvals/emails";

const MESSAGES = { en, es } as const;

/** "October 16, 2026 at 10:00 AM" in the agency's time zone (UTC when the zone is unknown). */
function whenIn(locale: "en" | "es", at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone }).format(at);
  } catch {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(at);
  }
}

export function renderPasskeyAddedEmail(input: { name: string; locale: string; agencyName: string; passkeyName: string; at: Date; timeZone: string; accountLink: string }): RenderedEmail {
  const locale = input.locale === "es" ? "es" : "en";
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "passkeys.email" });
  return assemble(t("subject"), [
    { text: t("greeting", { name: input.name }) },
    { text: t("intro", { passkey: input.passkeyName, agency: input.agencyName, when: whenIn(locale, input.at, input.timeZone) }) },
    { text: t("ifYou") },
    { text: t("ifNot") },
    { link: input.accountLink, label: t("open") },
    { footer: t("footer", { agency: input.agencyName }) },
  ], { locale });
}
