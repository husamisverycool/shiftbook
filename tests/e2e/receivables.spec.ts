/**
 * Slice (h) through the screens, in English and Spanish (plan "Done means" 2): with two Prairie Line
 * invoices from a week's run, the Owner sees them in the aging and exports it, imports the demo's
 * sample bank file (upload, columns, lines; the withdrawal left out), posts the deposit that names an
 * invoice and the one that pays the other $25.00 short, excludes the transfer from savings, records
 * why the second was short, copies a reminder for it and writes the rest off; sees what the client
 * owes and how fast it pays; voids the first deposit's payment and records a check by hand instead.
 * Accessibility checks on every new screen and dialog.
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
const PRAIRIE = "Prairie Line Manufacturing (demo)";
const FIRST = "PLM-20261005-1";
const SECOND = "PLM-20261005-2";

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

for (const locale of ["en", "es"] as const) {
  test(`receivables: the bank file matched and posted, a short pay explained, reminded and written off, a payment voided and recorded by hand (${locale})`, async ({ page, context }) => {
    test.setTimeout(420_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const dialog = page.getByRole("dialog");

    // Two invoices for Prairie Line: Anita Patel's placement on its own PO, the client separating by PO.
    await page.goto(`/${locale}/assignments`);
    const anita = page.getByTestId("record-row").filter({ hasText: "Anita Patel" });
    await anita.hover();
    await anita.getByRole("button", { name: m.list.preview.replace("{name}", "Anita Patel") }).click();
    await page.getByTestId("side-panel").getByTestId("assignment-po").fill("PO-77001");
    await page.getByTestId("side-panel").getByTestId("assignment-po").press("Enter");
    await expect(page.getByTestId("side-panel")).toContainText(m.assignments.poSaved);
    await page.goto(`/${locale}/clients`);
    await page.getByRole("link", { name: PRAIRIE }).click();
    await page.getByTestId("edit-settings").click();
    await dialog.getByTestId("field-separate-po").click();
    await dialog.getByTestId("save-settings").click();
    await expect(dialog).toBeHidden();
    const period = await uploadPrairieWeek(page, locale);
    await page.goto(`/${locale}/convert?period=${period}&step=hours`);
    await toExceptions(page, m);
    await toTotals(page, m);
    await approveAndCreateFiles(page, m);

    // Receivables (G then R): both invoices are current; the amount opens them; the CSV is the table.
    await page.keyboard.press("g");
    await page.keyboard.press("r");
    await expect(page.getByRole("heading", { level: 1, name: m.receivables.title })).toBeVisible();
    const aging = page.getByTestId("aging-row").filter({ hasText: PRAIRIE });
    await expect(aging).toHaveCount(1);
    await aging.getByTestId("amount-current").click();
    const aged = page.getByTestId("aging-invoices");
    await expect(aged.getByRole("row").filter({ hasText: FIRST })).toHaveCount(1);
    await expect(aged.getByRole("row").filter({ hasText: SECOND })).toHaveCount(1);
    await check(page, "receivables, aging");
    const [agingFile] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-aging").click()]);
    expect(agingFile.suggestedFilename()).toMatch(/^receivables-aging-\d{4}-\d{2}-\d{2}\.csv$/);
    const agingRows = readFileSync((await agingFile.path())!, "utf8").split("\r\n");
    expect(agingRows[0]).toBe("Client,Current,1-30,31-60,61-90,91+,Total,Days to pay");
    expect(agingRows[1]).toMatch(/^Prairie Line Manufacturing \(demo\),\d+\.\d{2},0\.00,0\.00,0\.00,0\.00,\d+\.\d{2},$/);

    // Bank (G then B): nothing yet. Import the demo's sample bank file.
    await page.keyboard.press("g");
    await page.keyboard.press("b");
    await expect(page.getByTestId("bank-empty")).toBeVisible();
    await check(page, "bank, empty");
    await page.getByTestId("import-bank").click();
    await expect(page.getByRole("heading", { level: 1, name: m.bankImport.title })).toBeVisible();
    await check(page, "bank import, upload");
    const [sample] = await Promise.all([page.waitForEvent("download"), page.getByTestId("bank-sample").click()]);
    expect(sample.suggestedFilename()).toMatch(/^demo-bank-activity-\d{4}-\d{2}-\d{2}\.csv$/);
    await page.getByTestId("bank-file").setInputFiles({ name: sample.suggestedFilename(), mimeType: "text/csv", buffer: readFileSync((await sample.path())!) });
    await page.getByTestId("next").click();

    // Map columns: chosen from the file's header; the first lines as Shiftbook reads them.
    await expect(page.getByTestId("map-preview")).toBeVisible();
    await expect(page.locator("#map-date")).toHaveValue("0");
    await expect(page.locator("#map-description")).toHaveValue("1");
    await expect(page.locator("#map-amount")).toHaveValue("2");
    await expect(page.getByTestId("map-preview").getByRole("row")).toHaveCount(5);
    await check(page, "bank import, map columns");
    await page.getByTestId("next").click();

    // Choose lines: the three deposits ticked, the withdrawal not.
    const lines = page.getByTestId("choose-line");
    await expect(lines).toHaveCount(4);
    await expect(lines.filter({ hasText: m.bankImport.withdrawal }).getByRole("checkbox")).not.toBeChecked();
    await expect(page.getByTestId("import-lines")).toHaveText(locale === "en" ? "Import 3 lines" : "Importar 3 líneas");
    await check(page, "bank import, choose lines");
    await page.getByTestId("import-lines").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/bank$`));

    // For review: the deposit naming the first invoice pays it exactly (High).
    const review = page.getByTestId("review-line");
    await expect(review).toHaveCount(3);
    const exact = review.filter({ hasText: `PAYMENT INV ${FIRST}` });
    await expect(exact.getByTestId("confidence")).toHaveText(m.bank.confidence.high);
    // Why, in the reader's language (decision 0030).
    await expect(exact).toContainText(locale === "en" ? `invoice number ${FIRST} on the deposit;` : `el número de factura ${FIRST} en el depósito;`);
    await check(page, "bank, for review");
    await exact.getByTestId("post-line").click();
    await expect(review).toHaveCount(2);
    // The client's remittance then pays the second, $25.00 short.
    const remit = review.filter({ hasText: "AP REMITTANCE" });
    await expect(remit.getByTestId("suggestion")).toContainText(SECOND);
    await expect(remit.getByTestId("suggestion")).toContainText(m.bank.short.replace("{amount}", money(2500, locale)));
    await remit.getByTestId("post-line").click();
    await expect(review).toHaveCount(1);
    // The transfer from savings is no client's payment.
    const transfer = review.filter({ hasText: "TRANSFER FROM SAVINGS" });
    await expect(transfer).toContainText(m.bank.noSuggestion);
    await transfer.getByTestId("exclude-line").click();
    await dialog.locator("#exclude-reason").selectOption("transfer");
    await check(page, "exclude dialog");
    await dialog.getByTestId("confirm-exclude").click();
    await expect(page.getByTestId("review-empty")).toBeVisible();
    await page.getByTestId("tab-posted").click();
    await expect(page.getByTestId("posted-row")).toHaveCount(2);
    await check(page, "bank, posted");
    await page.getByTestId("tab-excluded").click();
    await expect(page.getByTestId("excluded-row")).toHaveCount(1);
    await expect(page.getByTestId("excluded-row")).toContainText(m.bank.reasons.transfer);

    // Receivables, Short pays: the second invoice, with no reason yet.
    await page.goto(`/${locale}/receivables?tab=short`);
    const short = page.getByTestId("short-row");
    await expect(short).toHaveCount(1);
    await expect(short).toContainText(SECOND);
    await expect(short).toContainText(m.receivables.noReason);
    await check(page, "receivables, short pays");
    await short.getByRole("link", { name: SECOND }).click();

    // The invoice: $25.00 still due; why it was short; a reminder copied; the rest written off.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(SECOND);
    await expect(page.getByTestId("invoice-balance")).toHaveText(money(2500, locale));
    await expect(page.getByTestId("invoice-payment")).toHaveCount(1);
    await expect(page.getByTestId("short-pay")).toContainText(m.invoicePayments.shortNoReason);
    await check(page, "invoice page, paid short");
    await page.getByTestId("short-reason").click();
    await dialog.locator("#short-reason").selectOption("bank_fee");
    await dialog.locator("#short-note").fill("Kept back by the client's bank");
    await check(page, "short pay dialog");
    await dialog.getByTestId("save-short-reason").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("short-pay")).toContainText(m.invoicePayments.shortReason.replace("{reason}", m.invoicePayments.shortReasons.bank_fee));

    await page.getByTestId("prepare-reminder").click();
    await expect(dialog.getByTestId("reminder-stage")).toHaveValue("before_due");
    await expect(dialog.getByTestId("reminder-language")).toHaveValue(locale);
    await expect(dialog.getByTestId("reminder-subject")).toHaveValue(new RegExp(SECOND));
    await expect(dialog.getByTestId("reminder-body")).toHaveValue(/\$25\.00/);
    const subject = await dialog.getByTestId("reminder-subject").inputValue();
    await dialog.getByTestId("reminder-language").selectOption(locale === "en" ? "es" : "en");
    await expect(dialog.getByTestId("reminder-subject")).not.toHaveValue(subject);
    await dialog.getByTestId("reminder-language").selectOption(locale);
    await expect(dialog.getByTestId("reminder-subject")).toHaveValue(subject);
    await check(page, "reminder dialog");
    await dialog.getByTestId("reminder-copy").click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`${subject}\n\n`);
    await expect(page.getByTestId("reminder-prepared")).toHaveCount(1);

    await page.getByTestId("write-off").click();
    await expect(dialog.locator("#write-off-amount")).toHaveValue("25.00");
    await dialog.locator("#write-off-reason").selectOption("bank_fee");
    await check(page, "write-off dialog");
    await dialog.getByTestId("confirm-write-off").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("invoice-balance")).toHaveText(m.invoicePayments.paidInFull);
    await expect(page.getByTestId("invoice-write-off")).toHaveCount(1);
    await expect(page.getByTestId("prepare-reminder")).toHaveCount(0);

    // The client's page: nothing owed; days to pay counts the invoice paid in full.
    await page.goto(`/${locale}/clients`);
    await page.getByRole("link", { name: PRAIRIE }).click();
    const owes = page.getByTestId("client-owes");
    await expect(owes.getByTestId("owes-owed")).toContainText(money(0, locale));
    await expect(owes.getByTestId("owes-daysToPay")).toContainText(locale === "en" ? "0 days (1 invoice)" : "0 días (1 factura)");
    await check(page, "client page, what the client owes");

    // Payments (G then Y): the two deposits. Voiding the first puts its bank line back for review.
    await page.keyboard.press("g");
    await page.keyboard.press("y");
    await expect(page.getByRole("heading", { level: 1, name: m.payments.title })).toBeVisible();
    const payments = page.getByTestId("payment-row");
    await expect(payments).toHaveCount(2);
    await check(page, "payments");
    const first = payments.filter({ hasText: FIRST });
    await first.getByTestId("payment-menu").click();
    await page.getByRole("menuitem", { name: m.payments.void }).click();
    await dialog.locator("#void-reason").fill("Posted to the wrong deposit");
    await check(page, "void dialog");
    await dialog.getByTestId("confirm-void").click();
    await expect(dialog).toBeHidden();
    await expect(first).toContainText(m.payments.statuses.voided);

    // Recorded by hand from the invoice instead: a check for the whole balance.
    await page.goto(`/${locale}/invoices`);
    await page.getByRole("link", { name: FIRST }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(FIRST);
    await expect(page.getByTestId("invoice-balance")).not.toHaveText(m.invoicePayments.paidInFull);
    await page.getByTestId("invoice-record-payment").click();
    const due = await dialog.getByTestId("pay-invoice").filter({ hasText: FIRST }).getByTestId("pay-invoice-amount").inputValue();
    await dialog.getByTestId("pay-amount").fill(due);
    await dialog.locator("#pay-reference").fill("1043");
    await check(page, "record payment dialog");
    await dialog.getByTestId("pay-save").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("invoice-balance")).toHaveText(m.invoicePayments.paidInFull);
    await expect(page.getByTestId("invoice-payment")).toHaveCount(2);

    // The deposit is back for review; it was the same money, so it is excluded as a duplicate.
    await page.goto(`/${locale}/bank`);
    await expect(page.getByTestId("review-line")).toHaveCount(1);
    await page.getByTestId("review-line").getByTestId("exclude-line").click();
    await dialog.locator("#exclude-reason").selectOption("duplicate");
    await dialog.getByTestId("confirm-exclude").click();
    await expect(page.getByTestId("review-empty")).toBeVisible();

    // Nothing is owed as of today.
    await page.goto(`/${locale}/receivables`);
    await expect(page.getByTestId("receivables-empty")).toBeVisible();
    await check(page, "receivables, nothing owed");
    expect(errors).toEqual([]);
  });
}
