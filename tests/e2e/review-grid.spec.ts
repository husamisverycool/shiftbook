/**
 * Review grid (docs/patterns/review.md) end to end: a time-clock file with an unknown person, a
 * written total that does not match the punches, and times out of order. Each is resolved through
 * the screen — edit with a required reason, approve, reject — before totals can be computed.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const FIXTURE = "tests/e2e/fixtures/timeclock-messy-2026-10-05.csv";

for (const locale of ["en", "es"] as const) {
  test(`review grid: fix, approve and reject flagged rows (${locale})`, async ({ page }) => {
    const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as typeof import("../../messages/en.json");
    const h = m.convert.hours;
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(`/${locale}/convert`);
    await page.getByRole("link", { name: m.landing.start }).first().click();
    await page.getByTestId("file-input").setInputFiles(FIXTURE);
    await expect(page.getByTestId("document-row")).toHaveCount(1, { timeout: 60_000 });
    await expect(page.getByTestId("document-row")).toContainText(m.convert.upload.status.read);

    await page.getByTestId("forward").click();
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.hours })).toBeVisible();
    await expect(page.getByTestId("hours-blocker")).toBeVisible();
    await expect(page.getByTestId("forward")).toBeDisabled();
    await expect(page.getByTestId("hours-row")).toHaveCount(3); // the clean row is not shown under "needs review"

    // Unknown person → matched to a worker, with a required reason.
    const ortiz = page.getByTestId("hours-row").filter({ hasText: "Ortiz" });
    await expect(ortiz).toContainText(h.unmatched);
    await ortiz.getByRole("button", { name: h.edit }).click();
    await page.getByRole("combobox", { name: h.colWorker }).selectOption({ label: "Olivia Hart" });
    await expect(page.getByTestId("save-edit")).toBeDisabled();
    await page.getByTestId("reason-trigger").click();
    await page.getByRole("menuitemcheckbox", { name: h.editReasons.matched_worker }).click();
    await page.keyboard.press("Escape");
    await page.getByTestId("save-edit").click();
    await expect(page.getByTestId("reason-row")).toHaveCount(0);

    // Written total differs from the punches → a person checks and approves.
    await page.getByTestId("hours-row").filter({ hasText: "Ruiz" }).getByRole("button", { name: h.approve }).click();
    // Time out before time in → rejected (never paid).
    await page.getByTestId("hours-row").filter({ hasText: "Haddad" }).getByRole("button", { name: h.reject }).click();

    await expect(page.getByText(h.noRows)).toBeVisible();
    await expect(page.getByTestId("hours-blocker")).toHaveCount(0);
    await expect(page.getByTestId("forward")).toBeEnabled();

    // The edit is marked and its reason is in the entry's history.
    await page.getByRole("button", { name: new RegExp(`^${h.filterAll.split(" (")[0]}`) }).click();
    const olivia = page.getByTestId("hours-row").filter({ hasText: "Olivia Hart" });
    await expect(olivia).toContainText(h.edited);
    await olivia.getByRole("button", { name: h.openSource }).click();
    const panel = page.getByTestId("source-panel");
    await expect(panel).toContainText(h.historyActions.update);
    await expect(panel).toContainText(h.editReasons.matched_worker);
    await expect(panel).toContainText("Olivia Hart");
    await page.keyboard.press("Escape");

    // Totals compute with the rejected row left out.
    await page.getByTestId("forward").click();
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.totals })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("blocker")).toHaveCount(0);
    await expect(page.getByTestId("summary")).toContainText("24:00");
    expect(errors).toEqual([]);
  });
}
