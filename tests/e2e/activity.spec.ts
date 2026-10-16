/**
 * Slice (k) step 3 in the browser (decision 0028; SPEC §19, §24 step 10): the Owner reveals one SSN
 * with a reason and the activity log shows it — its details, the filters, one record's own history,
 * Load more, the arrows, Copy link, the export following the filters — in English and Spanish; the
 * accountant reads it; a coordinator does not; accessibility.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

type Messages = typeof import("../../messages/en.json");
const MESSAGES = {
  en: JSON.parse(readFileSync("messages/en.json", "utf8")) as Messages,
  es: JSON.parse(readFileSync("messages/es.json", "utf8")) as Messages,
};

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.title.length > 0 && document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

async function signedInAs(browser: Browser, role: "coordinator" | "accountant"): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/en/sign-in");
  await page.getByTestId(`continue-${role}`).click();
  await expect(page).toHaveURL(/\/en$/);
  return page;
}

for (const locale of ["en", "es"] as const) {
  test(`the Owner reveals one SSN with a reason and the activity log shows it (${locale})`, async ({ page, context }) => {
    const m = MESSAGES[locale];
    const a = m.activityLog;
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    // The log is never cleared (earlier runs' looks stay): this run's look is told apart by its reason.
    const reason = `Payroll check ${locale} ${Date.now()}`;
    await page.goto(`/${locale}/workers`);
    await page.getByRole("link", { name: "Bell, Marcus" }).click();
    await page.getByTestId("retrieve-ssn").click();
    await page.getByTestId("reveal-reason").fill(reason);
    await page.getByTestId("reveal-show").click();
    await expect(page.getByTestId("ssn-revealed")).toBeVisible();
    const number = (await page.getByTestId("ssn-revealed").textContent())!;
    await page.getByTestId("reveal-close").click();

    // The agency menu → Activity: the reveal first, with its reason; never the number.
    await page.getByTestId("agency-menu").click();
    await page.getByTestId("menu-activity").click();
    await expect(page.getByRole("heading", { level: 1, name: a.title })).toBeVisible();
    const first = page.getByTestId("activity-row").first();
    await expect(first).toContainText(a.events.ssn_viewed);
    await expect(first).toContainText("Marcus Bell");
    await expect(first).toContainText("Demo Owner (demo)");
    await expect(page.getByTestId("activity-details")).toContainText(reason);
    await expect(page.getByTestId("activity-record-link")).toHaveAttribute("href", /\/workers\/[0-9a-f-]{36}$/);
    expect(await page.content()).not.toContain(number);
    await check(page, `activity (${locale})`);

    // The arrows move through the list; the address names the event (Copy link copies it).
    await first.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("activity-row").nth(1)).toHaveAttribute("aria-current", "true");
    await expect(page).toHaveURL(/event=\d+/);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByTestId("activity-copy-link").click();
    await expect(page.getByText(a.copied)).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());

    // Load more: the next 50.
    await expect(page.getByTestId("activity-row")).toHaveCount(50);
    await page.getByTestId("activity-more").click();
    await expect(page.getByTestId("activity-row")).toHaveCount(100);

    // Filter to SSN views: Apply puts it in the address.
    await page.getByTestId("activity-action").selectOption("ssn_viewed");
    await page.getByTestId("activity-apply").click();
    await expect(page).toHaveURL(/action=ssn_viewed/);
    const views = page.getByTestId("activity-row");
    await expect(views.first()).toContainText(a.events.ssn_viewed);
    const shown = await views.count();
    for (let i = 0; i < shown; i++) await expect(views.nth(i)).toContainText(a.events.ssn_viewed);
    await expect(page.getByTestId("activity-count")).toHaveText(new RegExp(`^${shown} `));
    await views.first().click();
    await expect(page.getByTestId("activity-reason")).toHaveText(reason);

    // One record's own history: the chip names it; its × shows every record again.
    await page.getByTestId("activity-show-record").click();
    await expect(page).toHaveURL(/record=worker%3A/);
    await expect(page.getByTestId("activity-record-chip")).toContainText("Marcus Bell");
    await check(page, `activity, one record (${locale})`);

    // The export follows the filters and is itself in the log.
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("activity-export").click()]);
    const csv = readFileSync(await download.path(), "utf8");
    expect(csv.split("\r\n")[0]).toBe("When (UTC),Who,Event,Action,Record type,Record,Record id,Reason,Before,After");
    expect(csv).toContain(reason);
    expect(csv).not.toContain(number);
    // Only SSN views of Marcus Bell.
    for (const line of csv.trimEnd().split("\r\n").slice(1)) expect(line).toMatch(/,ssn_viewed,reveal,worker,Marcus Bell,/);
    await page.getByTestId("activity-record-clear").click();
    await expect(page).not.toHaveURL(/record=/);
    await expect(page.getByTestId("activity-record-chip")).toHaveCount(0);
    await page.getByTestId("activity-action").selectOption("export");
    await page.getByTestId("activity-apply").click();
    await expect(page.getByTestId("activity-row").first()).toContainText(a.types.activity_log);

    // Nothing matches: the line and Clear filters.
    await page.goto(`/${locale}/settings/activity?from=2020-01-01&to=2020-01-02`);
    await expect(page.getByTestId("activity-empty")).toContainText(a.noMatch);
    await page.getByRole("button", { name: a.clearFilters }).click();
    await expect(page.getByTestId("activity-row").first()).toBeVisible();
  });
}

test("the accountant reads the log; a coordinator does not", async ({ browser }) => {
  const en = MESSAGES.en;
  const morgan = await signedInAs(browser, "accountant");
  await morgan.getByTestId("agency-menu").click();
  await expect(morgan.getByTestId("menu-activity")).toBeVisible();
  await morgan.keyboard.press("Escape");
  await morgan.goto("/en/settings/activity");
  await expect(morgan.getByTestId("activity-row").first()).toBeVisible();
  await check(morgan, "activity, accountant");

  const lena = await signedInAs(browser, "coordinator");
  await lena.getByTestId("agency-menu").click();
  await expect(lena.getByTestId("menu-members")).toBeVisible();
  await expect(lena.getByTestId("menu-activity")).toHaveCount(0);
  await lena.keyboard.press("Escape");
  await lena.goto("/en/settings/activity");
  await expect(lena.getByTestId("activity-not-for-role")).toHaveText(en.activityLog.notForRole);
  await expect(lena.getByTestId("activity-row")).toHaveCount(0);
  expect((await lena.request.get("/api/files/activity")).status()).toBe(403);
});
