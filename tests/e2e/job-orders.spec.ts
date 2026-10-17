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
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
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
  // Each key is checked before the next, so a key pressed while the page is still loading is retried.
  const rows = page.getByTestId("record-row");
  // Each rate says which it is; the client is its group's band, not repeated in the rows.
  await expect(rows.first()).toContainText(en.list.payRate.replace("{rate}", "$"));
  await expect(rows.first()).toContainText(en.list.billRate.replace("{rate}", "$"));
  await expect(rows.first()).not.toContainText("(demo)");
  await expect(async () => {
    await page.keyboard.press("j");
    await expect(rows.nth(0)).toHaveAttribute("data-highlighted", "true", { timeout: 1000 });
  }).toPass();
  await page.keyboard.press("j");
  await expect(rows.nth(1)).toHaveAttribute("data-highlighted", "true");
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
  // Display options (Linear's panel): grouping by state puts the rows under a band per state.
  await page.keyboard.press("Shift+V");
  await page.getByTestId("display-grouping").selectOption({ label: en.jobOrders.group.state });
  await expect(page.getByRole("row").filter({ hasText: /^IL\s*\d/ }).first()).toBeVisible();
  // Filters go in the URL.
  await page.keyboard.press("Escape");
  await page.goto("/en/job-orders?state=MA");
  await expect(page.getByTestId("record-row")).toHaveCount(1);
  // Linear's segmented filter chip: the field, the operator, the value.
  await expect(page.getByTestId("filter-chips")).toContainText(`${en.jobOrders.filter.state}${en.list.is}MA`);
});

test("import placements from the Bullhorn sample, deciding what the file could not say", async ({ page }) => {
  await page.goto("/en/assignments/import");
  await noSeriousProblems(page, "import: source");
  await page.locator("#placement-file").setInputFiles(PLACEMENTS);
  await page.getByTestId("import-next").click();
  await expect(page).toHaveURL(/step=map/);
  await expect(page.getByRole("table", { name: en.import.step.map })).not.toContainText("SSN");
  // The removed columns stay listed on this step, by position, never with their values.
  const removed = page.getByTestId("removed-columns");
  await expect(removed).toContainText("Column D (SSN)");
  await expect(removed).toContainText("Column E (Date of Birth)");
  await expect(removed).not.toContainText("900-");
  await noSeriousProblems(page, "import: map");
  await page.getByTestId("import-next").click();
  await expect(page).toHaveURL(/step=values/);
  await noSeriousProblems(page, "import: values");
  await expect(page.getByTestId("import-next")).toBeDisabled();
  await page.getByLabel(en.import.choiceFor.replace("{value}", "Maria Gomez")).selectOption("leave_out");
  await page.getByRole("button", { name: en.import.kinds.jobOrder }).click();
  await page.getByLabel(en.import.choiceFor.replace("{value}", "Forklift Operator · Night")).selectOption({ label: en.import.newAt.replace("{site}", "Joliet Plant 2, Joliet, IL") });
  await expect(page.getByTestId("import-next")).toBeEnabled();
  // Dates: the order the file uses, and each date as read.
  await page.getByRole("button", { name: en.import.kinds.dates }).click();
  await expect(page.getByLabel(en.import.dateOrder.month_first)).toBeChecked();
  await expect(page.getByTestId("date-row").filter({ hasText: "10/19/2026" })).toContainText("October 19, 2026");
  await noSeriousProblems(page, "import: dates");
  await page.getByTestId("import-next").click();
  await expect(page).toHaveURL(/step=preview/);
  await expect(page.getByTestId("preview-create")).toHaveText("4");
  await expect(page.getByTestId("preview-row")).toHaveCount(4);
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

test("a placement file over 1 MB is taken (the request limit is the app's own, not the framework's)", async ({ page }) => {
  const header = "Candidate,Company,Job Title,Shift,Start Date,Notes";
  const row = `Anita Patel,Prairie Line Manufacturing (demo),Assembler,Day,10/19/2026,${"x".repeat(800)}`;
  const csv = [header, ...Array.from({ length: 1500 }, () => row)].join("\n");
  expect(csv.length).toBeGreaterThan(1024 * 1024);
  await page.goto("/en/assignments/import");
  await page.getByLabel(en.import.sources.other).check();
  await page.locator("#placement-file").setInputFiles({ name: "big.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByTestId("import-next").click();
  await expect(page).toHaveURL(/step=map/, { timeout: 30_000 });
});

test("a file without a header row is refused with what to do", async ({ page }) => {
  const rows = readFileSync(PLACEMENTS, "utf8").split("\n").slice(1).join("\n");
  await page.goto("/en/assignments/import");
  await page.locator("#placement-file").setInputFiles({ name: "no-header.csv", mimeType: "text/csv", buffer: Buffer.from(rows) });
  await page.getByTestId("import-next").click();
  await expect(page.getByText(en.import.refused.no_header)).toHaveAttribute("role", "alert");
  await expect(page).not.toHaveURL(/step=map/);
});
