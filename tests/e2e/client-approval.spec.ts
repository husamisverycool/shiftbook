/**
 * Slice (d) through the screens, in English and Spanish (plan "Done means" 2; SPEC §24 step 4): the
 * agency sends a client's week for approval; the approver opens the email's link, disputes one shift
 * with the right end time, and approves the rest; the agency accepts the client's times; the run
 * pays the corrected hours. Then the accessibility check on every new screen.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { money } from "../../src/components/shiftbook/format";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;
const CLOCK_HEADER = "Employee ID,Employee Name,Department,Date,Clock In,Clock Out,Break (min),Total Hours";
const PRAIRIE = "Prairie Line Manufacturing (demo)";

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

/** Marcus 10 h Monday to Wednesday and 8 h Thursday and Friday; Anita 8 h Monday to Wednesday. Returns the period id. */
async function uploadPrairieWeek(page: Page, locale: "en" | "es"): Promise<string> {
  const m = MESSAGES[locale];
  const row = (id: string, name: string, date: string, out: string, total: string) => `${id},"${name}",Molding,${date},7:00 AM,${out},0,${total}`;
  const lines = [
    ...["10/05/2026", "10/06/2026", "10/07/2026"].map((d) => row("10411", "Bell, Marcus", d, "5:00 PM", "10.00")),
    ...["10/08/2026", "10/09/2026"].map((d) => row("10411", "Bell, Marcus", d, "3:00 PM", "8.00")),
    ...["10/05/2026", "10/06/2026", "10/07/2026"].map((d) => row("10413", "Patel, Anita", d, "3:00 PM", "8.00")),
  ];
  await page.goto(`/${locale}/convert`);
  await page.getByRole("link", { name: m.landing.start }).first().click();
  await page.getByTestId("file-input").setInputFiles({ name: "prairie-week.csv", mimeType: "text/csv", buffer: Buffer.from([CLOCK_HEADER, ...lines].join("\n")) });
  await expect(page.getByTestId("document-row")).toHaveCount(1, { timeout: 60_000 });
  return new URL(page.url()).searchParams.get("period")!;
}

for (const locale of ["en", "es"] as const) {
  test(`a client approves a week by link, disputing one shift; the agency accepts the client's times (${locale})`, async ({ page }) => {
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const period = await uploadPrairieWeek(page, locale);

    // The agency sends Prairie Line's week to its approver.
    await page.goto(`/${locale}/approvals?period=${period}`);
    const prairie = page.getByTestId("approval-row").filter({ hasText: PRAIRIE });
    await expect(prairie.getByTestId("approval-state")).toHaveText(m.approvals.state.not_sent);
    await prairie.getByTestId("row-send").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(m.approvals.approverName).fill("Dana Approver");
    await dialog.getByLabel(m.approvals.approverEmail).fill("dana@prairie.example");
    await dialog.getByLabel(m.approvals.approverLanguage).selectOption(locale);
    await dialog.getByTestId("send-request").click();
    await expect(dialog).toBeHidden();
    await expect(prairie.getByTestId("approval-state")).toHaveText(m.approvals.state.waiting);

    // Demo mode: the request's history opens the email as the approver receives it, with its link.
    await prairie.getByRole("link", { name: PRAIRIE }).click();
    await page.getByTestId("view-email").first().click();
    const link = page.getByTestId("demo-copy").getByTestId("email-link");
    await expect(link).toHaveAttribute("href", new RegExp(`/${locale}/approve/sbap_[A-Za-z0-9_-]{43}$`));
    await link.click();

    // The approver's page: hours by worker and day; Marcus's Wednesday is disputed with the right end.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(m.portal.title.replace("{client}", PRAIRIE));
    await expect(page.getByTestId("portal-status")).toHaveText(m.portal.status.waiting);
    await page.getByRole("button", { name: m.hoursTable.showShifts.replace("{worker}", "Marcus Bell") }).click();
    await page.getByTestId("shift-row").nth(2).getByTestId("dispute-shift").click();
    const dispute = page.getByRole("dialog");
    await dispute.getByLabel(m.portal.end).fill("15:00");
    await dispute.getByLabel(m.portal.reason).fill(locale === "en" ? "He left at 3 pm that day" : "Ese día salió a las 3 pm");
    await dispute.getByTestId("save-dispute").click();
    await expect(dispute).toBeHidden();
    await expect(page.getByTestId("approve-bar")).toContainText(locale === "en" ? "7 shifts" : "7 turnos");
    await page.getByLabel(m.portal.fullName).fill("Dana Approver");
    await page.getByRole("checkbox").check();
    await page.getByTestId("approve-hours").click();
    await expect(page.getByTestId("portal-status")).toContainText(m.portal.status.disputed.replace("{agency}", "Cedar Row Staffing (demo)"));
    await expect(page.getByTestId("portal-status")).toContainText("Dana Approver");
    await expect(page.getByTestId("approve-bar")).toHaveCount(0);

    // The agency sees the dispute and accepts the client's times.
    await page.goto(`/${locale}/approvals?period=${period}`);
    await expect(page.getByTestId("disputes-banner")).toBeVisible();
    await expect(prairie.getByTestId("approval-state")).toHaveText(m.approvals.state.disputed);
    await prairie.getByRole("link", { name: PRAIRIE }).click();
    const card = page.getByTestId("dispute-card");
    await expect(card).toContainText(locale === "en" ? "He left at 3 pm that day" : "Ese día salió a las 3 pm");
    await expect(card).toContainText("-2:00");
    await card.getByTestId("accept-dispute").click();
    await expect(page.getByTestId("dispute-card")).toHaveCount(0);
    await expect(page.getByTestId("approval-state").first()).toHaveText(m.approvals.state.approved);

    // The run pays the corrected week: Marcus 44 h (4 h overtime) and Anita 24 h at $18.25.
    await page.goto(`/${locale}/convert?period=${period}&step=totals`);
    await expect(page.getByTestId("summary")).toContainText(money(83_950 + 43_800, locale), { timeout: 60_000 });
    expect(errors).toEqual([]);
  });
}

test("the approval screens have no serious accessibility problems, and an unknown link says so", async ({ page }) => {
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
  const period = await uploadPrairieWeek(page, "en");
  await page.goto(`/en/approvals?period=${period}`);
  await check(page, "approvals list");
  const prairie = page.getByTestId("approval-row").filter({ hasText: PRAIRIE });
  await prairie.getByTestId("row-send").click();
  await check(page, "send dialog");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(en.approvals.approverName).fill("Dana Approver");
  await dialog.getByLabel(en.approvals.approverEmail).fill("dana@prairie.example");
  await dialog.getByTestId("send-request").click();
  await expect(dialog).toBeHidden();
  await prairie.getByRole("link", { name: PRAIRIE }).click();
  await check(page, "approval detail");
  await page.getByTestId("view-email").first().click();
  await check(page, "email dialog");
  const href = await page.getByTestId("demo-copy").getByTestId("email-link").getAttribute("href");
  await page.goto(new URL(href!).pathname);
  await check(page, "approval page");
  await page.getByRole("button", { name: en.hoursTable.showShifts.replace("{worker}", "Anita Patel") }).click();
  await page.getByTestId("dispute-shift").first().click();
  await check(page, "dispute dialog");

  await page.goto(`/en/approve/sbap_${"A".repeat(43)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.portal.invalid.title);
  await check(page, "invalid link");
});
