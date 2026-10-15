/**
 * The photo path through the screens: a sign-in sheet photo is read (redaction, two passes,
 * comparison — replayed from a hand-written test recording, see fixtures/make-photo-fixture.ts),
 * its rows appear in the review grid, and the side panel shows the redacted page with a box around
 * each value.
 */
import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test("a photographed sign-in sheet is read and its values are boxed on the page", async ({ page }) => {
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
  await page.goto("/en/convert");
  await page.getByRole("link", { name: "Start" }).first().click();
  await page.getByTestId("file-input").setInputFiles("tests/e2e/fixtures/photo-sign-in-2026-10-06.jpg");
  const doc = page.getByTestId("document-row");
  await expect(doc).toHaveCount(1, { timeout: 120_000 });
  await expect(doc).toContainText("Read");
  await expect(doc).toContainText("Prairie Line Manufacturing");

  await page.getByTestId("forward").click();
  await page.getByRole("button", { name: /^All/ }).click();
  const robert = page.getByTestId("hours-row").filter({ hasText: "Robert Jones" });
  await expect(robert).toContainText("3:00 PM");
  await expect(robert).toContainText("11:30 PM");
  await expect(robert).toContainText("8:00");
  await expect(page.getByTestId("hours-row").filter({ hasText: "Kateryna Bondarenko" })).toContainText("7:30");

  await robert.getByRole("button", { name: "Open source" }).click();
  const panel = page.getByTestId("source-panel");
  const image = panel.getByRole("img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(panel.locator("[data-state]")).toHaveCount(5); // worker, in, out, break, total
  await expect(panel).toContainText("Read from the timesheet");
});
