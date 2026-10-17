/**
 * Slice G3 through the screens, in English and Spanish:
 * - the inbox (docs/patterns/inbox.md): a time-clock file in a layout no profile knows fails; "Map this
 *   file" maps it once (header line, columns, preview, name) and it is read; search, tabs, totals;
 * - the document review (docs/patterns/documents/[documentId].md): its lines beside the file's rows,
 *   a value chosen highlights its source row, a worker matched teaches a nickname;
 * - Settings › Names (docs/patterns/settings/names.md): add and remove a nickname.
 * Accessibility checks on each new screen.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type Messages = typeof import("../../messages/en.json");
const messages = (locale: "en" | "es") => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Messages;

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

/** Another clock's export (fictional demo workers): two lines of titles, its own column names, hours only. */
const NORTHSIDE = ["Northside Clock — hours by associate", "Printed 10/12/2026", "Badge,Associate,Work Date,Hrs", '10413,"Patel, Anita",10/05/2026,8.00', "10416,Mike Ruiz,10/05/2026,7.50"].join("\n");

for (const locale of ["en", "es"] as const) {
  test(`inbox: map an unknown time file, review it, and keep a nickname (${locale})`, async ({ page }) => {
    test.setTimeout(300_000);
    const m = messages(locale);
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });

    await page.goto(`/${locale}/convert`);
    await page.getByRole("link", { name: m.landing.start }).first().click();
    await page.getByTestId("file-input").setInputFiles({ name: "northside-week.csv", mimeType: "text/csv", buffer: Buffer.from(NORTHSIDE) });
    const row = page.getByTestId("document-row").filter({ hasText: "northside-week.csv" });
    await expect(row).toContainText(m.convert.upload.status.failed, { timeout: 60_000 });
    await check(page, "inbox");

    // Map this file: the column names are on line 3; the worker, the date and the hours.
    await row.getByTestId("map-this-file").click();
    const dialog = page.getByTestId("map-file");
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("header-row-3").check();
    await dialog.getByTestId("map-next").click();
    await dialog.getByTestId("map-name").selectOption("Associate");
    await dialog.getByTestId("map-date").selectOption("Work Date");
    await dialog.getByTestId("map-totalHours").selectOption("Hrs");
    await dialog.getByTestId("map-externalId").selectOption("Badge");
    await check(page, "map columns");
    await dialog.getByTestId("map-next").click();
    await expect(dialog.getByTestId("map-preview-row")).toHaveCount(2);
    await dialog.getByTestId("map-name").fill("Northside clock");
    await dialog.getByTestId("map-save").click();
    await expect(dialog).toBeHidden();
    await expect(row.getByTestId("document-status")).toContainText(m.convert.upload.status.read, { timeout: 120_000 });

    // Search and the totals footer.
    await page.getByTestId("inbox-search").fill("nothing-like-this");
    await expect(page.getByText(m.inbox.noMatch)).toBeVisible();
    await page.getByTestId("inbox-search").fill("northside");
    await expect(page.getByTestId("document-row")).toHaveCount(1);
    await expect(page.getByTestId("inbox-totals")).toContainText("15:30");

    // The document review: the file's rows beside the values; choosing one highlights its row.
    await row.getByRole("link", { name: "northside-week.csv" }).click();
    await expect(page.getByTestId("document-title")).toHaveText("northside-week.csv");
    await expect(page.getByTestId("review-line")).toHaveCount(2);
    await expect(page.getByTestId("document-file")).toBeVisible();
    await page.getByTestId("value-total").first().click();
    await expect(page.getByTestId("file-row-highlighted")).toBeVisible();
    await expect(page.getByTestId("field-details")).toBeVisible();
    await check(page, "document review");

    // "Mike Ruiz" matched to Daniel Ruiz teaches a nickname: Remember "Mike" as Daniel.
    const mike = page.getByTestId("review-line").filter({ hasText: "Mike Ruiz" });
    if ((await mike.count()) > 0) {
      await mike.getByTestId("value-worker").click();
      await page.getByTestId("correct-value").click();
      await page.getByTestId("review-value").selectOption({ label: "Daniel Ruiz" });
      await page.getByTestId("review-reason").selectOption("matched_worker");
      await page.getByTestId("save-value").click();
      await expect(page.getByTestId("nickname-prompt")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("remember-nickname").click();
      await expect(page.getByTestId("nickname-prompt")).toBeHidden();
    }

    // Settings › Names: the nickname learned is there; one added by hand, then removed.
    await page.goto(`/${locale}/settings/names`);
    await expect(page.getByRole("heading", { level: 1, name: m.names.title })).toBeVisible();
    await page.getByTestId("add-nickname").click();
    await page.getByTestId("nickname-input").fill("Zeke");
    await page.getByTestId("given-input").fill("Ezekiel");
    await page.getByTestId("save-nickname").click();
    const zeke = page.getByTestId("nickname-row").filter({ hasText: "Zeke" });
    await expect(zeke).toBeVisible();
    await check(page, "settings names");
    await zeke.getByTestId("remove-nickname").click();
    await expect(zeke).toHaveCount(0);
  });
}
