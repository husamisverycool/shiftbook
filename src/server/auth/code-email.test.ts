/**
 * The emails of decision 0033 after its security review (L4, H2c): the code is never in the subject,
 * the email says never to share it, and each purpose and provider reads properly in both languages.
 */
import { describe, expect, it } from "vitest";
import { renderIdentityLinkedEmail, renderSignInCodeEmail } from "./code-email";

const lena = { name: "Lena Ortiz (demo)", locale: "en", agencyName: "Cedar Row Staffing (demo)" };

describe("the code email", () => {
  it("never puts the code in the subject, and says never to share it", () => {
    for (const purpose of ["sign_in", "link", "confirm"] as const)
      for (const provider of [undefined, "google", "sso"] as const)
        for (const locale of ["en", "es"]) {
          const mail = renderSignInCodeEmail("482913", { ...lena, locale }, { purpose, provider });
          expect(mail.subject).not.toContain("482913");
          expect(mail.text).toContain("482913");
          expect(mail.text).toMatch(locale === "en" ? /Never share this code/ : /Nunca comparta este código/);
        }
  });

  it("names Google or Microsoft, and words an agency's SSO as its own", () => {
    expect(renderSignInCodeEmail("482913", lena, { purpose: "link", provider: "google" }).text).toContain("connecting a Google account");
    expect(renderSignInCodeEmail("482913", lena, { purpose: "link", provider: "sso" }).text).toContain("connecting your agency's single sign-on (SSO) account");
    expect(renderSignInCodeEmail("482913", { ...lena, locale: "es" }, { purpose: "link", provider: "sso" }).subject).toBe("Confirme la conexión del inicio de sesión único (SSO) con Granite");
  });
});

describe("the account-connected notice", () => {
  it("says what was connected, when, and where to review it", () => {
    const mail = renderIdentityLinkedEmail({ provider: "microsoft", providerEmail: "lena@cedarrow.example.com", ...lena, accountUrl: "https://app.example/en/settings/account", at: new Date("2026-10-17T09:30:00Z") });
    expect(mail.subject).toBe("Microsoft was connected to your Granite account");
    expect(mail.text).toContain("The Microsoft account lena@cedarrow.example.com can now sign you in to Cedar Row Staffing (demo) on Granite.");
    expect(mail.text).toContain("October 17, 2026");
    expect(mail.text).toContain("https://app.example/en/settings/account");
    const sso = renderIdentityLinkedEmail({ provider: "sso", providerEmail: null, ...lena, locale: "es", accountUrl: "https://app.example/es/settings/account", at: new Date("2026-10-17T09:30:00Z") });
    expect(sso.subject).toBe("El inicio de sesión único (SSO) se conectó a su cuenta de Granite");
  });
});
