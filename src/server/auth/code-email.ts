/**
 * The emails of decision 0033, in the person's language, plain text with a simple HTML copy:
 * - the code email (docs/patterns/_emails/sign-in-code.md): to sign in, to finish connecting an
 *   outside account, or to confirm it's them; never the code in the subject, and a line saying never
 *   to share it (review L4); the copy Tabulado keeps hides the code (identities.ts, hideEmailCode);
 * - the notice that an outside account was connected (docs/patterns/_emails/identity-linked.md;
 *   GitHub's "added to your account" security notice; review H2c).
 */
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { assemble, type RenderedEmail } from "../approvals/emails";
import type { CodePurpose } from "./identities";
import type { ProviderId } from "./oidc";

const MESSAGES = { en, es } as const;
const localeOf = (locale: string) => (locale === "es" ? "es" : "en");
/** Google's and Microsoft's own names; an agency's SSO has its own wording (no name to put in). */
const providerName = (locale: "en" | "es", provider: "google" | "microsoft") => createTranslator({ locale, messages: MESSAGES[locale], namespace: "identities.mail" })(`providers.${provider}`);

export function renderSignInCodeEmail(code: string, user: { name: string; locale: string; agencyName: string }, context: { purpose: CodePurpose; provider?: ProviderId } = { purpose: "sign_in" }): RenderedEmail {
  const locale = localeOf(user.locale);
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "emailCode.mail" });
  const sso = context.provider === "sso";
  const provider = context.provider && context.provider !== "sso" ? providerName(locale, context.provider) : "";
  const subject = context.purpose === "link" ? (sso ? t("subjectLinkSso") : t("subjectLink", { provider })) : context.purpose === "confirm" ? t("subjectConfirm") : t("subject");
  const intro =
    context.purpose === "link" ? (sso ? t("introLinkSso", { agency: user.agencyName }) : t("introLink", { provider, agency: user.agencyName })) : context.purpose === "confirm" ? t("introConfirm", { agency: user.agencyName }) : t("intro", { agency: user.agencyName });
  return assemble(subject, [
    { text: t("greeting", { name: user.name }) },
    { text: intro },
    { code },
    { text: t("expires") },
    { text: t("never") },
    { text: t("unexpected") },
    { footer: t("footer", { agency: user.agencyName }) },
  ], { locale });
}

export function renderIdentityLinkedEmail(input: { provider: ProviderId; providerEmail: string | null; name: string; locale: string; agencyName: string; accountUrl: string; at: Date }): RenderedEmail {
  const locale = localeOf(input.locale);
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "identities.mail" });
  const when = `${new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(input.at)} UTC`;
  const agency = input.agencyName;
  const sso = input.provider === "sso";
  const provider = input.provider === "sso" ? "" : providerName(locale, input.provider);
  const body = sso
    ? input.providerEmail
      ? t("bodySso", { email: input.providerEmail, agency })
      : t("bodyNoEmailSso", { agency })
    : input.providerEmail
      ? t("body", { provider, email: input.providerEmail, agency })
      : t("bodyNoEmail", { provider, agency });
  return assemble(sso ? t("subjectSso") : t("subject", { provider }), [
    { text: t("greeting", { name: input.name }) },
    { text: body },
    { text: t("when", { date: when }) },
    { link: input.accountUrl, label: t("review") },
    { text: t("unexpected") },
    { footer: t("footer", { agency: input.agencyName }) },
  ], { locale });
}
