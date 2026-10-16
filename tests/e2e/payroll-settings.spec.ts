/**
 * Slice (f) through the screens, in English and Spanish (plan "Done means" 3): the Owner switches the
 * payroll system to ADP Workforce Now, enters the company code, the run names the worker with no ADP
 * file number, the fix opens the worker ids where the Owner enters it, and the week's file is
 * `PRXYZEPI.csv`; the same for a spreadsheet laid out in a custom column order. Then the
 * accessibility check on every new screen.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { approveAndCreateFiles, toExceptions, toTotals, uploadPrairieWeek } from "./flow";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

/** From any app page: the agency menu's Settings opens the payroll file settings. */
async function openSettings(page: Page, locale: "en" | "es") {
  const m = MESSAGES[locale];
  await page.goto(`/${locale}/convert`);
  await page.getByTestId("agency-menu").click();
  await page.getByTestId("menu-settings").click();
  await expect(page.getByRole("heading", { level: 1, name: m.settings.payroll.title })).toBeVisible();
}

/** The payroll file the Files step offers, as text. */
async function downloadPayroll(page: Page): Promise<{ name: string; text: string }> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("payroll-file").getByRole("link").first().click()]);
  const path = await download.path();
  return { name: download.suggestedFilename(), text: readFileSync(path, "utf8") };
}

for (const locale of ["en", "es"] as const) {
  test(`the Owner switches to ADP Workforce Now, enters the missing file number from the run's fix, and gets PRXYZEPI.csv (${locale})`, async ({ page }) => {
    const m = MESSAGES[locale];
    const p = m.settings.payroll;
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await openSettings(page, locale);
    await expect(page.getByTestId("system-gusto_hours_csv")).toContainText(p.inUse);
    await page.getByTestId("system-adp_wfn_paydata").click();
    await page.getByLabel(p.fields.companyCode).fill("xyz");
    await expect(page.getByTestId("file-name")).toContainText("PRXYZEPI.csv");
    await page.getByTestId("save-system").click();
    await expect(page.getByTestId("system-saved")).toHaveText(p.saved);
    await expect(page.getByTestId("system-adp_wfn_paydata")).toContainText(p.inUse);

    // A worker with no ADP file number holds the run; the fix opens the worker ids on what is missing.
    const period = await uploadPrairieWeek(page, locale);
    await page.goto(`/${locale}/convert?period=${period}&step=hours`);
    await toExceptions(page, m);
    const blocker = page.getByTestId("blocker");
    await expect(blocker).toHaveCount(1);
    await expect(blocker).toContainText(m.convert.totals.blockers.missing_payroll_id);
    await expect(blocker).toContainText("Anita Patel");
    await blocker.getByTestId("open-payroll-settings").click();
    await expect(page.getByTestId("ids-progress")).toHaveText(p.workers.progress.replace("{set}", "39").replace("{total}", "40"));
    await expect(page.getByRole("tab", { name: p.tabs.workers })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("filter-missing")).toHaveAttribute("aria-pressed", "true");
    const rows = page.getByTestId("id-row");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Anita Patel");
    // A file number ADP would refuse is not saved; then the right one is.
    await rows.getByTestId("worker-id").fill("12");
    await rows.getByTestId("worker-id").press("Enter");
    await expect(rows.getByTestId("field-problem")).toHaveText(p.rules.adp_file_number);
    await rows.getByTestId("worker-id").fill("100114");
    await rows.getByTestId("worker-id").press("Enter");
    await expect(rows.getByTestId("id-status")).toHaveText(p.workers.set);
    await expect(page.getByTestId("ids-progress")).toHaveText(p.workers.progress.replace("{set}", "40").replace("{total}", "40"));

    // The week now goes through, and its file is ADP's.
    await page.goto(`/${locale}/convert?period=${period}&step=hours`);
    await toExceptions(page, m);
    await toTotals(page, m);
    await approveAndCreateFiles(page, m);
    await expect(page.getByTestId("payroll-file")).toContainText(`${m.convert.files.formats.adp_wfn_paydata} · PRXYZEPI.csv`);
    const file = await downloadPayroll(page);
    expect(file.name).toBe("PRXYZEPI.csv");
    expect(file.text).toBe(["Co Code,Batch ID,File #,Temp Rate,Reg Hours,O/T Hours", "XYZ,26101101,100113,18.2500,40.00,6.00", "XYZ,26101101,100114,18.2500,24.00,", ""].join("\r\n"));
    expect(errors).toEqual([]);
  });

  test(`a spreadsheet in the agency's own column order (${locale})`, async ({ page }) => {
    const m = MESSAGES[locale];
    const p = m.settings.payroll;
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    await openSettings(page, locale);
    await page.getByTestId("system-spreadsheet_csv").click();
    await page.getByTestId("save-system").click();
    await expect(page.getByTestId("system-saved")).toHaveText(p.saved);
    await page.getByRole("tab", { name: p.tabs.columns }).click();

    const field = (name: keyof typeof p.columns.fields) => p.columns.fields[name];
    await page.getByLabel(p.columns.headerText.replace("{field}", field("worker_id"))).fill("Employee");
    await page.getByRole("button", { name: p.columns.remove.replace("{field}", field("first_name")) }).click();
    await page.getByRole("button", { name: p.columns.moveUp.replace("{field}", field("earning_code")) }).click();
    await page.getByRole("button", { name: p.columns.moveUp.replace("{field}", field("earning_code")) }).click();
    await page.getByLabel(p.columns.searchFields).fill(field("fixed").slice(0, 4));
    await page.getByRole("button", { name: p.columns.addField.replace("{field}", field("fixed")) }).click();
    await page.getByLabel(p.columns.headerText.replace("{field}", field("fixed"))).fill("Client");
    await page.getByLabel(p.columns.fixedValue.replace("{field}", field("fixed"))).fill("PLM");
    await page.getByLabel(p.columns.delimiter).selectOption("semicolon");
    await page.getByTestId("sheet-file-name").fill("factor-{end}.csv");
    await page.getByTestId("save-columns").click();
    await expect(page.getByTestId("columns-saved")).toHaveText(p.saved);
    await expect(page.getByTestId("column-header")).toHaveCount(8);

    const period = await uploadPrairieWeek(page, locale);
    await page.goto(`/${locale}/convert?period=${period}&step=hours`);
    await toExceptions(page, m);
    await toTotals(page, m);
    await approveAndCreateFiles(page, m);
    const file = await downloadPayroll(page);
    expect(file.name).toBe("factor-2026-10-11.csv");
    expect(file.text).toBe(
      [
        "Employee;Earning code;Last name;Week ending;Hours;Rate;Amount;Client",
        "SB-0013;REG;Bell;10/11/2026;40.00;18.2500;730.00;PLM",
        "SB-0013;OT;Bell;10/11/2026;6.00;27.3750;164.25;PLM",
        "SB-0014;REG;Patel;10/11/2026;24.00;18.2500;438.00;PLM",
        "",
      ].join("\r\n"),
    );
  });
}

