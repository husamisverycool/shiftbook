/**
 * Slice w through the screens, in English and Spanish (SPEC §27 item 9: compute everything, move
 * nothing). The Prairie Line week is run (Marcus Bell 46 h, Anita Patel 24 h at $18.25; pay $894.25 +
 * $438.00 = $1,332.25). Then the Owner: hands the run's payroll off in Check's format (reconciled to the
 * payroll file to the cent); sees the invoice not eligible for funding until client approval by link is
 * no longer required in Money settings, then submits its packet; records the broker's payroll by class;
 * and finds every handoff on the Money page. Accessibility checks on each new screen.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { money } from "../../src/components/shiftbook/format";
import { approveAndCreateFiles, toExceptions, toTotals, uploadPrairieWeek } from "./flow";

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
  test(`money: payroll handed off, funding prequalified and submitted, the broker's figures recorded (${locale})`, async ({ page }) => {
    test.setTimeout(420_000);
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Nothing handed off yet (G then N opens Money).
    await page.goto(`/${locale}`);
    await page.keyboard.press("g");
    await page.keyboard.press("f");
    await expect(page.getByRole("heading", { level: 1, name: m.money.title })).toBeVisible();
    await expect(page.getByTestId("no-money-moves")).toHaveText(m.money.noMoneyMoves);
    await expect(page.getByTestId("handoffs-empty")).toBeVisible();
    await check(page, "money, empty");

    // The week is run and its files made.
    const period = await uploadPrairieWeek(page, locale);
    await page.goto(`/${locale}/convert?period=${period}&step=hours`);
    await toExceptions(page, m);
    await toTotals(page, m);
    await approveAndCreateFiles(page, m);

    // Payroll: the run, its payload reconciled to the payroll file, recorded in Check's format.
    await page.goto(`/${locale}/money/payroll`);
    await expect(page.getByTestId("payroll-run-row")).toHaveCount(1);
    await expect(page.getByTestId("run-handoff-status")).toHaveText(m.money.payroll.ready);
    await check(page, "money payroll");
    await page.getByTestId("payroll-run-row").getByRole("link").click();
    await expect(page.getByTestId("payroll-run-status")).toHaveText(m.money.run.status.ready);
    await expect(page.getByTestId("payroll-employee")).toHaveCount(2);
    await expect(page.getByTestId("payload-gross")).toHaveText(money(133_225, locale));
    await expect(page.getByTestId("reconciled").locator("dd")).toHaveText(m.money.run.reconciled);
    await check(page, "payroll handoff");
    const download = page.waitForEvent("download");
    await page.getByTestId("download-payload").click();
    const payload = JSON.parse(readFileSync(await (await download).path(), "utf8")) as { payday: string; items: { earnings: { amount: string }[] }[] };
    expect(payload.payday).toBe("2026-10-16");
    expect(payload.items.flatMap((i) => i.earnings.map((e) => e.amount)).sort()).toEqual(["164.25", "438.00", "730.00"]);
    await page.getByTestId("record-payroll-handoff").click();
    await check(page, "payroll handoff dialog");
    await page.getByTestId("confirm-payroll-handoff").click();
    await expect(page.getByTestId("payroll-run-status")).toHaveText(m.money.run.status.recorded);
    await expect(page.getByTestId("handoff-recorded-at")).toBeVisible();
    await expect(page.getByTestId("record-payroll-handoff")).toHaveCount(0);

    // Funding: not eligible while client approval by link is required (Prairie approved nothing by link).
    await page.goto(`/${locale}/money/funding`);
    await expect(page.getByTestId("funding-row")).toHaveCount(1);
    await expect(page.getByTestId("funding-decision")).toHaveText(m.money.funding.notEligible);
    await check(page, "money funding");
    await page.getByTestId("funding-row").getByRole("link").click();
    await expect(page.getByTestId("funding-reason")).toHaveText([m.money.funding.reasons.no_approval]);
    await expect(page.getByTestId("submit-funding")).toBeDisabled();
    await check(page, "funding packet, not eligible");

    // Money settings: client approval no longer required; the invoice is prequalified and submitted.
    await page.goto(`/${locale}/settings/money`);
    await expect(page.getByRole("heading", { level: 1, name: m.money.settings.title })).toBeVisible();
    await check(page, "money settings");
    await page.getByTestId("funding-approval").click();
    await page.getByTestId("save-funding").click();
    await expect(page.getByText(m.money.settings.saved)).toBeVisible();
    await page.goto(`/${locale}/money/funding`);
    await expect(page.getByTestId("funding-decision")).toHaveText(m.money.funding.prequalified);
    await page.getByTestId("funding-row").getByRole("link").click();
    await expect(page.getByTestId("funding-status")).toHaveText(m.money.funding.prequalified);
    await expect(page.getByTestId("funding-offer")).toContainText(m.money.funding.offerLine);
    await check(page, "funding packet, prequalified");
    await page.getByTestId("submit-funding").click();
    await page.getByTestId("confirm-funding").click();
    await expect(page.getByTestId("funding-status")).toHaveText(m.money.funding.submitted);

    // Wage access: the week is paid, so no unpaid hours remain.
    await page.goto(`/${locale}/money/wage-access`);
    await expect(page.getByTestId("wage-rules")).toBeVisible();
    await expect(page.getByTestId("wage-empty")).toBeVisible();
    await check(page, "wage access");

    // Insurance: the broker's payroll by class for the policy's pay dates, recorded.
    await page.goto(`/${locale}/money/insurance`);
    await expect(page.getByTestId("insurance-total")).toHaveText(money(133_225, locale));
    await check(page, "insurance");
    await page.getByTestId("insurance-record").click();
    await page.getByTestId("confirm-insurance").click();
    await expect(page.getByText(m.money.insurance.done)).toBeVisible();

    // Every handoff on the Money page, newest first.
    await page.goto(`/${locale}/money`);
    await expect(page.getByTestId("handoff-row")).toHaveCount(3);
    await expect(page.getByTestId("handoff-row").first()).toHaveAttribute("data-kind", "insurance");
    await check(page, "money handoffs");
    expect(errors).toEqual([]);
  });
}
