/**
 * Decision 0036 in the browser (demo mode), in English and Spanish: "Create an agency" from the sign-in
 * page reaches the sign-up page, which in the demo says the demo uses its own agency and points to
 * "Continue as"; a sign-up link does nothing in the demo; Settings › Billing shows the demo agency as
 * "Active (demo)" and its buttons explain that nothing is charged (no Stripe call, no navigation); the
 * accountant gets the "not for your role" state and no menu item; the webhook does not exist in the demo.
 * Accessibility on every new screen.
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

type Messages = typeof import("../../messages/en.json");
const MESSAGES = { en: JSON.parse(readFileSync("messages/en.json", "utf8")) as Messages, es: JSON.parse(readFileSync("messages/es.json", "utf8")) as Messages };
const LANGS = ["en", "es"] as const;

async function check(page: Page, where: string) {
  // Let toasts finish moving: mid-animation colours are half-transparent.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

async function signedOut(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return context.newPage();
}

for (const lang of LANGS) {
  const m = MESSAGES[lang];

  test(`[${lang}] sign-in → Create an agency: in the demo, the page says no agency is made and leads to Continue as`, async ({ browser }) => {
    const page = await signedOut(browser);
    await page.goto(`/${lang}/sign-in`);
    await expect(page.getByTestId("sign-in-new-here")).toContainText(m.signIn.newHere);
    await page.getByTestId("sign-in-create-agency").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/sign-up$`));
    await expect(page.getByRole("heading", { level: 1, name: m.signUp.title })).toBeVisible();
    await expect(page.getByTestId("sign-up-demo")).toHaveText(m.signUp.demoBody);
    // No form in the demo.
    await expect(page.getByTestId("sign-up-email")).toHaveCount(0);
    await expect(page.getByTestId("sign-up-have-account")).toContainText(m.signUp.haveAccount);
    await check(page, `${lang} sign-up (demo)`);
    await page.getByTestId("sign-up-demo-continue").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/sign-in$`));
    await expect(page.getByTestId("continue-owner")).toBeVisible();
  });

  test(`[${lang}] a sign-up link does nothing in the demo: "This link no longer works"`, async ({ browser }) => {
    const page = await signedOut(browser);
    await page.goto(`/${lang}/sign-up/sbau_${"A".repeat(43)}`);
    await expect(page.getByTestId("sign-up-link-gone")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: m.signUpFinish.expiredTitle })).toBeVisible();
    await check(page, `${lang} sign-up link gone`);
    await page.getByRole("link", { name: m.signUpFinish.startAgain }).click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/sign-up$`));
  });

  test(`[${lang}] Settings › Billing for the demo Owner: Active (demo), nothing charged, the buttons explain and stay`, async ({ page }) => {
    await page.goto(`/${lang}`);
    // The demo agency is always active: no billing banner on Home.
    await expect(page.getByTestId("billing-banner-paused")).toHaveCount(0);
    await page.getByTestId("agency-menu").click();
    await page.getByTestId("menu-billing").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/settings/billing$`));
    await expect(page.getByRole("heading", { level: 1, name: m.billing.title })).toBeVisible();
    await expect(page.getByTestId("billing-status")).toHaveText(m.billing.status.demo);
    await expect(page.getByTestId("billing-state-line")).toHaveText(m.billing.line.demo);
    await expect(page.getByTestId("billing-next-charge")).toHaveText(m.billing.noCharge.demo);
    await check(page, `${lang} billing (demo)`);
    await page.getByTestId("billing-start").click();
    await expect(page.getByText(m.billing.demoPressed).first()).toBeVisible();
    await page.getByTestId("billing-manage").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/settings/billing$`));
    await check(page, `${lang} billing (demo, after pressing)`);
  });

  test(`[${lang}] the accountant: Billing is for the Owner, and the menu does not list it`, async ({ browser }) => {
    const page = await signedOut(browser);
    await page.goto(`/${lang}/sign-in`);
    await page.getByTestId("continue-accountant").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}$`));
    await page.getByTestId("agency-menu").click();
    await expect(page.getByTestId("menu-account")).toBeVisible();
    await expect(page.getByTestId("menu-billing")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.goto(`/${lang}/settings/billing`);
    await expect(page.getByTestId("billing-not-allowed")).toBeVisible();
    await expect(page.getByText(m.billing.notForRoleTitle)).toBeVisible();
    await expect(page.getByTestId("billing-start")).toHaveCount(0);
    await check(page, `${lang} billing (not for the accountant)`);
  });
}

test("the demo has no Stripe webhook (no outside calls, SPEC §18)", async ({ request }) => {
  const r = await request.post("/api/billing/webhook", { data: "{}", headers: { "stripe-signature": "t=1,v1=00" } });
  expect(r.status()).toBe(404);
});
