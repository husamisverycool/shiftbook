/**
 * The converter's forward steps after Review hours (slice e): Exceptions → Review totals → Approve →
 * Create files. Shared by the specs that walk a week through to its files.
 */
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

type Messages = typeof import("../../messages/en.json");
const CLOCK_HEADER = "Employee ID,Employee Name,Department,Date,Clock In,Clock Out,Break (min),Total Hours";

/** Marcus 10 h Monday to Wednesday and 8 h Thursday and Friday; Anita 8 h Monday to Wednesday. Returns the period id. */
export async function uploadPrairieWeek(page: Page, locale: "en" | "es"): Promise<string> {
  const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Messages;
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

/** From Review hours: the rules are computed on the way to Exceptions. */
export async function toExceptions(page: Page, m: Messages) {
  await page.getByTestId("forward").click();
  await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.exceptions })).toBeVisible({ timeout: 60_000 });
}

/** From Exceptions with nothing blocking. */
export async function toTotals(page: Page, m: Messages) {
  await expect(page.getByTestId("blocker")).toHaveCount(0);
  await page.getByTestId("forward").click();
  await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.totals })).toBeVisible({ timeout: 60_000 });
}

/** From Review totals: the Owner approves, then the files are made from what was approved. */
export async function approveAndCreateFiles(page: Page, m: Messages) {
  await expect(page.getByTestId("forward")).toHaveText(m.convert.forward.approve);
  await page.getByTestId("forward").click();
  await expect(page.getByTestId("approval")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("forward")).toHaveText(m.convert.forward.totals);
  await page.getByTestId("forward").click();
  await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.files })).toBeVisible({ timeout: 60_000 });
}
