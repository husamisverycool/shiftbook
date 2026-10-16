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

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
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
    await expect(rows).toHaveCount(7);
    await expect(rows.first()).toContainText(m.compliance.kinds.ma_job_order);
    await expect(rows.first()).toContainText("Kwame Boateng");
    await expect(rows.first().getByTestId("status-overdue")).toBeVisible();
    await check(page, "compliance list");

    // Filters: Massachusetts; the workers area; search.
    await page.getByTestId("compliance-state").selectOption("MA");
    await expect(rows).toHaveCount(2);
    await page.getByTestId("compliance-state").selectOption("");
    await expect(rows).toHaveCount(7);
    await page.getByTestId("area-workers").click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Kateryna Bondarenko");
    await page.getByTestId("area-all").click();
    await expect(rows).toHaveCount(7);
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
    // Her balance from before Shiftbook.
    await rows.first().getByTestId("counter-toggle").click();
    await expect(page.getByTestId("balance")).toContainText("590:00");
    await check(page, "counter balances");

    // Marcus Bell's hours before Shiftbook, added and then removed.
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
