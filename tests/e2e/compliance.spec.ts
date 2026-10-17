/**
 * Slice (j) step 1 through the screens, in English and Spanish (plan "Done means" 2). The demo on
 * its day: Kwame Boateng's Massachusetts job order is overdue; the Massachusetts and Illinois
 * registration renewals and Kateryna Bondarenko's I-9 reverification are due soon (the sidebar's
 * badge: 4); the workers' comp renewal and audit and Prairie Line's next proof page are upcoming.
 * The Owner opens Compliance (G then O), filters, opens the Illinois renewal, adds a file and a note,
 * marks it done; sets Kwame's job order aside with a reason; records the reverification; switches
 * the calendar's views by key; adds the renewed Illinois registration in settings.
 * Accessibility checks on every new screen.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { toExceptions, toTotals, uploadPrairieWeek } from "./flow";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  // A client navigation sets the page's title a moment after its address.
  await page.waitForFunction(() => document.title.length > 0);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

for (const locale of ["en", "es"] as const) {
  test(`compliance: the most urgent first, a duty done with its file and note, one set aside, the calendar by key, a renewal entered (${locale})`, async ({ page }) => {
    test.setTimeout(240_000);
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => msg.type() === "error" && /MISSING_MESSAGE|FORMATTING_ERROR/.test(msg.text()) && errors.push(msg.text()));
    const dialog = page.getByRole("dialog");
    const rows = page.getByTestId("obligation-row");

    // G then O from another page; the badge counts what is overdue or due soon.
    await page.goto(`/${locale}/job-orders`);
    await expect(page.getByTestId("compliance-badge")).toHaveText("4");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("g");
    await page.keyboard.press("o");
    await expect(page.getByRole("heading", { level: 1, name: m.compliance.title })).toBeVisible();
    // 14: the demo's 7 duties, and for its three New Jersey packers starting in 21 days an assignment
    // notice and an equal-pay check each, plus the notice in Leticia's language (she prefers Spanish).
    await expect(rows).toHaveCount(14);
    await expect(rows.first()).toContainText(m.compliance.kinds.ma_job_order);
    await expect(rows.first()).toContainText("Kwame Boateng");
    await expect(rows.first().getByTestId("status-overdue")).toBeVisible();
    await check(page, "compliance list");

    // Filters: Massachusetts; the workers area; search.
    await page.getByTestId("compliance-state").selectOption("MA");
    await expect(rows).toHaveCount(2);
    await page.getByTestId("compliance-state").selectOption("");
    await expect(rows).toHaveCount(14);
    await page.getByTestId("area-workers").click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Kateryna Bondarenko");
    await page.getByTestId("area-all").click();
    await expect(rows).toHaveCount(14);
    await page.keyboard.press("/");
    await page.keyboard.type("IL-DTLSA");
    await page.keyboard.press("Enter");
    await expect(rows).toHaveCount(1);

    // The Illinois renewal: a file, a note, done.
    await rows.first().getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1, name: m.compliance.kinds.il_registration_renewal })).toBeVisible();
    await expect(page.getByText(m.compliance.asks.il_registration_renewal.replace("{days}", "60"))).toBeVisible();
    await check(page, "obligation overview");
    await page.getByTestId("obligation-tab-evidence").click();
    await expect(page.getByTestId("no-files")).toBeVisible();
    await page.getByTestId("evidence-input").setInputFiles({ name: "il-renewal-receipt.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% demo receipt\n") });
    await page.getByTestId("add-evidence").click();
    await expect(page.getByTestId("evidence-file")).toContainText("il-renewal-receipt.pdf");
    await check(page, "obligation evidence");
    await page.getByTestId("obligation-tab-notes").click();
    await page.getByTestId("note-body").fill("Fee check mailed with the bond rider.");
    await page.getByTestId("add-note").click();
    await expect(page.getByTestId("obligation-note")).toContainText("Fee check mailed");
    await page.getByTestId("mark-done").click();
    await dialog.getByTestId("close-note-input").fill("Renewal filed online.");
    await check(page, "mark done");
    await dialog.getByTestId("confirm-close").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("status-done").first()).toBeVisible();
    await page.getByTestId("obligation-tab-history").click();
    await expect(page.getByTestId("obligation-history")).toContainText("Renewal filed online.");
    await check(page, "obligation history");

    // Kwame's job order does not apply: a reason is required.
    await page.goto(`/${locale}/compliance`);
    await expect(page.getByTestId("compliance-badge")).toHaveText("3");
    await rows.first().getByRole("link").click();
    await page.getByTestId("not-applicable").click();
    await expect(dialog.getByTestId("confirm-close")).toBeDisabled();
    await dialog.getByTestId("close-note-input").fill("Secretarial placement: exempt.");
    await dialog.getByTestId("confirm-close").click();
    await expect(page.getByTestId("status-not_applicable").first()).toBeVisible();

    // Kateryna's reverification.
    await page.goto(`/${locale}/compliance?area=workers`);
    await rows.first().getByRole("link").click();
    await page.locator("#next-expires").fill("2028-06-30");
    await page.getByTestId("save-reverify").click();
    await expect(page.getByTestId("status-done").first()).toBeVisible();

    // The calendar: month by default; w, a, t and n by key.
    await page.goto(`/${locale}/compliance/calendar?status=all`);
    await expect(page.getByTestId("calendar-month")).toBeVisible();
    await check(page, "calendar month");
    await page.keyboard.press("w");
    await expect(page.getByTestId("calendar-week")).toBeVisible();
    await page.keyboard.press("a");
    await expect(page.getByTestId("calendar-agenda")).toBeVisible();
    await check(page, "calendar agenda");
    await page.keyboard.press("m");
    await expect(page.getByTestId("calendar-month")).toBeVisible();
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/date=2026-11-01/);
    await expect(page.getByTestId("calendar-chip").filter({ hasText: m.compliance.kinds.il_registration_renewal })).toHaveCount(1);
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(page).toHaveURL(/date=2026-10-01/);
    await expect(page.getByTestId("calendar-range")).toContainText(locale === "en" ? "October 2026" : "octubre de 2026");
    await page.keyboard.press("t");
    await expect(page).not.toHaveURL(/date=/);

    // Settings: the renewed Illinois registration.
    await page.getByTestId("agency-menu").click();
    await page.getByTestId("menu-compliance-settings").click();
    await expect(page.getByRole("heading", { level: 1, name: m.complianceSettings.title })).toBeVisible();
    await check(page, "compliance settings");
    await page.getByTestId("add-registration").click();
    await dialog.getByTestId("reg-number").fill("IL-DTLSA-0001-DEMO");
    await dialog.getByTestId("reg-expires").fill("2027-12-31");
    await check(page, "add registration");
    await dialog.getByTestId("save-registration").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("registration-row")).toHaveCount(3);
    await expect(page.getByTestId("registration-row").filter({ hasText: "IL-DTLSA-0000-DEMO" })).toContainText(m.complianceSettings.registrations.replaced);
    // The insurer's address and phone show under its name; the agency opens on Saturdays.
    await expect(page.getByTestId("policy-row").first()).toContainText("(217) 555-0188");
    await expect(page.getByTestId("open-day-1")).toBeDisabled();
    await expect(page.getByTestId("save-open-days")).toBeDisabled();
    await page.getByTestId("open-day-6").click();
    await page.getByTestId("save-open-days").click();
    await expect(page.getByText(m.complianceSettings.saved).first()).toBeVisible();
    await expect(page.getByTestId("open-days")).toBeVisible();
    await expect(page.getByTestId("save-open-days")).toBeDisabled();
    expect(errors).toEqual([]);
  });
}

for (const locale of ["en", "es"] as const) {
  test(`compliance documents: the Illinois proof page, the Massachusetts job order with its details, the workers' comp packet (${locale})`, async ({ page }) => {
    test.setTimeout(240_000);
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => msg.type() === "error" && /MISSING_MESSAGE|FORMATTING_ERROR/.test(msg.text()) && errors.push(msg.text()));
    const rows = page.getByTestId("obligation-row");

    // Prairie Line's next proof page waits for a registration in force on March 1, 2027.
    await page.goto(`/${locale}/compliance?area=clients`);
    await rows.first().getByRole("link").click();
    await page.getByTestId("obligation-tab-evidence").click();
    await expect(page.getByTestId("make-document-button")).toBeDisabled();
    await expect(page.getByTestId("make-document")).toContainText(m.compliance.detail.proofNoRegistration.split("{date}")[0]!);
    await expect(page.getByTestId("make-document").getByRole("link")).toHaveAttribute("href", `/${locale}/settings/compliance`);
    // The contract's proof page (given already), made again today and kept as evidence.
    await page.goto(`/${locale}/compliance?area=clients&status=done`);
    await rows.first().getByRole("link").click();
    await page.getByTestId("obligation-tab-evidence").click();
    await expect(page.getByTestId("make-document-button")).toHaveText(m.compliance.detail.create.il_client_proof_contract);
    await page.getByTestId("make-document-button").click();
    await expect(page.getByTestId("evidence-file")).toContainText("il-proof-of-registration-PLM-");
    await expect(page.getByTestId("evidence-file")).toContainText(m.compliance.detail.generated);
    await check(page, "proof page made");
    const [proof] = await Promise.all([page.waitForEvent("download"), page.getByTestId("evidence-file").getByRole("link").click()]);
    expect(proof.suggestedFilename()).toMatch(/^il-proof-of-registration-PLM-\d{4}-\d{2}-\d{2}\.pdf$/);

    // Kwame's Massachusetts job order: the details, then the document.
    await page.goto(`/${locale}/compliance?area=placements`);
    await rows.first().getByRole("link").click();
    await expect(page.getByTestId("notice-form")).toBeVisible();
    await expect(page.getByTestId("notice-start")).toHaveValue("16:00");
    await page.getByTestId("notice-transport").fill(locale === "en" ? "Shuttle from the station, no fee" : "Transporte desde la estación, sin costo");
    await page.getByTestId("save-notice").click();
    await expect(page.getByText(m.compliance.detail.notice.saved)).toBeVisible();
    await check(page, "job order details");
    await page.getByTestId("obligation-tab-evidence").click();
    await page.getByTestId("make-document-button").click();
    await expect(page.getByTestId("evidence-file")).toContainText("ma-job-order-boateng-kwame-2026-08-03.pdf");

    // The workers' comp tab: nothing paid in the demo's policy year yet; the packet still downloads.
    await page.goto(`/${locale}/compliance/workers-comp`);
    await expect(page.getByTestId("wc-none")).toBeVisible();
    await expect(page.getByTestId("wc-from")).toHaveValue("2026-01-01");
    await check(page, "workers' comp");
    await page.getByTestId("wc-export").click();
    const [packet] = await Promise.all([page.waitForEvent("download"), page.getByTestId("wc-export-pdf").click()]);
    expect(packet.suggestedFilename()).toBe("workers-comp-2026-01-01-to-2026-12-31.pdf");
    expect(errors).toEqual([]);
  });
}

for (const locale of ["en", "es"] as const) {
  test(`compliance counters: who is near 720 hours, an opening balance added and removed (${locale})`, async ({ page }) => {
    test.setTimeout(180_000);
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => msg.type() === "error" && /MISSING_MESSAGE|FORMATTING_ERROR/.test(msg.text()) && errors.push(msg.text()));
    const dialog = page.getByRole("dialog");
    const rows = page.getByTestId("counter-row");

    await page.goto(`/${locale}/compliance`);
    await page.getByTestId("compliance-tab-counters").click();
    await expect(page).toHaveURL(/\/compliance\/counters/);
    await expect(rows.first()).toContainText("Fatima Haddad");
    await expect(rows.first()).toContainText(m.compliance.counters.near.split("{hours}")[0]!.trim());
    await check(page, "counters");
    await page.getByTestId("counters-show").selectOption("near");
    await expect(page).toHaveURL(/show=near/);
    await expect(rows).toHaveCount(1);
    // Her balance from before Granite.
    await rows.first().getByTestId("counter-toggle").click();
    await expect(page.getByTestId("balance")).toContainText("590:00");
    await check(page, "counter balances");

    // Marcus Bell's hours before Granite, added and then removed.
    await page.getByTestId("counters-show").selectOption("all");
    await expect(page).not.toHaveURL(/show=/);
    await page.getByTestId("add-balance").click();
    await dialog.getByTestId("balance-pair").selectOption({ label: "Marcus Bell · Prairie Line Manufacturing (demo)" });
    await dialog.getByTestId("balance-hours").fill("100:30");
    await dialog.getByTestId("balance-through").fill("2026-06-30");
    await dialog.getByTestId("balance-note").fill(locale === "en" ? "Old timekeeping export" : "Exportación del sistema anterior");
    await check(page, "add balance");
    await dialog.getByTestId("save-balance").click();
    await expect(dialog).toBeHidden();
    const marcus = rows.filter({ hasText: "Marcus Bell" });
    await expect(marcus).toContainText("100:30");
    await marcus.getByTestId("counter-toggle").click();
    await page.getByTestId("remove-balance").click();
    await dialog.getByTestId("balance-reason").fill(locale === "en" ? "Wrong worker" : "Trabajador equivocado");
    await dialog.getByTestId("confirm-remove-balance").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("balance")).toContainText(locale === "en" ? "Wrong worker" : "Trabajador equivocado");
    await expect(marcus.locator("td").nth(5)).toHaveText("—");
    expect(errors).toEqual([]);
  });
}

for (const locale of ["en", "es"] as const) {
  test(`compliance equal pay: hours before Granite cross 720, the run waits for the rate, the rate is entered and paid (${locale})`, async ({ page }) => {
    test.setTimeout(300_000);
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => msg.type() === "error" && /MISSING_MESSAGE|FORMATTING_ERROR/.test(msg.text()) && errors.push(msg.text()));
    const dialog = page.getByRole("dialog");

    // Marcus Bell's 720 hours at Prairie Line before Granite, up to 2026-09-27: his next hour crosses.
    await page.goto(`/${locale}/compliance/counters`);
    await page.getByTestId("add-balance").click();
    await dialog.getByTestId("balance-pair").selectOption({ label: "Marcus Bell · Prairie Line Manufacturing (demo)" });
    await dialog.getByTestId("balance-hours").fill("720");
    await dialog.getByTestId("balance-through").fill("2026-09-27");
    await dialog.getByTestId("balance-note").fill("Old system");
    await dialog.getByTestId("save-balance").click();
    await expect(dialog).toBeHidden();

    // The week of 2026-10-05: his hours in the week before cross 720, so this week needs the rate.
    const period = await uploadPrairieWeek(page, locale);
    await page.goto(`/${locale}/convert?period=${period}&step=hours`);
    await toExceptions(page, m);
    const blocker = page.getByTestId("blocker").filter({ hasText: m.convert.totals.blockers.equal_pay_rate_needed });
    await expect(blocker).toHaveCount(1);
    await blocker.getByTestId("open-equal-pay").click();
    await expect(page).toHaveURL(/area=equal_pay/);
    await page.getByTestId("obligation-row").first().getByRole("link").click();
    await expect(page.getByTestId("equal-pay-form")).toBeVisible();
    const duty = page.url();
    await check(page, "equal-pay rate");
    // The client's figures: $20.00 an hour from 2026-10-05, benefits given.
    await page.getByTestId("ep-from").fill("2026-10-05");
    await page.getByTestId("ep-rate").fill("20.00");
    await page.getByTestId("ep-comparator").fill(locale === "en" ? "Molding operator, 2 years" : "Operador de moldeo, 2 años");
    await page.getByTestId("save-equal-pay").click();
    await expect(page.getByTestId("equal-pay-rate")).toHaveCount(1);
    await expect(page.getByTestId("status-done").first()).toBeVisible();

    // Back to the week: nothing blocks. Marcus 40 h × $20.00 + 6 h × $30.00 = $980.00 (at the card's
    // $18.25 it was $894.25); Anita 24 h × $18.25 = $438.00; gross $1,418.00.
    await page.goto(`/${locale}/convert?period=${period}&step=hours`);
    await toExceptions(page, m);
    await toTotals(page, m);
    await expect(page.getByTestId("summary")).toContainText("$1,418.00");

    // A wrong rate is removed with a reason: it stays listed, and with no rate left the duty is open again.
    await page.goto(duty);
    await page.getByTestId("remove-equal-pay").click();
    await expect(dialog.getByTestId("confirm-remove-equal-pay")).toBeDisabled();
    await dialog.getByTestId("ep-remove-reason").fill(locale === "en" ? "Entered for the wrong client" : "Ingresada para el cliente equivocado");
    await dialog.getByTestId("confirm-remove-equal-pay").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("equal-pay-rate")).toContainText(locale === "en" ? "Entered for the wrong client" : "Ingresada para el cliente equivocado");
    await expect(page.getByTestId("remove-equal-pay")).toHaveCount(0);
    // Open again (past its due date, so overdue); the form starts again from the crossing day.
    await expect(page.getByTestId("status-overdue").first()).toBeVisible();
    await expect(page.getByTestId("ep-from")).toHaveValue("2026-09-28");
    expect(errors).toEqual([]);
  });
}

/** Hours from before Granite: October 2025 to September 2026, Marcus 140 h a month (full-time), Anita 120 h (not). */
const MONTHS = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const HOURS_CSV = ["Worker,Month,Hours", ...MONTHS.map((m) => `Marcus Bell,${m},140`), ...MONTHS.map((m) => `Anita Patel,${m},120`)].join("\n");

