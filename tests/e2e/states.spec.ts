/**
 * Slice (o): every state handled (docs/patterns/_components/loading.md and error.md).
 * - A slow navigation shows the page's outline inside the frame, then the page.
 * - A record that does not exist, or an address that matches no page, keeps the frame and offers Home.
 * In English and Spanish; axe on the not-found page.
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;

for (const locale of ["en", "es"] as const) {
  const m = MESSAGES[locale];

  test(`a slow page shows its outline inside the frame, then the page (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await expect(page.getByRole("navigation").first()).toBeVisible();
    // A click before the page is interactive is a full page load, which has no outline to show.
    await page.waitForLoadState("networkidle");
    // Hold the server's answer for the next page so its outline has time to show.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/invoices(\?|$)/, async (route) => {
      // Background prefetches go through; only the navigation itself waits.
      if (route.request().headers()["next-router-prefetch"]) return route.continue();
      await held;
      await route.continue();
    });
    await page.getByRole("link", { name: m.nav.invoices, exact: true }).click();
    const outline = page.getByTestId("page-skeleton");
    await expect(outline).toBeVisible();
    await expect(outline).toHaveAttribute("role", "status");
    await expect(outline.getByRole("heading", { level: 1, name: m.invoices.title })).toBeVisible();
    await expect(page.getByTestId("agency-menu")).toBeVisible();
    release();
    await expect(page).toHaveURL(new RegExp(`/${locale}/invoices`));
    await expect(outline).toBeHidden();
  });

  test(`a record that does not exist, and an unknown address, keep the frame (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}/invoices/00000000-0000-4000-8000-000000000000`);
    const missing = page.getByTestId("page-not-found");
    await expect(missing).toBeVisible();
    await expect(missing.getByText(m.states.notFoundTitle)).toBeVisible();
    await expect(page.getByTestId("agency-menu")).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await page.goto(`/${locale}/no-such-page`);
    await expect(page.getByTestId("page-not-found")).toBeVisible();
    await expect(page.getByTestId("agency-menu")).toBeVisible();
    await page.getByTestId("page-not-found").getByRole("link", { name: m.states.goHome }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
  });
}
