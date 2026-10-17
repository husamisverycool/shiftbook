/**
 * Decision 0043 through the screens, in English and Spanish: Connections › Edit columns for a Beeline
 * export (saved, reopened, restored); Settings › Onboarding edits a policy (a new version) and adds
 * one; a credit note issued by hand is voided with a reason; the demo Recruiter on "Continue as".
 * Accessibility on the new page and dialogs.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { approveAndCreateFiles, toExceptions, toTotals, uploadPrairieWeek } from "./flow";

type Messages = typeof import("../../messages/en.json");
const MESSAGES = {
  en: JSON.parse(readFileSync("messages/en.json", "utf8")) as Messages,
  es: JSON.parse(readFileSync("messages/es.json", "utf8")) as Messages,
};
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? `{${k}}`);
const BEELINE = "beeline-timesheet-export";

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.title.length > 0 && document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

/** The invoice header's ⋯ menu, opened again until the item shows (a click before hydration is lost). */
async function openMenu(page: Page, item: string) {
  await expect(async () => {
    if (!(await page.getByTestId(item).isVisible())) await page.getByTestId("invoice-menu").click();
    await expect(page.getByTestId(item)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

for (const locale of ["en", "es"] as const) {
  test(`VMS columns, onboarding policies, a voided credit note and the demo recruiter (${locale})`, async ({ page, browser }) => {
    const m = MESSAGES[locale];
    const dialog = page.getByRole("dialog");
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // 1. Connections › Available: Beeline can be read; its columns follow the buyer's report.
    const name = m.connections.systems[BEELINE];
    await page.goto(`/${locale}/settings/connections?tab=available`);
    await page.getByTestId(`edit-columns-${BEELINE}`).click();
    await expect(page.getByTestId("columns-dialog")).toBeVisible();
    await expect(page.getByTestId("column-hours")).toHaveValue("Hours");
    await check(page, "edit columns");
    await page.getByTestId("column-hours").fill("Total Hrs");
    await page.getByTestId("columns-save").click();
    await expect(page.getByText(fill(m.vmsColumns.saved, { name })).first()).toBeVisible();
    await page.getByTestId(`edit-columns-${BEELINE}`).click();
    await expect(page.getByTestId("column-hours")).toHaveValue("Total Hrs");
    await page.getByTestId("columns-restore").click();
    await expect(page.getByText(fill(m.vmsColumns.restored, { name })).first()).toBeVisible();

    // 2. Settings › Onboarding from the agency menu: a change is a new version; a new policy is listed.
    const p = m.onboardingPolicies;
    await page.goto(`/${locale}`);
    await page.getByTestId("agency-menu").click();
    await page.getByTestId("menu-onboarding").click();
    await expect(page.getByRole("heading", { level: 1, name: p.title })).toBeVisible();
    await expect(page.getByTestId("policy-safety")).toContainText(p.defaults.safety);
    await check(page, "settings/onboarding");
    await page.getByTestId("edit-policy-safety").click();
    await expect(page.getByTestId("policy-dialog")).toBeVisible();
    await check(page, "edit policy");
    await page.getByTestId("policy-bodyEn").fill("Wear the gear the job needs and report any injury the same day.");
    await page.getByTestId("save-policy").click();
    await expect(page.getByText(p.saved).first()).toBeVisible();
    await expect(page.getByTestId("policy-safety")).toContainText(fill(p.version, { version: "2" }));
    await page.getByTestId("add-policy").click();
    await page.getByTestId("policy-titleEn").fill("Parking");
    await page.getByTestId("policy-bodyEn").fill("Park in the visitor lot.");
    await page.getByTestId("save-policy").click();
    await expect(page.getByTestId("policy-parking")).toContainText("Parking");

    // 3. A credit note issued by hand on the week's invoice, then voided with a reason.
    const period = await uploadPrairieWeek(page, locale);
    await page.goto(`/${locale}/convert?period=${period}&step=hours`);
    await toExceptions(page, m);
    await toTotals(page, m);
    await approveAndCreateFiles(page, m);
    await page.goto(`/${locale}/invoices`);
    await page.getByRole("link", { name: /^PLM-/ }).first().click();
    const invoiceUrl = page.url();
    await openMenu(page, "issue-credit-note");
    await page.getByTestId("issue-credit-note").click();
    await dialog.getByTestId("credit-reason").selectOption("discount");
    await dialog.getByTestId("credit-amount").fill("100.00");
    await dialog.getByTestId("confirm-credit-note").click();
    await expect(page.getByTestId("invoice-credit")).toContainText("-CN-01");
    await page.getByTestId("invoice-credit").getByRole("link").click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/);
    await openMenu(page, "void-credit-note");
    await page.getByTestId("void-credit-note").click();
    await check(page, "void credit note");
    const reason = locale === "en" ? "Issued against the wrong week" : "Emitida para la semana equivocada";
    await dialog.getByTestId("void-reason").fill(reason);
    await dialog.getByTestId("confirm-void-credit").click();
    await expect(page.getByTestId("summary-voided")).toContainText(reason);
    await page.goto(invoiceUrl);
    await expect(page.getByTestId("invoice-credit")).toHaveCount(0);

    // 4. The demo Recruiter on "Continue as".
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const fresh = await context.newPage();
    await fresh.goto(`/${locale}/sign-in`);
    await expect(fresh.getByTestId("continue-recruiter")).toContainText("Priya Raman");
    await fresh.getByTestId("continue-recruiter").click();
    await expect(fresh).toHaveURL(new RegExp(`/${locale}$`));
    await fresh.getByTestId("agency-menu").click();
    await expect(fresh.getByTestId("menu-person")).toContainText(m.roles.recruiter.name);
    await context.close();

    expect(errors).toEqual([]);
  });
}
