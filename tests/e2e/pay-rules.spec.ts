/**
 * Slice (c) through the screens, in English and Spanish (plan "Done means" 5): a California week
 * with daily overtime, double time and a seventh day, paid and exported; and a week with two pay
 * rates and overtime, paid on the weighted regular rate, where the Gusto hours file (one rate per
 * job) names the worker it cannot carry so the person can skip them and pay them by hand.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { demoUuid } from "../../src/server/demo/dataset";
import { money } from "../../src/components/shiftbook/format";
import { approveAndCreateFiles, toExceptions, toTotals, vmsFileOff } from "./flow";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;
const CLOCK_HEADER = "Employee ID,Employee Name,Department,Date,Clock In,Clock Out,Break (min),Total Hours";

async function uploadClock(page: Page, locale: "en" | "es", name: string, lines: string[]) {
  const m = MESSAGES[locale];
  await page.goto(`/${locale}/convert`);
  await page.getByRole("link", { name: m.landing.start }).first().click();
  await page.getByTestId("file-input").setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from([CLOCK_HEADER, ...lines].join("\n")) });
  await expect(page.getByTestId("document-row")).toHaveCount(1, { timeout: 60_000 });
  await page.getByTestId("forward").click();
  await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.hours })).toBeVisible();
  await expect(page.getByTestId("forward")).toBeEnabled();
  await toExceptions(page, m);
}

async function payrollCsv(page: Page, locale: "en" | "es") {
  const m = MESSAGES[locale];
  await approveAndCreateFiles(page, m);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("payroll-file").getByRole("link", { name: m.common.download }).click()]);
  return readFileSync((await download.path())!, "utf8").trim().split("\n");
}

for (const locale of ["en", "es"] as const) {
  test(`a California week: daily overtime, double time and the seventh day (${locale})`, async ({ page }) => {
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Pacific Crest's hours come from its time clock here, not from SAP Fieldglass time sheets.
    await vmsFileOff(page, locale, "Pacific Crest Distribution (demo)");
    // Luis Hernández, Ontario CA at $19.50: 8, 10, 13, 8, 8, 6 and 10 hours, Monday to Sunday.
    const day = (date: string, out: string, total: string) => `30101,"Hernández, Luis",Warehouse,${date},7:00 AM,${out},30,${total}`;
    await uploadClock(page, locale, "pacific-crest-week.csv", [
      day("10/05/2026", "3:30 PM", "8.00"),
      day("10/06/2026", "5:30 PM", "10.00"),
      day("10/07/2026", "8:30 PM", "13.00"),
      day("10/08/2026", "3:30 PM", "8.00"),
      day("10/09/2026", "3:30 PM", "8.00"),
      day("10/10/2026", "1:30 PM", "6.00"),
      day("10/11/2026", "5:30 PM", "10.00"),
    ]);
    await toTotals(page, MESSAGES[locale]);
    // 40 h × $19.50 + 20 h × $29.25 + 3 h × $39.00 = $1,482.00 (Cal. Lab. Code § 510(a)).
    await expect(page.getByTestId("summary")).toContainText(money(148_200, locale));
    const csv = await payrollCsv(page, locale);
    expect(csv[1]).toMatch(/^Hernández,Luis,.*,40\.00,20\.00,3\.00$/);
    expect(errors).toEqual([]);
  });

  test(`a two-rate overtime week: paid on the weighted regular rate; the Gusto file names the worker it cannot carry (${locale})`, async ({ page }) => {
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // The machine operator rate rises to $19.00 from Thursday October 8.
    await page.goto(`/${locale}/job-orders/${demoUuid("job:il-operator")}`);
    await page.getByRole("tab", { name: m.jobOrder.tabs.rates }).click();
    await page.getByTestId("new-version").click();
    const rate = page.getByRole("dialog");
    await rate.getByLabel(m.rates.effectiveFrom).fill("2026-10-08");
    await rate.getByLabel(m.rates.payPerHour).fill("19.00");
    await rate.getByLabel(m.rates.markup, { exact: true }).check();
    await rate.getByLabel(m.rates.markupPercent).fill("45");
    await rate.getByRole("button", { name: m.rates.addVersion }).click();
    await expect(rate).toBeHidden();

    // Marcus: 10 h Monday to Wednesday at $18.25, 8 h Thursday and Friday at $19.00 (46 h). Anita: 8 h Monday to Wednesday.
    const row = (id: string, name: string, date: string, out: string, total: string) => `${id},"${name}",Molding,${date},7:00 AM,${out},0,${total}`;
    await uploadClock(page, locale, "prairie-week.csv", [
      ...["10/05/2026", "10/06/2026", "10/07/2026"].map((d) => row("10411", "Bell, Marcus", d, "5:00 PM", "10.00")),
      ...["10/08/2026", "10/09/2026"].map((d) => row("10411", "Bell, Marcus", d, "3:00 PM", "8.00")),
      ...["10/05/2026", "10/06/2026", "10/07/2026"].map((d) => row("10413", "Patel, Anita", d, "3:00 PM", "8.00")),
    ]);
    // Regular rate ($547.50 + $304.00) ÷ 46 h; overtime 6 h × ($19.00 + ½ × that) = $169.53: Marcus $907.03,
    // shown as the amount to pay him by hand; Anita 24 h × $18.25 = $438.00.
    const refused = page.getByTestId("blocker");
    await expect(refused).toHaveCount(1);
    await expect(refused).toContainText("Bell, Marcus");
    await expect(refused.getByTestId("gross-by-hand")).toContainText(money(90_703, locale));
    await page.getByTestId("skip-workers").click();
    await page.locator("#skip-reason").fill(locale === "en" ? "Paid by hand in Gusto (two rates)" : "Pagado a mano en Gusto (dos tarifas)");
    await page.getByTestId("confirm-skip").click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await toTotals(page, m);
    await expect(page.getByTestId("summary")).toContainText(money(43_800, locale));
    const csv = await payrollCsv(page, locale);
    expect(csv).toHaveLength(2);
    expect(csv[1]).toMatch(/^Patel,Anita,.*,24\.00,0\.00,0\.00$/);
    expect(errors).toEqual([]);
  });

  test(`a rate card below the minimum wage: the engine's warning and line in the reader's language (${locale})`, async ({ page }) => {
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // The machine operator rate drops to $14.50 from Monday October 5, below Illinois's $15.00.
    await page.goto(`/${locale}/job-orders/${demoUuid("job:il-operator")}`);
    await page.getByRole("tab", { name: m.jobOrder.tabs.rates }).click();
    await page.getByTestId("new-version").click();
    const rate = page.getByRole("dialog");
    await rate.getByLabel(m.rates.effectiveFrom).fill("2026-10-05");
    await rate.getByLabel(m.rates.payPerHour).fill("14.50");
    await rate.getByLabel(m.rates.markup, { exact: true }).check();
    await rate.getByLabel(m.rates.markupPercent).fill("45");
    // The markup's working, said the reader's way (decision 0030).
    await expect(rate.getByTestId("markup-preview")).toContainText(locale === "en" ? "2102.5¢, rounded half up to $21.03" : "2102.5¢, redondeado hacia arriba en la mitad a $21.03");
    await rate.getByRole("button", { name: m.rates.addVersion }).click();
    await expect(rate).toBeHidden();

    // Anita: 8 h on Monday at the new rate.
    await uploadClock(page, locale, "prairie-monday.csv", [`10413,"Patel, Anita",Molding,10/05/2026,7:00 AM,3:00 PM,0,8.00`]);
    // Exceptions: the engine's warning in the reader's language, the day the reader's way (decision 0030).
    const warning = page.getByTestId("warning").filter({ hasText: m.convert.totals.blockers.below_minimum_wage });
    await expect(warning).toContainText(
      locale === "en" ? "Anita Patel on October 5, 2026: pay rate $14.50/h is below the minimum wage of $15.00/h" : "Anita Patel el 5 de octubre de 2026: la tarifa de pago de $14.50/h está por debajo del salario mínimo de $15.00/h",
    );
    await expect(warning).toContainText(locale === "en" ? "A top-up line pays the difference; fix the rate card." : "Una línea de complemento paga la diferencia; corrija la tarjeta de tarifas.");
    // Review totals: the same warning, acknowledged by approving.
    await toTotals(page, m);
    await expect(page.getByText(locale === "en" ? "pay rate $14.50/h is below the minimum wage of $15.00/h" : "la tarifa de pago de $14.50/h está por debajo del salario mínimo de $15.00/h")).toBeVisible();
    expect(errors).toEqual([]);
  });
}
