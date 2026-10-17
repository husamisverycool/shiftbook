/**
 * Slice r through the screens, in English and Spanish (plan `.claude/plans/slice-r-notifications.md`):
 * the Notifications inbox and its sidebar badge (Linear), Settings › Notifications and › Collections,
 * then the demo week's invoice sent with its PDF, a credit note issued and a promise to pay recorded
 * (Stripe), the promise shown in receivables. Accessibility checks on each new screen.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { approveAndCreateFiles, toExceptions, toTotals, uploadPrairieWeek } from "./flow";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;
const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

for (const locale of ["en", "es"] as const) {
  test(`notifications, collection settings, an invoice sent, credited and promised (${locale})`, async ({ page }) => {
    test.setTimeout(420_000);
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const dialog = page.getByRole("dialog");

    // The demo's compliance duties already call for notices: the badge counts them, the inbox lists them.
    await page.goto(`/${locale}`);
    const badge = page.getByTestId("notifications-badge");
    await expect(badge).toBeVisible();
    await page.getByRole("link", { name: m.nav.notifications, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: m.notify.title })).toBeVisible();
    const rows = page.getByTestId("notification");
    await expect(rows.first()).toBeVisible();
    await check(page, "notifications");
    // U marks the selected notice read; Alt+U marks all read and the badge goes.
    await rows.first().focus();
    await page.keyboard.press("u");
    await expect(rows.first()).toHaveAttribute("data-read", "true");
    await page.getByTestId("mark-all-read").click();
    await expect(page.getByText(m.notify.markedAllRead)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("notifications-empty")).toContainText(m.notify.emptyUnread);
    await expect(page.getByTestId("notifications-badge")).toHaveCount(0);
    await page.getByTestId("tab-all").click();
    await expect(page.getByTestId("notification").first()).toBeVisible();

    // Settings › Notifications: email per kind, saved at once.
    await page.getByTestId("agency-menu").click();
    await page.getByTestId("menu-notification-settings").click();
    await expect(page.getByRole("heading", { level: 1, name: m.notify.settings.title })).toBeVisible();
    await page.getByTestId("email-obligation_overdue").getByRole("switch").click();
    await expect(page.getByText(m.notify.settings.saved).first()).toBeVisible();
    await check(page, "settings/notifications");

    // Settings › Collections: the demo emails reminders; the overdue one moves to 14 days after.
    await page.getByTestId("agency-menu").click();
    await page.getByTestId("menu-collections").click();
    await expect(page.getByRole("heading", { level: 1, name: m.collect.settings.title })).toBeVisible();
    await expect(page.getByTestId("reminders-enabled")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("days-overdue").selectOption("14");
    await page.getByTestId("save-schedule").click();
    await expect(page.getByText(m.collect.settings.saved)).toBeVisible();
    await check(page, "settings/collections");

    // The week's files: Prairie Line's invoice.
    const period = await uploadPrairieWeek(page, locale);
    await page.goto(`/${locale}/convert?period=${period}&step=hours`);
    await toExceptions(page, m);
    await toTotals(page, m);
    await approveAndCreateFiles(page, m);
    await page.goto(`/${locale}/invoices`);
    await page.getByRole("link", { name: /^PLM-/ }).first().click();
    await expect(page.getByTestId("summary-sent")).toContainText(m.collect.send.never);

    // Send invoice: to the billing contact, the PDF attached; the facts then say when and to whom.
    await page.getByTestId("send-invoice").click();
    await expect(dialog.getByTestId("send-to")).toHaveValue(/@/);
    const to = await dialog.getByTestId("send-to").inputValue();
    await expect(dialog.getByTestId("send-attachment")).toContainText(".pdf");
    await check(page, "send invoice");
    await dialog.getByTestId("send-message").fill(locale === "en" ? "Thanks for the week." : "Gracias por la semana.");
    await dialog.getByTestId("confirm-send").click();
    await expect(page.getByText(fill(m.collect.send.sent, { email: to }))).toBeVisible();
    await expect(page.getByTestId("summary-sent")).toContainText(to);
    await expect(page.getByTestId("send-invoice")).toContainText(m.collect.send.resend);

    // Issue a credit note for $100.00: numbered in the invoice's series, listed under its payments.
    await page.getByTestId("invoice-menu").click();
    await page.getByTestId("issue-credit-note").click();
    await dialog.getByTestId("credit-reason").selectOption("discount");
    await dialog.getByTestId("credit-amount").fill("100.00");
    await expect(dialog.getByTestId("credit-after")).not.toBeEmpty();
    await check(page, "credit note");
    await dialog.getByTestId("confirm-credit-note").click();
    await expect(page.getByText(/-CN-01/).first()).toBeVisible();
    await expect(page.getByTestId("invoice-credit")).toContainText("-CN-01");

    // A promise to pay, today: shown on the invoice and in receivables.
    await page.getByTestId("add-promise").click();
    await dialog.getByTestId("promise-amount").fill("500.00");
    await dialog.getByTestId("confirm-promise").click();
    await expect(page.getByText(m.collect.promise.saved)).toBeVisible();
    await expect(page.getByTestId("invoice-promise")).toBeVisible();
    await page.goto(`/${locale}/receivables`);
    await page.getByRole("row").filter({ hasText: "Prairie Line Manufacturing (demo)" }).getByTestId("amount-total").first().click();
    await expect(page.getByTestId("promised").first()).toBeVisible();

    expect(errors).toEqual([]);
  });
}
