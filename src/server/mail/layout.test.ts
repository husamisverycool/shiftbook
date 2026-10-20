/** The layout every email shares (docs/patterns/_emails/layout.md). */
import { describe, expect, it } from "vitest";
import { layout } from "./layout";

describe("the email layout", () => {
  const mail = layout("Your code", [{ text: "Hello <b>Dana</b>," }, { code: "482 913" }, { link: "https://app.example/x?a=1&b=2", label: "Continue" }, { link: "https://app.example/help", label: "Help" }, { footer: "Sent by Tabulado." }], { preheader: "Use it within 15 minutes", locale: "es" });

  it("puts the preheader first, hidden, for the inbox preview", () => {
    expect(mail.html).toMatch(/<body[^>]*><div style="display:none[^"]*">Use it within 15 minutes/);
  });

  it("makes the first link the button, writes its address under it in the reader's language, and keeps later links plain", () => {
    expect(mail.html).toContain('class="tb-button" href="https://app.example/x?a=1&amp;b=2"');
    expect(mail.html).toContain("O copie este enlace en su navegador:");
    expect(mail.html).toMatch(/<a href="https:\/\/app\.example\/help" style="[^"]*underline">Help<\/a>/);
  });

  it("sets the code apart and escapes what it is given", () => {
    expect(mail.html).toContain(">482 913</p>");
    expect(mail.html).toContain("Hello &lt;b&gt;Dana&lt;/b&gt;,");
  });

  it("follows the reader's dark setting where the mail program allows it", () => {
    expect(mail.html).toContain('<meta name="color-scheme" content="light dark">');
    expect(mail.html).toContain("@media (prefers-color-scheme:dark)");
  });

  it("says the same in plain text, each link on its own line, the footer after a rule", () => {
    expect(mail.text).toBe("Hello <b>Dana</b>,\n\n482 913\n\nContinue:\nhttps://app.example/x?a=1&b=2\n\nHelp:\nhttps://app.example/help\n\n--\nSent by Tabulado.\n");
  });

  it("refuses a link that is not a web address", () => {
    expect(() => layout("x", [{ link: "javascript:alert(1)", label: "x" }])).toThrow(/web address/);
  });

  it("loads nothing from other sites", () => {
    expect(mail.html).not.toMatch(/<img|src=|url\(/);
  });
});
