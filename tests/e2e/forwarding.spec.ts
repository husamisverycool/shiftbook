/**
 * Slice (y), decision 0042: timesheets by email, in English and Spanish. The agency's forwarding
 * address on Settings › Connections and beside Convert timesheets' upload; the demo's test email runs
 * the same code as a real one and its files land in a week (or wait for one, and are added to a week);
 * an accepted sender is added and removed. Accessibility checks on the section.
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
  test(`timesheets by email: the address, a test email filed into a week, accepted senders (${locale})`, async ({ page }) => {
    test.setTimeout(180_000);
    const m = MESSAGES[locale].forwarding;
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });

    await page.goto(`/${locale}/settings/connections`);
    const section = page.getByTestId("forwarding");
    await expect(section.getByRole("heading", { name: m.title })).toBeVisible();
    const address = page.getByTestId("forwarding-address");
    await expect(address).toHaveText(/^timesheets\+[a-z2-7]{20}@in\.granite\.example$/);
    await expect(page.getByTestId("forwarding-emails")).toContainText(m.recent.empty);
    await check(page, "forwarding section");

    // The demo's test email: the same code as a real one, no outside call.
    await page.getByTestId("forwarding-test-email").click();
    const row = page.getByTestId("forwarding-email").first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("IL-prairie-line-timeclock-2026-10-05.csv");
    const status = row.getByTestId("forwarding-email-status");
    await expect(status).toHaveText(new RegExp(`${m.recent.status.filed}|${m.recent.status.held}`));
    if ((await status.textContent())?.includes(m.recent.status.held)) {
      // Last week is already paid: a person adds the files to an open week.
      await row.getByTestId("forwarding-week").selectOption({ index: 1 });
      await row.getByTestId("forwarding-file").click();
      await expect(row.getByTestId("forwarding-email-status")).toHaveText(m.recent.status.filed);
    }
    await expect(row).toContainText(m.recent.outcome.filed);

    // An accepted sender (Ramp's receipt forwarding): added, then removed.
    await page.getByTestId("forwarding-sender-add").click();
    await page.getByTestId("forwarding-sender-input").fill("not a sender");
    await page.getByTestId("forwarding-sender-save").click();
    await expect(page.getByRole("alert").filter({ hasText: "not a sender" })).toBeVisible();
    await page.getByTestId("forwarding-sender-input").fill("@Prairie.example.com");
    await page.getByTestId("forwarding-sender-save").click();
    const senders = page.getByTestId("forwarding-senders");
    await expect(senders).toContainText("@prairie.example.com");
    await senders.getByRole("button", { name: m.senders.remove.replace("{sender}", "@prairie.example.com") }).click();
    await expect(senders).toContainText(m.senders.anyone);
    await check(page, "forwarding after the test email");

    // "Open the week": Convert timesheets' upload, with the emailed file listed and the same address.
    const shown = await address.textContent();
    await row.getByRole("link", { name: m.recent.openWeek }).click();
    await expect(page).toHaveURL(/\/convert\?period=/);
    await expect(page.getByTestId("convert-forwarding-address")).toHaveText(shown!);
    await expect(page.getByText("IL-prairie-line-timeclock-2026-10-05.csv").first()).toBeVisible();
  });
}
