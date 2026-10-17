/**
 * SPEC §24 acceptance, in English and Spanish, in demo mode, the way a stranger does it: from the
 * demo URL, signed out, in under ten minutes, moving only by the sign-in page, Home's setup guide and
 * the sidebar.
 *  1. upload the sample folder; 2. every field read with where it came from; 3. the review grid shows
 *  only the rows that need a person; 4. the client approves by its emailed link; 5. the run passes its
 *  checks; 6. the payroll file is exported and reconciles (Gusto here; ADP Paydata, QuickBooks Online
 *  and the IIF file in the second test); 7. invoice PDFs with their backup; 8. the bank file matched;
 *  9. Margin and Compliance show the run; 10. the Owner looks up one SSN with a reason and the activity
 *  log shows it. The setup guide then has every step ticked.
 *
 * The demo's photographed sign-in sheets and the client's signed PDF are read only from recorded
 * readings (SPEC §18: no outside calls). Until those recordings exist, each says so and they are
 * archived together with one reason, as a person would. Two test photos with hand-written recorded
 * readings (fixtures/make-photo-fixture.ts) carry the photo path: one reads cleanly; the other has a
 * written total that does not match its times and a visitor who is not on the roster.
 *
 * The figures below are worked out by hand from the sample files (demo/samples/2026-10-05):
 *  - Marcus Bell's five clocked days: 9:03 + 8:59 + 9:04 + 9:00 + 8:57 = 45:03, so 40:00 regular and
 *    5:03 overtime; Gusto takes hundredths of an hour, 5:03 = 303 / 60 = 5.05. At his $18.25 an hour:
 *    straight time 2,703 min × $18.25 / 60 = $822.16, overtime premium 303 × $9.125 / 60 = $46.08,
 *    total $868.24.
 *  - Daniel Ruiz: 40:37, so 0:37 overtime = 37 / 60 = 0.6167, rounded up to 0.62 (no worked time lost).
 *  - Overtime across the week: Pedro 2:00, Marcus 5:03, Jasmine 4:00, Luis 4:00, Óscar 3:00, Daniel
 *    0:37, Kevin 4:00, Jerome 4:00 = 26:40; in the file 2.00 + 5.05 + 4 + 4 + 3 + 0.62 + 4 + 4 = 26.67.
 *  - Fatima Haddad's equal-pay counter at Prairie Line rises by her week, 5 × 8:00 = 40:00.
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { money } from "../../src/components/shiftbook/format";
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
const SAMPLE_FILES = readdirSync(SAMPLES);
/** Test photos with hand-written recorded readings (fixtures/make-photo-fixture.ts). */
const PHOTOS = ["tests/e2e/fixtures/photo-sign-in-2026-10-06.jpg", "tests/e2e/fixtures/photo-sign-in-2026-10-07.jpg"];

/** The page fits its frame: no sideways scroll, and nothing hanging below the frame's sheet. */
async function fitsFrame(page: Page) {
  const room = await page.evaluate(() => {
    const sheet = document.querySelector("[data-slot=sidebar-inset]")!.getBoundingClientRect();
    return { wider: document.documentElement.scrollWidth - window.innerWidth, below: document.documentElement.scrollHeight - (sheet.bottom + window.scrollY) };
  });
  expect(room.wider).toBe(0);
  // The sheet's own margin (8px, and the part of a pixel where the sheet ends) is all there is under it.
  expect(room.below).toBeLessThan(9);
}

const PRAIRIE = "Prairie Line Manufacturing (demo)";
const PACIFIC = "Pacific Crest Distribution (demo)";
const TIMECLOCK = "IL-prairie-line-timeclock-2026-10-05.csv";
const FIELDGLASS = "CA-pacific-crest-fieldglass-approved-time-sheets.csv";
const minutesOf = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h! * 60 + m!;
};
const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
const centsOf = (text: string) => Number(/\$([\d,]+\.\d{2})/.exec(text)![1]!.replace(/[,.]/g, ""));

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

// A step that cannot find what it looks for fails within half a minute, not at the test's end.
test.use({ actionTimeout: 30_000 });