test("a layout that cannot price its rows is refused, saying why", async ({ page }) => {
  const p = en.settings.payroll;
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
  await openSettings(page, "en");
  await page.getByTestId("system-spreadsheet_csv").click();
  await page.getByTestId("save-system").click();
  await page.getByRole("tab", { name: p.tabs.columns }).click();
  await page.getByRole("button", { name: p.columns.remove.replace("{field}", p.columns.fields.amount) }).click();
  await page.getByRole("button", { name: p.columns.remove.replace("{field}", p.columns.fields.rate) }).click();
  await page.getByTestId("save-columns").click();
  await expect(page.getByText(p.rules.needs_price)).toBeVisible();
  await expect(page.getByTestId("columns-saved")).toHaveText("");
});

test("accessibility: payroll file settings, every tab and the agency menu", async ({ page }) => {
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
  const p = en.settings.payroll;
  await page.goto("/en/convert");
  await page.getByTestId("agency-menu").click();
  await expect(page.getByTestId("menu-settings")).toBeVisible();
  await check(page, "agency menu");
  await page.getByTestId("menu-settings").click();
  await expect(page.getByRole("heading", { level: 1, name: p.title })).toBeVisible();
  await check(page, "settings, codes (Gusto)");
  await page.getByTestId("system-adp_wfn_paydata").click();
  await page.getByLabel(p.fields.companyCode).fill("XYZ");
  await page.getByTestId("save-system").click();
  await expect(page.getByTestId("system-saved")).toHaveText(p.saved);
  await check(page, "settings, codes (ADP)");
  await page.getByRole("tab", { name: p.tabs.workers }).click();
  await expect(page.getByTestId("id-row").first()).toBeVisible();
  await check(page, "settings, worker ids");
  await page.getByTestId("system-spreadsheet_csv").click();
  await page.getByTestId("save-system").click();
  await expect(page.getByTestId("system-saved")).toHaveText(p.saved);
  await page.getByRole("tab", { name: p.tabs.columns }).click();
  await check(page, "settings, spreadsheet columns");
  await page.goto("/es/settings/payroll?tab=columns");
  await check(page, "settings, spreadsheet columns (es)");
});
