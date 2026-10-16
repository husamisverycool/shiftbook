/**
 * Every converter step, checked with axe (WCAG 2.1 A/AA rules): no serious or critical problems.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { demoUuid } from "../../src/server/demo/dataset";
import { expect, test, type Page } from "@playwright/test";

const FIXTURE = "tests/e2e/fixtures/timeclock-messy-2026-10-05.csv";
const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");

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

test("totals and files steps, with their dialogs, have no serious accessibility problems", async ({ page }) => {
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
  // A mid-week rate change gives the machine operators two pay rates, which the Gusto hours file
  // refuses per worker: the totals step is blocked and offers to skip them.
  await page.goto(`/en/job-orders/${demoUuid("job:il-operator")}`);
  await page.getByRole("tab", { name: en.jobOrder.tabs.rates }).click();
  await page.getByTestId("new-version").click();
  const rate = page.getByRole("dialog");
  await rate.getByLabel(en.rates.effectiveFrom).fill("2026-10-07");
  await rate.getByLabel(en.rates.payPerHour).fill("19.00");
  await rate.getByLabel(en.rates.markup, { exact: true }).check();
  await rate.getByLabel(en.rates.markupPercent).fill("45");
  await rate.getByRole("button", { name: en.rates.addVersion }).click();
  await expect(rate).toBeHidden();
  await page.goto("/en/convert");
  await page.getByRole("link", { name: "Start" }).first().click();
  await page.getByTestId("file-input").setInputFiles(["demo/samples/2026-10-05/IL-prairie-line-timeclock-2026-10-05.csv", "demo/samples/2026-10-05/CA-pacific-crest-fieldglass-approved-time-sheets.csv"]);
  await expect(page.getByTestId("document-row")).toHaveCount(2, { timeout: 60_000 });
  await page.getByTestId("forward").click();
  await expect(page.getByTestId("hours-grid").or(page.getByText("Nothing needs review"))).toBeVisible();
  await page.getByTestId("forward").click();
  await expect(page.getByRole("heading", { level: 1, name: "Review totals" })).toBeVisible({ timeout: 60_000 });
  await check(page, "review totals (blocked)");
  await page.getByTestId("skip-workers").first().click();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  await check(page, "skip dialog");
  await page.locator("#skip-reason").fill("Paid separately (test)");
  await page.getByTestId("confirm-skip").click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await check(page, "review totals (ready)");
  await page.getByRole("tab", { name: "Billing" }).click();
  await check(page, "review totals (billing tab)");
  await page.getByTestId("forward").click();
  await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible({ timeout: 60_000 });
  await check(page, "files");
});
