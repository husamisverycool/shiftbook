/**
 * Slice s (decision 0040) through the screens, in English and Spanish: Settings › Connections lists
 * the payroll system, the time files and the catalogue, and Test says whether one is ready; Payroll
 * settings reads a Paychex sample file and fills the client id; the placement import offers Avionté
 * and its template. Accessibility on the new page.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;
const PAYCHEX_SAMPLE = ["Client ID,Worker ID,Org,Job Number,Pay Component,Rate,Rate Number,Hours,Units,Line Date,Amount,Check Seq Number,Override State,Override Local,Override Local Jurisdiction,Labor Assignment", "ZX123456,1001,,,Hourly,18.0000,,40.00,,10/11/2026,,,,,,", "ZX123456,1001,,,Overtime,27.0000,,2.00,,10/11/2026,,,,,,"].join("\r\n");

for (const locale of ["en", "es"] as const) {
  test(`connections, a Paychex sample file and an Avionté template (${locale})`, async ({ page }) => {
    const m = MESSAGES[locale];
    const c = m.connections;
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // From the agency menu, as the other settings.
    await page.goto(`/${locale}`);
    await page.getByTestId("agency-menu").click();
    await page.getByTestId("menu-connections").click();
    await expect(page.getByRole("heading", { level: 1, name: c.title })).toBeVisible();
    const payroll = page.getByTestId("connection-payroll:gusto_hours_csv");
    await expect(payroll).toContainText(c.systems.gusto_hours_csv);
    await expect(payroll).toContainText(c.kinds.payroll);
    await expect(page.getByTestId("connection-time:fieldglass-approved-time-sheet")).toContainText(c.systems["fieldglass-approved-time-sheet"]);

    // Test says ready, or what needs attention, in a message.
    await payroll.getByRole("button", { name: c.menu.replace("{name}", c.systems.gusto_hours_csv) }).click();
    await page.getByTestId("connection-test").click();
    const status = (await payroll.getByTestId("connection-status").textContent())!;
    await expect(page.getByText(status === c.status.ready ? c.testReady.replace("{name}", c.systems.gusto_hours_csv) : /./).first()).toBeVisible();

    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

    // Available: the catalogue, with Paychex Flex to set up and the VMS Granite cannot read yet said so.
    await page.getByTestId("tab-available").click();
    await expect(page).toHaveURL(/tab=available/);
    await expect(page.getByTestId("available-payroll")).toContainText(c.systems.paychex_flex_csv);
    // Beeline, Coupa and Magnit have profiles now (decision 0043): none is "not available yet".
    for (const vms of [c.systems.beeline, c.systems.coupa, c.systems.magnit]) await expect(page.getByTestId("available-time")).toContainText(vms);
    await expect(page.getByTestId("available-time")).not.toContainText(c.notYet);
    await page.getByTestId("set-up-paychex_flex_csv").click();

    // Payroll settings: Paychex Flex reads a sample file and fills the client id (not saved).
    await expect(page.getByRole("heading", { level: 1, name: m.settings.payroll.title })).toBeVisible();
    await page.getByTestId("system-paychex_flex_csv").click();
    await page.getByTestId("payroll-sample-file").setInputFiles({ name: "paychex-sample.csv", mimeType: "text/csv", buffer: Buffer.from(PAYCHEX_SAMPLE) });
    await expect(page.getByTestId("payroll-sample-result")).toContainText("ZX123456");
    await expect(page.getByTestId("payroll-sample-result")).toContainText("Hourly · Overtime");
    await expect(page.getByLabel(m.settings.payroll.fields.clientId)).toHaveValue("ZX123456");

    // The placement import offers Avionté and its template.
    await page.goto(`/${locale}/assignments/import`);
    await page.getByText(m.import.sources.avionte, { exact: true }).click();
    await expect(page.getByTestId("placement-template")).toHaveAttribute("href", "/api/files/placement-template?source=avionte");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("placement-template").click()]);
    expect(readFileSync(await download.path(), "utf8")).toContain("Placement Id,Talent First Name,Talent Last Name,Company Name,Job Title");
    expect(errors).toEqual([]);
  });
}