for (const locale of ["en", "es"] as const) {
  test(`compliance ACA: periods set, hours imported (a bad file first), who is full-time, the offer duty (${locale})`, async ({ page }) => {
    test.setTimeout(300_000);
    const m = MESSAGES[locale];
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => msg.type() === "error" && /MISSING_MESSAGE|FORMATTING_ERROR/.test(msg.text()) && errors.push(msg.text()));
    const dialog = page.getByRole("dialog");

    // No periods yet: the tab says so and leads to the settings.
    await page.goto(`/${locale}/compliance/aca`);
    await expect(page.getByTestId("aca-needs-settings")).toBeVisible();
    await check(page, "ACA without settings");
    await page.getByTestId("aca-needs-settings").getByRole("link").click();
    await expect(page.getByTestId("aca-settings-form")).toBeVisible();
    await expect(page.getByTestId("aca-settings-none")).toBeVisible();
    // Twelve-month periods from October, 60 administrative days; a 91st day is refused.
    await page.getByTestId("aca-first").selectOption("10");
    await page.getByTestId("aca-admin").fill("91");
    await page.getByTestId("save-aca").click();
    await expect(page.getByText(m.compliance.errors.fields.adminDays)).toBeVisible();
    await page.getByTestId("aca-admin").fill("60");
    await page.getByTestId("save-aca").click();
    await expect(page.getByTestId("aca-settings-none")).toHaveCount(0);
    await check(page, "compliance settings with ACA");

    // Before any hours: every worker is measuring, with no hours on file.
    await page.goto(`/${locale}/compliance/aca`);
    await expect(page.getByTestId("aca-settings")).toBeVisible();
    await expect(page.getByTestId("aca-row").first()).toHaveAttribute("data-result", "measuring");
    await expect(page.locator('[data-testid="aca-row"][data-result="full_time"]')).toHaveCount(0);

    // A file with a name that matches nobody: nothing is saved, the row is named.
    await page.getByTestId("aca-import").click();
    await dialog.getByTestId("aca-file").setInputFiles({ name: "old-payroll.csv", mimeType: "text/csv", buffer: Buffer.from("Worker,Month,Hours\nMarcus Bel,2025-10,140") });
    await dialog.getByTestId("aca-import-save").click();
    await expect(dialog.getByTestId("aca-problems")).toContainText(m.compliance.aca.import.problems.worker.replace("{row}", "2"));
    await dialog.getByTestId("aca-file").setInputFiles({ name: "old-payroll.csv", mimeType: "text/csv", buffer: Buffer.from(HOURS_CSV) });
    await dialog.getByTestId("aca-import-save").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("aca-imports")).toContainText("old-payroll.csv");

    // Marcus averaged 32:13 a week (100,800 minutes × 7 ÷ 365 days): full-time, with his offer duty; Anita (27:36) is not.
    await page.getByTestId("aca-show").selectOption("full_time");
    await expect(page).toHaveURL(/show=full_time/);
    const full = page.getByTestId("aca-row");
    await expect(full.first()).toContainText("Marcus Bell");
    await expect(page.getByTestId("aca-table")).not.toContainText("Anita Patel");
    await check(page, "ACA with results");
    await page.getByTestId("aca-search").fill("anita");
    await page.getByTestId("aca-search").press("Enter");
    await expect(page.getByTestId("aca-no-match")).toBeVisible();
    await page.getByTestId("aca-no-match").getByRole("button").click();
    await expect(page).not.toHaveURL(/show=/);
    await page.getByTestId("aca-show").selectOption("full_time");
    await page.getByTestId("aca-row").filter({ hasText: m.compliance.aca.cycles.standard }).getByTestId("aca-duty").click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(m.compliance.kinds.aca_offer);
    // What it was worked out from, in the reader's language and dates (decision 0028).
    await expect(page.getByTestId("obligation-message")).toContainText(
      locale === "en" ? "Measured full-time in the standard measurement period October 1, 2025 to September 30, 2026" : "Medido como tiempo completo en el periodo de medición estándar del 1 de octubre de 2025 al 30 de septiembre de 2026",
    );
    await check(page, "ACA offer duty");
    expect(errors).toEqual([]);
  });
}
