/**
 * Slice (p): the command menu (decision 0038; docs/patterns/_components/command-menu.md) — GitHub's
 * command palette in Granite: ⌘K/Ctrl+K from anywhere, pages, records found on the server, `>` for
 * actions, `@` for people, a client's page as the scope, Tab to scope, Backspace to leave it, recent
 * items. English and Spanish; axe on the open menu.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;

test.beforeAll(() => {
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
});

for (const locale of ["en", "es"] as const) {
  const m = MESSAGES[locale];
  const c = m.commandMenu;

  test(`⌘K finds pages, records and actions; scopes narrow; recent items return (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await page.keyboard.press("ControlOrMeta+k");
    const menu = page.getByTestId("command-menu");
    await expect(menu).toBeVisible();
    const input = menu.getByRole("combobox");
    await expect(input).toBeFocused();
    await expect(menu.getByRole("group", { name: c.groups.pages })).toBeVisible();
    await expect(menu.getByRole("option", { name: m.nav.invoices, exact: false }).first()).toBeVisible();
    const result = await new AxeBuilder({ page }).include('[data-slot="dialog-content"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

    // A page by name: Enter goes there.
    await input.fill(m.nav.clients);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${locale}/clients$`));

    // A record found on the server: the client opens; its page becomes the scope next time.
    await page.keyboard.press("ControlOrMeta+k");
    await input.fill("@ prairie");
    const prairie = menu.getByRole("group", { name: c.groups.client }).getByRole("option").first();
    await expect(prairie).toBeVisible();
    await expect(menu.getByRole("group", { name: c.groups.invoice })).toHaveCount(0);
    const clientName = (await prairie.locator("span").first().textContent())!.trim();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${locale}/clients/[0-9a-f-]{36}$`));

    await page.keyboard.press("ControlOrMeta+k");
    const scope = menu.getByTestId("command-scope");
    await expect(scope).toContainText(clientName);
    await expect(menu.getByRole("group", { name: c.groups.suggestions })).toBeVisible();
    // Backspace on an empty input leaves the scope (GitHub).
    await page.keyboard.press("Backspace");
    await expect(scope).toHaveCount(0);
    // Recent: the client opened a moment ago.
    await expect(menu.getByRole("group", { name: c.groups.recent }).getByRole("option", { name: clientName })).toBeVisible();

    // Tab on a highlighted client adds it to the scope.
    await input.fill("@ prairie");
    await expect(menu.getByRole("group", { name: c.groups.client }).getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(scope).toBeVisible();
    await expect(input).toHaveValue("");

    // > actions only: shortcuts opens the shortcuts list.
    await page.keyboard.press("ControlOrMeta+Backspace");
    await input.fill(">");
    await expect(menu.getByRole("group", { name: c.groups.pages })).toHaveCount(0);
    await expect(menu.getByTestId("command-switchLanguage")).toBeVisible();
    await input.fill(`> ${c.actions.shortcuts.slice(0, 6)}`);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: m.nav.shortcuts })).toBeVisible();
    await page.keyboard.press("Escape");

    // ⌘K toggles it closed again; nothing matches says so.
    await page.getByTestId("command-menu-button").click();
    await input.fill("zzzz-nothing");
    await expect(menu.getByText(c.empty.replace("{text}", "zzzz-nothing"))).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(menu).toBeHidden();
  });

  test(`"Create a job order…" opens the job order form (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}/clients`);
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("command-menu").getByRole("combobox").fill(">");
    await page.getByTestId("command-createJobOrder").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/job-orders\\?new=1$`));
    await expect(page.getByRole("dialog")).toBeVisible();
  });
}
