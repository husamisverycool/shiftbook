/**
 * Completeness audit G1 through the screens, in English and Spanish: the Owner adds a client from the
 * clients list (Stripe's "Add customer"), lands on its page and adds a worksite whose county and city
 * come from the Census pickers, adds a branch on Settings › Branches, and saves the agency's details
 * on Settings › Agency — each reached from the agency menu.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;

for (const locale of ["en", "es"] as const) {
  test(`the Owner adds a client with a Census-picked worksite, a branch, and the agency's details (${locale})`, async ({ page }) => {
    const m = MESSAGES[locale];
    const tag = locale.toUpperCase();
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Clients › Add client opens the dialog; saving lands on the new client's page.
    await page.goto(`/${locale}/clients`);
    await page.getByTestId("add-client").click();
    const dialog = page.getByTestId("client-dialog");
    await expect(dialog.getByRole("heading", { name: m.clientSetup.addTitle })).toBeVisible();
    await dialog.getByTestId("client-save").click();
    await expect(dialog.getByText(m.clientSetup.rules.required).first()).toBeVisible();
    await dialog.getByTestId("client-name").fill(`Lakeside Test Foods ${tag}`);
    await dialog.getByTestId("client-code").fill(`LTF-${tag}`);
    await dialog.getByTestId("client-address").fill("100 Example Way\nSpringfield, IL 62701");
    await dialog.getByTestId("client-save").click();
    await expect(page.getByRole("heading", { level: 1, name: `Lakeside Test Foods ${tag}` })).toBeVisible();
    await expect(page.getByTestId("no-worksites")).toHaveText(m.clientSetup.worksites.none);

    // Add worksite: state, then the county list, then the places in that county.
    await page.getByTestId("add-worksite").click();
    const site = page.getByTestId("worksite-dialog");
    await site.getByTestId("site-name").fill("North plant");
    await site.getByTestId("site-street").fill("200 Example Ave");
    await site.getByTestId("site-city").fill("Chicago");
    await site.getByTestId("site-state").selectOption("IL");
    await site.getByTestId("site-zip").fill("60601");
    await expect(site.getByTestId("site-county").locator('option[value="17031"]')).toHaveCount(1);
    await site.getByTestId("site-county").selectOption("17031");
    await expect(site.getByTestId("site-place").locator('option[value="1714000"]')).toHaveCount(1);
    await site.getByTestId("site-place").selectOption("1714000");
    await site.getByTestId("site-save").click();
    await expect(page.getByTestId("worksite-row")).toHaveCount(1);
    await expect(page.getByTestId("worksite-row")).toContainText("North plant");
    await expect(page.getByTestId("worksite-row")).toContainText("Chicago");

    // Settings › Branches from the agency menu: add one.
    await page.getByTestId("agency-menu").click();
    await page.getByTestId("menu-branches").click();
    await expect(page.getByRole("heading", { level: 1, name: m.branchSetup.title })).toBeVisible();
    await page.getByTestId("add-branch").click();
    await page.getByTestId("branch-name").fill(`East ${tag}`);
    await page.getByTestId("branch-save").click();
    await expect(page.getByText(`East ${tag}`, { exact: true })).toBeVisible();

    // Settings › Agency: the details save.
    await page.getByTestId("agency-menu").click();
    await page.getByTestId("menu-agency").click();
    await expect(page.getByRole("heading", { level: 1, name: m.agencySetup.title })).toBeVisible();
    await page.getByTestId("agency-phone").fill("(312) 555-0100");
    await page.getByTestId("agency-save").click();
    await expect(page.getByText(m.agencySetup.saved)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("agency-phone")).toHaveValue("(312) 555-0100");

    expect(errors).toEqual([]);
  });
}
