/**
 * Every converter step, checked with axe (WCAG 2.1 A/AA rules): no serious or critical problems.
 */
import { execSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const FIXTURE = "tests/e2e/fixtures/timeclock-messy-2026-10-05.csv";

async function check(page: Page, where: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

test("converter steps have no serious accessibility problems", async ({ page }) => {
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
  await page.goto("/en/convert");
  await check(page, "landing");
  await page.getByRole("link", { name: "Start" }).first().click();
  await check(page, "upload (empty)");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await expect(page.getByTestId("document-row")).toHaveCount(1, { timeout: 60_000 });
  await check(page, "upload (read)");
  await page.getByTestId("forward").click();
  await expect(page.getByTestId("hours-grid")).toBeVisible();
  await check(page, "review hours");
  await page.getByTestId("hours-row").filter({ hasText: "Ruiz" }).getByRole("button", { name: "Edit" }).click();
  await check(page, "review hours (editing)");
  await page.keyboard.press("Escape");
  await page.getByTestId("hours-row").first().getByRole("button", { name: "Open source" }).click();
  await expect(page.getByTestId("source-panel")).toBeVisible();
  // Let the panel's slide-in finish: mid-animation colours are half-transparent.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  await check(page, "source panel");
});
