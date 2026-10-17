/**
 * Slice u (decision 0041), in English and Spanish, from a fresh demo: the week's schedule with its open
 * row and status bar; a warning opened from the status bar; a new open shift; the three-step publish; a
 * demo worker confirming in the Shifts screen; Margin › Attendance. Accessibility on the new screens.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

for (const locale of ["en", "es"] as const) {
  test(`schedule: grid, warnings, a new open shift, publish, a worker confirms, attendance (${locale})`, async ({ page }) => {
    test.setTimeout(240_000);
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });

    await page.goto(`/${locale}/schedule`);
    await expect(page.getByRole("heading", { level: 1, name: m.schedule.title })).toBeVisible();
    await expect(page.getByTestId("schedule-open-row")).toBeVisible();
    await expect(page.getByTestId("schedule-chip").first()).toBeVisible();
    await check(page, "schedule");

    // The status bar opens the declined shift and says why.
    await page.getByTestId("schedule-status-warnings").click();
    await expect(page.getByTestId("shift-warning")).toBeVisible();
    await page.keyboard.press("Escape");

    // A new open shift, two copies, on the first day of the week.
    await page.getByTestId("schedule-by-jobOrder").click();
    await expect(page).toHaveURL(/by=jobOrder/);
    const add = page.locator('[data-testid^="schedule-add-open-"]').first();
    await add.focus();
    await add.click();
    const dialog = page.getByTestId("shift-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("shift-job").selectOption({ index: 1 });
    await dialog.getByTestId("shift-copies").fill("2");
    await dialog.getByTestId("shift-save").click();
    await expect(dialog).toBeHidden();

    // Publish: only the changes, every client, ask for confirmation.
    await page.getByTestId("schedule-publish").click();
    const publish = page.getByTestId("publish-dialog");
    await expect(publish).toBeVisible();
    await publish.getByTestId("publish-next").click();
    await publish.getByTestId("publish-next").click();
    await publish.getByTestId("publish-notify-confirm").check();
    await publish.getByTestId("publish-confirm").click();
    await expect(publish).toBeHidden();
    await expect(page.getByTestId("schedule-status-unpublished")).toBeDisabled();

    // A demo worker answers in the Shifts screen: the first one with a shift waiting for an answer.
    await page.goto(`/${locale}/shifts-preview`);
    await expect(page.getByTestId("worker-shifts")).toBeVisible();
    const picker = page.getByTestId("worker-picker");
    const options = await picker.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    let confirmed = false;
    for (const value of options) {
      await picker.selectOption(value);
      await page.waitForURL(new RegExp(`worker=${value}`));
      if ((await page.getByTestId("worker-confirm").count()) > 0) {
        await page.getByTestId("worker-confirm").first().click();
        await expect(page.getByText(m.shiftsWorker.done).first()).toBeVisible();
        confirmed = true;
        break;
      }
    }
    expect(confirmed).toBe(true);
    await check(page, "worker shifts");

    // Attendance: the figures and the clients.
    await page.goto(`/${locale}/margin/attendance`);
    await expect(page.getByTestId("attendance-fill")).toBeVisible();
    await expect(page.getByTestId("attendance-clients")).toBeVisible();
    await check(page, "attendance");
  });
}
