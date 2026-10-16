/**
 * Slice (e) through the screens, in English and Spanish (plan "Done means" 2): a client that requires
 * approval holds the week at Exceptions until it approves; the Owner approves the run, takes the
 * approval back with a reason, approves again and creates the files; then a correction adds two
 * hours and makes a differences-only payroll file and a supplemental invoice. Then the accessibility
 * check on the new and changed screens.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { money, signedMoney } from "../../src/components/shiftbook/format";
import { approveAndCreateFiles, toExceptions, toTotals, uploadPrairieWeek } from "./flow";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;
const PRAIRIE = "Prairie Line Manufacturing (demo)";

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

/** Client approvals: Prairie Line's row menu turns "Approval required before payroll" on. */
async function requireApproval(page: Page, locale: "en" | "es", period: string) {
  const m = MESSAGES[locale];
  await page.goto(`/${locale}/approvals?period=${period}`);
  const prairie = page.getByTestId("approval-row").filter({ hasText: PRAIRIE });
  await expect(prairie.getByTestId("approval-required")).toHaveCount(0);
  await prairie.getByTestId("row-menu").click();
  await page.getByTestId("toggle-approval-required").click();
  await expect(prairie.getByTestId("approval-required")).toHaveText(m.approvals.requiredBadge);
}

/** Sends Prairie Line's week and approves all of it as the client, through the demo email's link. */
async function clientApprovesAll(page: Page, locale: "en" | "es") {
  const m = MESSAGES[locale];
  const prairie = page.getByTestId("approval-row").filter({ hasText: PRAIRIE });
  await prairie.getByTestId("row-send").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(m.approvals.approverName).fill("Dana Approver");
  await dialog.getByLabel(m.approvals.approverEmail).fill("dana@prairie.example");
  await dialog.getByLabel(m.approvals.approverLanguage).selectOption(locale);
  await dialog.getByTestId("send-request").click();
  await expect(dialog).toBeHidden();
  await prairie.getByRole("link", { name: PRAIRIE }).click();
  await page.getByTestId("view-email").first().click();
  await page.getByTestId("demo-copy").getByTestId("email-link").click();
  await page.getByLabel(m.portal.fullName).fill("Dana Approver");
  await page.getByRole("checkbox").check();
  await page.getByTestId("approve-hours").click();
  await expect(page.getByTestId("portal-status")).toContainText("Dana Approver");
}

for (const locale of ["en", "es"] as const) {
  test(`a client that must approve holds the run; the Owner approves, unapproves, approves again and creates the files (${locale})`, async ({ page }) => {
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const period = await uploadPrairieWeek(page, locale);
    await requireApproval(page, locale, period);

    // Exceptions: the week is held until Prairie Line approves it; the row opens Client approvals.
    await page.goto(`/${locale}/convert?period=${period}&step=hours`);
    await toExceptions(page, m);
    const held = page.getByTestId("blocker");
    await expect(held).toHaveCount(1);
    await expect(held).toContainText(m.convert.totals.blockers.client_approval_missing);
    await expect(held).toContainText(`${PRAIRIE}: 8`);
    await expect(page.getByTestId("exceptions-summary")).toContainText(locale === "en" ? "1 problem" : "1 problema");
    await expect(page.getByTestId("forward")).toBeDisabled();
    // Review totals cannot be opened by its address while the run is blocked.
    await page.goto(`/${locale}/convert?period=${period}&step=totals`);
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.exceptions })).toBeVisible({ timeout: 60_000 });
    await held.getByRole("link", { name: m.convert.totals.openApprovals }).click();
    await expect(page.getByRole("heading", { level: 1, name: m.approvals.title })).toBeVisible();
    await clientApprovesAll(page, locale);

    // Coming back to Exceptions checks again: nothing blocks now.
    await page.goto(`/${locale}/convert?period=${period}&step=exceptions`);
    await expect(page.getByTestId("exceptions-summary")).toContainText(m.convert.exceptions.summaryNone, { timeout: 60_000 });
    await toTotals(page, m);
    // Marcus 46 h: 40 h × $18.25 + 6 h × $27.375 = $894.25; Anita 24 h × $18.25 = $438.00.
    await expect(page.getByTestId("summary")).toContainText(money(89_425 + 43_800, locale));

    // The Owner approves; the approval can be taken back with a reason until the files exist.
    await page.getByTestId("forward").click();
    await expect(page.getByTestId("approval")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("forward")).toHaveText(m.convert.forward.totals);
    await page.getByTestId("unapprove").click();
    await expect(page.getByTestId("confirm-unapprove")).toBeDisabled();
    await page.getByLabel(m.convert.approval.reason).fill(locale === "en" ? "Checking one more timesheet" : "Reviso una hoja más");
    await page.getByTestId("confirm-unapprove").click();
    await expect(page.getByTestId("approval")).toHaveCount(0);
    await expect(page.getByTestId("forward")).toHaveText(m.convert.forward.approve);
    await page.getByTestId("forward").click();
    await expect(page.getByTestId("approval")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("forward").click();
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.files })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("payroll-file")).toBeVisible();
    expect(errors).toEqual([]);
  });
}

/** The Prairie week paid: hours → exceptions → totals → approve → files. */
async function paidPrairieWeek(page: Page, locale: "en" | "es") {
  const m = MESSAGES[locale];
  const period = await uploadPrairieWeek(page, locale);
  await page.goto(`/${locale}/convert?period=${period}&step=hours`);
  await toExceptions(page, m);
  await toTotals(page, m);
  await approveAndCreateFiles(page, m);
  return period;
}

