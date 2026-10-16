/**
 * SPEC §24 acceptance, in English and Spanish, in demo mode, through the screens a stranger uses,
 * starting from Home's setup guide:
 *  1. upload the sample folder; 2. every field read with where it came from; 3. the review grid shows
 *  only the rows that need a person; 4. the client approves by its emailed link; 5. the run passes its
 *  checks; 6. the payroll file is exported and reconciles (Gusto here; ADP Paydata, QuickBooks Online
 *  and the IIF file in the second test); 7. invoice PDFs with their backup; 8. the bank file matched;
 *  9. Margin and Compliance show the run; 10. the Owner looks up one SSN with a reason and the activity
 *  log shows it. The setup guide then has every step ticked.
 *
 * The demo's photographed sign-in sheets and the client's signed PDF are read only from recorded
 * readings (SPEC §18: no outside calls). Until those recordings exist, they are archived here with a
 * reason, as a person would; the CSV and spreadsheet exports carry the week.
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { parseAdpWfn } from "../../src/exports/adp-wfn";
import { parseGustoHoursCsv } from "../../src/exports/gusto-hours";
import { parseQbdIif } from "../../src/exports/qbd-iif";
import { parseQboTime } from "../../src/exports/qbo-time";
import { pdfPages } from "../../src/server/files/pdf-text";
import { approveAndCreateFiles, toExceptions, toTotals, uploadPrairieWeek } from "./flow";

type Messages = typeof import("../../messages/en.json");
const MESSAGES = {
  en: JSON.parse(readFileSync("messages/en.json", "utf8")) as Messages,
  es: JSON.parse(readFileSync("messages/es.json", "utf8")) as Messages,
};
const SAMPLES = "demo/samples/2026-10-05";
/** A test photo with a hand-written recorded reading (fixtures/make-photo-fixture.ts): the photo path, until the demo's own photos have recorded readings. */
const PHOTO = "tests/e2e/fixtures/photo-sign-in-2026-10-06.jpg";
const PRAIRIE = "Prairie Line Manufacturing (demo)";
const TIMECLOCK = "IL-prairie-line-timeclock-2026-10-05.csv";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const minutesOf = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h! * 60 + m!;
};

/** The hours the Files step shows for the payroll file (its control totals), in minutes. */
async function shownMinutes(page: Page): Promise<number> {
  const values = await page.getByTestId("payroll-file").locator("dd").allTextContents();
  return values.map((v) => v.trim()).filter((v) => /^\d+:\d{2}$/.test(v)).reduce((sum, v) => sum + minutesOf(v), 0);
}

async function downloadPayroll(page: Page): Promise<{ name: string; text: string }> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("payroll-file").getByRole("link").first().click()]);
  return { name: download.suggestedFilename(), text: readFileSync((await download.path())!, "utf8") };
}

