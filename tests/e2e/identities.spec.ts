/**
 * Decision 0033 in the browser, in English and Spanish: Continue with Google through the demo's
 * stand-in (Lena, a coordinator, straight in as a demo person); Continue with Microsoft with an
 * address no member has (refused, with the notice); SSO for the demo agency; an emailed code read
 * from the demo mailbox; Your account › Connected accounts (connect, disconnect); the SSO settings;
 * an invite accepted with a provider account. Accessibility on every new screen.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

type Messages = typeof import("../../messages/en.json");
const MESSAGES = { en: JSON.parse(readFileSync("messages/en.json", "utf8")) as Messages, es: JSON.parse(readFileSync("messages/es.json", "utf8")) as Messages };
const LANGS = ["en", "es"] as const;
const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

async function signedOut(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return context.newPage();
}

test.beforeAll(() => {
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
});

for (const lang of LANGS) {
  const m = MESSAGES[lang];

  test(`[${lang}] Continue with Google: the demo's stand-in, choose Lena (coordinator), and in`, async ({ browser }) => {
    const page = await signedOut(browser);
    await page.goto(`/${lang}/sign-in`);
    await page.getByTestId("sign-in-google").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/sign-in/demo-provider/google\\?request=`));
    await expect(page.getByRole("heading", { level: 1, name: fill(m.identities.demo.title, { provider: "Google" }) })).toBeVisible();
    await check(page, `${lang} demo provider`);
    await page.getByTestId("demo-account-lena@cedarrow.example.com").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}$`));
    await page.getByTestId("agency-menu").click();
    await expect(page.getByTestId("menu-person")).toHaveText(`Lena Ortiz (demo) · ${m.roles.coordinator.name}`);
  });

  test(`[${lang}] Continue with Microsoft with an address no member has: refused, with the notice`, async ({ browser }) => {
    const page = await signedOut(browser);
    await page.goto(`/${lang}/sign-in`);
    await page.getByTestId("sign-in-microsoft").click();
    await expect(page.getByRole("heading", { level: 1, name: fill(m.identities.demo.title, { provider: "Microsoft" }) })).toBeVisible();
    await page.getByTestId("demo-account-not.a.member@example.com").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/sign-in\\?notice=no_account$`));
    await expect(page.getByTestId("sign-in-notice")).toHaveText(m.signIn.notice.no_account);
    await check(page, `${lang} sign-in with a notice`);
    // Cancelling at the provider comes back with its own notice.
    await page.getByTestId("sign-in-microsoft").click();
    await page.getByTestId("demo-provider-cancel").click();
    await expect(page.getByTestId("sign-in-notice")).toHaveText(m.signIn.notice.provider_failed);
  });

  test(`[${lang}] SSO: an email with none set up is told so; the demo agency's member goes through its provider and in`, async ({ browser }) => {
    const page = await signedOut(browser);
    await page.goto(`/${lang}/sign-in`);
    await page.getByTestId("sign-in-sso").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/sign-in/sso$`));
    await expect(page.getByRole("heading", { level: 1, name: m.sso.signIn.title })).toBeVisible();
    await check(page, `${lang} sso sign-in`);
    await page.getByTestId("sso-email").fill("nobody@example.com");
    await page.getByTestId("sso-continue").click();
    await expect(page.getByTestId("sso-error")).toContainText(m.sso.signIn.notSetUp);
    await check(page, `${lang} sso not set up`);
    await page.getByTestId("sso-email").fill("owner@cedarrow.example.com");
    await page.getByTestId("sso-continue").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/sign-in/demo-provider/sso\\?request=`));
    await expect(page.getByRole("heading", { level: 1, name: fill(m.identities.demo.title, { provider: m.identities.demo.providerNames.sso }) })).toBeVisible();
    await page.getByTestId("demo-account-owner@cedarrow.example.com").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}$`));
    await page.getByTestId("agency-menu").click();
    await expect(page.getByTestId("menu-person")).toHaveText(`Demo Owner (demo) · ${m.roles.owner.name}`);
  });

  test(`[${lang}] an emailed sign-in code, read from the demo mailbox, signs in (a wrong one first)`, async ({ browser }) => {
    const who = lang === "en" ? "billing@cedarrow.example.com" : "accountant@cedarrow.example.com";
    const page = await signedOut(browser);
    await page.goto(`/${lang}/sign-in`);
    await page.getByTestId("sign-in-email-code").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/sign-in/email$`));
    await expect(page.getByRole("heading", { level: 1, name: m.emailCode.title })).toBeVisible();
    await check(page, `${lang} email code`);
    await page.getByTestId("code-email").fill(who);
    await page.getByTestId("code-send").click();
    await expect(page.getByRole("heading", { level: 1, name: m.emailCode.sentTitle })).toBeVisible();
    const copy = (await page.getByTestId("demo-code-text").textContent()) ?? "";
    const code = /\b(\d{6})\b/.exec(copy)![1]!;
    await check(page, `${lang} email code sent`);
    await page.getByTestId("email-code").fill(code === "000000" ? "111111" : "000000");
    await expect(page.getByTestId("email-code-error")).toHaveText(m.emailCode.invalid);
    await page.getByTestId("email-code").fill(code);
    await expect(page).toHaveURL(new RegExp(`/${lang}$`));
  });

  test(`[${lang}] Your account › Connected accounts: connect Google through the stand-in, then disconnect`, async ({ page }) => {
    await page.goto(`/${lang}/settings/account`);
    const section = page.getByTestId("connected-accounts");
    await expect(section.getByRole("heading", { level: 2, name: m.identities.connectedTitle })).toBeVisible();
    await expect(page.getByTestId("connected-google-state")).toHaveText(m.identities.notConnected);
    await check(page, `${lang} account with connected accounts`);
    await page.getByTestId("connect-google").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/sign-in/demo-provider/google\\?request=`));
    await page.getByTestId("demo-account-owner@cedarrow.example.com").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/settings/account`));
    await expect(page.getByText(fill(m.identities.result.connected, { provider: "Google" }))).toBeVisible();
    await expect(page.getByTestId("connected-google-state")).toContainText("owner@cedarrow.example.com");
    await page.getByTestId("disconnect-google").click();
    await check(page, `${lang} disconnect dialog`);
    await page.getByTestId("disconnect-google-confirm").click();
    await expect(page.getByText(fill(m.identities.result.disconnected, { provider: "Google" }))).toBeVisible();
    await expect(page.getByTestId("connected-google-state")).toHaveText(m.identities.notConnected);
  });

  test(`[${lang}] Settings › Single sign-on: the Owner sees it on, cannot point the demo elsewhere, turns it off and on`, async ({ page }) => {
    await page.goto(`/${lang}/settings/sso`);
    await expect(page.getByRole("heading", { level: 1, name: m.sso.settings.title })).toBeVisible();
    await expect(page.getByTestId("sso-status")).toHaveText(m.sso.settings.on);
    await expect(page.getByTestId("sso-redirect")).toHaveValue(/\/api\/auth\/oidc\/sso\/callback$/);
    await expect(page.getByTestId("sso-secret-set")).toBeVisible();
    await check(page, `${lang} sso settings`);
    await page.getByTestId("sso-issuer").fill("https://idp.example.com");
    await page.getByTestId("sso-save").click();
    await expect(page.getByTestId("sso-issuer-error")).toHaveText(m.sso.settings.errors.demo_issuer_only);
    await page.getByTestId("sso-enabled").click();
    await expect(page.getByTestId("sso-status")).toHaveText(m.sso.settings.off);
    await page.getByTestId("sso-enabled").click();
    await expect(page.getByTestId("sso-status")).toHaveText(m.sso.settings.on);
  });
}

test("an invite accepted with a provider account: only the invited email joins", async ({ page, browser }) => {
  const m = MESSAGES.en;
  // The Owner invites the address the stand-in offers as "not a member".
  await page.goto("/en/settings/members");
  await page.getByTestId("invite-member").click();
  await page.getByTestId("invite-name").fill("Avery Quinn");
  await page.getByTestId("invite-email").fill("not.a.member@example.com");
  await page.getByTestId("role-billing").check();
  await page.getByTestId("send-invite").click();
  const link = await page.getByTestId("demo-invite-copy").getByTestId("email-link").getAttribute("href");
  await page.keyboard.press("Escape");

  const guest = await signedOut(browser);
  await guest.goto(link!);
  await expect(guest.getByTestId("join-google")).toBeVisible();
  await check(guest, "invite with providers");
  // Another account's email: refused, with the notice.
  await guest.getByTestId("join-google").click();
  await guest.getByTestId("demo-account-lena@cedarrow.example.com").click();
  await expect(guest.getByTestId("invite-notice")).toHaveText(fill(m.identities.inviteNotice.email_mismatch, { email: "not.a.member@example.com" }));
  // The invited email: joined and in.
  await guest.getByTestId("join-microsoft").click();
  await guest.getByTestId("demo-account-not.a.member@example.com").click();
  await expect(guest).toHaveURL(/\/en$/);
  await guest.getByTestId("agency-menu").click();
  await expect(guest.getByTestId("menu-person")).toHaveText(`Avery Quinn · ${m.roles.billing.name}`);
});
