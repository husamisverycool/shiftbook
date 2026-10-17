/**
 * Slice (k) step 2 in the browser (decision 0027): the roster (search by name or payroll number,
 * finding ended workers; Include ended), adding a worker, each profile section's Edit, an SSN entered
 * and revealed by the Owner with a reason (the look listed), payroll numbers, the end of employment
 * and a rehire, a document added, opened by the Owner with a reason and removed; who sees which
 * buttons and who may open a worker's file; accessibility, in English and Spanish.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

type Messages = typeof import("../../messages/en.json");
const MESSAGES = {
  en: JSON.parse(readFileSync("messages/en.json", "utf8")) as Messages,
  es: JSON.parse(readFileSync("messages/es.json", "utf8")) as Messages,
};
/** A test number: area 9xx, group 55 (the demo's numbers use groups 10–49). */
const TEST_SSN = { en: ["900", "55", "1234"], es: ["901", "55", "4321"] } as const;

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.title.length > 0 && document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

/** A demo person by role, in their own browser context. */
async function signedInAs(browser: Browser, role: "coordinator" | "billing" | "accountant"): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/en/sign-in");
  await page.getByTestId(`continue-${role}`).click();
  await expect(page).toHaveURL(/\/en$/);
  return page;
}

for (const locale of ["en", "es"] as const) {
  test(`the roster: search, add a worker, edit each section, reveal the SSN with a reason, end and rehire, documents (${locale})`, async ({ page }) => {
    const m = MESSAGES[locale];
    const w = m.workers;
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
    await page.goto(`/${locale}/workers`);
    await expect(page.getByRole("heading", { level: 1, name: w.title })).toBeVisible();
    await expect(page.getByTestId("worker-row")).toHaveCount(40);
    await expect(page.getByTestId("worker-count")).toHaveText(locale === "en" ? "40 workers" : "40 trabajadores");
    await check(page, `workers (${locale})`);

    // "/" goes to the search; accents do not matter; a payroll number finds its worker.
    await page.keyboard.press("/");
    await expect(page.getByTestId("worker-search")).toBeFocused();
    await page.keyboard.type("hernandez");
    await expect(page.getByTestId("worker-row")).toHaveCount(1);
    await expect(page.getByTestId("worker-row")).toContainText("Hernández, Luis");
    await page.getByTestId("worker-search").fill("SB-0002");
    await expect(page.getByTestId("worker-row")).toHaveCount(1);
    await expect(page.getByTestId("worker-row")).toContainText("Torres, Maribel");
    await page.getByTestId("worker-search").fill("nobody by this name");
    await expect(page.getByTestId("workers-no-match")).toContainText(w.noMatch.replace("{query}", "nobody by this name"));
    await page.getByRole("button", { name: w.clearSearch }).click();
    await expect(page.getByTestId("worker-row")).toHaveCount(40);

    // Add a worker: the dialog opens their profile.
    const first = locale === "en" ? "Avery" : "Ximena";
    const last = locale === "en" ? "Quill" : "Robledo";
    await page.getByTestId("add-worker").click();
    await page.getByTestId("save-new-worker").click();
    await expect(page.getByText(w.fields.firstName)).toBeVisible();
    await page.getByTestId("new-first-name").fill(first);
    await page.getByTestId("new-last-name").fill(last);
    await page.getByTestId("new-language").selectOption("es");
    await check(page, `add worker (${locale})`);
    await page.getByTestId("save-new-worker").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/workers/[0-9a-f-]{36}$`));
    await expect(page.getByRole("heading", { level: 1, name: `${first} ${last}` })).toBeVisible();
    await expect(page.getByTestId("ssn-masked")).toHaveText(w.profile.ssn.notOnFile);
    await check(page, `profile (${locale})`);

    // Personal: Edit, change, Save; Escape cancels an open Edit.
    await page.getByTestId("personal-edit").click();
    await page.getByTestId("personal-last-name").fill(`${last}-Park`);
    await page.getByTestId("personal-save").click();
    await expect(page.getByRole("heading", { level: 1, name: `${first} ${last}-Park` })).toBeVisible();
    await page.getByTestId("personal-edit").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("personal-first-name")).toHaveCount(0);

    // The SSN: a number the SSA never issues is refused under the field; a good one shows its last four.
    await page.getByTestId("ssn-edit").click();
    await page.getByTestId("ssn-input").fill("123");
    await page.getByTestId("ssn-save").click();
    await expect(page.getByTestId("ssn").getByTestId("field-error")).toHaveText(w.profile.ssn.rules.format);
    await page.getByTestId("ssn-input").fill(TEST_SSN[locale].join("-"));
    await page.getByTestId("ssn-save").click();
    await expect(page.getByTestId("ssn-masked")).toHaveText(`•••-••-${TEST_SSN[locale][2]}`);
    // Never on the page itself.
    expect(await page.content()).not.toContain(TEST_SSN[locale].join("-"));

    // Retrieve SSN: the reason first, then the number; the look is listed with its reason.
    await page.getByTestId("retrieve-ssn").click();
    await page.getByTestId("reveal-show").click();
    await expect(page.getByRole("dialog").getByTestId("field-error")).toHaveText(w.errors.reason_required);
    await page.getByTestId("reveal-reason").fill("Payroll set-up");
    await page.getByTestId("reveal-show").click();
    await expect(page.getByTestId("ssn-revealed")).toHaveText(TEST_SSN[locale].join("-"));
    await expect(page.getByTestId("ssn-activity").locator("li").first()).toContainText(w.profile.reveal.viewed.replace("{who}", "Demo Owner (demo)"));
    await expect(page.getByTestId("ssn-activity").locator("li").first()).toContainText("“Payroll set-up”");
    await check(page, `retrieve SSN (${locale})`);
    await page.getByTestId("reveal-close").click();
    await expect(page.getByTestId("ssn-revealed")).toHaveCount(0);
    expect(await page.content()).not.toContain(TEST_SSN[locale].join("-"));

    // Payroll numbers: Gusto (in use) needs its job title too.
    await page.getByTestId("payroll-edit").click();
    await page.getByTestId("payroll-gusto").fill(`gusto-${locale}-77`);
    await page.getByTestId("payroll-save").click();
    await expect(page.getByTestId("payroll").getByTestId("field-problem")).toBeVisible();
    await page.getByTestId("payroll-gusto-title").fill("Picker");
    await page.getByTestId("payroll-spreadsheet").fill(`SB-${locale}-77`);
    await page.getByTestId("payroll-save").click();
    await expect(page.getByTestId("payroll-value-gusto")).toContainText(`gusto-${locale}-77`);
    await expect(page.getByTestId("payroll-value-gusto")).toContainText(w.profile.payroll.inUse);
    await expect(page.getByTestId("payroll-value-spreadsheet")).toContainText(`SB-${locale}-77`);
    // The facts line under the name gives the number in the system in use.
    await expect(page.getByTestId("worker-facts")).toContainText(w.profile.facts.payroll.replace("{number}", `gusto-${locale}-77`).replace("{system}", w.systems.gusto));

    // Employment: ended (hidden from the list, found by search), then hired again.
    await page.getByTestId("tab-employment").click();
    await expect(page).toHaveURL(/\?tab=employment$/);
    await check(page, `employment (${locale})`);
    await page.getByTestId("end-employment").click();
    await check(page, `end employment (${locale})`);
    await page.getByTestId("confirm-end").click();
    await expect(page.getByTestId("worker-status")).toHaveText(w.status.ended);
    await page.goto(`/${locale}/workers`);
    await expect(page.getByTestId("worker-row")).toHaveCount(40);
    await page.getByTestId("worker-search").fill(first);
    await expect(page.getByTestId("worker-row")).toHaveCount(1);
    await expect(page.getByTestId("worker-row")).toContainText(w.status.ended);
    await page.getByTestId("worker-search").fill(`SB-${locale}-77`);
    await expect(page.getByTestId("worker-row")).toHaveCount(1);
    await page.getByTestId("worker-search").fill("");
    await page.getByTestId("include-ended").click();
    await expect(page.getByTestId("worker-row")).toHaveCount(41);
    await page.getByRole("link", { name: `${last}-Park, ${first}` }).click();
    await page.getByTestId("tab-employment").click();
    await page.getByTestId("rehire").click();
    await expect(page.getByTestId("worker-status")).toHaveText(w.status.active);

    // Documents: add (a file name with an SSN in it is refused), download, remove.
    await page.getByTestId("tab-documents").click();
    await expect(page.getByTestId("documents-empty")).toBeVisible();
    await page.getByTestId("add-document").click();
    await check(page, `add document (${locale})`);
    await page.getByTestId("document-file").setInputFiles({ name: `w4 ${TEST_SSN[locale].join("")}.pdf`, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
    await page.getByTestId("save-document").click();
    await expect(page.getByRole("dialog").getByTestId("field-error")).toHaveText(w.profile.documents.rules.file_name);
    await page.getByTestId("document-file").setInputFiles({ name: "w4-signed.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
    await page.getByTestId("save-document").click();
    await expect(page.getByTestId("document-row")).toHaveCount(1);
    await expect(page.getByTestId("document-row")).toContainText("w4-signed.pdf");
    await expect(page.getByTestId("document-row")).toContainText(w.profile.documents.kinds.w4);
    await check(page, `documents (${locale})`);
    // A W-4 holds the SSN: the Owner opens it with a reason, and the opening is listed with the SSN's views.
    await page.getByTestId("open-document").click();
    await page.getByTestId("open-document-confirm").click();
    await expect(page.getByRole("dialog").getByTestId("field-error")).toHaveText(w.errors.reason_required);
    await page.getByTestId("open-reason").fill("Check the withholding");
    await check(page, `open document (${locale})`);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("open-document-confirm").click()]);
    expect(download.suggestedFilename()).toBe("w4-signed.pdf");
    expect(readFileSync(await download.path()).toString()).toBe("%PDF-1.4 test");
    await page.getByTestId("tab-profile").click();
    await page.getByTestId("retrieve-ssn").click();
    await expect(page.getByTestId("ssn-activity").locator("li").first()).toContainText(w.profile.reveal.opened.replace("{file}", "w4-signed.pdf").replace("{who}", "Demo Owner (demo)"));
    await page.getByTestId("reveal-close").click();
    await page.getByTestId("tab-documents").click();
    await page.getByTestId("remove-document").click();
    await page.getByTestId("confirm-remove-document").click();
    await expect(page.getByTestId("documents-empty")).toBeVisible();
  });
}

test("who sees what: a coordinator changes the roster but cannot retrieve an SSN or open a worker's file; Billing and the accountant read only", async ({ browser, page }) => {
  const en = MESSAGES.en;
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
  // Lena, a coordinator, adds a document to Marcus's profile; she cannot open it.
  const lena = await signedInAs(browser, "coordinator");
  await lena.goto("/en/workers");
  await lena.getByRole("link", { name: "Bell, Marcus" }).click();
  await expect(lena.getByTestId("ssn-masked")).toHaveText(/^•••-••-\d{4}$/);
  await expect(lena.getByTestId("retrieve-ssn")).toHaveCount(0);
  await expect(lena.getByTestId("personal-edit")).toBeVisible();
  await lena.getByTestId("tab-documents").click();
  await lena.getByTestId("add-document").click();
  await lena.getByTestId("document-kind").selectOption("direct_deposit");
  await lena.getByTestId("document-file").setInputFiles({ name: "direct-deposit.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 bank form") });
  await lena.getByTestId("save-document").click();
  await expect(lena.getByTestId("document-row")).toContainText(en.workers.profile.documents.kinds.direct_deposit);
  await expect(lena.getByTestId("open-document")).toHaveCount(0);
  await expect(lena.getByText(en.workers.profile.documents.openOnly)).toBeVisible();
  const marcus = lena.url().replace(/\?.*$/, "");

  // The Owner opens it with a reason; the address works for nobody else.
  await page.goto(`${marcus}?tab=documents`);
  await page.getByTestId("open-document").click();
  await page.getByTestId("open-reason").fill("Bank details for the first pay");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("open-document-confirm").click()]);
  const granted = download.url();
  expect(readFileSync(await download.path()).toString()).toBe("%PDF-1.4 bank form");
  expect((await lena.request.get(granted)).status()).toBe(403);
  expect((await page.request.get(granted.replace(/signature=[^&]+/, "signature=forged"))).status()).toBe(403);

  // Billing: the list of files only.
  const rosa = await signedInAs(browser, "billing");
  await rosa.goto(`${marcus}?tab=documents`);
  await expect(rosa.getByText(en.workers.profile.readOnly)).toBeVisible();
  await expect(rosa.getByText(en.workers.profile.documents.openOnly)).toBeVisible();
  await expect(rosa.getByTestId("document-row")).toContainText("direct-deposit.pdf");
  await expect(rosa.getByTestId("open-document")).toHaveCount(0);
  await expect(rosa.getByTestId("remove-document")).toHaveCount(0);
  expect((await rosa.request.get(granted)).status()).toBe(403);
  await rosa.goto("/en/workers");
  await expect(rosa.getByTestId("add-worker")).toHaveCount(0);
  await expect(rosa.getByText(en.workers.readOnly)).toBeVisible();

  // The accountant: reads everything except SSNs (SPEC §2): no whole number, no worker's file, no changes.
  const morgan = await signedInAs(browser, "accountant");
  await morgan.goto(marcus);
  await expect(morgan.getByTestId("personal-edit")).toHaveCount(0);
  await expect(morgan.getByTestId("ssn-edit")).toHaveCount(0);
  await expect(morgan.getByTestId("payroll-edit")).toHaveCount(0);
  await expect(morgan.getByTestId("retrieve-ssn")).toHaveCount(0);
  await check(morgan, "profile, accountant");
  await morgan.getByTestId("tab-employment").click();
  await expect(morgan.getByTestId("end-employment")).toHaveCount(0);
  await expect(morgan.getByTestId("i9-edit")).toHaveCount(0);
  await expect(morgan.getByTestId("worker-assignment").first()).toBeVisible();
  await morgan.getByTestId("tab-documents").click();
  await expect(morgan.getByTestId("open-document")).toHaveCount(0);
  expect((await morgan.request.get(granted)).status()).toBe(403);
});
