/**
 * Slice (g) through the screens, in English and Spanish (plan "Done means" 2): the Owner gives one of
 * Prairie Line's placements its own PO and sets the client to separate invoices by PO (the demo
 * client already sends hours detail and timesheet pictures), runs a week with a time-clock file and
 * a photographed sign-in sheet, opens the invoices list, sees two invoices for the client, opens
 * one, downloads its PDF (invoice, hours detail and the timesheet picture) and its CSV, and makes a
 * statement of the two. Accessibility checks on every new screen.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Download, type Page } from "@playwright/test";
import { pdfPages } from "../../src/server/files/pdf-text";
import { approveAndCreateFiles, toExceptions, toTotals, uploadPrairieWeek } from "./flow";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;
const PRAIRIE = "Prairie Line Manufacturing (demo)";
const PHOTO = "tests/e2e/fixtures/photo-sign-in-2026-10-06.jpg";

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

const bytesOf = async (d: Download) => new Uint8Array(readFileSync((await d.path())!));

for (const locale of ["en", "es"] as const) {
  test(`invoices separated by PO with backup: listed, opened, downloaded, put in a statement (${locale})`, async ({ page }) => {
    test.setTimeout(300_000);
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // No invoices yet: the empty state, under the status tabs and the client filter, which stay in place.
    await page.goto(`/${locale}/invoices`);
    await expect(page.getByTestId("invoices-empty")).toBeVisible();
    await expect(page.getByTestId("status-chip-all")).toBeVisible();
    await expect(page.getByRole("combobox", { name: m.invoices.filterClient })).toBeVisible();

    // Anita Patel's placement carries the client's PO-77001 (Assignments, side panel).
    await page.goto(`/${locale}/assignments`);
    const anita = page.getByTestId("record-row").filter({ hasText: "Anita Patel" });
    await anita.hover();
    await anita.getByRole("button", { name: m.list.preview.replace("{name}", "Anita Patel") }).click();
    const panel = page.getByTestId("side-panel");
    await expect(panel.getByTestId("assignment-po")).toHaveAttribute("placeholder", "PO-48213");
    await panel.getByTestId("assignment-po").fill("PO-77001");
    await panel.getByTestId("assignment-po").press("Enter");
    await expect(panel).toContainText(m.assignments.poSaved);

    // Prairie Line: separate invoices by PO, from the first day not yet invoiced.
    await page.goto(`/${locale}/clients`);
    await expect(page.getByRole("heading", { level: 1, name: m.clients.title })).toBeVisible();
    await check(page, "clients list");
    await page.getByRole("link", { name: PRAIRIE }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(PRAIRIE);
    const settings = page.getByTestId("invoice-settings");
    await expect(settings).toContainText(m.clients.notSeparated);
    await check(page, "client page");
    await page.getByTestId("edit-settings").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("field-separate-po").click();
    await check(page, "invoice settings dialog");
    await dialog.getByTestId("save-settings").click();
    await expect(dialog).toBeHidden();
    await expect(settings).toContainText(m.clients.separate.po);

    // The week: Prairie Line's time clock and a photographed sign-in sheet of its second shift.
    const period = await uploadPrairieWeek(page, locale);
    await page.getByTestId("file-input").setInputFiles(PHOTO);
    await expect(page.getByTestId("document-row")).toHaveCount(2, { timeout: 120_000 });
    await page.goto(`/${locale}/convert?period=${period}&step=hours`);
    await toExceptions(page, m);
    await toTotals(page, m);
    await approveAndCreateFiles(page, m);

    // Invoices (G then I): two for Prairie Line, one per PO, in PO order.
    await page.keyboard.press("g");
    await page.keyboard.press("i");
    await expect(page.getByRole("heading", { level: 1, name: m.invoices.title })).toBeVisible();
    const prairie = page.getByTestId("invoice-list-row").filter({ hasText: PRAIRIE });
    await expect(prairie).toHaveCount(2);
    await expect(prairie.filter({ hasText: "PLM-20261005-1" })).toHaveCount(1);
    await expect(prairie.filter({ hasText: "PLM-20261005-2" })).toHaveCount(1);
    // The client filter sits beside the status tabs, on their line.
    const tabs = (await page.getByRole("navigation", { name: m.invoices.filterStatus }).boundingBox())!;
    const filter = (await page.getByRole("combobox", { name: m.invoices.filterClient }).boundingBox())!;
    expect(filter.x).toBeGreaterThan(tabs.x + tabs.width);
    expect(Math.abs(filter.y + filter.height - (tabs.y + tabs.height))).toBeLessThan(12);
    await check(page, "invoices list");

    // A statement of the two: a first page listing them, then each invoice as issued.
    await prairie.nth(0).getByTestId("invoice-select").click();
    await prairie.nth(1).getByTestId("invoice-select").click();
    await expect(page.getByTestId("selection-bar")).toContainText(locale === "en" ? "2 selected" : "2 seleccionadas");
    await check(page, "invoices list with a selection");
    const [statement] = await Promise.all([page.waitForEvent("download"), page.getByTestId("make-statement").click()]);
    expect(statement.suggestedFilename()).toMatch(/^statement-PLM-\d{4}-\d{2}-\d{2}\.pdf$/);
    const cover = (await pdfPages(await bytesOf(statement)))[0]!;
    expect(cover).toContain("Statement");
    expect(cover).toContain("PLM-20261005-1");
    expect(cover).toContain("PLM-20261005-2");

    // The first invoice: the client's PO, with the hours detail and the sign-in sheet picture.
    await prairie.filter({ hasText: "PLM-20261005-1" }).getByRole("link", { name: "PLM-20261005-1" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("PLM-20261005-1");
    await expect(page.getByTestId("invoice-summary")).toContainText("PO-48213");
    await expect(page.getByTestId("line-item").filter({ hasText: "Marcus Bell" })).toHaveCount(2);
    await expect(page.getByTestId("line-item").filter({ hasText: "Anita Patel" })).toHaveCount(0);
    await expect(page.getByTestId("backup-list")).toContainText(m.invoices.detail.included);
    await expect(page.getByTestId("backup-timesheet")).toContainText("photo-sign-in-2026-10-06.jpg");
    await check(page, "invoice page");

    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-pdf").click()]);
    expect(pdf.suggestedFilename()).toBe("invoice-PLM-20261005-1.pdf");
    const pages = await pdfPages(await bytesOf(pdf));
    expect(pages[0]).toContain("PO number PO-48213");
    expect(pages[1]).toContain("Hours detail");
    expect(pages[1]).toContain("Marcus Bell · week of October 5, 2026");
    // The picture's page carries only the footer and its page number.
    expect(pages.at(-1)).toMatch(/Page \d+ of \d+$/);
    expect(pages.at(-1)).not.toContain("Hours detail");

    await page.getByTestId("invoice-menu").click();
    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-csv").click()]);
    expect(csv.suggestedFilename()).toBe("invoice-PLM-20261005-1.csv");
    const rows = new TextDecoder().decode(await bytesOf(csv)).split("\r\n");
    expect(rows[0]).toBe("Invoice Number,Invoice Date,Period Start,Period End,Worker,Worksite,PO Number,Week Ending,Earning Type,Hours,Minutes,Rate,Amount");
    expect(rows.filter((r) => r.includes("Marcus Bell"))).toHaveLength(2);
    expect(rows.slice(1).filter(Boolean).every((r) => r.includes(",PO-48213,"))).toBe(true);

    // Back to the list, and the client's page lists both invoices.
    await page.getByTestId("back-to-invoices").click();
    await expect(page.getByTestId("invoice-list-row").filter({ hasText: PRAIRIE })).toHaveCount(2);
    await page.goto(`/${locale}/clients`);
    await page.getByRole("link", { name: PRAIRIE }).click();
    await expect(page.getByTestId("invoice-list-row")).toHaveCount(2);
    expect(errors).toEqual([]);
  });
}
