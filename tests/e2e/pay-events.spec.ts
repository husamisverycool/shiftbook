/**
 * Slice G2 through the screens, in English and Spanish: on Review totals a person adds pay with a
 * reason. The Prairie week (Illinois): Anita Patel 24 h at $18.25 = $438.00 gross, no overtime.
 *   A $50.00 nondiscretionary bonus for the week of October 5: gross $438.00 + $50.00 = $488.00 (no
 *   overtime hours, so the higher regular rate changes nothing else). Marcus Bell's overtime week is
 *   not used: the demo pays through Gusto, which cannot carry a regular rate raised by a bonus, and
 *   the run holds him for it (as it should).
 *   A missed meal period confirmed in Illinois pays nothing (no state premium there): the engine
 *   says so as a warning, and the entry stays listed with its reason.
 * Then the bonus is removed with a reason and the gross is $438.00 again.
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { toExceptions, toTotals, uploadPrairieWeek } from "./flow";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${where}: ${v.id} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

async function addPay(page: Page, kind: string, fill: (dialog: ReturnType<Page["getByRole"]>) => Promise<void>, reason: string) {
  await page.getByTestId("pay-event-add").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("pay-event-worker").selectOption({ label: "Anita Patel" });
  await dialog.getByTestId("pay-event-kind").selectOption(kind);
  await fill(dialog);
  await dialog.getByTestId("pay-event-reason").fill(reason);
  await dialog.getByTestId("pay-event-save").click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
}

for (const locale of ["en", "es"] as const) {
  test(`additional pay on Review totals: a bonus raises the week's pay; a meal premium where none applies is flagged (${locale})`, async ({ page }) => {
    test.setTimeout(240_000);
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const period = await uploadPrairieWeek(page, locale);
    await page.goto(`/${locale}/convert?period=${period}&step=hours`);
    await toExceptions(page, m);
    await toTotals(page, m);
    const events = page.getByTestId("pay-events");
    await expect(events.getByText(m.payEvents.empty)).toBeVisible();

    await addPay(page, "bonus", async (d) => {
      await d.getByTestId("pay-event-week").selectOption("2026-10-05");
      await d.getByTestId("pay-event-amount").fill("50.00");
    }, "Perfect attendance (demo)");
    await expect(events.getByTestId("pay-event-row")).toHaveCount(1);
    await page.getByRole("tab", { name: m.convert.totals.tabPay }).click();
    await expect(page.getByText("$488.00").first()).toBeVisible();

    await addPay(page, "meal_period_missed", async (d) => {
      await d.getByTestId("pay-event-day").fill("2026-10-06");
    }, "Supervisor confirmed no lunch (demo)");
    await expect(events.getByTestId("pay-event-row")).toHaveCount(2);
    await expect(page.getByText(m.convert.totals.blockers.premium_not_applicable)).toBeVisible();
    await check(page, "review totals with additional pay");

    const bonusRow = events.getByTestId("pay-event-row").filter({ hasText: "$50.00" });
    await bonusRow.getByRole("button", { name: m.payEvents.actions }).click();
    await page.getByTestId("pay-event-remove").click();
    await page.getByTestId("pay-event-remove-reason").fill("Entered for the wrong week (demo)");
    await page.getByTestId("pay-event-remove-confirm").click();
    await expect(events.getByTestId("pay-event-row")).toHaveCount(1);
    await page.getByRole("tab", { name: m.convert.totals.tabPay }).click();
    await expect(page.getByText("$438.00").first()).toBeVisible();
  });
}
