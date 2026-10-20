import { describe, expect, it } from "vitest";
import { renderSignupEmail, renderSignupExistingEmail } from "./emails";

describe("the sign-up emails (docs/patterns/_emails/sign-up.md)", () => {
  it("the code and the link, their limits, in the page's language — and nothing the requester typed", () => {
    const en = renderSignupEmail("https://app.example/en/sign-up/sbau_x", "482913", { locale: "en" });
    expect(en.subject).toBe("Confirm your email to create your agency");
    // Never the code in the subject or the preview (review L4).
    expect(en.subject).not.toMatch(/\d/);
    expect(en.html).toMatch(/display:none[^>]*>Your code works for one hour/);
    expect(en.text.split("\n\n").slice(0, 3)).toEqual(["Confirm your email address", expect.stringMatching(/^Enter this code/), "482913"]);
    expect(en.text).toContain("Continue sign-up:\nhttps://app.example/en/sign-up/sbau_x");
    expect(en.text).toContain("one hour");
    expect(en.text).toContain("never ask you for this code");
    const es = renderSignupEmail("https://app.example/es/sign-up/sbau_x", "482913", { locale: "es" });
    expect(es.subject).toBe("Confirme su correo para crear su agencia");
    expect(es.html).toContain('href="https://app.example/es/sign-up/sbau_x"');
  });

  it("an email that already signs in: the ways back in, no link that creates anything", () => {
    const m = renderSignupExistingEmail({ signIn: "https://app.example/en/sign-in", reset: "https://app.example/en/sign-in/reset" }, { locale: "en" });
    expect(m.subject).toBe("You already have a Tabulado account");
    expect(m.text).toContain("Sign in:\nhttps://app.example/en/sign-in");
    expect(m.text).toContain("Reset your password:\nhttps://app.example/en/sign-in/reset");
    expect(m.text).not.toContain("sign-up");
  });
});
