/**
 * Slice (b) acceptance through the screens, in demo mode: create a job order, give it a rate
 * version (bill rate from a markup, rounding shown), assign a worker, import placements from the
 * Bullhorn sample with decisions in the review step; the list's keyboard; Spanish; accessibility.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const PLACEMENTS = "demo/samples/placements/bullhorn-placements-2026-10.csv";

async function noSeriousProblems(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

test.beforeEach(() => {
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
});

test("create a job order, add a rate version from a markup, and assign a worker", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/en/job-orders");
  await expect(page.getByRole("heading", { name: en.jobOrders.title })).toBeVisible();
  await noSeriousProblems(page, "job orders list");

  await page.keyboard.press("c");
  const form = page.getByRole("dialog");
  await form.getByLabel(en.jobOrders.form.client).selectOption({ label: "Prairie Line Manufacturing (demo)" });
  await form.getByLabel(en.jobOrders.form.worksite).selectOption({ index: 1 });
  await form.getByLabel(en.jobOrders.form.position).fill("Forklift Operator");
  await form.getByLabel(en.jobOrders.form.shift).fill("Night");
  await form.getByLabel(en.jobOrders.form.socCode).fill("53-7051");
  await form.getByLabel(en.jobOrders.form.headcount).fill("2");
  await form.getByRole("button", { name: en.jobOrders.form.create }).click();
  await expect(page).toHaveURL(/\/en\/job-orders\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Forklift Operator");

  // Rate card: none yet, then a version whose bill rate comes from a 45% markup.
  await page.getByRole("tab", { name: en.jobOrder.tabs.rates }).click();
  await expect(page.getByTestId("no-rates")).toBeVisible();
  await noSeriousProblems(page, "rate card (empty)");
  await page.getByTestId("new-version").click();
  const rate = page.getByRole("dialog");
  await rate.getByLabel(en.rates.effectiveFrom).fill("2026-11-02");
  await rate.getByLabel(en.rates.payPerHour).fill("18.25");
  await rate.getByLabel(en.rates.markup, { exact: true }).check();
  await rate.getByLabel(en.rates.markupPercent).fill("45");
  await expect(rate.getByTestId("markup-preview")).toContainText("2646.25¢, rounded half up to $26.46");
  await noSeriousProblems(page, "rate form");
  await rate.getByRole("button", { name: en.rates.addVersion }).click();
  await expect(page.getByTestId("scheduled-change")).toContainText("November 2, 2026");
  await expect(page.getByRole("table", { name: en.rates.history })).toContainText("$26.46");
  await noSeriousProblems(page, "rate card (scheduled)");

  // Assign a worker; the form stays open for the next one (Linear sub-issue editor).
  await page.getByRole("button", { name: en.jobOrder.assign }).first().click();
  const assign = page.getByRole("dialog");
  await assign.getByLabel(en.assignments.col.worker).selectOption({ label: "Anita Patel" });
  await assign.getByLabel(en.assignments.col.start).fill("2026-11-02");
  await assign.getByRole("button", { name: en.assignments.assignSubmit }).click();
  await expect(assign).toContainText("Anita Patel");
  await assign.getByRole("button", { name: en.assignments.done }).click();
  await page.getByRole("tab", { name: new RegExp(en.jobOrder.tabs.assignments) }).click();
  await expect(page.getByTestId("assignment-row")).toHaveCount(1);
  await noSeriousProblems(page, "job order assignments");
  await page.getByRole("tab", { name: en.jobOrder.tabs.activity }).click();
  await expect(page.getByTestId("activity")).toContainText(en.activity.what.rate_card.create);
  expect(errors).toEqual([]);
});

test("the list works from the keyboard: highlight, preview panel, select, display options", async ({ page }) => {
  await page.goto("/en/job-orders");
  await expect(page.getByTestId("record-row").first()).toBeVisible();
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await page.keyboard.press("Space");
  const panel = page.getByTestId("side-panel");
  await expect(panel).toContainText("2 of 5");
  await page.keyboard.press("j");
  await expect(panel).toContainText("3 of 5");
  await noSeriousProblems(page, "job orders with preview");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await page.keyboard.press("x");
  await expect(page.getByRole("toolbar", { name: en.list.bulk })).toContainText("1 selected");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+V");
  await page.getByRole("menuitemradio", { name: en.jobOrders.group.state }).click();
  await expect(page.getByRole("row").filter({ hasText: /^IL\s*\d/ }).first()).toBeVisible();
  // Filters go in the URL.
  await page.keyboard.press("Escape");
  await page.goto("/en/job-orders?state=MA");
  await expect(page.getByTestId("record-row")).toHaveCount(1);
  await expect(page.getByTestId("filter-chips")).toContainText("MA");
});

test("import placements from the Bullhorn sample, deciding what the file could not say", async ({ page }) => {
  await page.goto("/en/assignments/import");
  await noSeriousProblems(page, "import: source");
  await page.locator("#placement-file").setInputFiles(PLACEMENTS);
  await page.getByTestId("import-next").click();
  await expect(page).toHaveURL(/step=map/);
  await expect(page.getByRole("table", { name: en.import.step.map })).not.toContainText("SSN");
  await noSeriousProblems(page, "import: map");
  await page.getByTestId("import-next").click();
  await expect(page).toHaveURL(/step=values/);
  await noSeriousProblems(page, "import: values");
  await expect(page.getByTestId("import-next")).toBeDisabled();
  await page.getByLabel(en.import.choiceFor.replace("{value}", "Maria Gomez")).selectOption("leave_out");
  await page.getByRole("button", { name: en.import.kinds.jobOrder }).click();
  await page.getByLabel(en.import.choiceFor.replace("{value}", "Forklift Operator · Night")).selectOption({ label: en.import.newAt.replace("{site}", "Joliet Plant 2, Joliet, IL") });
  await expect(page.getByTestId("import-next")).toBeEnabled();
  await page.getByTestId("import-next").click();
  await expect(page).toHaveURL(/step=preview/);
  await expect(page.getByTestId("preview-create")).toHaveText("4");
  await expect(page.getByTestId("preview-skip")).toHaveText("2");
  await noSeriousProblems(page, "import: preview");
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-done")).toHaveText("4 imported, 2 skipped");
  await noSeriousProblems(page, "import: results");
  await page.getByRole("link", { name: en.import.openAssignments }).click();
  await expect(page.getByTestId("record-row").filter({ hasText: "Jerome Washington" }).filter({ hasText: "Forklift Operator" })).toHaveCount(1);
  await noSeriousProblems(page, "assignments list");
});

test("Spanish job orders", async ({ page }) => {
  await page.goto("/es/job-orders");
  await expect(page.getByRole("heading", { name: es.jobOrders.title })).toBeVisible();
  await expect(page.getByRole("link", { name: es.nav.assignments })).toBeVisible();
});
