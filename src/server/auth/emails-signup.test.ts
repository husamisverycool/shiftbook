import { describe, expect, it } from "vitest";
import { renderSignupEmail, renderSignupExistingEmail } from "./emails";

describe("the sign-up emails (docs/patterns/_emails/sign-up.md)", () => {
  it("the link, its limits, in the page's language — and nothing the requester typed", () => {
    const en = renderSignupEmail("https://app.example/en/sign-up/sbau_x", { locale: "en" });
    expect(en.subject).toBe("Finish creating your agency on Granite");
    expect(en.text).toContain("Set your password: https://app.example/en/sign-up/sbau_x");
    expect(en.text).toContain("24 hours");
    const es = renderSignupEmail("https://app.example/es/sign-up/sbau_x", { locale: "es" });
    expect(es.subject).toBe("Termine de crear su agencia en Granite");
    expect(es.html).toContain('<a href="https://app.example/es/sign-up/sbau_x">');
  });

  it("an email that already signs in: the ways back in, no link that creates anything", () => {
    const m = renderSignupExistingEmail({ signIn: "https://app.example/en/sign-in", reset: "https://app.example/en/sign-in/reset" }, { locale: "en" });
    expect(m.subject).toBe("You already have a Granite account");
    expect(m.text).toContain("Sign in: https://app.example/en/sign-in");
    expect(m.text).toContain("Reset your password: https://app.example/en/sign-in/reset");
    expect(m.text).not.toContain("sign-up");
  });
});
