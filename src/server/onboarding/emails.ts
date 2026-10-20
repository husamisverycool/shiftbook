/**
 * The onboarding emails (docs/patterns/_emails/onboarding.md): the welcome, one setup reminder naming the
 * next step, and the free days ending — in the Owner's language, in the shared layout.
 */
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { layout, type RenderedEmail } from "../mail/layout";
import type { SetupStep } from "../home/queries";

const MESSAGES = { en, es } as const;
type Locale = keyof typeof MESSAGES;
const localeOf = (locale: string): Locale => (locale === "es" ? "es" : "en");
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const longDate = (locale: Locale, at: Date, timeZone: string) => {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone }).format(at);
  } catch {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(at);
  }
};

export function renderWelcomeEmail(input: { name: string; locale: string; agencyName: string; trialEndsAt: Date | null; timeZone: string; forwardingAddress: string | null; homeUrl: string }): RenderedEmail {
  const locale = localeOf(input.locale);
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "onboardingEmail.welcome" });
  const next = input.forwardingAddress ? t("nextForward", { address: input.forwardingAddress }) : t("nextConvert");
  return layout(
    t("subject", { agency: input.agencyName }),
    [
      { heading: t("heading", { name: firstName(input.name) }) },
      { text: input.trialEndsAt ? t("readyTrial", { agency: input.agencyName, date: longDate(locale, input.trialEndsAt, input.timeZone) }) : t("ready", { agency: input.agencyName }) },
      { text: next },
      { link: input.homeUrl, label: t("open") },
      { text: t("guide") },
      { footer: t("footer", { agency: input.agencyName }) },
    ],
    { locale, preheader: next },
  );
}

export function renderSetupNudgeEmail(input: { name: string; locale: string; agencyName: string; step: SetupStep; link: string; left: number }): RenderedEmail {
  const locale = localeOf(input.locale);
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "onboardingEmail.nudge" });
  const g = createTranslator({ locale, messages: MESSAGES[locale], namespace: "home.guide.steps" });
  return layout(
    g(`${input.step}.title`),
    [
      { heading: t("heading", { left: input.left }) },
      { text: g(`${input.step}.body`) },
      { link: input.link, label: g(`${input.step}.action`) },
      { text: t("hi", { name: firstName(input.name) }) },
      { footer: t("footer", { agency: input.agencyName }) },
    ],
    { locale, preheader: t("preheader", { left: input.left }) },
  );
}

export function renderTrialEndingEmail(input: { name: string; locale: string; agencyName: string; trialEndsAt: Date; daysLeft: number; timeZone: string; billingUrl: string }): RenderedEmail {
  const locale = localeOf(input.locale);
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "onboardingEmail.trial" });
  const date = longDate(locale, input.trialEndsAt, input.timeZone);
  return layout(
    t("subject", { date }),
    [
      { heading: t("heading", { days: input.daysLeft }) },
      { text: t("body", { agency: input.agencyName, date }) },
      { link: input.billingUrl, label: t("start") },
      { text: t("nothingLost") },
      { footer: t("footer", { agency: input.agencyName }) },
    ],
    { locale, preheader: t("preheader", { date }) },
  );
}