for (const locale of ["en", "es"] as const) {
  test(`SPEC §24: a stranger runs the demo week from the sample folder to the bank, the margin, compliance and one SSN look-up (${locale})`, async ({ browser }) => {
    test.setTimeout(600_000);
    const m = MESSAGES[locale];
    const h = m.convert.hours;
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
    });
    const dialog = page.getByRole("dialog");
    const go = (name: string) => page.getByRole("navigation", { name: m.nav.label }).getByRole("link", { name, exact: true }).click();
    const home = async (step: string) => {
      await go(m.nav.home);
      await expect(page.getByTestId("setup-guide")).toBeVisible();
      await page.getByTestId(`setup-action-${step}`).click();
    };

    // The demo URL, signed out: sign-in, in Spanish by its language link; in as the demo Owner.
    await page.goto("/");
    await expect(page).toHaveURL(/\/en\/sign-in/);
    if (locale === "es") {
      await page.getByRole("navigation", { name: MESSAGES.en.authFrame.language }).getByRole("link", { name: MESSAGES.en.authFrame.spanish }).click();
      await expect(page).toHaveURL(/\/es\/sign-in/);
    }
    await page.getByTestId("continue-owner").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));

    // Fatima Haddad's equal-pay counter before the week.
    await go(m.nav.compliance);
    await page.getByTestId("compliance-tab-counters").click();
    const fatimaBefore = minutesOf(/(\d+:\d{2})/.exec((await page.getByTestId("counter-row").filter({ hasText: "Fatima Haddad" }).textContent())!)![1]!);

    // 1. Home's first open step: the week's timesheets. The sample folder in one click, then the test photos.
    await home("convert");
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.upload })).toBeVisible();
    const docs = page.getByTestId("document-row");
    const doc = (name: string) => docs.filter({ hasText: name });
    await page.getByTestId("use-samples").click();
    await expect(docs).toHaveCount(SAMPLE_FILES.length, { timeout: 180_000 });
    await page.getByTestId("file-input").setInputFiles(PHOTOS);
    await expect(docs).toHaveCount(SAMPLE_FILES.length + PHOTOS.length, { timeout: 180_000 });
    await expect(page.getByTestId("processing")).toHaveCount(0, { timeout: 180_000 });
    // Read: the time clock (51 days), the Fieldglass export (58), the test photos (2, and 3 with 2 to check).
    for (const [name, entries, review] of [
      [TIMECLOCK, "51", "0"],
      [FIELDGLASS, "58", "0"],
      ["photo-sign-in-2026-10-06.jpg", "2", "0"],
      ["photo-sign-in-2026-10-07.jpg", "3", "2"],
    ] as const) {
      await expect(doc(name)).toContainText(m.convert.upload.status.read);
      await expect(doc(name).getByRole("cell").nth(4)).toHaveText(entries);
      await expect(doc(name).getByRole("cell").nth(5)).toHaveText(review);
    }
    // The demo's own photos and signed PDF: no recorded reading yet, said plainly; archived together.
    const unrecorded = SAMPLE_FILES.filter((f) => !f.endsWith(".csv"));
    expect(unrecorded).toHaveLength(6);
    for (const name of unrecorded) await expect(doc(name)).toContainText(m.convert.upload.noRecording);
    await expect(page.getByTestId("archive-unreadable")).toContainText(String(unrecorded.length));
    await page.getByTestId("archive-unreadable").click();
    await page.locator("#archive-reason").fill(locale === "en" ? "No recorded reading in this demo" : "Sin lectura grabada en esta demostración");
    await page.getByTestId("confirm-archive").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("archive")).toHaveCount(0);

    // 3. Review hours opens on the rows that need a person, and only those: the visitor not on the
    // roster and Kateryna's written total that does not match her times.
    await page.getByTestId("forward").click();
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.hours })).toBeVisible();
    const needs = page.getByRole("button", { name: `${h.filterNeedsReview.split(" (")[0]} (2)` });
    const all = page.getByRole("button", { name: `${h.filterAll.split(" (")[0]} (114)` });
    await expect(needs).toHaveAttribute("aria-pressed", "true");
    const rows = page.getByTestId("hours-row");
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) await expect(row).toContainText(h.status.needs_review);
    const visitor = rows.filter({ hasText: "Dale Whitcomb" });
    const kateryna = rows.filter({ hasText: "Kateryna Bondarenko" });
    await expect(visitor).toContainText(h.reasons.worker_not_on_roster);
    await expect(kateryna).toContainText(h.reasons.total_mismatch);

    // 2. Every value read says where it came from: a time-clock row and a Fieldglass row name their
    // file and row; a photographed row shows the page with a box around each value read.
    await all.click();
    await expect(rows).toHaveCount(114);
    const panel = page.getByTestId("source-panel");
    for (const [worker, file, row] of [
      ["Marcus Bell", TIMECLOCK, "8"],
      ["Luis Hernández", FIELDGLASS, "2"],
    ] as const) {
      await rows.filter({ hasText: worker }).first().getByRole("button", { name: h.openSource }).click();
      await expect(panel).toContainText(h.noImage.replace("{file}", file).replace("{row}", row));
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
    }
    await rows.filter({ hasText: "Robert Jones" }).first().getByRole("button", { name: h.openSource }).click();
    await expect(panel.getByRole("img")).toBeVisible();
    await expect(panel.locator("[data-state]")).toHaveCount(5); // worker, in, out, break, total
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // The two rows: Kateryna's times are right (her written total was not), so approved; the visitor's
    // hours are no one's, so rejected (Approve is not offered without a worker).
    await needs.click();
    await expect(visitor.getByRole("button", { name: h.approve, exact: true })).toHaveCount(0);
    await visitor.getByRole("button", { name: h.reject, exact: true }).click();
    await kateryna.getByRole("button", { name: h.approve, exact: true }).click();
    await expect(page.getByText(h.noRows)).toBeVisible();

    // 4. Prairie Line's approver approves the week by the emailed link, opened where no one is signed in.
    await home("approval");
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
    const link = (await page.getByTestId("demo-copy").getByTestId("email-link").getAttribute("href"))!;
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    const client = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const portal = await client.newPage();
    await portal.goto(link);
    await expect(portal.getByTestId("portal-status")).toHaveText(m.portal.status.waiting);
    await portal.getByLabel(m.portal.fullName).fill("Dana Approver");
    await portal.getByRole("checkbox").check();
    await portal.getByTestId("approve-hours").click();
    await expect(portal.getByTestId("approve-bar")).toHaveCount(0);
    await client.close();
    await go(m.nav.approvals);
    await expect(prairie.getByTestId("approval-state")).toHaveText(m.approvals.state.approved);
    await expect(prairie).toContainText("Dana Approver");

    // SPEC §27 (earned wage access): Marcus Bell asks, in the worker app, for part of what his
    // approved, unpaid hours earned; the agency sees it outstanding, recovered by the run below.
    const marcusOnPhone = async () => {
      const phone = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });
      const worker = await phone.newPage();
      worker.on("pageerror", (e) => errors.push(`worker app: ${e.message}`));
      await worker.goto(`/${locale}/w/sign-in`);
      await worker.getByRole("button", { name: m.workerApp.signIn.demoAs.replace("{name}", "Marcus Bell") }).click();
      // The app opens in his saved language: English until the Spanish run changes it the first time.
      await expect(worker).toHaveURL(/\/(en|es)\/w$/);
      if (locale === "es" && worker.url().includes("/en/w")) {
        await worker.getByTestId("worker-tab-more").click();
        await worker.getByTestId("worker-language-es").click();
        await expect(worker).toHaveURL(/\/es\/w/);
      }
      return { phone, worker };
    };
    {
      const { phone, worker } = await marcusOnPhone();
      await worker.getByTestId("worker-tab-home").click();
      await worker.getByTestId("worker-wage-request").click();
      await worker.getByTestId("wage-amount").fill("50.00");
      await worker.getByTestId("wage-confirm").click();
      await expect(worker.getByText(m.money.wage.done).first()).toBeVisible();
      await phone.close();
      await page.goto(`/${locale}/money/wage-access`);
      await expect(page.getByTestId("wage-row").filter({ hasText: "Marcus Bell" }).getByTestId("wage-outstanding")).toHaveText(money(5000, locale));
    }

    // 5. The run passes its checks: nothing blocks.
    await home("files");
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.upload })).toBeVisible();
    await page.getByTestId("forward").click();
    await expect(page.getByRole("heading", { level: 1, name: m.convert.steps.hours })).toBeVisible();
    await toExceptions(page, m);
    await expect(page.getByTestId("blocker")).toHaveCount(0);
    await expect(page.getByTestId("exceptions-summary")).toContainText(m.convert.exceptions.summaryNone);
    await toTotals(page, m);
    await approveAndCreateFiles(page, m);

    // 6. The Gusto file gives back the control totals by type, each worker's hours rounded up to
    // hundredths; two workers' rows checked against the hand arithmetic above.
    const figures = (await page.getByTestId("payroll-file").locator("dd").allTextContents()).map((v) => v.trim());
    expect(figures.slice(0, 3)).toEqual(["24", "881:00", "26:40"]);
    const gusto = await downloadPayroll(page);
    const parsed = parseGustoHoursCsv(gusto.text);
    expect(parsed.workers).toBe(24);
    expect(parsed.hundredthsByColumn).toEqual({ regular_hours: 88100, overtime_hours: 2667, double_overtime_hours: 0 });
    expect(gusto.text).toMatch(/^Bell,Marcus,[^,\n]*,[0-9a-f]{6},40\.00,5\.05,0\.00$/m);
    expect(gusto.text).toMatch(/^Ruiz,Daniel,[^,\n]*,[0-9a-f]{6},40\.00,0\.62,0\.00$/m);
    expect(gusto.text).toMatch(/^Bondarenko,Kateryna,[^,\n]*,[0-9a-f]{6},15\.00,0\.00,0\.00$/m);

    // 7. Each client's invoice is a PDF with its backup: Prairie Line's carries hours detail pages, its
    // second-shift detail showing who approved it. (Invoices are written in English.)
    const invoices = page.getByTestId("invoice-row");
    await expect(invoices).toHaveCount(2);
    const invoice: Record<string, { number: string; cents: number }> = {};
    for (const name of [PACIFIC, PRAIRIE]) {
      const row = invoices.filter({ hasText: name });
      const text = (await row.textContent())!;
      invoice[name] = { number: /[A-Z]{3}-\d{8}/.exec(text)![0], cents: centsOf(text) };
      const [pdf] = await Promise.all([page.waitForEvent("download"), row.getByRole("link", { name: m.common.download }).click()]);
      const bytes = new Uint8Array(readFileSync((await pdf.path())!));
      expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("%PDF");
      const pages = await pdfPages(bytes);
      expect(pages[0]).toContain(invoice[name]!.number);
      if (name === PRAIRIE) {
        expect(pages.length).toBeGreaterThanOrEqual(3);
        expect(pages[2]!.startsWith(MESSAGES.en.invoice.detailTitle)).toBe(true);
        expect(pages.join(" ")).toMatch(/Robert Jones · week of October 5, 2026 .* Week total 16:00 Approved by Dana Approver \(dana@prairie\.example\)/);
      }
    }

    // 8. The bank file: the demo's sample, one deposit matched by its invoice number, the other short
    // by $25.00 against Prairie Line's invoice; both posted, $25.00 left owed.
    await home("bank");
    await page.getByTestId("import-bank").click();
    await page.getByTestId("use-bank-sample").click();
    await expect(page.getByTestId("map-preview")).toBeVisible();
    await page.getByTestId("next").click();
    await page.getByTestId("import-lines").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/bank$`));
    const review = page.getByTestId("review-line");
    await expect(review).toHaveCount(3);
    const exact = review.filter({ hasText: "PAYMENT INV" });
    const remit = review.filter({ hasText: "AP REMITTANCE" });
    await expect(exact.getByTestId("confidence")).toHaveText(m.bank.confidence.high);
    await expect(exact.getByTestId("suggestion")).toContainText(invoice[PACIFIC]!.number);
    await expect(exact.getByTestId("suggestion")).toContainText(money(invoice[PACIFIC]!.cents, locale));
    await expect(remit.getByTestId("suggestion")).toContainText(invoice[PRAIRIE]!.number);
    await expect(remit.getByTestId("suggestion")).toContainText(m.bank.short.replace("{amount}", money(2500, locale)));
    await exact.getByTestId("post-line").click();
    await expect(review).toHaveCount(2);
    await remit.getByTestId("post-line").click();
    await expect(review).toHaveCount(1);
    await page.getByTestId("tab-posted").click();
    await expect(page.getByTestId("posted-row")).toHaveCount(2);
    await go(m.nav.receivables);
    await expect(page.getByTestId("figure-owed-value")).toHaveText(money(2500, locale));
    await expect(page.getByTestId("aging-row")).toHaveCount(1);
    await expect(page.getByTestId("aging-row")).toContainText(PRAIRIE);

    // 9. Margin bills exactly the two invoices; the equal-pay counter rises by Fatima's week; workers'
    // comp carries Marcus Bell's hours and pay as worked out above.
    await go(m.nav.margin);
    await expect(page.getByTestId("margin-row")).toHaveCount(2);
    await expect(page.getByTestId("card-billed")).toContainText(money(invoice[PACIFIC]!.cents + invoice[PRAIRIE]!.cents, locale));
    await go(m.nav.compliance);
    await page.getByTestId("compliance-tab-counters").click();
    await expect(page.getByTestId("counter-row").filter({ hasText: "Fatima Haddad" })).toContainText(hm(fatimaBefore + 5 * 8 * 60));
    await page.getByTestId("compliance-tab-workersComp").click();
    const marcus = page.getByRole("row").filter({ hasText: "Marcus Bell" });
    await expect(marcus).toHaveCount(1);
    for (const value of ["45:03", money(82216, locale), money(4608, locale), money(86824, locale)]) await expect(marcus).toContainText(value);

    // 10. The Owner looks up one SSN with a reason; the activity log shows the look, never the number;
    // and who approved Prairie Line's hours.
    const reason = `Acceptance ${locale} ${Date.now()}`;
    await home("ssn");
    await page.getByRole("link", { name: "Bell, Marcus" }).click();
    await page.getByTestId("retrieve-ssn").click();
    await page.getByTestId("reveal-reason").fill(reason);
    await page.getByTestId("reveal-show").click();
    const number = (await page.getByTestId("ssn-revealed").textContent())!.trim();
    expect(number).toMatch(/^9\d{2}-\d{2}-\d{4}$/);
    await page.getByTestId("reveal-close").click();
    await page.getByTestId("agency-menu").click();
    await page.getByTestId("menu-activity").click();
    await expect(page.getByTestId("activity-row").first()).toContainText(m.activityLog.events.ssn_viewed);
    await expect(page.getByTestId("activity-details")).toContainText(reason);
    const html = await page.content();
    expect(html).not.toContain(number);
    expect(html).not.toContain(number.replaceAll("-", ""));
    const people = page.getByTestId("activity-person");
    const dana = (await people.locator("option").allTextContents()).find((o) => o.includes("Dana Approver"));
    expect(dana).toBeTruthy();
    await people.selectOption({ label: dana! });
    await page.getByTestId("activity-apply").click();
    await expect(page.getByTestId("activity-row").first()).toContainText("Dana Approver");

    // SPEC §27 item 11. The invoice is emailed to Prairie Line's billing contact (the demo keeps it).
    await page.goto(`/${locale}/invoices`);
    await page.getByRole("link", { name: invoice[PRAIRIE]!.number }).first().click();
    await page.getByTestId("send-invoice").click();
    const to = await dialog.getByTestId("send-to").inputValue();
    expect(to).toMatch(/@/);
    await dialog.getByTestId("confirm-send").click();
    await expect(page.getByTestId("summary-sent")).toContainText(to);

    // The schedule is published: the changes, every client, asking for answers.
    await page.goto(`/${locale}/schedule`);
    await page.getByTestId("schedule-publish").click();
    const publish = page.getByTestId("publish-dialog");
    await publish.getByTestId("publish-next").click();
    await publish.getByTestId("publish-next").click();
    await publish.getByTestId("publish-notify-confirm").check();
    await publish.getByTestId("publish-confirm").click();
    await expect(publish).toBeHidden();

    // A demo worker in the worker app (Marcus Bell, in Spanish for the Spanish run) confirms his
    // shift, and sees the week's hours and the pay stub of the run just paid.
    const { phone, worker } = await marcusOnPhone();
    await expect(worker.getByTestId("worker-tab-shifts")).toContainText(MESSAGES[locale].workerApp.tabs.shifts);
    await expect(worker.getByTestId("worker-shifts-waiting")).toHaveText("1");
    await worker.getByTestId("worker-tab-shifts").click();
    await worker.getByTestId("worker-confirm").first().click();
    await expect(worker.getByText(MESSAGES[locale].shiftsWorker.done).first()).toBeVisible();
    await worker.getByTestId("worker-tab-time").click();
    await expect(worker.getByTestId("worker-week-hours").first()).toBeVisible();
    await worker.getByTestId("worker-tab-pay").click();
    await worker.getByTestId("worker-stub").first().click();
    await expect(worker.getByTestId("worker-stub-gross")).toContainText("$");
    await expect(worker.getByTestId("worker-stub-lines")).toBeVisible();
    await phone.close();

    // The payroll payload and Prairie Line's funding packet are recorded for partners; nothing moves.
    const mo = m.money;
    await page.goto(`/${locale}/money/payroll`);
    await page.getByTestId("payroll-run-row").first().getByRole("link").click();
    await page.getByTestId("record-payroll-handoff").click();
    await page.getByTestId("confirm-payroll-handoff").click();
    await expect(page.getByTestId("payroll-run-status")).toHaveText(mo.run.status.recorded);
    await page.goto(`/${locale}/money/funding`);
    // Only Prairie Line's invoice is still owed ($25.00 short-paid above).
    await page.getByTestId("funding-row").first().getByRole("link").click();
    await expect(page.getByTestId("funding-status")).toHaveText(mo.funding.prequalified);
    await page.getByTestId("submit-funding").click();
    await page.getByTestId("confirm-funding").click();
    await expect(page.getByTestId("funding-status")).toHaveText(mo.funding.submitted);
    // The workers' comp wages for the broker: the period's pay by state and class, recorded as handed off.
    await page.goto(`/${locale}/money/insurance`);
    await expect(page.getByTestId("insurance-class").first()).toBeVisible();
    await page.getByTestId("insurance-record").click();
    await page.getByTestId("confirm-insurance").click();
    await expect(page.getByText(mo.insurance.done).first()).toBeVisible();
    await page.goto(`/${locale}/money`);
    // Payroll, funding, Marcus's wage access and the broker's file.
    await expect(page.getByTestId("handoff-row")).toHaveCount(4);
    await expect(page.getByTestId("handoff-row").first()).toHaveAttribute("data-kind", "insurance");

    // Home: every step of the guide is done.
    await go(m.nav.home);
    await expect(page.getByTestId("setup-progress")).toHaveText(m.home.guide.progress.replace("{done}", "10").replace("{total}", "10"));
    await fitsFrame(page);
    expect(errors).toEqual([]);
    await context.close();
  });

  test(`SPEC §24 step 6: the ADP Paydata, QuickBooks Online and QuickBooks Desktop (IIF) files reconcile with the run (${locale})`, async ({ page }) => {
    test.setTimeout(600_000);
    const m = MESSAGES[locale];
    const p = m.settings.payroll;
    // Marcus Bell 46 h (40 regular + 6 overtime) and Anita Patel 24 h (flow.ts). Each file is read back
    // as minutes per worker and type, compared without names (each system keys workers its own way).
    const sorted = (pairs: number[][]) => pairs.map((p) => p.join("/")).sort();
    const systems = [
      { id: "adp_wfn_paydata", split: (text: string) => sorted([...parseAdpWfn(text).values()].map((e) => [e.minutes.get("Reg Hours") ?? 0, e.minutes.get("O/T Hours") ?? 0])), expected: ["1440/0", "2400/360"] },
      { id: "qbo_time_csv", split: (text: string) => sorted([...parseQboTime(text).values()].map((minutes) => [minutes])), expected: ["1440"] },
      { id: "qbd_iif", split: (text: string) => sorted([...parseQbdIif(text).values()].map((items) => [...items.values()].sort((a, b) => b - a))), expected: ["1440", "2400/360"] },
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
        await expect(page.getByTestId("blocker")).toHaveCount(1);
        await page.getByTestId("blocker").getByTestId("open-payroll-settings").click();
        const row = page.getByTestId("id-row").filter({ hasText: "Anita Patel" });
        await row.getByTestId("worker-id").fill("100114");
        await row.getByTestId("worker-id").press("Enter");
        await expect(row.getByTestId("id-status")).toHaveText(p.workers.set);
        await page.goto(`/${locale}/convert?period=${period}&step=hours`);
        await toExceptions(page, m);
      }
      // QuickBooks Online takes regular hours only: Marcus's overtime week is held, and paid there by hand.
      if (system.id === "qbo_time_csv") {
        await expect(page.getByTestId("blocker")).toHaveCount(1);
        await expect(page.getByTestId("blocker")).toContainText("Marcus Bell");
        await skipAllBlocked(page, locale === "en" ? "Paid by hand in the payroll system" : "Pagado a mano en el sistema de nómina");
      }
      await toTotals(page, m);
      await approveAndCreateFiles(page, m);
      await expect(page.getByTestId("payroll-file")).toContainText(m.convert.files.formats[system.id]);
      const file = await downloadPayroll(page);
      expect(system.split(file.text)).toEqual(system.expected);
      expect(await shownMinutes(page)).toBe(system.id === "qbo_time_csv" ? 24 * 60 : 70 * 60);
    }
  });
}