/** On Review hours: Anita's Wednesday ends at 5 pm instead of 3 pm (two more hours). */
async function anitaWorkedTwoMoreHours(page: Page, locale: "en" | "es") {
  const h = MESSAGES[locale].convert.hours;
  await page.getByRole("button", { name: new RegExp(`^${h.filterAll.split(" (")[0]}`) }).click();
  const wednesday = page.getByTestId("hours-row").filter({ hasText: "Anita Patel" }).nth(2);
  await wednesday.getByRole("button", { name: h.edit }).click();
  await page.getByLabel(h.colOut, { exact: true }).fill("17:00");
  await page.getByTestId("reason-trigger").click();
  await page.getByRole("menuitemcheckbox", { name: h.editReasons.misread_corrected }).click();
  await page.keyboard.press("Escape");
  await page.getByTestId("save-edit").click();
  await expect(page.getByTestId("reason-row")).toHaveCount(0);
}

for (const locale of ["en", "es"] as const) {
  test(`a correction pays and bills only the differences, and the original files never change (${locale})`, async ({ page }) => {
    const m = MESSAGES[locale];
    const tr = m.convert.correction;
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await paidPrairieWeek(page, locale);

    // Files: version 1; the Owner starts a correction with a reason.
    await expect(page.getByTestId("version")).toHaveCount(1);
    await page.getByTestId("start-correction").click();
    await expect(page.getByTestId("confirm-start-correction")).toBeDisabled();
    const reason = locale === "en" ? "Anita stayed until 5 pm on Wednesday" : "Anita se quedó hasta las 5 pm el miércoles";
    await page.getByLabel(tr.reasonLabel).fill(reason);
    await page.getByTestId("confirm-start-correction").click();

    // The period is open again as version 2: every step says so.
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.hours })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("correction-banner")).toContainText(reason);
    await anitaWorkedTwoMoreHours(page, locale);

    // Exceptions: nothing blocks; more pay is due (a warning that never blocks).
    await toExceptions(page, m);
    await expect(page.getByTestId("exceptions-summary")).toContainText(m.convert.exceptions.summaryNone);
    await expect(page.getByTestId("warning").filter({ hasText: m.convert.totals.blockers.correction_pay_due })).toContainText("Anita Patel");

    // Review totals shows the differences: 2 h × $18.25 = $36.50 paid, 2 h × $26.50 = $53.00 billed.
    await toTotals(page, m);
    await expect(page.getByTestId("summary")).toContainText(signedMoney(3650, locale));
    await expect(page.getByTestId("summary")).toContainText(signedMoney(5300, locale));
    await approveAndCreateFiles(page, m);

    // Files: version 2 first, with only the differences; version 1 below, unchanged.
    const versions = page.getByTestId("version");
    await expect(versions).toHaveCount(2);
    const v2 = versions.first();
    const [download] = await Promise.all([page.waitForEvent("download"), v2.getByTestId("payroll-file").getByRole("link", { name: m.common.download }).click()]);
    const csv = readFileSync((await download.path())!, "utf8").trim().split("\n");
    expect(csv).toHaveLength(2);
    expect(csv[1]).toMatch(/^Patel,Anita,.*,2\.00,0\.00,0\.00$/);
    await expect(v2.getByTestId("invoice-row")).toContainText("PLM-20261005-S1");
    await expect(v2.getByTestId("invoice-row")).toContainText(tr.kind.supplemental);
    await expect(v2.getByTestId("invoice-row")).toContainText(money(5300, locale));
    await expect(versions.nth(1).getByTestId("invoice-row")).toContainText("PLM-20261005");
    expect(errors).toEqual([]);
  });
}

test("exceptions, approval and the row menu have no serious accessibility problems", async ({ page }) => {
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
  const period = await uploadPrairieWeek(page, "en");
  await page.goto(`/en/approvals?period=${period}`);
  await page.getByTestId("approval-row").filter({ hasText: PRAIRIE }).getByTestId("row-menu").click();
  await check(page, "row menu");
  await page.getByTestId("toggle-approval-required").click();
  await page.keyboard.press("Escape");
  await check(page, "approvals list (approval required)");
  await page.goto(`/en/convert?period=${period}&step=hours`);
  await toExceptions(page, en);
  await check(page, "exceptions (blocked)");
  await page.goto(`/en/approvals?period=${period}`);
  await clientApprovesAll(page, "en");
  await page.goto(`/en/convert?period=${period}&step=exceptions`);
  await expect(page.getByTestId("exceptions-summary")).toContainText(en.convert.exceptions.summaryNone, { timeout: 60_000 });
  await check(page, "exceptions (clear)");
  await toTotals(page, en);
  await check(page, "review totals (to approve)");
  await page.getByTestId("forward").click();
  await expect(page.getByTestId("approval")).toBeVisible({ timeout: 60_000 });
  await check(page, "review totals (approved)");
  await page.getByTestId("unapprove").click();
  await check(page, "unapprove dialog");
});

test("the correction screens have no serious accessibility problems", async ({ page }) => {
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
  await paidPrairieWeek(page, "en");
  await check(page, "files (one version)");
  await page.getByTestId("start-correction").click();
  await check(page, "start a correction dialog");
  await page.getByLabel(en.convert.correction.reasonLabel).fill("Checking the week again");
  await page.getByTestId("confirm-start-correction").click();
  await expect(page.getByTestId("correction-banner")).toBeVisible({ timeout: 60_000 });
  await check(page, "review hours (correction)");
  await toExceptions(page, en);
  // Nothing changed yet: the correction can be discarded.
  await expect(page.getByTestId("discard-correction")).toBeVisible();
  await check(page, "exceptions (nothing to correct)");
  await page.getByTestId("discard-correction").click();
  await check(page, "discard dialog");
  await page.getByTestId("confirm-discard-correction").click();
  await expect(page.getByRole("heading", { level: 1, name: en.convert.steps.files })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("version")).toHaveCount(1);
});
