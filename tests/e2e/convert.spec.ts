/**
 * Slice (a) acceptance, in English and Spanish (SPEC §24 steps that exist in this slice):
 * upload the sample folder → review hours → review totals → payroll file and invoice, all through
 * the screens, in demo mode (no outside calls).
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";


const SAMPLES = "demo/samples/2026-10-05";
// Read as plain JSON: Playwright loads this file as an ES module.
const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;

async function skipAllBlocked(page: Page, reason: string) {
  for (let i = 0; i < 10 && (await page.getByTestId("skip-workers").count()) > 0; i++) {
    await page.getByTestId("skip-workers").first().click();
    await page.locator("#skip-reason").fill(reason);
    await page.getByTestId("confirm-skip").click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
}

for (const locale of ["en", "es"] as const) {
  test(`converter end to end (${locale})`, async ({ page }) => {
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Landing → start last week's period.
    await page.goto(`/${locale}/convert`);
    await expect(page.getByRole("heading", { level: 1, name: m.landing.title })).toBeVisible();
    await page.getByRole("link", { name: m.landing.start }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.upload })).toBeVisible();

    // Upload the whole sample folder.
    await page.getByTestId("file-input").setInputFiles(readdirSync(SAMPLES).map((f) => `${SAMPLES}/${f}`));
    await expect(page.getByTestId("document-row")).toHaveCount(readdirSync(SAMPLES).length, { timeout: 180_000 });
    await expect(page.getByTestId("processing")).toHaveCount(0);
    const timeclock = page.getByTestId("document-row").filter({ hasText: "timeclock" });
    await expect(timeclock).toContainText(m.convert.upload.status.read);
    await expect(timeclock).toContainText("51");
    // Photos and the PDF are read only from recorded readings in demo mode. Without them they cannot
    // be read, and a person archives them with a reason so the run can go on without their hours.
    for (let i = 0; i < 10 && (await page.getByTestId("archive").count()) > 0; i++) {
      await page.getByTestId("archive").first().click();
      await page.locator("#archive-reason").fill("No recorded reading in this demo (test)");
      await page.getByTestId("confirm-archive").click();
      await expect(page.getByRole("dialog")).toBeHidden();
    }

    // Review hours: every row a person must check is resolved before totals.
    await page.getByTestId("forward").click();
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.hours })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`^${m.convert.hours.filterAll.split(" (")[0]}`) }).click();
    await expect(page.getByTestId("hours-row").first()).toBeVisible();
    await expect(page.getByTestId("forward")).toBeEnabled();

    // Review totals: workers held by rules this version does not handle are skipped with a reason.
    await page.getByTestId("forward").click();
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.totals })).toBeVisible({ timeout: 60_000 });
    await skipAllBlocked(page, "Paid separately this week (test)");
    await expect(page.getByTestId("blocker")).toHaveCount(0);
    await expect(page.getByTestId("summary")).toContainText(locale === "en" ? "$" : "US$");

    // Files: the payroll file reconciles with the control totals shown; the invoice is a PDF.
    await page.getByTestId("forward").click();
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.files })).toBeVisible({ timeout: 60_000 });
    const payroll = page.getByTestId("payroll-file");
    const [csvDownload] = await Promise.all([page.waitForEvent("download"), payroll.getByRole("link", { name: m.common.download }).click()]);
    const csv = readFileSync((await csvDownload.path())!, "utf8").trim().split("\n");
    expect(csv[0]).toBe("last_name,first_name,title,gusto_employee_id,regular_hours,overtime_hours,double_overtime_hours");
    const workersShown = await payroll.locator("dd").first().textContent();
    expect(csv.length - 1).toBe(Number(workersShown));
    const invoices = page.getByTestId("invoices");
    const [pdfDownload] = await Promise.all([page.waitForEvent("download"), invoices.getByRole("link", { name: m.common.download }).first().click()]);
    expect(readFileSync((await pdfDownload.path())!).subarray(0, 4).toString()).toBe("%PDF");

    // The period is locked: the trail's earlier steps are no longer links.
    await expect(page.getByRole("navigation").getByRole("link", { name: m.convert.steps.hours })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
