/**
 * The "passkey added" notice (docs/patterns/_emails/passkey-added.md; decision 0032): in the person's
 * language, the passkey's name and when it was added in the agency's time zone, what to do if it was
 * not them, the link to Your account; no sign-in link in it.
 */
import { describe, expect, it } from "vitest";
import { renderPasskeyAddedEmail } from "./passkey-emails";

const base = { name: "Pat Lee", agencyName: "Cedar Row Staffing (demo)", passkeyName: "Synced passkey", at: new Date("2026-10-16T15:00:00Z"), timeZone: "America/Chicago" };

describe("the passkey added email", () => {
  it("says which passkey was added and when, and what to do if it was not them (English)", () => {
    const mail = renderPasskeyAddedEmail({ ...base, locale: "en", accountLink: "https://app.example/en/settings/account" });
    expect(mail.subject).toBe("A passkey was added to your Shiftbook account");
    const lines = mail.text.split("\n\n");
    expect(lines[0]).toBe("Hello Pat Lee,");
    expect(lines[1]).toMatch(/^A passkey named “Synced passkey” was added to the account you use for Cedar Row Staffing \(demo\) on October 16, 2026 at 10:00/);
    expect(lines[2]).toBe("If you added it, there is nothing to do.");
    expect(lines[3]).toBe("If you did not, open Your account, remove the passkey and change your password, then tell your agency's Owner.");
    expect(lines[4]).toBe("Open Your account: https://app.example/en/settings/account");
    expect(lines[5]).toBe("Sent by Shiftbook on behalf of Cedar Row Staffing (demo).\n");
    expect(mail.html).toContain('<a href="https://app.example/en/settings/account">Open Your account</a>');
    expect(mail.text).not.toMatch(/sbau_/);
  });

  it("in Spanish, with the date the Spanish way", () => {
    const mail = renderPasskeyAddedEmail({ ...base, passkeyName: "Llave de acceso sincronizada", locale: "es", accountLink: "https://app.example/es/settings/account" });
    expect(mail.subject).toBe("Se agregó una llave de acceso a su cuenta de Shiftbook");
    expect(mail.text).toContain("Hola, Pat Lee:");
    expect(mail.text).toContain("«Llave de acceso sincronizada»");
    expect(mail.text).toContain("16 de octubre de 2026");
    expect(mail.text).toContain("Abrir Su cuenta: https://app.example/es/settings/account");
  });

  it("falls back to UTC for an unknown time zone rather than failing", () => {
    const mail = renderPasskeyAddedEmail({ ...base, timeZone: "Not/AZone", locale: "en", accountLink: "https://app.example/en/settings/account" });
    expect(mail.text).toContain("October 16, 2026 at 3:00");
  });
});
