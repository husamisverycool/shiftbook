/**
 * Slice t (SPEC §27 items 5–6) through the screens, in English and Spanish:
 * - A worker signs in with a texted code (the demo shows the text), lands in their own language
 *   (Daniel prefers Spanish), sees their hours and the translated thread, writes to the agency, clocks
 *   in and out (the hours wait for review), and signs out.
 * - A worker part-way through onboarding finishes it (Gusto's steps) and gets their signed forms.
 * - The agency reads and answers the thread on the worker's profile, sees the onboarding checklist and
 *   texts the onboarding link.
 * - After the demo week is paid, the worker's pay stub shows Marcus Bell's gross: 40 h × $18.25 =
 *   $730.00 + 6 h × $27.375 = $164.25 → $894.25 (the margin spec's hand arithmetic).
 * Accessibility checks on every worker app screen.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { money } from "../../src/components/shiftbook/format";
import { demoUuid } from "../../src/server/demo/dataset";
import { approveAndCreateFiles, toExceptions, toTotals, uploadPrairieWeek } from "./flow";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

test.beforeEach(() => {
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
});

for (const locale of ["en", "es"] as const) {
  test(`a worker signs in by text, reads the translated thread, writes, clocks in and out (${locale})`, async ({ browser }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const m = MESSAGES[locale];

    await page.goto(`/${locale}/w`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/w/sign-in$`));
    await expect(page.getByRole("heading", { level: 1, name: m.workerApp.signIn.title })).toBeVisible();
    await check(page, "worker sign-in");
    // An unknown number answers the same as a known one.
    await page.getByTestId("worker-phone").fill("12");
    await page.getByTestId("worker-send-code").click();
    await expect(page.getByTestId("worker-sign-in-error")).toHaveText(m.workerApp.signIn.invalidPhone);
    await page.getByTestId("worker-phone").fill("(312) 555-0142");
    await page.getByTestId("worker-send-code").click();
    await expect(page.getByRole("heading", { level: 1, name: m.workerApp.signIn.sentTitle })).toBeVisible();
    const text = await page.getByTestId("worker-demo-text").innerText();
    const code = /(\d{6})/.exec(text)![1]!;
    await page.getByTestId("worker-code").fill(code);
    // Daniel prefers Spanish: the app opens in Spanish whatever the address said.
    await expect(page).toHaveURL(/\/es\/w$/);
    await expect(page.getByTestId("worker-greeting")).toHaveText(es.workerApp.home.greeting.replace("{name}", "Daniel"));
    await check(page, "worker home");

    // Messages: the thread with translations; one unread from the agency is none once opened.
    await page.getByTestId("worker-tab-messages").click();
    await expect(page.getByTestId("thread-message")).toHaveCount(4);
    await expect(page.getByTestId("thread-translation").first()).toContainText("Hola Daniel");
    await check(page, "worker messages");
    await page.getByTestId("worker-thread-input").fill("Gracias. ¿Cuándo recibo mi pago de esta semana?");
    await page.getByTestId("worker-thread-send").click();
    await expect(page.getByTestId("thread-message")).toHaveCount(5);
    await expect(page.getByTestId("thread-translation").last()).toContainText("When do I get paid");

    // Time: the clock at Prairie Line (the Illinois client lets workers clock in).
    await page.getByTestId("worker-tab-time").click();
    await expect(page.getByTestId("worker-week-hours").first()).toBeVisible();
    await page.getByTestId("worker-clock-in").click();
    await expect(page.getByTestId("worker-clock-since")).toBeVisible();
    await check(page, "worker time, clocked in");
    // A minute must pass: the clock-out refuses a shift under one minute.
    await page.getByTestId("worker-clock-out").click();
    await expect(page.getByTestId("worker-clock-error")).toHaveText(es.workerApp.clock.errors.too_short);

    // More: the signed forms; the language; sign out.
    await page.getByTestId("worker-tab-more").click();
    const download = page.waitForEvent("download");
    await page.getByTestId("worker-form-w4").click();
    expect((await download).suggestedFilename()).toMatch(/^w4-Daniel-Ruiz\.pdf$/);
    await check(page, "worker more");
    await page.getByTestId("worker-language-en").click();
    await expect(page).toHaveURL(/\/en\/w\/more$/);
    await page.getByTestId("worker-sign-out").click();
    await expect(page).toHaveURL(/\/en\/w\/sign-in$/);
    expect(errors).toEqual([]);
    await context.close();
  });

  test(`a worker finishes onboarding; the agency sees it, answers the thread and texts the link (${locale})`, async ({ browser, page }) => {
    test.setTimeout(180_000);
    const m = MESSAGES[locale];
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });
    const worker = await context.newPage();
    await worker.goto(`/${locale}/w/sign-in`);
    // Maribel prefers Spanish; she has done personal information and taxes.
    await worker.getByRole("button", { name: m.workerApp.signIn.demoAs.replace("{name}", "Maribel Torres") }).click();
    await expect(worker).toHaveURL(/\/es\/w$/);
    const s = es.workerApp.onboarding;
    await worker.getByTestId("worker-onboarding-card").getByRole("link").click();
    await expect(worker.getByTestId("onboarding-form-i9")).toBeVisible();
    await check(worker, "worker onboarding");
    await worker.getByTestId("onboarding-status-permanent_resident").check();
    await worker.getByTestId("onboarding-save").click();
    await expect(worker.getByTestId("onboarding-error")).toHaveText(s.errors.uscisNumber);
    await worker.getByTestId("onboarding-uscisNumber").fill("A123456789");
    await worker.getByTestId("onboarding-save").click();
    await expect(worker.getByTestId("onboarding-form-payment")).toBeVisible();
    await worker.getByTestId("onboarding-kind-direct_deposit").check();
    await worker.getByTestId("onboarding-routing").fill("021000022");
    await worker.getByTestId("onboarding-account").fill("000123450144");
    await worker.getByTestId("onboarding-confirm").fill("000123450144");
    await worker.getByTestId("onboarding-save").click();
    await expect(worker.getByTestId("onboarding-error")).toHaveText(s.errors.routing);
    await worker.getByTestId("onboarding-routing").fill("021000021");
    await worker.getByTestId("onboarding-save").click();
    await expect(worker.getByTestId("onboarding-form-policies")).toBeVisible();
    for (const k of ["safety", "harassment", "timekeeping"]) await worker.getByTestId(`onboarding-policy_${k}`).click();
    await worker.getByTestId("onboarding-save").click();
    await expect(worker.getByTestId("onboarding-form-sign")).toContainText(s.sign.deposit.replace("{last4}", "0144"));
    await worker.getByTestId("onboarding-name").fill("Maribel Torres");
    await worker.getByTestId("onboarding-agree").click();
    await worker.getByTestId("onboarding-save").click();
    await expect(worker.getByTestId("worker-onboarding-done")).toBeVisible();
    await check(worker, "worker onboarding done");
    await context.close();

    // The agency's side: the checklist done, the forms there; Daniel's thread answered.
    await page.goto(`/${locale}/workers/${demoUuid("worker:maribel-torres")}`);
    await page.getByTestId("tab-onboarding").click();
    for (const step of ["personal", "w4", "i9", "payment", "policies", "sign"]) await expect(page.getByTestId(`checklist-${step}`)).toContainText(m.workerAppAgency.doneOn.split("{")[0]!.trim());
    await expect(page.getByTestId("worker-forms-section")).toContainText(m.workerApp.more.forms.deposit);
    await check(page, "agency onboarding tab");
    await page.goto(`/${locale}/workers/${demoUuid("worker:daniel-ruiz")}`);
    await expect(page.getByTestId("worker-messages-unread")).toHaveText("1");
    await page.getByTestId("tab-messages").click();
    await expect(page.getByTestId("thread-message")).toHaveCount(4);
    // The agency writes in its screen's language; Daniel reads Spanish, so English gets a translation.
    const reply = locale === "en" ? "Payday is Friday. Your pay stub will be in the app." : "El día de pago es el viernes. Su talón de pago estará en la aplicación.";
    await page.getByTestId("agency-thread-input").fill(reply);
    await page.getByTestId("agency-thread-send").click();
    await expect(page.getByTestId("thread-message")).toHaveCount(5);
    await expect(page.getByTestId("thread-message").last()).toContainText(reply);
    if (locale === "en") await expect(page.getByTestId("thread-message").last().getByTestId("thread-translation")).toContainText("El día de pago es el viernes");
    else await expect(page.getByTestId("thread-message").last().getByTestId("thread-translation")).toHaveCount(0);
    await check(page, "agency messages tab");
    await page.getByTestId("tab-onboarding").click();
    await page.getByTestId("send-onboarding-link").click();
    await expect(page.getByText(m.workerAppAgency.sent)).toBeVisible();
  });
}

test("after the week is paid, the worker's pay stub shows the week's gross and opens as a PDF", async ({ browser, page }) => {
  test.setTimeout(420_000);
  const m = MESSAGES.en;
  const period = await uploadPrairieWeek(page, "en");
  await page.goto(`/en/convert?period=${period}&step=hours`);
  await toExceptions(page, m);
  await toTotals(page, m);
  await approveAndCreateFiles(page, m);

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });
  const worker = await context.newPage();
  await worker.goto("/en/w/sign-in");
  await worker.getByRole("button", { name: "Continue as Marcus Bell" }).click();
  await expect(worker.getByTestId("worker-latest-pay")).toContainText(money(89_425, "en"));
  await worker.getByTestId("worker-tab-pay").click();
  await expect(worker.getByTestId("worker-stub")).toHaveCount(1);
  await worker.getByTestId("worker-stub").click();
  await expect(worker.getByTestId("worker-stub-gross")).toHaveText(money(89_425, "en"));
  await expect(worker.getByTestId("worker-stub-lines")).toContainText(m.invoice.earning.OT);
  await check(worker, "worker pay stub");
  const download = worker.waitForEvent("download");
  await worker.getByTestId("worker-stub-pdf").click();
  expect((await download).suggestedFilename()).toMatch(/^pay-stub-2026-10-05-Marcus-Bell\.pdf$/);
  await context.close();
});
