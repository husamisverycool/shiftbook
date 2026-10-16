/**
 * Passkeys in the browser (decision 0032), with Chromium's virtual authenticator standing in for the
 * device (DevTools WebAuthn domain: CTAP2, internal, resident keys, user verification): the demo
 * coordinator adds a passkey on Your account, signs out, signs in with the "Passkey" tile and lands
 * where she was going, with no code; a closed prompt says nothing; a removed passkey is refused.
 * Accessibility of the account page and the sign-in page, in English and Spanish.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type CDPSession, type Page } from "@playwright/test";

type Messages = typeof import("../../messages/en.json");
const MESSAGES = {
  en: JSON.parse(readFileSync("messages/en.json", "utf8")) as Messages,
  es: JSON.parse(readFileSync("messages/es.json", "utf8")) as Messages,
};

async function check(page: Page, where: string) {
  // Let toasts and dialogs finish moving: mid-animation colours are half-transparent.
  await page.waitForFunction(() => document.title.length > 0 && document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

/** A browser with nobody signed in, and a virtual platform authenticator that verifies the person. */
async function withDevice(browser: Browser): Promise<{ page: Page; cdp: CDPSession; authenticatorId: string }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { page, cdp, authenticatorId };
}

test.beforeAll(() => {
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
});

for (const locale of ["en", "es"] as const) {
  test(`the demo coordinator adds a passkey, signs out and back in with it; a removed one is refused (${locale})`, async ({ browser }) => {
    const m = MESSAGES[locale];
    const { page, cdp, authenticatorId } = await withDevice(browser);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // In as the demo coordinator ("Continue as"), then Your account.
    await page.goto(`/${locale}/sign-in`);
    await page.getByTestId("continue-coordinator").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await page.goto(`/${locale}/settings/account`);
    await expect(page.getByRole("heading", { level: 1, name: m.account.title })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: m.passkeys.title })).toBeVisible();
    await expect(page.getByTestId("passkeys-none")).toHaveText(m.passkeys.none);
    await check(page, `account (${locale})`);

    // Add a passkey: "confirm it's you" when the session asks for it (the demo's shared sessions never
    // do), then the device makes it; a confirmation names it, then Done.
    await page.getByTestId("passkey-add").click();
    const confirm = page.getByTestId("confirm-access");
    const added = page.getByTestId("passkey-added");
    await expect(confirm.or(added)).toBeVisible();
    await expect(confirm).toHaveCount(0);
    const defaultNames = Object.values(m.passkeys.defaultName);
    await expect(added).toContainText(m.passkeys.addedTitle);
    // The list behind it has been refreshed (the button is no longer busy).
    await expect(page.getByTestId("passkey-add")).toBeEnabled();
    await check(page, `passkey added (${locale})`);
    await page.getByTestId("passkey-added-done").click();
    await expect(added).toHaveCount(0);
    await expect(page.getByTestId("passkey")).toHaveCount(1);
    expect(defaultNames).toContain(await page.getByTestId("passkey-name").textContent());
    await expect(page.getByTestId("passkey")).toContainText(m.passkeys.neverUsed);
    // The device holds one discoverable passkey for this site.
    const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
    expect(credentials.map((c) => [c.isResidentCredential, c.rpId])).toEqual([[true, "localhost"]]);
    await check(page, `account with a passkey (${locale})`);

    // Sign out; going to Invoices meets sign-in; the Passkey tile signs in with no code and goes on.
    await page.getByTestId("account-sign-out").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in\\?notice=signed_out$`));
    await page.goto(`/${locale}/invoices`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in\\?next=%2Finvoices$`));
    // A closed prompt (here: the device could not check it was her) says nothing.
    await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: false });
    await page.getByTestId("sign-in-passkey").click();
    await expect(page.getByTestId("sign-in-passkey")).toBeEnabled();
    await expect(page.getByTestId("passkey-error")).toHaveCount(0);
    await expect(page).toHaveURL(/\/sign-in/);
    await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: true });
    await page.getByTestId("sign-in-passkey").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/invoices$`));
    await page.getByTestId("agency-menu").click();
    await expect(page.getByTestId("menu-person")).toContainText("Lena Ortiz");
    await page.keyboard.press("Escape");

    // The account page shows when it was last used; Remove asks first.
    await page.goto(`/${locale}/settings/account`);
    await expect(page.getByTestId("passkey")).not.toContainText(m.passkeys.neverUsed);
    await page.getByTestId("passkey-remove").click();
    await expect(page.getByRole("alertdialog")).toContainText(m.passkeys.removeTitle);
    await check(page, `remove a passkey (${locale})`);
    await page.getByTestId("passkey-remove-confirm").click();
    await expect(page.getByTestId("passkeys-none")).toBeVisible();

    // Signed out again, the removed passkey (still on the device) is refused, under the tiles.
    await page.getByTestId("account-sign-out").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in\\?notice=signed_out$`));
    await page.getByTestId("sign-in-passkey").click();
    await expect(page.getByTestId("passkey-error")).toHaveText(m.passkeys.signIn.invalid);
    await expect(page).toHaveURL(/\/sign-in/);
    await check(page, `sign-in, passkey refused (${locale})`);
    expect(errors).toEqual([]);
  });
}
