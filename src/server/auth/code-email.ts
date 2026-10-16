/**
 * The sign-in code email (docs/patterns/_emails/sign-in-code.md, decision 0033): plain text with a
 * simple HTML copy, in the person's language; the copy Shiftbook keeps hides the code
 * (identities.ts, hideEmailCode).
 */
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { assemble, type RenderedEmail } from "../approvals/emails";

const MESSAGES = { en, es } as const;

export function renderSignInCodeEmail(code: string, user: { name: string; locale: string; agencyName: string }): RenderedEmail {
  const locale = user.locale === "es" ? "es" : "en";
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "emailCode.mail" });
  return assemble(t("subject", { code }), [
    { text: t("greeting", { name: user.name }) },
    { text: t("intro", { agency: user.agencyName }) },
    { text: code },
    { text: t("expires") },
    { text: t("unexpected") },
    { text: t("footer", { agency: user.agencyName }) },
  ]);
}
