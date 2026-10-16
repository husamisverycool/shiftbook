/**
 * The way into the demo (decision 0031), in English and Spanish: a stranger opens sign-in, takes the
 * main way in (the demo Owner), lands on Home's setup guide, and its first open step leads to the
 * upload, where the sample timesheets go in with one click; the bank import takes the sample bank
 * file the same way. Accessibility on the sign-in page.
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type Messages = typeof import("../../messages/en.json");
const MESSAGES = {
  en: JSON.parse(readFileSync("messages/en.json", "utf8")) as Messages,
  es: JSON.parse(readFileSync("messages/es.json", "utf8")) as Messages,
};
const SAMPLES = readdirSync("demo/samples/2026-10-05");

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.title.length > 0 && document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

for (const locale of ["en", "es"] as const) {
  test(`a stranger's way in: the demo Owner, the setup guide, the samples in one click (${locale})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Sign in: the heading, then the demo people first, the Owner's the main (filled) button; then
    // "or" and the email form.
    await page.goto(`/${locale}/sign-in`);
    await expect(page.getByRole("heading", { level: 1, name: m.signIn.title })).toBeVisible();
    const people = page.getByTestId("demo-people").getByRole("button");
    await expect(people).toHaveCount(4);
    await expect(people.first()).toHaveAttribute("data-testid", "continue-owner");
    await expect(page.getByTestId("continue-coordinator")).toContainText("Lena Ortiz");
    await expect(page.getByTestId("continue-coordinator")).not.toContainText("(demo)");
    await expect(page.getByRole("separator", { name: m.signIn.or })).toBeVisible();
    await expect(page.getByTestId("email")).toBeVisible();
    await check(page, "sign-in");

    // The language at the foot of the page switches it in place.
    const other = locale === "en" ? "es" : "en";
    await page.getByRole("navigation", { name: m.authFrame.language }).getByRole("link", { name: m.authFrame[other === "es" ? "spanish" : "english"] }).click();
    await expect(page).toHaveURL(new RegExp(`/${other}/sign-in`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in`));

    // In as the Owner: Home, its setup guide open on the week's timesheets.
    await page.getByTestId("continue-owner").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await expect(page.getByTestId("setup-guide")).toBeVisible();
    await expect(page.getByTestId("setup-step-convert")).toContainText(m.home.guide.steps.convert.demo);
    await page.getByTestId("setup-action-convert").click();

    // The sample timesheets in one click: every file of the sample folder arrives.
    await page.getByTestId("use-samples").click();
    await expect(page.getByTestId("document-row")).toHaveCount(SAMPLES.length, { timeout: 180_000 });
    await expect(page.getByTestId("use-samples")).toHaveCount(0);
    await expect(page.getByTestId("document-row").filter({ hasText: "timeclock" })).toContainText(m.convert.upload.status.read, { timeout: 120_000 });

    // The sample bank file in one click: straight to its columns.
    await page.goto(`/${locale}/bank/import`);
    await page.getByTestId("use-bank-sample").click();
    await expect(page.getByTestId("map-preview")).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
  });
}