async function skipAllBlocked(page: Page, reason: string) {
  for (let i = 0; i < 10 && (await page.getByTestId("skip-workers").count()) > 0; i++) {
    await page.getByTestId("skip-workers").first().click();
    await page.locator("#skip-reason").fill(reason);
    await page.getByTestId("confirm-skip").click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
}

for (const locale of ["en", "es"] as const) {
  test(`SPEC §24: the demo week from the sample folder to the bank, the margin, compliance and one SSN look-up (${locale})`, async ({ page }) => {
    test.setTimeout(900_000);
    const m = MESSAGES[locale];
    const h = m.convert.hours;
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const dialog = page.getByRole("dialog");

    // Home: the setup guide's next step is the week's timesheets.
    await page.goto(`/${locale}`);
    await expect(page.getByTestId("setup-guide")).toBeVisible();
    await expect(page.getByTestId("setup-step-convert")).toHaveAttribute("data-done", "false");
    await page.getByTestId("setup-action-convert").click();
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.upload })).toBeVisible();
    const period = new URL(page.url()).searchParams.get("period")!;

    // 1. The whole sample folder at once, and one photographed sheet the test can read.
    const files = readdirSync(SAMPLES);
    await page.getByTestId("file-input").setInputFiles([...files.map((f) => `${SAMPLES}/${f}`), PHOTO]);
    await expect(page.getByTestId("document-row")).toHaveCount(files.length + 1, { timeout: 180_000 });
    await expect(page.getByTestId("processing")).toHaveCount(0, { timeout: 180_000 });
    for (const name of ["timeclock", "fieldglass", "photo-sign-in"]) await expect(page.getByTestId("document-row").filter({ hasText: name })).toContainText(m.convert.upload.status.read);
    await expect(page.getByTestId("document-row").filter({ hasText: "timeclock" })).toContainText("51");
    for (let i = 0; i < 10 && (await page.getByTestId("archive").count()) > 0; i++) {
      await page.getByTestId("archive").first().click();
      await page.locator("#archive-reason").fill(locale === "en" ? "No recorded reading in this demo" : "Sin lectura grabada en esta demostración");
      await page.getByTestId("confirm-archive").click();
      await expect(dialog).toBeHidden();
    }

    // 3. Review hours opens on the rows that need a person, and only those.
    await page.getByTestId("forward").click();
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.hours })).toBeVisible();
    const needs = page.getByRole("button", { name: new RegExp(`^${escape(h.filterNeedsReview.split(" (")[0]!)}`) });
    const all = page.getByRole("button", { name: new RegExp(`^${escape(h.filterAll.split(" (")[0]!)}`) });
    const count = async (b: typeof needs) => Number(/\((\d+)\)/.exec((await b.textContent()) ?? "")?.[1]);
    const needCount = await count(needs);
    const allCount = await count(all);
    expect(allCount).toBeGreaterThan(needCount);
    if (needCount > 0) {
      await expect(needs).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("hours-row")).toHaveCount(needCount);
    } else {
      // Nothing to check: the grid opens on every row.
      await expect(all).toHaveAttribute("aria-pressed", "true");
    }

    // 2. Every value read says where it came from: a time-clock row names its file and row; a
    // photographed row shows the page with a box around each value read.
    await all.click();
    await page.getByTestId("hours-row").filter({ hasText: "Marcus Bell" }).first().getByRole("button", { name: h.openSource }).click();
    const panel = page.getByTestId("source-panel");
    await expect(panel).toContainText(new RegExp(escape(h.noImage.split("{file}")[0]!) + escape(TIMECLOCK)));
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await page.getByTestId("hours-row").filter({ hasText: "Robert Jones" }).first().getByRole("button", { name: h.openSource }).click();
    await expect(panel.getByRole("img")).toBeVisible();
    await expect(panel.locator("[data-state]")).toHaveCount(5); // worker, in, out, break, total
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // The rows a person must check: approved when the reading is right, rejected when it is no one's.
    if (needCount > 0) {
      await needs.click();
      for (let i = 0; i < needCount + 2 && (await page.getByTestId("hours-row").count()) > 0; i++) {
        const row = page.getByTestId("hours-row").first();
        const approve = row.getByRole("button", { name: h.approve, exact: true });
        if ((await approve.count()) > 0 && (await approve.isEnabled())) await approve.click();
        else await row.getByRole("button", { name: h.reject, exact: true }).click();
      }
      await expect(page.getByText(h.noRows)).toBeVisible();
    }

    // 4. Prairie Line's approver approves the week by the emailed link.
    await page.goto(`/${locale}/approvals?period=${period}`);
    const prairie = page.getByTestId("approval-row").filter({ hasText: PRAIRIE });
    await prairie.getByTestId("row-send").click();
    await dialog.getByLabel(m.approvals.approverName).fill("Dana Approver");
    await dialog.getByLabel(m.approvals.approverEmail).fill("dana@prairie.example");
    await dialog.getByLabel(m.approvals.approverLanguage).selectOption(locale);
    await dialog.getByTestId("send-request").click();
    await expect(dialog).toBeHidden();
    await expect(prairie.getByTestId("approval-state")).toHaveText(m.approvals.state.waiting);
    await prairie.getByRole("link", { name: PRAIRIE }).click();
    await page.getByTestId("view-email").first().click();
    await page.getByTestId("demo-copy").getByTestId("email-link").click();
    await expect(page.getByTestId("portal-status")).toHaveText(m.portal.status.waiting);
    await page.getByLabel(m.portal.fullName).fill("Dana Approver");
    await page.getByRole("checkbox").check();
    await page.getByTestId("approve-hours").click();
    await expect(page.getByTestId("approve-bar")).toHaveCount(0);
    await page.goto(`/${locale}/approvals?period=${period}`);
    await expect(prairie.getByTestId("approval-state")).toHaveText(m.approvals.state.approved);

    // 5. The run passes its checks: workers held by rules this version does not handle are skipped
    // with a reason; nothing else blocks.
    await page.goto(`/${locale}/convert?period=${period}&step=hours`);
    await toExceptions(page, m);
    await skipAllBlocked(page, locale === "en" ? "Paid separately this week" : "Pagado aparte esta semana");
    await expect(page.getByTestId("exceptions-summary")).toContainText(m.convert.exceptions.summaryNone);
    await toTotals(page, m);
    await approveAndCreateFiles(page, m);

    // 6. The Gusto file: one row per worker the control totals count, its hours those the totals show
    // (Gusto takes hundredths of an hour, each worker's rounded up so no worked time is lost).
    const workers = Number((await page.getByTestId("payroll-file").locator("dd").first().textContent())!.trim());
    const gusto = await downloadPayroll(page);
    const parsed = parseGustoHoursCsv(gusto.text);
    expect(parsed.workers).toBe(workers);
    const fileHundredths = Object.values(parsed.hundredthsByColumn).reduce((a, b) => a + b, 0);
    const shown = await shownMinutes(page);
    expect(fileHundredths * 0.6).toBeGreaterThanOrEqual(shown);
    expect(fileHundredths * 0.6 - shown).toBeLessThan(workers * 3);

    // 7. Each invoice is a PDF with its backup (Prairie Line sends an hours detail page).
    const invoices = page.getByTestId("invoice-row");
    expect(await invoices.count()).toBeGreaterThanOrEqual(2);
    const prairieInvoice = invoices.filter({ hasText: PRAIRIE });
    const [pdf] = await Promise.all([page.waitForEvent("download"), prairieInvoice.getByRole("link", { name: m.common.download }).click()]);
    const bytes = new Uint8Array(readFileSync((await pdf.path())!));
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("%PDF");
    expect((await pdfPages(bytes)).length).toBeGreaterThanOrEqual(2);

    // 8. The bank file: the demo's sample, its deposits matched to the invoices and posted.
    await page.goto(`/${locale}/bank`);
    await page.getByTestId("import-bank").click();
    const [sample] = await Promise.all([page.waitForEvent("download"), page.getByTestId("bank-sample").click()]);
    await page.getByTestId("bank-file").setInputFiles({ name: sample.suggestedFilename(), mimeType: "text/csv", buffer: readFileSync((await sample.path())!) });
    await page.getByTestId("next").click();
    await expect(page.getByTestId("map-preview")).toBeVisible();
    await page.getByTestId("next").click();
    await page.getByTestId("import-lines").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/bank$`));
    const review = page.getByTestId("review-line");
    const exact = review.filter({ hasText: "PAYMENT INV" });
    await expect(exact.getByTestId("confidence")).toHaveText(m.bank.confidence.high);
    await exact.getByTestId("post-line").click();
    await review.filter({ hasText: "AP REMITTANCE" }).getByTestId("post-line").click();
    await page.getByTestId("tab-posted").click();
    await expect(page.getByTestId("posted-row")).toHaveCount(2);

    // 9. Margin shows the week (both clients billed), and compliance counts its hours.
    await page.goto(`/${locale}/margin`);
    await expect(page.getByTestId("margin-row")).toHaveCount(2);
    await expect(page.getByTestId("card-billed").locator("span").last()).not.toHaveText("$0.00");
    await page.goto(`/${locale}/compliance/counters`);
    await expect(page.getByTestId("counter-row").filter({ hasText: "Fatima Haddad" })).toContainText("670:00");
    await page.goto(`/${locale}/compliance/workers-comp`);
    await expect(page.getByRole("row").filter({ hasText: "Marcus Bell" })).toHaveCount(1);

    // 10. The Owner looks up one SSN with a reason; the activity log shows the look, never the number.
    const reason = `Acceptance ${locale} ${Date.now()}`;
    await page.goto(`/${locale}/workers`);
    await page.getByRole("link", { name: "Bell, Marcus" }).click();
    await page.getByTestId("retrieve-ssn").click();
    await page.getByTestId("reveal-reason").fill(reason);
    await page.getByTestId("reveal-show").click();
    const number = (await page.getByTestId("ssn-revealed").textContent())!;
    await page.getByTestId("reveal-close").click();
    await page.getByTestId("agency-menu").click();
    await page.getByTestId("menu-activity").click();
    const first = page.getByTestId("activity-row").first();
    await expect(first).toContainText(m.activityLog.events.ssn_viewed);
    await expect(page.getByTestId("activity-details")).toContainText(reason);
    expect(await page.content()).not.toContain(number);

    // Home: every step of the guide is done.
    await page.goto(`/${locale}`);
    await expect(page.getByTestId("setup-progress")).toHaveText(m.home.guide.progress.replace("{done}", "7").replace("{total}", "7"));
    expect(errors).toEqual([]);
  });

  test(`SPEC §24 step 6: the ADP Paydata, QuickBooks Online and QuickBooks Desktop (IIF) files reconcile with the run (${locale})`, async ({ page }) => {
    test.setTimeout(600_000);
    const m = MESSAGES[locale];
    const p = m.settings.payroll;
    const systems = [
      { id: "adp_wfn_paydata", minutes: (text: string) => [...parseAdpWfn(text).values()].reduce((sum, e) => sum + [...e.minutes.values()].reduce((a, b) => a + b, 0), 0) },
      { id: "qbo_time_csv", minutes: (text: string) => [...parseQboTime(text).values()].reduce((a, b) => a + b, 0) },
      { id: "qbd_iif", minutes: (text: string) => [...parseQbdIif(text).values()].reduce((sum, items) => sum + [...items.values()].reduce((a, b) => a + b, 0), 0) },
    ] as const;
    for (const system of systems) {
      execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
      await page.goto(`/${locale}/settings/payroll`);
      await page.getByTestId(`system-${system.id}`).click();
      if (system.id === "adp_wfn_paydata") await page.getByLabel(p.fields.companyCode).fill("xyz");
      if (system.id === "qbo_time_csv") await page.getByLabel(p.fields.customer).fill("Prairie Line Manufacturing");
      if (system.id === "qbd_iif") await page.getByLabel(p.fields.version2022).check();
      await page.getByTestId("save-system").click();
      await expect(page.getByTestId("system-saved")).toHaveText(p.saved);

      const period = await uploadPrairieWeek(page, locale);
      await page.goto(`/${locale}/convert?period=${period}&step=hours`);
      await toExceptions(page, m);
      // ADP: the demo leaves one worker's file number unset; the run's fix opens it.
      if (system.id === "adp_wfn_paydata") {
        await page.getByTestId("blocker").getByTestId("open-payroll-settings").click();
        const row = page.getByTestId("id-row").filter({ hasText: "Anita Patel" });
        await row.getByTestId("worker-id").fill("100114");
        await row.getByTestId("worker-id").press("Enter");
        await expect(row.getByTestId("id-status")).toHaveText(p.workers.set);
        await page.goto(`/${locale}/convert?period=${period}&step=hours`);
        await toExceptions(page, m);
      }
      // QuickBooks Online takes regular hours only: Marcus's overtime week is paid there by hand.
      await skipAllBlocked(page, locale === "en" ? "Paid by hand in the payroll system" : "Pagado a mano en el sistema de nómina");
      await toTotals(page, m);
      await approveAndCreateFiles(page, m);
      await expect(page.getByTestId("payroll-file")).toContainText(m.convert.files.formats[system.id]);
      const file = await downloadPayroll(page);
      // Marcus Bell 46 h (40 + 6 overtime) and Anita Patel 24 h, Marcus left out where skipped: the
      // file carries exactly the hours the control totals show.
      expect(system.minutes(file.text)).toBe(await shownMinutes(page));
      expect(await shownMinutes(page)).toBe(system.id === "qbo_time_csv" ? 24 * 60 : 70 * 60);
    }
  });
}
