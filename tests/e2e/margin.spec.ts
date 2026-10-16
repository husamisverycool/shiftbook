/**
 * Slice (i) through the screens, in English and Spanish (plan "Done means" 2). Prairie Line bills
 * overtime at straight time from the week's first day; the week is run (Marcus Bell 46 h, Anita Patel
 * 24 h, machine operators: $18.25 pay, $26.50 bill, Illinois, class 3632). By hand:
 *   Marcus: pay 40 h × $18.25 = $730.00 + 6 h × $27.375 = $164.25 → $894.25; billed 46 h × $26.50 = $1,219.00
 *     burden: $730.00 × (11.70% + 3.00%) = $107.31; $164.25 × 11.70% + $109.50 × 3.00% = $22.50225 → $22.50
 *   Anita: pay 24 h × $18.25 = $438.00; billed $636.00; burden $438.00 × 14.70% = $64.386 → $64.39
 *   Billed $1,855.00 − pay $1,332.25 − burden $194.20 = margin $328.55; 17.7%.
 *   Overtime premium not billed: one third of $164.25 = $54.75.
 * Then the Owner groups by worker, recruiter, branch and week, opens Marcus's lines, exports the
 * summary, reads overtime not billed and cash floating, raises Illinois 3632 to $5.00 from that week
 * (Marcus's burden: $730.00 × 16.70% = $121.91 + $19.21725 + $5.475 = $24.69225 → $24.69; Anita
 * $73.146 → $73.15; margin $1,855.00 − $1,332.25 − $219.75 = $303.00) and clears Anita's recruiter.
 * Accessibility checks on every new screen.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { money } from "../../src/components/shiftbook/format";
import { approveAndCreateFiles, toExceptions, toTotals, uploadPrairieWeek } from "./flow";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;
const PRAIRIE = "Prairie Line Manufacturing (demo)";

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

for (const locale of ["en", "es"] as const) {
  test(`margin: by client, worker, recruiter, branch and week; overtime not billed; cash floating; a rate changed from a date (${locale})`, async ({ page }) => {
    test.setTimeout(420_000);
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const dialog = page.getByRole("dialog");
    const cell = (testId: string) => page.getByTestId(testId).locator("span").last();

    // Prairie Line bills overtime at straight time from the week's first day.
    await page.goto(`/${locale}/clients`);
    await page.getByRole("link", { name: PRAIRIE }).click();
    await page.getByTestId("edit-settings").click();
    await dialog.locator("#bill-ot").selectOption("straight_time");
    await dialog.getByTestId("field-from").fill("2026-10-05");
    await dialog.getByTestId("save-settings").click();
    await expect(dialog).toBeHidden();
    const period = await uploadPrairieWeek(page, locale);
    await page.goto(`/${locale}/convert?period=${period}&step=hours`);
    await toExceptions(page, m);
    await toTotals(page, m);
    await approveAndCreateFiles(page, m);

    // Margin (G then M): the week's numbers.
    await page.keyboard.press("g");
    await page.keyboard.press("m");
    await expect(page.getByRole("heading", { level: 1, name: m.margin.title })).toBeVisible();
    await expect(cell("card-billed")).toHaveText(money(185_500, locale));
    await expect(cell("card-pay")).toHaveText(money(133_225, locale));
    await expect(cell("card-burden")).toHaveText(money(19_420, locale));
    await expect(cell("card-margin")).toHaveText(money(32_855, locale));
    await expect(cell("card-percent")).toHaveText("17.7%");
    await expect(cell("card-overtime")).toHaveText(money(5475, locale));
    await check(page, "margin overview");
    await page.getByTestId("card-margin").click();
    await expect(dialog.getByTestId("metric-working")).toContainText(money(32_855, locale));
    await check(page, "metric dialog");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // By client: Prairie Line; its lines; Marcus's burden worked out.
    const rows = page.getByTestId("margin-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(PRAIRIE);
    await rows.first().getByRole("button").click();
    const marcus = page.getByTestId("margin-line").filter({ hasText: "Marcus Bell" });
    await marcus.click();
    await expect(page.getByTestId("margin-line-explain")).toContainText("Employer taxes (IL) 11.70% of $730.00");
    await expect(page.getByTestId("margin-line-explain")).toContainText("the overtime premium left out: 2/3 of $164.25");
    await check(page, "margin, a line opened");

    // By worker, recruiter, branch and week.
    await page.getByTestId("group-worker").click();
    await expect(rows.filter({ hasText: "Marcus Bell" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "Anita Patel" })).toHaveCount(1);
    await page.getByTestId("group-recruiter").click();
    await expect(rows.filter({ hasText: "Lena Ortiz (demo)" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "Sam Whitfield (demo)" })).toHaveCount(1);
    const [summary] = await Promise.all([page.waitForEvent("download"), page.getByTestId("margin-export").click().then(() => page.getByTestId("export-summary").click())]);
    expect(summary.suggestedFilename()).toMatch(/^margin-summary-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = readFileSync((await summary.path())!, "utf8").split("\r\n");
    expect(lines[0]).toBe([m.margin.groups.recruiter, m.margin.cols.hours, m.margin.cards.billed, m.margin.cards.pay, m.margin.cards.burden, m.margin.cards.margin, m.margin.cards.percent].join(","));
    expect(lines.slice(1, 3).sort()).toEqual(["Lena Ortiz (demo),46.00,1219.00,894.25,129.81,194.94,16.0%", "Sam Whitfield (demo),24.00,636.00,438.00,64.39,133.61,21.0%"]);
    await page.getByTestId("group-branch").click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Main office");
    await page.getByTestId("group-week").click();
    await expect(rows.first()).toContainText(m.margin.weekOf.replace("{date}", locale === "en" ? "October 5, 2026" : "5 de octubre de 2026"));

    // Overtime not billed: Marcus's six hours at straight time.
    await page.getByTestId("margin-tab-overtime").click();
    const ot = page.getByTestId("overtime-row");
    await expect(ot).toHaveCount(1);
    await expect(ot).toContainText("Marcus Bell");
    await expect(ot).toContainText(money(5475, locale));
    await expect(ot).toContainText(m.margin.overtime.reasons.bill_overtime_straight);
    await ot.getByRole("button").click();
    await expect(page.getByTestId("overtime-explain")).toContainText("its premium (the part above straight time) $54.75");
    await expect(page.getByTestId("overtime-line")).toHaveCount(2);
    await check(page, "overtime not billed");

    // Cash floating: the week's payroll, paid 5 days after it ended, not yet paid for.
    await page.getByTestId("margin-tab-cash").click();
    await expect(page.getByTestId("cash-cards")).toBeVisible();
    await expect(page.getByTestId("cash-row").filter({ hasText: PRAIRIE })).toContainText(money(133_225, locale));
    await check(page, "cash floating");

    // Margin settings (from the agency menu): Illinois 3632 at $5.00 from that week.
    await page.getByTestId("agency-menu").click();
    await page.getByTestId("menu-margin-settings").click();
    await expect(page.getByRole("heading", { level: 1, name: m.marginSettings.title })).toBeVisible();
    await check(page, "margin settings");
    await page.getByTestId("add-wc-rate").click();
    await dialog.locator("#wc-state").selectOption("IL");
    await dialog.getByTestId("wc-class-input").fill("3632");
    await dialog.getByTestId("wc-rate-input").fill("5.00");
    await dialog.getByTestId("wc-from-input").fill("2026-10-05");
    await check(page, "add workers' comp rate");
    await dialog.getByTestId("save-wc-rate").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("wc-rate").filter({ hasText: "3632" })).toHaveCount(2);
    await page.goto(`/${locale}/margin`);
    await expect(cell("card-burden")).toHaveText(money(21_975, locale));
    await expect(cell("card-margin")).toHaveText(money(30_300, locale));

    // Anita's placement without a recruiter: her margin moves to None.
    await page.goto(`/${locale}/assignments`);
    const anita = page.getByTestId("record-row").filter({ hasText: "Anita Patel" });
    await anita.hover();
    await anita.getByRole("button", { name: m.list.preview.replace("{name}", "Anita Patel") }).click();
    await page.getByTestId("side-panel").getByTestId("assignment-recruiter").selectOption("");
    await expect(page.getByTestId("side-panel")).toContainText(m.assignments.recruiterSaved);
    await page.goto(`/${locale}/margin?group=recruiter`);
    await expect(rows.filter({ hasText: m.margin.none })).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
