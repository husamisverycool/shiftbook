/**
 * Slice (j) step 1 through the screens, in English and Spanish (plan "Done means" 2). The demo on
 * its day: Kwame Boateng's Massachusetts job order is overdue; the Massachusetts and Illinois
 * registration renewals and Kateryna Bondarenko's I-9 reverification are due soon (the sidebar's
 * badge: 4); the workers' comp renewal and audit and Prairie Line's next proof page are upcoming.
 * The Owner opens Compliance (G then O), filters, opens the Illinois renewal, adds a file and a note,
 * marks it done; sets Kwame's job order aside with a reason; records the reverification; switches
 * the calendar's views by key; adds the renewed Illinois registration in settings.
 * Accessibility checks on every new screen.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

for (const locale of ["en", "es"] as const) {
  test(`compliance: the most urgent first, a duty done with its file and note, one set aside, the calendar by key, a renewal entered (${locale})`, async ({ page }) => {
    test.setTimeout(240_000);
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => msg.type() === "error" && /MISSING_MESSAGE|FORMATTING_ERROR/.test(msg.text()) && errors.push(msg.text()));
    const dialog = page.getByRole("dialog");
    const rows = page.getByTestId("obligation-row");

    // G then O from another page; the badge counts what is overdue or due soon.
    await page.goto(`/${locale}/job-orders`);
    await expect(page.getByTestId("compliance-badge")).toHaveText("4");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("g");
    await page.keyboard.press("o");
    await expect(page.getByRole("heading", { level: 1, name: m.compliance.title })).toBeVisible();
    await expect(rows).toHaveCount(7);
    await expect(rows.first()).toContainText(m.compliance.kinds.ma_job_order);
    await expect(rows.first()).toContainText("Kwame Boateng");
    await expect(rows.first().getByTestId("status-overdue")).toBeVisible();
    await check(page, "compliance list");

    // Filters: Massachusetts; the workers area; search.
    await page.getByTestId("compliance-state").selectOption("MA");
    await expect(rows).toHaveCount(2);
    await page.getByTestId("compliance-state").selectOption("");
    await expect(rows).toHaveCount(7);
    await page.getByTestId("area-workers").click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Kateryna Bondarenko");
    await page.getByTestId("area-all").click();
    await expect(rows).toHaveCount(7);
    await page.keyboard.press("/");
    await page.keyboard.type("IL-DTLSA");
    await page.keyboard.press("Enter");
    await expect(rows).toHaveCount(1);

    // The Illinois renewal: a file, a note, done.
    await rows.first().getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1, name: m.compliance.kinds.il_registration_renewal })).toBeVisible();
    await expect(page.getByText(m.compliance.asks.il_registration_renewal.replace("{days}", "60"))).toBeVisible();
    await check(page, "obligation overview");
    await page.getByTestId("obligation-tab-evidence").click();
    await expect(page.getByTestId("no-files")).toBeVisible();
    await page.getByTestId("evidence-input").setInputFiles({ name: "il-renewal-receipt.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% demo receipt\n") });
    await page.getByTestId("add-evidence").click();
    await expect(page.getByTestId("evidence-file")).toContainText("il-renewal-receipt.pdf");
    await check(page, "obligation evidence");
    await page.getByTestId("obligation-tab-notes").click();
    await page.getByTestId("note-body").fill("Fee check mailed with the bond rider.");
    await page.getByTestId("add-note").click();
    await expect(page.getByTestId("obligation-note")).toContainText("Fee check mailed");
    await page.getByTestId("mark-done").click();
    await dialog.getByTestId("close-note-input").fill("Renewal filed online.");
    await check(page, "mark done");
    await dialog.getByTestId("confirm-close").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("status-done").first()).toBeVisible();
    await page.getByTestId("obligation-tab-history").click();
    await expect(page.getByTestId("obligation-history")).toContainText("Renewal filed online.");
    await check(page, "obligation history");

    // Kwame's job order does not apply: a reason is required.
    await page.goto(`/${locale}/compliance`);
    await expect(page.getByTestId("compliance-badge")).toHaveText("3");
    await rows.first().getByRole("link").click();
    await page.getByTestId("not-applicable").click();
    await expect(dialog.getByTestId("confirm-close")).toBeDisabled();
    await dialog.getByTestId("close-note-input").fill("Secretarial placement: exempt.");
    await dialog.getByTestId("confirm-close").click();
    await expect(page.getByTestId("status-not_applicable").first()).toBeVisible();

    // Kateryna's reverification.
    await page.goto(`/${locale}/compliance?area=workers`);
    await rows.first().getByRole("link").click();
    await page.locator("#next-expires").fill("2028-06-30");
    await page.getByTestId("save-reverify").click();
    await expect(page.getByTestId("status-done").first()).toBeVisible();

    // The calendar: month by default; w, a, t and n by key.
    await page.goto(`/${locale}/compliance/calendar?status=all`);
    await expect(page.getByTestId("calendar-month")).toBeVisible();
    await check(page, "calendar month");
    await page.keyboard.press("w");
    await expect(page.getByTestId("calendar-week")).toBeVisible();
    await page.keyboard.press("a");
    await expect(page.getByTestId("calendar-agenda")).toBeVisible();
    await check(page, "calendar agenda");
    await page.keyboard.press("m");
    await expect(page.getByTestId("calendar-month")).toBeVisible();
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/date=2026-11-01/);
    await expect(page.getByTestId("calendar-chip").filter({ hasText: m.compliance.kinds.il_registration_renewal })).toHaveCount(1);
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(page).toHaveURL(/date=2026-10-01/);
    await expect(page.getByTestId("calendar-range")).toContainText(locale === "en" ? "October 2026" : "octubre de 2026");
    await page.keyboard.press("t");
    await expect(page).not.toHaveURL(/date=/);

    // Settings: the renewed Illinois registration.
    await page.getByTestId("agency-menu").click();
    await page.getByTestId("menu-compliance-settings").click();
    await expect(page.getByRole("heading", { level: 1, name: m.complianceSettings.title })).toBeVisible();
    await check(page, "compliance settings");
    await page.getByTestId("add-registration").click();
    await dialog.getByTestId("reg-number").fill("IL-DTLSA-0001-DEMO");
    await dialog.getByTestId("reg-expires").fill("2027-12-31");
    await check(page, "add registration");
    await dialog.getByTestId("save-registration").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("registration-row")).toHaveCount(3);
    await expect(page.getByTestId("registration-row").filter({ hasText: "IL-DTLSA-0000-DEMO" })).toContainText(m.complianceSettings.registrations.replaced);
    expect(errors).toEqual([]);
  });
}
