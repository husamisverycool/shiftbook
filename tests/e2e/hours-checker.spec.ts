/**
 * Slice (q): the free Illinois 720-hour checker (docs/patterns/tools/il-720-hours.md), signed out, in
 * English and Spanish: the sample counts one worker past 720 hours, one near, one under; a CSV file
 * with an unreadable row and the Spanish column names; a file missing a column; the CSV download;
 * axe on the page with results.
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;

test.use({ storageState: { cookies: [], origins: [] } });

for (const locale of ["en", "es"] as const) {
  const m = MESSAGES[locale].hoursChecker;

  test(`anyone can check hours with no account: the sample, a file, a missing column, the download (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}/tools/il-720-hours`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/tools/il-720-hours$`));
    await expect(page.getByRole("heading", { level: 1, name: m.title })).toBeVisible();

    // The sample: Rosa 16 weeks of 50 h (past 720), Dev 13 weeks (650 h: near), Lee 6 weeks (under).
    await page.getByTestId("checker-as-of").fill("2026-05-01");
    await page.getByTestId("checker-sample").click();
    await page.getByTestId("checker-check").click();
    const results = page.getByTestId("checker-results");
    await expect(results).toBeVisible();
    await expect(page.getByTestId("checker-over-value")).toHaveText("1");
    await expect(page.getByTestId("checker-near-value")).toHaveText("1");
    const rows = results.getByTestId("checker-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveAttribute("data-status", "over");
    await expect(rows.nth(0)).toContainText("Rosa Example");
    await expect(rows.nth(0)).toContainText("800:00");
    await expect(rows.nth(1)).toHaveAttribute("data-status", "near");
    await expect(rows.nth(1)).toContainText(m.results.about.split("{date}")[0]!.trim());
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

    const download = page.waitForEvent("download");
    await page.getByTestId("checker-download").click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(m.results.file);
    const csv = readFileSync(await file.path(), "utf8");
    expect(csv.split("\r\n")[1]).toContain("Rosa Example");

    // A file with the Spanish column names and one row whose hours cannot be read.
    await page.getByTestId("checker-file").setInputFiles({
      name: "horas.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Trabajador,Cliente,Fecha,Horas\nAna Muestra,Cliente Uno (ejemplo),2026-03-02,8\nAna Muestra,Cliente Uno (ejemplo),3/3/2026,8:30\nAna Muestra,Cliente Uno (ejemplo),2026-03-04,muchas\n"),
    });
    await page.getByTestId("checker-check").click();
    await expect(results.getByTestId("checker-row")).toHaveCount(1);
    await expect(results.getByTestId("checker-row")).toContainText("16:30");
    await expect(page.getByTestId("checker-problems")).toContainText(m.results.problem.replace("{row}", "4").replace("{what}", m.results.problemWhat.hours));

    // A file without a Client column says which is missing.
    await page.getByRole("button", { name: m.tool.clearFile }).click();
    await page.getByTestId("checker-file").setInputFiles({ name: "x.csv", mimeType: "text/csv", buffer: Buffer.from("Worker,Date,Hours\nA,2026-03-02,8\n") });
    await page.getByTestId("checker-check").click();
    await expect(page.getByTestId("checker-error")).toContainText(MESSAGES[locale].hoursChecker.columns.client);
  });
}
