/**
 * Decision 0046 (owner, 2026-10-18: "customize between different styles of colors … not just one
 * choice"): each person picks their colour and theme in Settings › Account › Appearance; the page shows
 * it at once and keeps it after a reload. Every colour passes axe in light and in dark.
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;

async function axe(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

const html = (page: Page) => page.locator("html");

for (const locale of ["en", "es"] as const) {
  test(`a person chooses Teal and Dark; both stay after a reload (${locale})`, async ({ page }) => {
    const m = MESSAGES[locale];
    await page.goto(`/${locale}/settings/account`);
    const picker = page.getByTestId("accent-picker");
    await expect(picker.getByRole("radio", { name: m.account.accentNames.indigo })).toHaveAttribute("aria-checked", "true");

    await picker.getByRole("radio", { name: m.account.accentNames.teal }).click();
    await expect(html(page)).toHaveAttribute("data-accent", "teal");
    await expect(page.getByText(m.account.accentSaved)).toBeVisible();
    await page.getByTestId("appearance").selectOption("dark");
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await expect(page.getByText(m.account.appearanceSaved)).toBeVisible();

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-accent", "teal");
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await expect(page.getByTestId("accent-picker").getByRole("radio", { name: m.account.accentNames.teal })).toHaveAttribute("aria-checked", "true");

    // Arrow keys move the choice (a radio group).
    await page.getByTestId("accent-teal").focus();
    await page.keyboard.press("ArrowRight");
    await expect(html(page)).toHaveAttribute("data-accent", "graphite");
    await expect(page.getByTestId("accent-graphite")).toBeFocused();

    // Back to the defaults, so other tests see the app as they expect.
    await page.getByTestId("accent-indigo").click();
    await expect(page.getByText(m.account.accentSaved).first()).toBeVisible();
    await page.getByTestId("appearance").selectOption("system");
    await expect(html(page)).toHaveAttribute("data-accent", "indigo");
  });
}

test("every colour is readable on the Account page, light and dark", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/en/settings/account");
  for (const theme of ["light", "dark"] as const) {
    await page.getByTestId("appearance").selectOption(theme);
    for (const accent of ["indigo", "blue", "teal", "graphite"] as const) {
      await page.getByTestId(`accent-${accent}`).click();
      await expect(html(page)).toHaveAttribute("data-accent", accent);
      await axe(page, `${accent} ${theme}`);
    }
  }
  await page.getByTestId("accent-indigo").click();
  await page.getByTestId("appearance").selectOption("system");
  await expect(html(page)).toHaveAttribute("data-accent", "indigo");
});
